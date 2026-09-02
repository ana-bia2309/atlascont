import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { GitBranch } from "@/lib/icons";

type ChamadoRow = { id: string; created_at: string; analisado_em: string; os_id: string };

// Funil só dos chamados do Portal do Cliente (tabela `chamados`), que já
// tem os timestamps estruturados (created_at / analisado_em / os_id).
// O "chamado interno" (ordens_servico com origem=Chamado) não entra aqui
// porque o vínculo dele com a OS gerada é só um marcador de texto, sem
// timestamp — precisaria de uma migration à parte.
export default function DashboardFunilChamados() {
  const { companyId } = useCompany();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ aberturaAnalise: number; analiseFechamento: number; total: number; qtd: number } | null>(null);

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data: chamados } = await (supabase as any)
        .from("chamados")
        .select("id, created_at, analisado_em, os_id")
        .eq("company_id", companyId)
        .not("os_id", "is", null)
        .not("analisado_em", "is", null);

      const rows: ChamadoRow[] = chamados || [];
      if (rows.length === 0) { setStats(null); return; }

      const osIds = [...new Set(rows.map((r) => r.os_id))];
      const { data: osList } = await (supabase as any)
        .from("ordens_servico")
        .select("id, finalizado_em")
        .eq("company_id", companyId)
        .in("id", osIds);

      const osMap = new Map((osList || []).map((o: any) => [o.id, o.finalizado_em]));

      const diasAberturaAnalise: number[] = [];
      const diasAnaliseFechamento: number[] = [];
      const diasTotal: number[] = [];

      rows.forEach((r) => {
        const finalizadoEm = osMap.get(r.os_id);
        const abertura = new Date(r.created_at).getTime();
        const analise = new Date(r.analisado_em).getTime();
        diasAberturaAnalise.push((analise - abertura) / 86400000);

        if (finalizadoEm) {
          const fechamento = new Date(finalizadoEm as string).getTime();
          diasAnaliseFechamento.push((fechamento - analise) / 86400000);
          diasTotal.push((fechamento - abertura) / 86400000);
        }
      });

      const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

      setStats({
        aberturaAnalise: avg(diasAberturaAnalise),
        analiseFechamento: avg(diasAnaliseFechamento),
        total: avg(diasTotal),
        qtd: rows.length,
      });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading || !stats) return null;

  const fmt = (d: number) => d < 1 ? `${Math.round(d * 24)}h` : `${d.toFixed(1)}d`;

  return (
    <div className="rounded-xl border bg-card p-5 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <GitBranch className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Funil de Chamados (Portal do Cliente)</h2>
        <span className="text-xs text-muted-foreground ml-auto">{stats.qtd} chamado{stats.qtd !== 1 ? "s" : ""} analisado{stats.qtd !== 1 ? "s" : ""}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Abertura → Análise</p>
          <p className="text-xl font-semibold">{fmt(stats.aberturaAnalise)}</p>
        </div>
        <div className="rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Análise → Conclusão da O.S.</p>
          <p className="text-xl font-semibold">{stats.analiseFechamento ? fmt(stats.analiseFechamento) : "—"}</p>
        </div>
        <div className="rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Ciclo total</p>
          <p className="text-xl font-semibold">{stats.total ? fmt(stats.total) : "—"}</p>
        </div>
      </div>
    </div>
  );
}
