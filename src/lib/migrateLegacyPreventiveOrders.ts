import { supabase } from "@/integrations/supabase/client";

type MigrationResult = {
  migrated_orders: number;
  migrated_activities: number;
  updated_history: number;
};

const EMPTY_RESULT: MigrationResult = {
  migrated_orders: 0,
  migrated_activities: 0,
  updated_history: 0,
};

let migration_checked = false;
let migration_promise: Promise<MigrationResult> | null = null;

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
};

export async function migrateLegacyPreventiveOrdersIfNeeded(force = false): Promise<MigrationResult> {
  if (migration_checked && !force) return EMPTY_RESULT;
  if (migration_promise && !force) return migration_promise;

  migration_promise = (async () => {
    try {
      const [history_res, preventive_os_res] = await Promise.all([
        (supabase.from("historico_preventiva" as any).select("id, preventiva_id, os_id, ordem_preventiva_id") as any).not("os_id", "is", null),
        (supabase.from("ordens_servico" as any).select("id") as any).eq("origem", "Preventiva"),
      ]);

      if (history_res.error) throw history_res.error;
      if (preventive_os_res.error) throw preventive_os_res.error;

      const candidate_ids = Array.from(new Set([
        ...((history_res.data as any[]) || []).map((item) => item.os_id).filter(Boolean),
        ...((preventive_os_res.data as any[]) || []).map((item) => item.id).filter(Boolean),
      ]));

      if (candidate_ids.length === 0) {
        migration_checked = true;
        return EMPTY_RESULT;
      }

      const [legacy_orders_res, existing_ops_res, legacy_activities_res, existing_op_activities_res] = await Promise.all([
        (supabase.from("ordens_servico" as any)
          .select("id, codigo_os, status, prioridade, bloco_id, ativo_id, cronograma_id, responsible_user_id, titulo, tipo_servico, equipamentos, observacoes, data_inicio, data_termino, prazo, finalizado_em, finalizado_por, criado_por, editado_em, editado_por, created_at") as any)
          .in("id", candidate_ids),
        (supabase.from("ordens_preventivas" as any).select("id") as any).in("id", candidate_ids),
        (supabase.from("atividades_os" as any)
          .select("id, os_id, nome, data_inicio, data_termino, status, responsavel, tipo_atividade, tipo_medicao, unidade_medicao, created_at") as any)
          .in("os_id", candidate_ids)
          .order("created_at", { ascending: true }),
        (supabase.from("atividades_ordem_preventiva" as any).select("id, ordem_preventiva_id") as any).in("ordem_preventiva_id", candidate_ids),
      ]);

      if (legacy_orders_res.error) throw legacy_orders_res.error;
      if (existing_ops_res.error) throw existing_ops_res.error;
      if (legacy_activities_res.error) throw legacy_activities_res.error;
      if (existing_op_activities_res.error) throw existing_op_activities_res.error;

      const history_by_os = new Map<string, any>();
      for (const item of ((history_res.data as any[]) || [])) {
        if (item.os_id && !history_by_os.has(item.os_id)) history_by_os.set(item.os_id, item);
      }

      const existing_op_ids = new Set((((existing_ops_res.data as any[]) || []).map((item) => item.id)));
      const existing_op_activity_ids = new Set((((existing_op_activities_res.data as any[]) || []).map((item) => item.id)));

      const ops_to_insert = (((legacy_orders_res.data as any[]) || []) as any[])
        .filter((order) => !existing_op_ids.has(order.id))
        .map((order) => {
          const history = history_by_os.get(order.id);
          const payload: Record<string, any> = {
            id: order.id,
            preventiva_id: history?.preventiva_id || null,
            status: order.status || "Não Iniciada",
            prioridade: order.prioridade || "Média",
            bloco_id: order.bloco_id || null,
            ativo_id: order.ativo_id || null,
            cronograma_id: order.cronograma_id || null,
            responsible_user_id: order.responsible_user_id || null,
            titulo: order.titulo || null,
            tipo_servico: order.tipo_servico || null,
            equipamentos: order.equipamentos || null,
            observacoes: order.observacoes || null,
            data_inicio: order.data_inicio || null,
            data_termino: order.data_termino || null,
            prazo: order.prazo || null,
            finalizado_em: order.finalizado_em || null,
            finalizado_por: order.finalizado_por || null,
            criado_por: order.criado_por || null,
            editado_em: order.editado_em || null,
            editado_por: order.editado_por || null,
          };

          if (order.codigo_os) payload.codigo_op = order.codigo_os;
          if (order.created_at) payload.created_at = order.created_at;

          return payload;
        });

      for (const items of chunk(ops_to_insert, 100)) {
        if (items.length === 0) continue;
        const { error } = await (supabase.from("ordens_preventivas" as any) as any).insert(items);
        if (error) throw error;
      }

      const activity_order_map = new Map<string, number>();
      const activities_to_insert = (((legacy_activities_res.data as any[]) || []) as any[])
        .filter((activity) => !existing_op_activity_ids.has(activity.id))
        .map((activity) => {
          const current_order = activity_order_map.get(activity.os_id) || 0;
          activity_order_map.set(activity.os_id, current_order + 1);
          const status = activity.status || "Não iniciado";
          const concluido = /conclu/i.test(status);

          return {
            id: activity.id,
            ordem_preventiva_id: activity.os_id,
            nome: activity.nome,
            descricao: null,
            status,
            ordem: current_order,
            data_inicio: activity.data_inicio || null,
            data_termino: activity.data_termino || null,
            concluido,
            concluido_em: concluido ? activity.created_at || new Date().toISOString() : null,
            responsavel: activity.responsavel || null,
            tipo_atividade: activity.tipo_atividade || null,
            tipo_medicao: activity.tipo_medicao || null,
            unidade_medicao: activity.unidade_medicao || null,
          };
        });

      for (const items of chunk(activities_to_insert, 200)) {
        if (items.length === 0) continue;
        const { error } = await (supabase.from("atividades_ordem_preventiva" as any) as any).insert(items);
        if (error) throw error;
      }

      let updated_history = 0;
      for (const item of ((history_res.data as any[]) || [])) {
        if (!item.os_id || item.ordem_preventiva_id) continue;
        const { error } = await (supabase.from("historico_preventiva" as any) as any)
          .update({ ordem_preventiva_id: item.os_id })
          .eq("id", item.id);
        if (error) throw error;
        updated_history += 1;
      }

      migration_checked = true;

      const result = {
        migrated_orders: ops_to_insert.length,
        migrated_activities: activities_to_insert.length,
        updated_history,
      };

      if (result.migrated_orders > 0 || result.migrated_activities > 0 || result.updated_history > 0) {
        console.info("[preventivas] Migração legada concluída", result);
      }

      return result;
    } catch (error) {
      console.warn("[preventivas] Falha ao migrar legados automaticamente", error);
      return EMPTY_RESULT;
    } finally {
      migration_promise = null;
    }
  })();

  return migration_promise;
}
