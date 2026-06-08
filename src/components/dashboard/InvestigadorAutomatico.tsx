import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { AlertTriangle, TrendingUp, Wrench, RefreshCw } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { format, subMonths } from "date-fns";
import { cn } from "@/lib/utils";

type Padrao = {
  ativo_id: string;
  ativo_nome: string;
  ativo_codigo: string | null;
  total_os: number;
  periodo_meses: number;
  tipos: string[];
  gravidade: "critica" | "alta" | "media";
  ultima_os: string;
  bloco_nome: string | null;
};

export default function InvestigadorAutomatico() {
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const [padroes, setPadroes] = useState<Padrao[]>([]);
  const [loading, setLoading] = useState(true);

  const analisar = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const seissMesesAtras = format(subMonths(new Date(), 6), "yyyy-MM-dd");

      // Busca OS com ativo vinculado dos últimos 6 meses
      const { data: osData } = await (supabase as any)
        .from("ordens_servico")
        .select("id, ativo_id, tipo_servico, created_at, status, ativos(nome, codigo_identificacao, bloco_id), blocos(nome)")
        .eq("company_id", companyId)
        .not("ativo_id", "is", null)
        .gte("created_at", seissMesesAtras + "T00:00:00")
        .order("created_at", { ascending: false });

      if (!osData?.length) { setPadroes([]); setLoading(false); return; }

      // Agrupa por ativo
      const porAtivo: Record<string, any[]> = {};
      osData.forEach((os: any) => {
        if (!os.ativo_id) return;
        if (!porAtivo[os.ativo_id]) porAtivo[os.ativo_id] = [];
        porAtivo[os.ativo_id].push(os);
      });

      // Detecta padrões — ativos com 2+ OS em 6 meses
      const padroesDet: Padrao[] = [];
      for (const [ativoId, osList] of Object.entries(porAtivo)) {
        if (osList.length < 2) continue;

        const tipos = Array.from(new Set(osList.map((os: any) => os.tipo_servico).filter(Boolean)));
        const primeiraOs = osList[osList.length - 1];
        const ultimaOs = osList[0];
        const ativo = primeiraOs.ativos;
        const bloco = primeiraOs.blocos;

        // Calcula período real entre primeira e última OS
        const diff = new Date(ultimaOs.created_at).getTime() - new Date(primeiraOs.created_at).getTime();
        const periodoMeses = Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24 * 30)));

        let gravidade: "critica" | "alta" | "media" = "media";
        if (osList.length >= 4) gravidade = "critica";
        else if (osList.length >= 3) gravidade = "alta";

        padroesDet.push({
          ativo_id: ativoId,
          ativo_nome: ativo?.nome || "Ativo desconhecido",
          ativo_codigo: ativo?.codigo_identificacao || null,
          total_os: osList.length,
          periodo_meses: periodoMeses,
          tipos,
          gravidade,
          ultima_os: ultimaOs.created_at,
          bloco_nome: bloco?.nome || null,
        });
      }

      // Ordena por gravidade e quantidade
      padroesDet.sort((a, b) => {
        const g = { critica: 3, alta: 2, media: 1 };
        return g[b.gravidade] - g[a.gravidade] || b.total_os - a.total_os;
      });

      setPadroes(padroesDet.slice(0, 5));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { analisar(); }, [analisar]);

  if (loading) return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold">Investigador Automático</h3>
      </div>
      <p className="text-xs text-muted-foreground">Analisando padrões...</p>
    </div>
  );

  if (padroes.length === 0) return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold">Investigador Automático</h3>
      </div>
      <div className="flex items-center gap-2 text-emerald-600">
        <span className="text-xs">✅ Nenhum padrão de falha recorrente detectado nos últimos 6 meses.</span>
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold">Investigador Automático</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            {padroes.length} padrão(ões) detectado(s)
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={analisar}>
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      <div className="space-y-2">
        {padroes.map(p => (
          <div key={p.ativo_id} className={cn(
            "rounded-lg border p-3 space-y-1.5",
            p.gravidade === "critica" && "border-red-200 bg-red-50/50",
            p.gravidade === "alta" && "border-amber-200 bg-amber-50/50",
            p.gravidade === "media" && "border-yellow-200 bg-yellow-50/30",
          )}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className={cn("h-3.5 w-3.5 shrink-0",
                  p.gravidade === "critica" && "text-red-600",
                  p.gravidade === "alta" && "text-amber-600",
                  p.gravidade === "media" && "text-yellow-600",
                )} />
                <span className="text-sm font-semibold">
                  {p.ativo_codigo ? `${p.ativo_codigo} — ` : ""}{p.ativo_nome}
                </span>
              </div>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0",
                p.gravidade === "critica" && "bg-red-100 text-red-700",
                p.gravidade === "alta" && "bg-amber-100 text-amber-700",
                p.gravidade === "media" && "bg-yellow-100 text-yellow-700",
              )}>
                {p.gravidade === "critica" ? "🔴 Crítico" : p.gravidade === "alta" ? "🟠 Alto" : "🟡 Médio"}
              </span>
            </div>

            <p className="text-xs text-muted-foreground pl-5">
              <strong>{p.total_os} O.S.</strong> em {p.periodo_meses} {p.periodo_meses === 1 ? "mês" : "meses"}
              {p.bloco_nome && ` · ${p.bloco_nome}`}
              {p.tipos.length > 0 && ` · ${p.tipos.join(", ")}`}
            </p>

            <p className="text-xs pl-5 font-medium text-muted-foreground">
              ⚠️ Sugestão: {p.total_os >= 4
                ? "Avaliar substituição do equipamento ou revisão do dimensionamento."
                : p.total_os >= 3
                ? "Realizar inspeção detalhada e verificar causas raiz."
                : "Monitorar de perto e agendar preventiva."}
            </p>

            <div className="pl-5">
              <button
                onClick={() => navigate(`/ativos/${p.ativo_id}`)}
                className="text-xs text-primary hover:underline font-medium"
              >
                Ver prontuário do ativo →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}