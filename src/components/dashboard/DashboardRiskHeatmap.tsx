import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { TrendingUp } from "@/lib/icons";
import { cn } from "@/lib/utils";

type BlocoRisco = {
  id: string;
  nome: string;
  os_abertas: number;
};

const TOP_N = 5;

// Versão compacta do bloco "OS Abertas por Bloco" que já existe em
// MapaAtivos.tsx (aba heatmap) — mesma query e mesma escala de cor,
// só limitada aos blocos com mais risco pra caber no Dashboard.
export default function DashboardRiskHeatmap() {
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const [blocos, setBlocos] = useState<BlocoRisco[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [blocosRes, osRes] = await Promise.all([
        (supabase as any).from("blocos").select("id, nome").eq("company_id", companyId),
        (supabase as any).from("ordens_servico").select("bloco_id, status").eq("company_id", companyId)
          .not("status", "in", "(Concluída,Cancelada,Encerrado)"),
      ]);

      const blocosList = blocosRes.data || [];
      const osList = osRes.data || [];

      const result: BlocoRisco[] = blocosList
        .map((b: any) => ({
          id: b.id,
          nome: b.nome,
          os_abertas: osList.filter((os: any) => os.bloco_id === b.id).length,
        }))
        .filter((b: BlocoRisco) => b.os_abertas > 0)
        .sort((a: BlocoRisco, b: BlocoRisco) => b.os_abertas - a.os_abertas)
        .slice(0, TOP_N);

      setBlocos(result);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading || blocos.length === 0) return null;

  const maxOs = Math.max(...blocos.map(b => b.os_abertas), 1);

  return (
    <div className="rounded-xl border bg-card p-5 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-4 w-4 text-warning" />
        <h2 className="text-lg font-semibold">Blocos com Mais Risco</h2>
        <span className="text-xs text-muted-foreground ml-auto">OS em aberto por bloco</span>
      </div>
      <div className="space-y-3">
        {blocos.map(bloco => {
          const pct = (bloco.os_abertas / maxOs) * 100;
          const cor = pct > 66 ? "bg-destructive" : pct > 33 ? "bg-warning" : "bg-info";
          return (
            <div
              key={bloco.id}
              onClick={() => navigate("/mapa-ativos")}
              className="cursor-pointer hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{bloco.nome}</span>
                <span className="text-sm font-bold">{bloco.os_abertas} OS</span>
              </div>
              <div className="h-6 rounded-lg bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-lg transition-all duration-500", cor)}
                  style={{ width: `${Math.max(pct, 5)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
