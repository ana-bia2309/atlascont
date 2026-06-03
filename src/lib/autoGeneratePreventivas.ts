import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { createPreventiveOrder } from "@/lib/createPreventiveOrder";

let last_check_date: string | null = null;

const FREQ_DAYS: Record<string, number> = { diaria: 1, semanal: 7, quinzenal: 15 };
const FREQ_MONTHS: Record<string, number> = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };

function calcProxima(from: Date, frequencia: string): Date {
  const d = new Date(from);
  if (FREQ_DAYS[frequencia]) { d.setDate(d.getDate() + FREQ_DAYS[frequencia]); return d; }
  d.setMonth(d.getMonth() + (FREQ_MONTHS[frequencia] ?? 1));
  return d;
}

export async function autoGeneratePreventivas(force = false): Promise<number> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeStr = format(hoje, "yyyy-MM-dd");

  if (!force && last_check_date === hojeStr) return 0;
  last_check_date = hojeStr;

  try {
    const { data: planos, error: planosError } = await (supabase as any)
      .from("planos_manutencao")
      .select("id, nome, frequencia, prioridade, data_inicio, automatico, status, company_id, descricao, bloco_id, ativo_id, tipo_servico, responsavel_id, qr_code_obrigatorio")
      .eq("automatico", true)
      .eq("status", "ativo");

    if (planosError || !planos?.length) return 0;

    let geradas = 0;

    for (const plano of planos) {
      if (!plano.data_inicio) continue;
      const dataInicio = new Date(plano.data_inicio + "T00:00:00");
      if (dataInicio > hoje) continue;

      // Busca preventivas mestres deste plano
      let { data: preventivas } = await (supabase as any)
        .from("manutencao_preventiva")
        .select("id, titulo, descricao, frequencia, prioridade, bloco_id, ativo_id, tipo_servico, proxima_execucao, ultima_execucao, qr_code_obrigatorio, responsavel_id")
        .eq("plano_id", plano.id)
        .eq("ativo", true);

      // Se não existem preventivas mestres, criar automaticamente
      if (!preventivas?.length) {
        console.log(`[autoGeneratePreventivas] Plano "${plano.nome}" sem preventivas mestres — criando...`);

        // Buscar ativos vinculados ao plano
        const { data: planoAtivos } = await (supabase as any)
          .from("plano_ativos")
          .select("ativo_id, ativos(nome, bloco_id)")
          .eq("plano_id", plano.id);

        // Buscar atividades do plano
        const { data: atividades } = await (supabase as any)
          .from("plano_atividades")
          .select("*")
          .eq("plano_id", plano.id)
          .order("ordem");

        const ativos = planoAtivos?.length > 0 ? planoAtivos : [{ ativo_id: plano.ativo_id || null, ativos: null }];

        for (const pa of ativos) {
          if (!pa.ativo_id && !plano.bloco_id) continue;
          const ativo = pa.ativos;
          const titulo = `${plano.nome}${ativo?.nome ? ` — ${ativo.nome}` : ""}`;

          const { data: novaMestre } = await (supabase as any)
            .from("manutencao_preventiva")
            .insert({
              titulo,
              descricao: plano.descricao,
              frequencia: plano.frequencia,
              prioridade: atividades?.[0]?.prioridade || plano.prioridade || "Média",
              tipo_servico: atividades?.[0]?.tipo_servico || plano.tipo_servico || null,
              ativo_id: pa.ativo_id || null,
              bloco_id: ativo?.bloco_id || plano.bloco_id || null,
              proxima_execucao: plano.data_inicio,
              ativo: true,
              plano_id: plano.id,
              qr_code_obrigatorio: plano.qr_code_obrigatorio !== false,
              responsavel_id: atividades?.[0]?.responsavel_id || plano.responsavel_id || null,
            })
            .select()
            .single();

          if (novaMestre && atividades?.length) {
            await (supabase as any).from("atividades_preventiva").insert(
              atividades.map((a: any, idx: number) => ({
                preventiva_id: novaMestre.id,
                nome: a.nome, descricao: a.descricao, prioridade: a.prioridade,
                tipo_servico: a.tipo_servico, tipo_atividade: a.tipo_atividade,
                tipo_medicao: a.tipo_medicao, unidade_medicao: a.unidade_medicao,
                responsavel_id: a.responsavel_id, ordem: idx,
              }))
            );
          }
        }

        // Rebuscar preventivas após criar
        const { data: novas } = await (supabase as any)
          .from("manutencao_preventiva")
          .select("id, titulo, descricao, frequencia, prioridade, bloco_id, ativo_id, tipo_servico, proxima_execucao, ultima_execucao, qr_code_obrigatorio, responsavel_id")
          .eq("plano_id", plano.id)
          .eq("ativo", true);
        preventivas = novas || [];
      }

      if (!preventivas?.length) continue;

      for (const prev of preventivas) {
        try {
          const frequencia = prev.frequencia || plano.frequencia;
          if (!frequencia) continue;

          let dataRef: Date;
          if (prev.proxima_execucao) {
            dataRef = new Date(prev.proxima_execucao + "T00:00:00");
          } else if (prev.ultima_execucao) {
            dataRef = calcProxima(new Date(prev.ultima_execucao + "T00:00:00"), frequencia);
          } else {
            dataRef = new Date(plano.data_inicio + "T00:00:00");
          }

          let iteracoes = 0;
          while (dataRef <= hoje && iteracoes < 365) {
            iteracoes++;
            const dataRefStr = format(dataRef, "yyyy-MM-dd");

            const { data: existing } = await (supabase as any)
              .from("ordens_preventivas")
              .select("id")
              .eq("preventiva_id", prev.id)
              .eq("data_inicio", dataRefStr)
              .maybeSingle();

            if (!existing) {
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
              } catch (e: any) {
                console.warn(`[autoGeneratePreventivas] Erro ao gerar OP:`, e?.message || e);
              }
            }
            dataRef = calcProxima(dataRef, frequencia);
          }
        } catch (e: any) {
          console.warn(`[autoGeneratePreventivas] Erro ao processar preventiva:`, e?.message || e);
        }
      }
    }

    if (geradas > 0) {
      console.info(`[autoGeneratePreventivas] ✅ ${geradas} OP(s) gerada(s) automaticamente.`);
    }
    return geradas;
  } catch (e: any) {
    console.warn("[autoGeneratePreventivas] Erro geral:", e?.message || e);
    return 0;
  }
}