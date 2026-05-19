import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type TableName =
  | "ordens_servico"
  | "blocos"
  | "gastos"
  | "historico_os"
  | "materiais_os"
  | "anexos_os"
  | "atividades_os"
  | "tipos_gasto"
  | "os_responsaveis"
  | "os_colaboradores"
  | "ordens_preventivas"
  | "atividades_ordem_preventiva"
  | "historico_preventiva"
  | "manutencao_preventiva";

export function useRealtime(
  tables: TableName[],
  onUpdate: () => void,
  companyId?: string | null
) {

  useEffect(() => {

    if (!companyId) return;

    const channelName =
      `realtime-${companyId}-${tables.join("-")}`;

    const ch =
      supabase.channel(channelName);

    tables.forEach((table) => {

      ch.on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table,
          filter: `company_id=eq.${companyId}`,
        },
        () => onUpdate()
      );

    });

    ch.subscribe();

    return () => {
      supabase.removeChannel(ch);
    };

  }, [
    tables.join(","),
    onUpdate,
    companyId
  ]);
}