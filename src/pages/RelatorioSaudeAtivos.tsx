import { useCallback, useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Search, X, Activity, Wrench, AlertTriangle, CheckCircle2, Clock, TrendingUp, TrendingDown } from "@/lib/icons";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

type AtivoSaude = {
  id: string;
  nome: string;
  codigo_identificacao: string | null;
  sistema: string | null;
  status: string;
  bloco_nome: string | null;
  score: number;
  osAbertas: number;
  osAtrasadas: number;
  osConcluidas: number;
  preventivasTotal: number;
  preventivasConcluidas: number;
  ultimaManutencao: string | null;
  proximaPreventiva: string | null;
};

function getScoreColor(score: number) {
  if (score >= 75) return { text: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", bar: "bg-emerald-500" };
  if (score >= 50) return { text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", bar: "bg-amber-500" };
  return { text: "text-red-600", bg: "bg-red-50", border: "border-red-200", bar: "bg-red-500" };
}

function getScoreLabel(score: number) {
  if (score >= 85) return "Excelente";
  if (score >= 70) return "Bom";
  if (score >= 50) return "Regular";
  if (score >= 30) return "Crítico";
  return "Emergência";
}

function ScoreBar({ score }: { score: number }) {
  const colors = getScoreColor(score);
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-2 rounded-full transition-all duration-700", colors.bar)}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={cn("text-sm font-semibold w-8 text-right", colors.text)}>{score}</span>
    </div>
  );
}

export default function RelatorioSaudeAtivos() {
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const [ativos, setAtivos] = useState<AtivoSaude[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [sortBy, setSortBy] = useState<"score" | "nome" | "osAbertas">("score");

  const fetchData = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);

      const [ativosRes, blocosRes, osRes, opRes] = await Promise.all([
        (supabase as any).from("ativos")
          .select("id, nome, codigo_identificacao, sistema, status, bloco_id")
          .eq("company_id", companyId)
          .not("status", "eq", "excluído")
          .order("nome"),
        (supabase as any).from("blocos").select("id, nome").eq("company_id", companyId),
        (supabase as any).from("ordens_servico")
          .select("id, ativo_id, status, prazo, created_at, data_termino, finalizado_em")
          .eq("company_id", companyId),
        (supabase as any).from("ordens_preventivas")
          .select("id, ativo_id, status, data_inicio, data_fim")
          .eq("company_id", companyId),
      ]);

      const blocoMap: Record<string, string> = {};
      (blocosRes?.data || []).forEach((b: any) => { blocoMap[b.id] = b.nome; });

      const osList: any[] = osRes?.data || [];
      const opList: any[] = opRes?.data || [];

      const result: AtivoSaude[] = (ativosRes?.data || []).map((ativo: any) => {
        const osDoAtivo = osList.filter(os => os.ativo_id === ativo.id);
        const opDoAtivo = opList.filter(op => op.ativo_id === ativo.id);

        const osAbertas = osDoAtivo.filter(os => {
          const st = (os.status || "").toLowerCase();
          return !["concluída", "concluida", "cancelada"].includes(st);
        }).length;

        const osAtrasadas = osDoAtivo.filter(os => {
          const st = (os.status || "").toLowerCase();
          if (["concluída", "concluida", "cancelada"].includes(st)) return false;
          return os.prazo && os.prazo < today;
        }).length;

        const osConcluidas = osDoAtivo.filter(os => {
          const st = (os.status || "").toLowerCase();
          return st === "concluída" || st === "concluida";
        }).length;

        const preventivasTotal = opDoAtivo.length;
        const preventivasConcluidas = opDoAtivo.filter(op => {
          const st = (op.status || "").toLowerCase();
          return st === "concluída" || st === "concluida";
        }).length;

        // Última manutenção
        const concluidasComData = osDoAtivo
          .filter(os => {
            const st = (os.status || "").toLowerCase();
            return (st === "concluída" || st === "concluida") && (os.finalizado_em || os.data_termino);
          })
          .map(os => os.finalizado_em || os.data_termino)
          .sort()
          .reverse();
        const ultimaManutencao = concluidasComData[0] || null;

        // Próxima preventiva
        const proximasOps = opDoAtivo
          .filter(op => {
            const st = (op.status || "").toLowerCase();
            return !["concluída", "concluida", "cancelada"].includes(st) && op.data_inicio >= today;
          })
          .map(op => op.data_inicio)
          .sort();
        const proximaPreventiva = proximasOps[0] || null;

        // Calcular score
        let score = 100;

        // Penaliza OS abertas (-5 por OS aberta, máx -25)
        score -= Math.min(osAbertas * 5, 25);

        // Penaliza OS atrasadas (-15 por OS atrasada, máx -45)
        score -= Math.min(osAtrasadas * 15, 45);

        // Penaliza se não tem manutenção recente
        if (ultimaManutencao) {
          const diasSemManutencao = differenceInDays(new Date(), new Date(ultimaManutencao));
          if (diasSemManutencao > 365) score -= 20;
          else if (diasSemManutencao > 180) score -= 10;
          else if (diasSemManutencao > 90) score -= 5;
        } else if (osConcluidas === 0) {
          score -= 15; // nunca teve manutenção
        }

        // Penaliza se preventivas em atraso
        const preventivasAtrasadas = opDoAtivo.filter(op => {
          const st = (op.status || "").toLowerCase();
          return !["concluída", "concluida", "cancelada"].includes(st) && op.data_inicio < today;
        }).length;
        score -= Math.min(preventivasAtrasadas * 10, 20);

        // Bonifica se tem preventivas em dia
        if (preventivasTotal > 0 && preventivasConcluidas > 0) {
          const taxaPreventiva = preventivasConcluidas / preventivasTotal;
          score += Math.round(taxaPreventiva * 10);
        }

        score = Math.max(0, Math.min(100, score));

        return {
          id: ativo.id,
          nome: ativo.nome,
          codigo_identificacao: ativo.codigo_identificacao,
          sistema: ativo.sistema,
          status: ativo.status,
          bloco_nome: ativo.bloco_id ? blocoMap[ativo.bloco_id] || null : null,
          score,
          osAbertas,
          osAtrasadas,
          osConcluidas,
          preventivasTotal,
          preventivasConcluidas,
          ultimaManutencao,
          proximaPreventiva,
        };
      });

      setAtivos(result);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao carregar o relatório", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    return ativos
      .filter(a => {
        if (filterStatus !== "__all__") {
          if (filterStatus === "critico" && a.score >= 50) return false;
          if (filterStatus === "regular" && (a.score < 50 || a.score >= 75)) return false;
          if (filterStatus === "bom" && a.score < 75) return false;
        }
        if (filterSearch.trim()) {
          const q = filterSearch.toLowerCase();
          return a.nome.toLowerCase().includes(q) ||
            (a.codigo_identificacao || "").toLowerCase().includes(q) ||
            (a.sistema || "").toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "score") return a.score - b.score;
        if (sortBy === "osAbertas") return b.osAbertas - a.osAbertas;
        return a.nome.localeCompare(b.nome);
      });
  }, [ativos, filterSearch, filterStatus, sortBy]);

  const scoreGeral = ativos.length > 0
    ? Math.round(ativos.reduce((s, a) => s + a.score, 0) / ativos.length)
    : null;

  const criticos = ativos.filter(a => a.score < 50).length;
  const regulares = ativos.filter(a => a.score >= 50 && a.score < 75).length;
  const bons = ativos.filter(a => a.score >= 75).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Saúde dos Ativos</h1>
            <p className="text-sm text-muted-foreground">Score de saúde por equipamento</p>
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={fetchData}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Score geral + resumo */}
      {scoreGeral !== null && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className={cn("rounded-xl border p-5 col-span-2 sm:col-span-1", getScoreColor(scoreGeral).bg, getScoreColor(scoreGeral).border)}>
            <p className="text-xs text-muted-foreground mb-1">Score médio geral</p>
            <p className={cn("text-4xl font-bold", getScoreColor(scoreGeral).text)}>{scoreGeral}</p>
            <p className={cn("text-sm font-medium mt-1", getScoreColor(scoreGeral).text)}>{getScoreLabel(scoreGeral)}</p>
          </div>
          <div className="rounded-xl border bg-emerald-50 border-emerald-200 p-5">
            <p className="text-xs text-muted-foreground mb-1">Saudáveis</p>
            <p className="text-3xl font-bold text-emerald-600">{bons}</p>
            <p className="text-xs text-emerald-600 mt-1">score ≥ 75</p>
          </div>
          <div className="rounded-xl border bg-amber-50 border-amber-200 p-5">
            <p className="text-xs text-muted-foreground mb-1">Atenção</p>
            <p className="text-3xl font-bold text-amber-600">{regulares}</p>
            <p className="text-xs text-amber-600 mt-1">score 50–74</p>
          </div>
          <div className="rounded-xl border bg-red-50 border-red-200 p-5">
            <p className="text-xs text-muted-foreground mb-1">Críticos</p>
            <p className="text-3xl font-bold text-red-600">{criticos}</p>
            <p className="text-xs text-red-600 mt-1">score &lt; 50</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="flex-1 min-w-[180px]">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Buscar ativo..." className="pl-9" />
          </div>
        </div>
        <div className="flex gap-2">
          {[
            { value: "__all__", label: "Todos" },
            { value: "critico", label: "Críticos" },
            { value: "regular", label: "Atenção" },
            { value: "bom", label: "Saudáveis" },
          ].map(f => (
            <Button
              key={f.value}
              variant={filterStatus === f.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          <span className="text-xs text-muted-foreground self-center">Ordenar:</span>
          {[
            { value: "score", label: "Score" },
            { value: "osAbertas", label: "OS Abertas" },
            { value: "nome", label: "Nome" },
          ].map(s => (
            <Button
              key={s.value}
              variant={sortBy === s.value ? "default" : "outline"}
              size="sm"
              onClick={() => setSortBy(s.value as any)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Lista de ativos */}
      {loading ? (
        <p className="text-muted-foreground text-center py-12">Calculando scores...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">Nenhum ativo encontrado.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(ativo => {
            const colors = getScoreColor(ativo.score);
            const label = getScoreLabel(ativo.score);
            return (
              <div
                key={ativo.id}
                className="rounded-xl border bg-card p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => navigate(`/ativos/${ativo.id}`)}
              >
                <div className="flex items-start gap-4">
                  {/* Score circle */}
                  <div className={cn(
                    "h-14 w-14 rounded-full border-2 flex flex-col items-center justify-center shrink-0",
                    colors.bg, colors.border
                  )}>
                    <span className={cn("text-lg font-bold leading-tight", colors.text)}>{ativo.score}</span>
                    <span className={cn("text-[9px] font-medium", colors.text)}>{label}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-semibold text-sm">{ativo.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {[ativo.codigo_identificacao, ativo.sistema, ativo.bloco_nome].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("text-xs shrink-0",
                        ativo.status === "ativo" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        ativo.status === "manutenção" ? "bg-amber-50 text-amber-700 border-amber-200" :
                        "bg-zinc-100 text-zinc-600 border-zinc-200"
                      )}>
                        {ativo.status}
                      </Badge>
                    </div>

                    {/* Indicadores */}
                    <div className="flex flex-wrap gap-3 mt-2">
                      {ativo.osAtrasadas > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600">
                          <AlertTriangle className="h-3 w-3" /> {ativo.osAtrasadas} OS atrasada{ativo.osAtrasadas > 1 ? "s" : ""}
                        </span>
                      )}
                      {ativo.osAbertas > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                          <Wrench className="h-3 w-3" /> {ativo.osAbertas} OS em aberto
                        </span>
                      )}
                      {ativo.osConcluidas > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> {ativo.osConcluidas} OS concluída{ativo.osConcluidas > 1 ? "s" : ""}
                        </span>
                      )}
                      {ativo.ultimaManutencao && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" /> Última manutenção: {format(new Date(ativo.ultimaManutencao), "dd/MM/yyyy")}
                        </span>
                      )}
                      {ativo.proximaPreventiva && (
                        <span className="inline-flex items-center gap-1 text-xs text-primary">
                          <TrendingUp className="h-3 w-3" /> Próxima preventiva: {format(new Date(ativo.proximaPreventiva), "dd/MM/yyyy")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}