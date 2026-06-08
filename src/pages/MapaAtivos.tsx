import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { useNavigate } from "react-router-dom";
import { Building2, Wrench, CheckCircle2, AlertTriangle, X, Eye, RefreshCw, TrendingUp } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type BlocoInfo = {
  id: string;
  nome: string;
  total_ativos: number;
  ativos_inativos: number;
  ativos_manutencao: number;
  os_abertas: number;
};

type AtivoDetalhe = {
  id: string;
  nome: string;
  codigo_identificacao: string | null;
  status: string;
  sistema: string | null;
  tipo: string | null;
  os_abertas: number;
};

export default function MapaAtivos() {
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const [blocos, setBlocos] = useState<BlocoInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBloco, setSelectedBloco] = useState<BlocoInfo | null>(null);
  const [ativosBloco, setAtivosBloco] = useState<AtivoDetalhe[]>([]);
  const [loadingAtivos, setLoadingAtivos] = useState(false);
  const [activeTab, setActiveTab] = useState<"mapa" | "heatmap">("mapa");

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [blocosRes, ativosRes, osRes] = await Promise.all([
        (supabase as any).from("blocos").select("id, nome").eq("company_id", companyId).order("nome"),
        (supabase as any).from("ativos").select("id, bloco_id, status").eq("company_id", companyId).neq("status", "excluído"),
        (supabase as any).from("ordens_servico").select("bloco_id, status").eq("company_id", companyId).not("status", "in", "(Concluída,Cancelada,Encerrado)"),
      ]);

      const blocosList = (blocosRes.data || []);
      const ativosList = (ativosRes.data || []);
      const osList = (osRes.data || []);

      const result: BlocoInfo[] = blocosList.map((b: any) => {
        const ativosDoBloco = ativosList.filter((a: any) => a.bloco_id === b.id);
        const osDoBloco = osList.filter((os: any) => os.bloco_id === b.id);
        return {
          id: b.id,
          nome: b.nome,
          total_ativos: ativosDoBloco.length,
          ativos_inativos: ativosDoBloco.filter((a: any) => a.status === "inativo").length,
          ativos_manutencao: ativosDoBloco.filter((a: any) => a.status === "manutenção").length,
          os_abertas: osDoBloco.length,
        };
      });

      setBlocos(result);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchAtivosBloco = async (blocoId: string) => {
    setLoadingAtivos(true);
    try {
      const [ativosRes, osRes] = await Promise.all([
        (supabase as any).from("ativos").select("id, nome, codigo_identificacao, status, sistema, tipo").eq("bloco_id", blocoId).neq("status", "excluído").order("nome"),
        (supabase as any).from("ordens_servico").select("ativo_id, status").eq("bloco_id", blocoId).not("status", "in", "(Concluída,Cancelada,Encerrado)"),
      ]);

      const osPorAtivo: Record<string, number> = {};
      (osRes.data || []).forEach((os: any) => {
        if (os.ativo_id) osPorAtivo[os.ativo_id] = (osPorAtivo[os.ativo_id] || 0) + 1;
      });

      setAtivosBloco((ativosRes.data || []).map((a: any) => ({
        ...a,
        os_abertas: osPorAtivo[a.id] || 0,
      })));
    } finally {
      setLoadingAtivos(false);
    }
  };

  const handleBlocoClick = (bloco: BlocoInfo) => {
    setSelectedBloco(bloco);
    fetchAtivosBloco(bloco.id);
  };

  const getBlocoColor = (bloco: BlocoInfo) => {
    if (bloco.os_abertas > 3) return "border-red-300 bg-red-50/50 dark:bg-red-950/20";
    if (bloco.os_abertas > 0) return "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20";
    if (bloco.ativos_manutencao > 0) return "border-yellow-300 bg-yellow-50/50";
    if (bloco.total_ativos === 0) return "border-muted bg-muted/20";
    return "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20";
  };

  const getBlocoStatus = (bloco: BlocoInfo) => {
    if (bloco.os_abertas > 3) return { icon: "🔴", label: `${bloco.os_abertas} OS abertas`, color: "text-red-600" };
    if (bloco.os_abertas > 0) return { icon: "🟡", label: `${bloco.os_abertas} OS aberta(s)`, color: "text-amber-600" };
    if (bloco.ativos_manutencao > 0) return { icon: "🔧", label: `${bloco.ativos_manutencao} em manutenção`, color: "text-yellow-600" };
    if (bloco.total_ativos === 0) return { icon: "⚪", label: "Sem ativos", color: "text-muted-foreground" };
    return { icon: "✅", label: "Tudo OK", color: "text-emerald-600" };
  };

 const maxOs = Math.max(...blocos.map(b => b.os_abertas), 1);
  const maxAtivos = Math.max(...blocos.map(b => b.total_ativos), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Mapa dos Ativos</h1>
            <p className="text-sm text-muted-foreground">Visualização por bloco e área</p>
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Abas */}
      <div className="flex gap-1 rounded-lg border p-1 bg-muted w-fit">
        {(["mapa", "heatmap"] as const).map(v => (
          <button key={v} onClick={() => setActiveTab(v)}
            className={cn("px-4 py-1.5 rounded text-sm font-medium transition-colors",
              activeTab === v ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}>
            {v === "mapa" ? "🗺️ Mapa" : "🔥 Heatmap"}
          </button>
        ))}
      </div>

      {loading ? <p className="text-muted-foreground">Carregando...</p> : activeTab === "mapa" ? (
        <>
          <div className="flex flex-wrap gap-3 text-xs">
            {[
              { cor: "bg-emerald-100 border-emerald-300", label: "Tudo OK" },
              { cor: "bg-amber-100 border-amber-300", label: "OS abertas" },
              { cor: "bg-red-100 border-red-300", label: "Muitas OS" },
              { cor: "bg-yellow-100 border-yellow-300", label: "Em manutenção" },
              { cor: "bg-muted border-muted-foreground/20", label: "Sem ativos" },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className={cn("w-4 h-4 rounded border", l.cor)} />
                <span className="text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {blocos.map(bloco => {
              const status = getBlocoStatus(bloco);
              return (
                <div key={bloco.id} onClick={() => handleBlocoClick(bloco)}
                  className={cn("rounded-xl border-2 p-4 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5",
                    getBlocoColor(bloco), selectedBloco?.id === bloco.id && "ring-2 ring-primary ring-offset-2")}>
                  <div className="flex items-start justify-between mb-3">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <span className="text-lg">{status.icon}</span>
                  </div>
                  <h3 className="font-bold text-sm leading-tight mb-2">{bloco.nome}</h3>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">{bloco.total_ativos} ativo(s)</p>
                    <p className={cn("text-xs font-medium", status.color)}>{status.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total de OS abertas</p>
              <p className="text-2xl font-bold text-amber-600">{blocos.reduce((s, b) => s + b.os_abertas, 0)}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Bloco mais crítico</p>
              <p className="text-lg font-bold text-red-600">{[...blocos].sort((a,b) => b.os_abertas - a.os_abertas)[0]?.nome || "—"}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total de ativos</p>
              <p className="text-2xl font-bold text-primary">{blocos.reduce((s, b) => s + b.total_ativos, 0)}</p>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6 space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-amber-600" />
              <h3 className="font-semibold">OS Abertas por Bloco</h3>
              <span className="text-xs text-muted-foreground ml-auto">escala de calor</span>
            </div>
            {[...blocos].sort((a, b) => b.os_abertas - a.os_abertas).map(bloco => {
              const pct = (bloco.os_abertas / maxOs) * 100;
              const cor = bloco.os_abertas === 0 ? "bg-emerald-400" : pct > 66 ? "bg-red-500" : pct > 33 ? "bg-amber-500" : "bg-yellow-400";
              return (
                <div key={bloco.id} onClick={() => handleBlocoClick(bloco)} className="cursor-pointer hover:opacity-80 transition-opacity">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{bloco.nome}</span>
                    <span className="text-sm font-bold">{bloco.os_abertas} OS</span>
                  </div>
                  <div className="h-8 rounded-lg bg-muted overflow-hidden">
                    <div className={cn("h-full rounded-lg transition-all duration-500 flex items-center px-3", cor)}
                      style={{ width: `${Math.max(pct, bloco.os_abertas > 0 ? 5 : 0)}%` }}>
                      {bloco.os_abertas > 0 && <span className="text-white text-xs font-bold">{bloco.os_abertas}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border bg-card p-6 space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Ativos por Bloco</h3>
            </div>
            {[...blocos].sort((a, b) => b.total_ativos - a.total_ativos).map(bloco => {
              const pct = (bloco.total_ativos / maxAtivos) * 100;
              return (
                <div key={bloco.id} onClick={() => handleBlocoClick(bloco)} className="cursor-pointer hover:opacity-80 transition-opacity">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{bloco.nome}</span>
                    <span className="text-sm font-bold">{bloco.total_ativos} ativos</span>
                  </div>
                  <div className="h-6 rounded-lg bg-muted overflow-hidden">
                    <div className="h-full rounded-lg bg-primary/60 transition-all duration-500 flex items-center px-3"
                      style={{ width: `${Math.max(pct, bloco.total_ativos > 0 ? 5 : 0)}%` }}>
                      {bloco.total_ativos > 0 && <span className="text-white text-xs font-bold">{bloco.total_ativos}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Drawer lateral */}
      {selectedBloco && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setSelectedBloco(null)} />
          <div className="w-full max-w-md bg-background shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-bold text-lg">{selectedBloco.nome}</p>
                  <p className="text-xs text-muted-foreground">{selectedBloco.total_ativos} ativo(s) · {selectedBloco.os_abertas} OS aberta(s)</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedBloco(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingAtivos ? <p className="text-muted-foreground text-sm">Carregando ativos...</p>
                : ativosBloco.length === 0 ? (
                  <div className="text-center py-8">
                    <Building2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-30" />
                    <p className="text-sm text-muted-foreground">Nenhum ativo cadastrado neste bloco.</p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate("/ativos")}>Cadastrar Ativo</Button>
                  </div>
                ) : ativosBloco.map(a => (
                  <div key={a.id} className={cn(
                    "rounded-lg border p-3 flex items-center justify-between gap-2",
                    a.os_abertas > 0 && "border-amber-200 bg-amber-50/30",
                    a.status === "manutenção" && "border-yellow-200 bg-yellow-50/30",
                    a.status === "inativo" && "border-zinc-200 bg-zinc-50/30",
                  )}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">{a.nome}</p>
                        {a.codigo_identificacao && <span className="text-xs font-mono text-muted-foreground shrink-0">{a.codigo_identificacao}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={cn("text-xs px-1.5 py-0.5 rounded-full border font-medium",
                          a.status === "ativo" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                          a.status === "manutenção" && "bg-yellow-50 text-yellow-700 border-yellow-200",
                          a.status === "inativo" && "bg-zinc-100 text-zinc-600 border-zinc-200",
                        )}>{a.status}</span>
                        {a.sistema && <span className="text-xs text-muted-foreground">{a.sistema}</span>}
                        {a.os_abertas > 0 && (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                            {a.os_abertas} OS aberta(s)
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => navigate(`/ativos/${a.id}`)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
            </div>
            <div className="p-4 border-t">
              <Button className="w-full" variant="outline" onClick={() => navigate(`/ativos?bloco=${selectedBloco.id}`)}>
                Ver todos os ativos deste bloco
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}