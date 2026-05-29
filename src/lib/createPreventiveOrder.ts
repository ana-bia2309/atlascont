import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

type PreventivaOrderSource = {
  id: string;
  titulo: string;
  descricao?: string | null;
  frequencia: string;
  prioridade: string;
  bloco_id?: string | null;
  ativo_id?: string | null;
  tipo_servico?: string | null;
  tipo_atividade?: string | null;
  tipo_medicao?: string | null;
  unidade_medicao?: string | null;
  ordem_grandeza?: string | null;
  responsavel_id?: string | null;
  qr_code_obrigatorio?: boolean | null;
};

type CreatePreventiveOrderOptions = {
  observacao_historico?: string;
};

const FREQUENCIA_DAYS: Record<string, number> = {
  diaria: 1,
  semanal: 7,
  quinzenal: 15,
};

const FREQUENCIA_MONTHS: Record<string, number> = {
  mensal: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

function calc_next_date(from_date: Date, frequencia: string) {
  const next_date = new Date(from_date);
  const days = FREQUENCIA_DAYS[frequencia];
  if (days) {
    next_date.setDate(next_date.getDate() + days);
    return next_date;
  }
  next_date.setMonth(next_date.getMonth() + (FREQUENCIA_MONTHS[frequencia] || 1));
  return next_date;
}

export async function createPreventiveOrder(
  preventiva: PreventivaOrderSource,
  options?: CreatePreventiveOrderOptions,
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const today_str = format(today, "yyyy-MM-dd");
  const prazo_date = calc_next_date(today, preventiva.frequencia);
  const prazo_str = format(prazo_date, "yyyy-MM-dd");

  const { data: op_data, error: op_error } = await (supabase.from("ordens_preventivas" as any) as any)
    .insert({
      preventiva_id: preventiva.id,
      status: "Não Iniciada",
      prioridade: preventiva.prioridade,
      bloco_id: preventiva.bloco_id || null,
      tipo_servico: preventiva.tipo_servico || null,
      ativo_id: preventiva.ativo_id || null,
      equipamentos: preventiva.titulo,
      titulo: preventiva.titulo,
      responsible_user_id: preventiva.responsavel_id || null,
      data_inicio: today_str,
      prazo: prazo_str,
      qr_code_obrigatorio: preventiva.qr_code_obrigatorio !== false,
      observacoes: [
        `Gerada manualmente - Preventiva: ${preventiva.titulo}`,
        preventiva.descricao || "",
        preventiva.tipo_atividade ? `Tipo de atividade: ${preventiva.tipo_atividade}` : "",
        preventiva.tipo_medicao ? `Medição: ${preventiva.tipo_medicao}` : "",
        preventiva.unidade_medicao ? `Unidade: ${preventiva.unidade_medicao}` : "",
        preventiva.ordem_grandeza ? `Ordem de grandeza: ${preventiva.ordem_grandeza}` : "",
      ].filter(Boolean).join("\n").trim(),
    })
    .select("id, codigo_op")
    .single();

  if (op_error || !op_data) throw op_error || new Error("Erro ao criar Ordem Preventiva");

  const { data: prev_activities, error: activities_error } = await (supabase.from("atividades_preventiva" as any) as any)
    .select("nome, descricao, ordem, tipo_atividade, tipo_medicao, unidade_medicao")
    .eq("preventiva_id", preventiva.id)
    .order("ordem");

  if (activities_error) throw activities_error;

  if (prev_activities && prev_activities.length > 0) {
    const atividades_payload = (prev_activities as any[]).map((activity, index) => ({
      ordem_preventiva_id: op_data.id,
      nome: activity.nome,
      descricao: activity.descricao || null,
      data_inicio: today_str,
      data_termino: prazo_str,
      status: "Não iniciado",
      ordem: activity.ordem ?? index,
      responsavel: null,
      tipo_atividade: activity.tipo_atividade || null,
      tipo_medicao: activity.tipo_atividade === "Medição" ? (activity.tipo_medicao || null) : null,
      unidade_medicao: activity.tipo_atividade === "Medição" ? (activity.unidade_medicao || null) : null,
    }));

    const { error: insert_activities_error } = await (supabase.from("atividades_ordem_preventiva" as any) as any)
      .insert(atividades_payload);

    if (insert_activities_error) throw insert_activities_error;
  }

  await (supabase.from("historico_preventiva" as any) as any).insert({
    preventiva_id: preventiva.id,
    ordem_preventiva_id: op_data.id,
    observacao: options?.observacao_historico || "Geração manual",
  });

  const nextDate = calc_next_date(today, preventiva.frequencia);
  nextDate.setHours(0, 0, 0, 0);
  await (supabase.from("manutencao_preventiva" as any) as any)
    .update({
      ultima_execucao: today_str,
      proxima_execucao: format(nextDate, "yyyy-MM-dd"),
    })
    .eq("id", preventiva.id);

  return op_data as { id: string; codigo_op: string };
}