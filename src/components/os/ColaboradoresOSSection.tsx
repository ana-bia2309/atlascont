import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { X, UserPlus, Users } from "@/lib/icons";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import MultiUserSelect from "@/components/os/MultiUserSelect";
import type { UserOption } from "@/components/os/MultiUserSelect";

type Colaborador = {
  id: string;
  profile_id: string;
  nome: string;
};

interface ColaboradoresOSSectionProps {
  osId: string;
  readOnly?: boolean;
  responsibleUserIds?: string[];
}

export default function ColaboradoresOSSection({ osId, readOnly, responsibleUserIds = [] }: ColaboradoresOSSectionProps) {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [profiles, setProfiles] = useState<UserOption[]>([]);

  const fetchColaboradores = useCallback(async () => {
    const { data } = await supabase
      .from("os_colaboradores")
      .select("id, profile_id, profiles(nome)")
      .eq("os_id", osId) as any;

    if (data) {
      setColaboradores(
        data.map((d: any) => ({
          id: d.id,
          profile_id: d.profile_id,
          nome: d.profiles?.nome || "—",
        }))
      );
    }
  }, [osId]);

  useEffect(() => {
    fetchColaboradores();
  }, [fetchColaboradores]);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, nome, job_title")
      .eq("status", "ativo")
      .order("nome")
      .then(({ data }) => {
        if (data) setProfiles(data.map((p: any) => ({ id: p.id, nome: p.nome, job_title: p.job_title })));
      });
  }, []);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`os_colaboradores_${osId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "os_colaboradores", filter: `os_id=eq.${osId}` }, () => fetchColaboradores())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [osId, fetchColaboradores]);

  const handleChange = async (selectedIds: string[]) => {
    const currentIds = colaboradores.map((c) => c.profile_id);
    const toAdd = selectedIds.filter((id) => !currentIds.includes(id));
    const toRemove = colaboradores.filter((c) => !selectedIds.includes(c.profile_id));

    for (const id of toAdd) {
      await supabase.from("os_colaboradores").insert({ os_id: osId, profile_id: id });
    }
    for (const c of toRemove) {
      await supabase.from("os_colaboradores").delete().eq("id", c.id);
    }

    if (toAdd.length > 0 || toRemove.length > 0) {
      toast({ title: "Auxiliares atualizados" });
      fetchColaboradores();
    }
  };

  const selectedIds = colaboradores.map((c) => c.profile_id);

  return (
    <MultiUserSelect
      label="Auxiliares"
      options={profiles}
      selected={selectedIds}
      onChange={handleChange}
      placeholder="Adicionar auxiliar..."
      disabled={readOnly}
      excludeIds={responsibleUserIds}
    />
  );
}

export { ColaboradoresOSSection };
