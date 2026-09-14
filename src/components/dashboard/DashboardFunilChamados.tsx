import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { GitBranch } from "@/lib/icons";

type ChamadoRow = { id: string; created_at: string; analisado_em: string; os_id: string };
type ChamadoInternoRow = { id: string; created_at: string; analisado_em: string; finalizado_em: string | null };

// Funil combina as duas origens de chamado:
// - Portal do Cliente (tabela `chamados`): created_at/analisado_em/os_id,
//   com finalizado_em vindo da O.S. vinculada.
// - Chamado interno (ordens_servico com origem=Chamado): agora tem
//   analisado_em na propria linha, marcado automaticamente (trigger) na
//   primeira vez que o status sai de "Aberto".
export default function DashboardFunilChamados() {
  const { companyId } = useCompany();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ aberturaAnalise: number; analiseFechamento: number; total: number; qtd: number; qtdPortal: number; qtdInterno: number } | null>(null);

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [chamadosRes, internosRes] = await Promise.all([
        (supabase as any)
          .from("chamados")
          .select("id, created_at, analisado_em, os_id")
          .eq("company_id", companyId)
          .not("os_id", "is", null)
          .not("analisado_em", "is", null),
        (supabase as any)
          .from("ordens_servico")
          .select("id, created_at, analisado_em, finalizado_em")
          .eq("company_id", companyId)
          .eq("origem", "Chamado")
          .not("analisado_em", "is", null),
      ]);

      const chamadosPortal: ChamadoRow[] = chamadosRes.data || [];
      const chamadosInterno: ChamadoInternoRow[] = internosRes.data || [];

      if (chamadosPortal.length === 0 && chamadosInterno.length === 0) { setStats(null); return; }

      const osIds = [...new Set(chamadosPortal.map((r) => r.os_id))];
      const osList = osIds.length > 0
        ? (await (supabase as any)
            .from("ordens_servico")
            .select("id, finalizado_em")
            .eq("company_id", companyId)
            .eq("arquivada", false)
            .in("id", osIds)).data
        : [];

      const osMap = new Map((osList || []).map((o: any) => [o.id, o.finalizado_em]));

      const diasAberturaAnalise: number[] = [];
      const diasAnaliseFechamento: number[] = [];
      const diasTotal: number[] = [];

      chamadosPortal.forEach((r) => {
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

      chamadosInterno.forEach((r) => {
        const abertura = new Date(r.created_at).getTime();
        const analise = new Date(r.analisado_em).getTime();
        diasAberturaAnalise.push((analise - abertura) / 86400000);

        if (r.finalizado_em) {
          const fechamento = new Date(r.finalizado_em).getTime();
          diasAnaliseFechamento.push((fechamento - analise) / 86400000);
          diasTotal.push((fechamento - abertura) / 86400000);
        }
      });

      const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

      setStats({
        aberturaAnalise: avg(diasAberturaAnalise),
        analiseFechamento: avg(diasAnaliseFechamento),
        total: avg(diasTotal),
        qtd: chamadosPortal.length + chamadosInterno.length,
        qtdPortal: chamadosPortal.length,
        qtdInterno: chamadosInterno.length,
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
        <h2 className="text-lg font-semibold">Funil de Chamados</h2>
        <span className="text-xs text-muted-foreground ml-auto">
          {stats.qtd} chamado{stats.qtd !== 1 ? "s" : ""} analisado{stats.qtd !== 1 ? "s" : ""}
          {" "}({stats.qtdPortal} Portal · {stats.qtdInterno} interno{stats.qtdInterno !== 1 ? "s" : ""})
        </span>
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
