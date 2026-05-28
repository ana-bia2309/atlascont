import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { createPreventiveOrder } from "@/lib/createPreventiveOrder";

let auto_checked = false;

const FREQ_DAYS: Record<string, number> = { diaria: 1, semanal: 7, quinzenal: 15 };
const FREQ_MONTHS: Record<string, number> = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };

function calcProxima(from: Date, frequencia: string): Date {
  const d = new Date(from);
  if (FREQ_DAYS[frequencia]) { d.setDate(d.getDate() + FREQ_DAYS[frequencia]); return d; }
  d.setMonth(d.getMonth() + (FREQ_MONTHS[frequencia] || 1));
  return d;
}

export async function autoGeneratePreventivas(force = false): Promise<number> {
  if (auto_checked && !force) return 0;
  auto_checked = true;

  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeStr = format(hoje, "yyyy-MM-dd");

    // Busca planos automáticos ativos com data_inicio definida
    const { data: planos, error: planosError } = await (supabase as any)
      .from("planos_manutencao")
      .select("id, nome, frequencia, prioridade, data_inicio, automatico, status")
      .eq("automatico", true)
      .eq("status", "ativo");

    if (planosError || !planos?.length) return 0;

    let geradas = 0;

    for (const plano of planos) {
      if (!plano.data_inicio) continue;

      const dataInicio = new Date(plano.data_inicio + "T00:00:00");
      if (dataInicio > hoje) continue; // ainda não chegou a data

      // Busca preventivas mestres deste plano
      const { data: preventivas } = await (supabase as any)
        .from("manutencao_preventiva")
        .select("id, titulo, descricao, frequencia, prioridade, bloco_id, ativo_id, tipo_servico, proxima_execucao, qr_code_obrigatorio")
        .eq("plano_id", plano.id)
        .eq("ativo", true);

      if (!preventivas?.length) continue;

      for (const prev of preventivas) {
        const proxima = prev.proxima_execucao;

        // Verifica se proxima_execucao é hoje ou já passou
        if (!proxima || proxima > hojeStr) continue;

        // Verifica se já existe uma OP gerada hoje para esta preventiva
        const { data: opsHoje } = await (supabase as any)
          .from("ordens_preventivas")
          .select("id")
          .eq("preventiva_id", prev.id)
          .gte("created_at", hojeStr + "T00:00:00")
          .lte("created_at", hojeStr + "T23:59:59");

        if (opsHoje?.length > 0) continue; // já foi gerada hoje

        // Gera a OP automaticamente
        try {
          await createPreventiveOrder(
            {
              id: prev.id,
              titulo: prev.titulo,
              descricao: prev.descricao,
              frequencia: prev.frequencia || plano.frequencia,
              prioridade: prev.prioridade || plano.prioridade,
              bloco_id: prev.bloco_id,
              ativo_id: prev.ativo_id,
              tipo_servico: prev.tipo_servico,
              qr_code_obrigatorio: prev.qr_code_obrigatorio,
            },
            { observacao_historico: "Geração automática pelo sistema" }
          );
          geradas++;
        } catch (e) {
          console.warn("[autoGeneratePreventivas] Erro ao gerar OP para:", prev.titulo, e);
        }
      }
    }

    if (geradas > 0) {
      console.info(`[autoGeneratePreventivas] ${geradas} Ordem(ns) Preventiva(s) gerada(s) automaticamente.`);
    }

    return geradas;
  } catch (e) {
    console.warn("[autoGeneratePreventivas] Erro:", e);
    return 0;
  }
}