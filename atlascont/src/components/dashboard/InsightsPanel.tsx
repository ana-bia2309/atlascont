import { useNavigate } from "react-router-dom";
import { AlertTriangle, TrendingUp, TrendingDown, Building2, CheckCircle2, Clock, Lightbulb, ArrowRight } from "@/lib/icons";
import { isFinishedStatus } from "@/lib/os-status";
import { Button } from "@/components/ui/button";

type OSRow = {
  status: string | null;
  created_at: string | null;
  bloco_id: string | null;
  data_inicio: string | null;
  data_termino: string | null;
  prazo: string | null;
};

type Props = {
  rows: OSRow[];
  blocoMap: Map<string, string>;
};

type Insight = {
  icon: React.ElementType;
  text: string;
  type: "warning" | "info" | "success";
  action?: { label: string; to: string };
};

export default function InsightsPanel({ rows, blocoMap }: Props) {
  const navigate = useNavigate();
  const today = new Date().toISOString().substring(0, 10);

  const atrasadasHoje = rows.filter((r) => {
    const st = (r.status || "").toLowerCase().trim();
    if (st === "atrasada") return true;
    if (isFinishedStatus(r.status)) return false;
    return r.prazo && r.prazo < today;
  });

  const concluidasHoje = rows.filter((r) => {
    return isFinishedStatus(r.status) && r.data_termino === today;
  });

  const blocoAberto: Record<string, number> = {};
  rows.forEach((r) => {
    if (!isFinishedStatus(r.status)) {
      const nome = r.bloco_id ? (blocoMap.get(r.bloco_id) || "Sem bloco") : "Sem bloco";
      blocoAberto[nome] = (blocoAberto[nome] || 0) + 1;
    }
  });
  const topBloco = Object.entries(blocoAberto).sort((a, b) => b[1] - a[1])[0];

  const duracoes: number[] = [];
  rows.forEach((r) => {
    if (isFinishedStatus(r.status) && r.data_inicio && r.data_termino) {
      const d1 = new Date(r.data_inicio).getTime();
      const d2 = new Date(r.data_termino).getTime();
      if (d2 >= d1) duracoes.push((d2 - d1) / (1000 * 60 * 60 * 24));
    }
  });
  const tempoMedio = duracoes.length > 0 ? (duracoes.reduce((a, b) => a + b, 0) / duracoes.length) : null;

  const alerts: { icon: React.ElementType; text: string; color: string; action?: { label: string; to: string } }[] = [
    {
      icon: AlertTriangle,
      text: `${atrasadasHoje.length} O.S. atrasada(s) hoje`,
      color: atrasadasHoje.length > 0 ? "text-red-600" : "text-muted-foreground",
      action: atrasadasHoje.length > 0 ? { label: "Ver atrasadas", to: "/ordens-servico?status=Atrasada" } : undefined,
    },
    {
      icon: Building2,
      text: topBloco ? `${topBloco[0]} — ${topBloco[1]} O.S. em aberto` : "Nenhuma O.S. em aberto",
      color: topBloco && topBloco[1] > 0 ? "text-yellow-600" : "text-muted-foreground",
      action: topBloco && topBloco[1] > 0 ? { label: "Abrir O.S.", to: "/ordens-servico" } : undefined,
    },
    {
      icon: Clock,
      text: tempoMedio !== null ? `Tempo médio de execução: ${tempoMedio.toFixed(1)} dias` : "Sem dados de tempo médio",
      color: "text-sky-600",
    },
    {
      icon: CheckCircle2,
      text: `${concluidasHoje.length} O.S. concluída(s) hoje`,
      color: concluidasHoje.length > 0 ? "text-emerald-600" : "text-muted-foreground",
      action: concluidasHoje.length > 0 ? { label: "Abrir O.S.", to: "/ordens-servico?status=Concluída" } : undefined,
    },
  ];

  const insights: Insight[] = [];

  if (topBloco && topBloco[1] > 0) {
    insights.push({
      icon: Building2,
      text: `${topBloco[0]} está com maior volume de demandas (${topBloco[1]} O.S. em aberto).`,
      type: "warning",
      action: { label: "Abrir O.S.", to: "/ordens-servico" },
    });
  }

  if (atrasadasHoje.length > 0) {
    insights.push({
      icon: AlertTriangle,
      text: `Existem ${atrasadasHoje.length} O.S. atrasada(s) que precisam de atenção.`,
      type: "warning",
      action: { label: "Resolver agora", to: "/ordens-servico?status=Atrasada" },
    });
  }

  if (tempoMedio !== null) {
    insights.push({
      icon: tempoMedio > 7 ? TrendingUp : TrendingDown,
      text: tempoMedio > 7
        ? `Tempo médio de execução está alto (${tempoMedio.toFixed(1)} dias). Considere redistribuir prioridades.`
        : `Tempo médio de execução está em ${tempoMedio.toFixed(1)} dias. Bom ritmo!`,
      type: tempoMedio > 7 ? "warning" : "success",
    });
  }

  const totalAbertas = rows.filter((r) => !isFinishedStatus(r.status)).length;
  if (totalAbertas === 0 && rows.length > 0) {
    insights.push({ icon: CheckCircle2, text: "Todas as O.S. estão concluídas! 🎉", type: "success" });
  }

  const typeStyles = {
    warning: "border-yellow-500/30 bg-yellow-500/5",
    info: "border-sky-500/30 bg-sky-500/5",
    success: "border-emerald-500/30 bg-emerald-500/5",
  };

  const typeIconColor = {
    warning: "text-yellow-600",
    info: "text-sky-600",
    success: "text-emerald-600",
  };

  return (
    <>
      <div className="rounded-xl border bg-card p-5 mt-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          Alertas
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
              <a.icon className={`h-5 w-5 shrink-0 ${a.color}`} />
              <span className="text-sm flex-1">{a.text}</span>
              {a.action && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-xs gap-1"
                  onClick={() => navigate(a.action!.to)}
                >
                  {a.action.label}
                  <ArrowRight className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {insights.length > 0 && (
        <div className="rounded-xl border bg-card p-5 mt-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-600" />
            Insights
          </h2>
          <div className="flex flex-col gap-3">
            {insights.map((ins, i) => (
              <div key={i} className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${typeStyles[ins.type]}`}>
                <ins.icon className={`h-5 w-5 shrink-0 ${typeIconColor[ins.type]}`} />
                <span className="text-sm flex-1">{ins.text}</span>
                {ins.action && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-xs gap-1"
                    onClick={() => navigate(ins.action!.to)}
                  >
                    {ins.action.label}
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
