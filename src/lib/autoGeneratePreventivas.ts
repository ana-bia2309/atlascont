import { format, addDays, addMonths } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { createPreventiveOrder } from "@/lib/createPreventiveOrder";

// Controle de execução por sessão — reseta ao recarregar a página
let last_check_date: string | null = null;

const FREQ_DAYS: Record<string, number> = {
  diaria: 1,
  semanal: 7,
  quinzenal: 15,
};

const FREQ_MONTHS: Record<string, number> = {
  mensal: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

function calcProxima(from: Date, frequencia: string): Date {
  const d = new Date(from);
  if (FREQ_DAYS[frequencia]) {
    d.setDate(d.getDate() + FREQ_DAYS[frequencia]);
    return d;
  }
  d.setMonth(d.getMonth() + (FREQ_MONTHS[frequencia] ?? 1));
  return d;
}

export async function autoGeneratePreventivas(force = false): Promise<number> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeStr = format(hoje, "yyyy-MM-dd");

  // Só roda uma vez por dia (ou se forçado)
  if (!force && last_check_date === hojeStr) return 0;
  last_check_date = hojeStr;

  try {
    // Busca planos automáticos ativos
    const { data: planos, error: planosError } = await (supabase as any)
      .from("planos_manutencao")
      .select("id, nome, frequencia, prioridade, data_inicio, automatico, status, company_id")
      .eq("automatico", true)
      .eq("status", "ativo");

    if (planosError) {
      console.warn("[autoGeneratePreventivas] Erro ao buscar planos:", planosError.message);
      return 0;
    }

    if (!planos?.length) {
      console.log("[autoGeneratePreventivas] Nenhum plano automático ativo encontrado.");
      return 0;
    }

    console.log(`[autoGeneratePreventivas] ${planos.length} plano(s) ativo(s) encontrado(s). Data: ${hojeStr}`);

    let geradas = 0;

    for (const plano of planos) {
      if (!plano.data_inicio) continue;

      const dataInicio = new Date(plano.data_inicio + "T00:00:00");
      if (dataInicio > hoje) continue; // plano ainda não começou

      // Busca preventivas mestres deste plano
      const { data: preventivas } = await (supabase as any)
        .from("manutencao_preventiva")
        .select("id, titulo, descricao, frequencia, prioridade, bloco_id, ativo_id, tipo_servico, proxima_execucao, ultima_execucao, qr_code_obrigatorio, responsavel_id")
        .eq("plano_id", plano.id)
        .eq("ativo", true);

      if (!preventivas?.length) continue;

      for (const prev of preventivas) {
        try {
          const frequencia = prev.frequencia || plano.frequencia;
          if (!frequencia) continue;

          // Calcula data de referência para gerar a próxima OP
          let dataRef: Date;

          if (prev.proxima_execucao) {
            dataRef = new Date(prev.proxima_execucao + "T00:00:00");
          } else if (prev.ultima_execucao) {
            dataRef = calcProxima(new Date(prev.ultima_execucao + "T00:00:00"), frequencia);
          } else {
            // Nunca foi gerada — usa data_inicio do plano
            dataRef = new Date(plano.data_inicio + "T00:00:00");
          }

          // Gera todas as OPs pendentes (recuperação de atrasos)
          let iteracoes = 0;
          const MAX_ITERACOES = 365; // segurança contra loops infinitos

          while (dataRef <= hoje && iteracoes < MAX_ITERACOES) {
            iteracoes++;
            const dataRefStr = format(dataRef, "yyyy-MM-dd");

            // Verifica se já existe OP para esta preventiva nesta data
            const { data: existing } = await (supabase as any)
              .from("ordens_preventivas")
              .select("id")
              .eq("preventiva_id", prev.id)
              .eq("data_inicio", dataRefStr)
              .maybeSingle();

            if (!existing) {
              // Não existe — gera a OP
              try {
                await createPreventiveOrder(
                  {
                    id: prev.id,
                    titulo: prev.titulo,
                    descricao: prev.descricao,
                    frequencia,
                    prioridade: prev.prioridade || plano.prioridade,
                    bloco_id: prev.bloco_id,
                    ativo_id: prev.ativo_id,
                    tipo_servico: prev.tipo_servico,
                    qr_code_obrigatorio: prev.qr_code_obrigatorio,
                    responsavel_id: prev.responsavel_id,
                  },
                  {
                    observacao_historico: iteracoes > 1
                      ? `Recuperação automática — competência ${dataRefStr}`
                      : `Geração automática pelo sistema — ${dataRefStr}`,
                    data_inicio_override: dataRefStr,
                  }
                );
                geradas++;
                console.log(`[autoGeneratePreventivas] OP gerada: ${prev.titulo} — ${dataRefStr}`);
              } catch (e: any) {
                console.warn(`[autoGeneratePreventivas] Erro ao gerar OP para "${prev.titulo}" (${dataRefStr}):`, e?.message || e);
              }
            } else {
              console.log(`[autoGeneratePreventivas] OP já existe para "${prev.titulo}" em ${dataRefStr} — pulando.`);
              // Mesmo existindo, atualiza proxima_execucao se necessário
            }

            // Avança para a próxima data
            dataRef = calcProxima(dataRef, frequencia);
          }

          if (iteracoes >= MAX_ITERACOES) {
            console.warn(`[autoGeneratePreventivas] Limite de iterações atingido para "${prev.titulo}". Verifique a configuração.`);
          }

        } catch (e: any) {
          console.warn(`[autoGeneratePreventivas] Erro ao processar preventiva "${prev.titulo}":`, e?.message || e);
        }
      }
    }

    if (geradas > 0) {
      console.info(`[autoGeneratePreventivas] ✅ ${geradas} Ordem(ns) Preventiva(s) gerada(s) automaticamente.`);
    } else {
      console.log("[autoGeneratePreventivas] Nenhuma nova OP necessária.");
    }

    return geradas;
  } catch (e: any) {
    console.warn("[autoGeneratePreventivas] Erro geral:", e?.message || e);
    return 0;
  }
}