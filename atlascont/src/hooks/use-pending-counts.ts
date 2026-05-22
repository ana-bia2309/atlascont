import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/use-user-role";

/**
 * Returns pending counts for menu badges:
 * - minhasOs: OS where user is linked (responsável, auxiliar, cronograma) with non-finished status
 * - Admin sees all non-finished OS
 */
export function usePendingCounts() {
  const { session } = useAuth();
  const { isAdmin } = useUserRole();
  const [minhasOs, setMinhasOs] = useState(0);
  const [cronogramasPendentes, setCronogramasPendentes] = useState(0);
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from("profiles")
      .select("id, nome")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfileId(data.id);
      });
  }, [session?.user?.id]);

  const refresh = useCallback(async () => {
    if (!profileId) return;

    const notFinishedFilter = '("Concluída","Cancelada")';

    // Admin não exibe badge de pendências — vê tudo na listagem
    if (isAdmin) {
      setMinhasOs(0);
      setCronogramasPendentes(0);
      return;
    }

    // Get user name for cronograma matching
    const { data: profileData } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", profileId)
      .maybeSingle();

    // Collect OS IDs from all link sources in parallel
    const [respRes, colabRes, legacyRes, atividadeRes] = await Promise.all([
      supabase.from("os_responsaveis").select("os_id").eq("profile_id", profileId),
      supabase.from("os_colaboradores").select("os_id").eq("profile_id", profileId),
      supabase.from("ordens_servico").select("id").eq("responsible_user_id", profileId).neq("origem", "Preventiva"),
      profileData?.nome
        ? supabase.from("atividades_os").select("os_id").ilike("responsavel", `%${profileData.nome}%`)
        : Promise.resolve({ data: [] }),
    ]);

    const allOsIds = [...new Set([
      ...(respRes.data || []).map((r: any) => r.os_id),
      ...(colabRes.data || []).map((r: any) => r.os_id),
      ...(legacyRes.data || []).map((r: any) => r.id),
      ...(atividadeRes.data || []).map((r: any) => r.os_id),
    ])];

    if (allOsIds.length === 0) {
      setMinhasOs(0);
      return;
    }

    const { count } = await supabase
      .from("ordens_servico")
      .select("id", { count: "exact", head: true })
      .in("id", allOsIds)
      .neq("origem", "Preventiva")
      .not("status", "in", notFinishedFilter);

    setMinhasOs(count || 0);

    // Count pending cronograma activities for this user
    if (profileData?.nome) {
      const { count: cronCount } = await supabase
        .from("atividades_os")
        .select("id", { count: "exact", head: true })
        .ilike("responsavel", `%${profileData.nome}%`)
        .neq("status", "Concluído");
      setCronogramasPendentes(cronCount || 0);
    } else {
      setCronogramasPendentes(0);
    }
  }, [profileId, isAdmin]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { minhasOs, cronogramasPendentes };
}
