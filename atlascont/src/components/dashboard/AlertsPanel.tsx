import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock, CalendarClock, Bell } from "@/lib/icons";
import { isToday, isBefore, startOfDay, format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { isFinishedStatus } from "@/lib/os-status";

interface OsRow {
  status?: string | null;
  prazo?: string | null;
  codigo_os?: string | null;
  bloco_id?: string | null;
  prioridade?: string | null;
}

interface AtividadeRow {
  id: string;
  nome: string;
  data_termino: string;
  status: string;
  codigo_os: string | null;
}

interface CronoRow {
  id: string;
  titulo?: string;
  data_inicio?: string | null;
  data_fim?: string | null;
  status?: string;
}

interface Alert {
  type: "danger" | "warning" | "info";
  icon: typeof AlertTriangle;
  title: string;
  detail: string;
  to?: string;
}

const TYPE_STYLES = {
  danger: "border-red-500/40 bg-red-50 text-red-600",
  warning: "border-amber-500/40 bg-amber-50 text-amber-600",
  info: "border-blue-500/40 bg-blue-500/10 text-blue-600",
};

export default function AlertsPanel({
  osRows,
  atividades,
  cronogramas,
  blocoMap,
}: {
  osRows: OsRow[];
  atividades: AtividadeRow[];
  cronogramas: CronoRow[];
  blocoMap: Map<string, string>;
}) {
  const navigate = useNavigate();

  const alerts = useMemo(() => {
    const today = startOfDay(new Date());
    const todayStr = format(today, "yyyy-MM-dd");
    const result: Alert[] = [];

    // 1. OS atrasadas (prazo vencido, não concluída)
    const osAtrasadas = osRows.filter((r) => {
      if (!r.prazo) return false;
      if (isFinishedStatus(r.status)) return false;
      return isBefore(new Date(r.prazo + "T00:00:00"), today);
    });
    if (osAtrasadas.length > 0) {
      const detailLines = osAtrasadas.slice(0, 5).map((o) => {
        const code = o.codigo_os || "—";
        const prazoDate = new Date(o.prazo + "T00:00:00");
        const dias = differenceInDays(today, prazoDate);
        return `O.S. ${code} — Prazo: ${format(prazoDate, "dd/MM/yyyy")} (${dias}d atraso)`;
      });
      result.push({
        type: "danger",
        icon: AlertTriangle,
        title: `${osAtrasadas.length} O.S. com prazo vencido`,
        detail: detailLines.join(" • ") + (osAtrasadas.length > 5 ? ` e mais ${osAtrasadas.length - 5}` : ""),
        to: "/ordens-servico?atrasada=true",
      });
    }

    // 2. OS vencendo hoje
    const osHoje = osRows.filter((r) => {
      if (!r.prazo) return false;
      if (isFinishedStatus(r.status)) return false;
      return r.prazo === todayStr;
    });
    if (osHoje.length > 0) {
      const detailLines = osHoje.slice(0, 5).map((o) => {
        const code = o.codigo_os || "—";
        return `O.S. ${code} — Vencimento: ${format(today, "dd/MM/yyyy")}`;
      });
      result.push({
        type: "warning",
        icon: Clock,
        title: `${osHoje.length} O.S. vencem hoje`,
        detail: detailLines.join(" • "),
        to: "/ordens-servico",
      });
    }

    // 3. OS com prioridade Crítica não concluídas
    const osCriticas = osRows.filter((r) => {
      return r.prioridade === "Crítica" && !isFinishedStatus(r.status);
    });
    if (osCriticas.length > 0) {
      result.push({
        type: "danger",
        icon: AlertTriangle,
        title: `${osCriticas.length} O.S. com prioridade Crítica em aberto`,
        detail: osCriticas
          .slice(0, 5)
          .map((o) => o.codigo_os || "—")
          .join(", "),
        to: "/ordens-servico?prioridade=Crítica",
      });
    }

    // 4. Atividades atrasadas
    const ativAtrasadas = atividades.filter((a) => {
      return a.status !== "Concluído" && isBefore(new Date(a.data_termino + "T00:00:00"), today);
    });
    if (ativAtrasadas.length > 0) {
      result.push({
        type: "danger",
        icon: AlertTriangle,
        title: `${ativAtrasadas.length} atividade${ativAtrasadas.length > 1 ? "s" : ""} atrasada${ativAtrasadas.length > 1 ? "s" : ""}`,
        detail: ativAtrasadas
          .slice(0, 4)
          .map((a) => a.nome)
          .join(", "),
        to: "/cronogramas",
      });
    }

    // 5. Cronogramas iniciando hoje
    const cronosHoje = cronogramas.filter((c) => c.data_inicio === todayStr);
    if (cronosHoje.length > 0) {
      result.push({
        type: "info",
        icon: CalendarClock,
        title: `${cronosHoje.length} cronograma${cronosHoje.length > 1 ? "s" : ""} iniciando hoje`,
        detail: cronosHoje
          .slice(0, 3)
          .map((c) => c.titulo || "—")
          .join(", "),
        to: "/cronogramas",
      });
    }

    // 6. Cronogramas atrasados (data_fim vencida, não concluído)
    const cronosAtrasados = cronogramas.filter((c) => {
      if (!c.data_fim) return false;
      const st = (c.status || "").toLowerCase().trim();
      if (st === "concluído") return false;
      return isBefore(new Date(c.data_fim + "T00:00:00"), today);
    });
    if (cronosAtrasados.length > 0) {
      result.push({
        type: "warning",
        icon: CalendarClock,
        title: `${cronosAtrasados.length} cronograma${cronosAtrasados.length > 1 ? "s" : ""} atrasado${cronosAtrasados.length > 1 ? "s" : ""}`,
        detail: cronosAtrasados
          .slice(0, 3)
          .map((c) => c.titulo || "—")
          .join(", "),
        to: "/cronogramas",
      });
    }

    return result;
  }, [osRows, atividades, cronogramas, blocoMap]);

  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-5 mt-6">
        <div className="flex items-center gap-2 text-emerald-600">
          <Bell className="h-5 w-5" />
          <span className="font-semibold">Nenhum alerta — tudo em dia! 🎉</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-5 mt-6">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <Bell className="h-5 w-5 text-amber-600" />
        Alertas
        <span className="text-xs bg-red-500/15 text-red-600 rounded-full px-2 py-0.5">{alerts.length}</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {alerts.map((alert, i) => (
          <div
            key={i}
            onClick={() => alert.to && navigate(alert.to)}
            className={cn(
              "rounded-lg border p-3 flex items-start gap-3",
              TYPE_STYLES[alert.type],
              alert.to && "cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all duration-200",
            )}
          >
            <alert.icon className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-semibold text-sm">{alert.title}</p>
              <p className="text-xs opacity-80 line-clamp-2">{alert.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
