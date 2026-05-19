import { useMemo, useState } from "react";
import { format, differenceInDays, startOfDay, addDays, startOfWeek, startOfMonth, endOfMonth, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Activity = {
  id: string;
  nome: string;
  data_inicio: string;
  data_termino: string;
  status: string;
  responsavel: string | null;
  codigo_os: string | null;
};

interface CronogramaGanttProps {
  atividades: Activity[];
}

type ZoomLevel = "dias" | "semanas" | "meses";

const STATUS_CONFIG: Record<string, { bg: string; label: string }> = {
  "Em andamento": { bg: "bg-sky-500", label: "Em andamento" },
  "Não iniciado": { bg: "bg-zinc-400", label: "Não iniciado" },
  "Concluído": { bg: "bg-emerald-500", label: "Concluído" },
  "Atrasada": { bg: "bg-rose-500", label: "Atrasada" },
};

function getEffectiveStatus(a: Activity, today: Date) {
  if (a.status === "Concluído") return "Concluído";
  const termino = new Date(a.data_termino + "T00:00:00");
  if (termino < today) return "Atrasada";
  if (a.status === "Em andamento") return "Em andamento";
  return "Não iniciado";
}

export default function CronogramaGantt({ atividades }: CronogramaGanttProps) {
  const [zoom, setZoom] = useState<ZoomLevel>("semanas");
  const today = startOfDay(new Date());

  const { timelineStart, timelineEnd, columns, colWidth } = useMemo(() => {
    if (atividades.length === 0) {
      const s = startOfMonth(today);
      const e = endOfMonth(today);
      return { timelineStart: s, timelineEnd: e, columns: [] as { date: Date; label: string }[], colWidth: 40 };
    }

    let minDate = new Date(atividades[0].data_inicio + "T00:00:00");
    let maxDate = new Date(atividades[0].data_termino + "T00:00:00");
    atividades.forEach((a) => {
      const s = new Date(a.data_inicio + "T00:00:00");
      const e = new Date(a.data_termino + "T00:00:00");
      if (s < minDate) minDate = s;
      if (e > maxDate) maxDate = e;
    });

    const padStart = addDays(minDate, -3);
    const padEnd = addDays(maxDate, 3);
    const cols: { date: Date; label: string }[] = [];
    let cw = 40;

    if (zoom === "dias") {
      cw = 40;
      let d = startOfDay(padStart);
      while (d <= padEnd) { cols.push({ date: d, label: format(d, "dd") }); d = addDays(d, 1); }
    } else if (zoom === "semanas") {
      cw = 56;
      let d = startOfWeek(padStart, { weekStartsOn: 1 });
      while (d <= padEnd) { cols.push({ date: d, label: format(d, "dd/MM") }); d = addDays(d, 7); }
    } else {
      cw = 90;
      let d = startOfMonth(padStart);
      while (d <= padEnd) { cols.push({ date: d, label: format(d, "MMM/yy", { locale: ptBR }) }); d = addMonths(d, 1); }
    }

    return { timelineStart: padStart, timelineEnd: padEnd, columns: cols, colWidth: cw };
  }, [atividades, zoom, today]);

  const totalDays = differenceInDays(timelineEnd, timelineStart) || 1;
  const totalWidth = columns.length * colWidth;

  const getBarStyle = (a: Activity) => {
    const s = new Date(a.data_inicio + "T00:00:00");
    const e = new Date(a.data_termino + "T00:00:00");
    const startOffset = Math.max(0, differenceInDays(s, timelineStart));
    const duration = Math.max(1, differenceInDays(e, s) + 1);
    const left = (startOffset / totalDays) * totalWidth;
    const width = Math.max(24, (duration / totalDays) * totalWidth);
    return { left, width };
  };

  if (atividades.length === 0) {
    return <p className="text-muted-foreground">Nenhuma atividade para exibir no Gantt.</p>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4 w-full">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-foreground">Gráfico de Gantt</h3>
          <div className="flex flex-wrap items-center gap-4">
            <Select value={zoom} onValueChange={(v) => setZoom(v as ZoomLevel)}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dias">Dias</SelectItem>
                <SelectItem value="semanas">Semanas</SelectItem>
                <SelectItem value="meses">Meses</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span className={cn("h-2.5 w-2.5 rounded-full inline-block", cfg.bg)} />
                  {cfg.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Chart */}
        <ScrollArea className="rounded-xl border bg-background/50 w-full">
          <div className="flex">
            {/* Sticky left labels */}
            <div className="sticky left-0 z-10 bg-card border-r min-w-[180px] md:min-w-[220px] flex-shrink-0">
              <div className="h-10 border-b px-3 flex items-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/40">
                Atividade
              </div>
              {atividades.map((a, i) => {
                const status = getEffectiveStatus(a, today);
                const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["Não iniciado"];
                return (
                  <div
                    key={a.id}
                    className={cn(
                      "h-14 border-b px-3 flex items-center gap-2 text-xs",
                      i % 2 === 0 ? "bg-card" : "bg-muted/20"
                    )}
                    title={a.nome}
                  >
                    <span className={cn("h-2 w-2 rounded-full flex-shrink-0", cfg.bg)} />
                    <span className="truncate font-medium text-foreground">{a.nome}</span>
                  </div>
                );
              })}
            </div>

            {/* Timeline area */}
            <div style={{ minWidth: totalWidth }} className="relative">
              {/* Column headers */}
              <div className="h-10 border-b flex bg-muted/40">
                {columns.map((col, i) => (
                  <div
                    key={i}
                    className="border-r border-border/30 flex items-center justify-center text-[11px] font-medium text-muted-foreground flex-shrink-0"
                    style={{ width: colWidth }}
                  >
                    {col.label}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {atividades.map((a, i) => {
                const { left, width } = getBarStyle(a);
                const status = getEffectiveStatus(a, today);
                const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["Não iniciado"];
                return (
                  <div key={a.id} className={cn("h-14 border-b relative", i % 2 === 0 ? "bg-card" : "bg-muted/20")}>
                    {columns.map((_, ci) => (
                      <div key={ci} className="absolute top-0 bottom-0 border-r border-border/15" style={{ left: ci * colWidth, width: colWidth }} />
                    ))}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "absolute top-2 h-10 rounded-lg cursor-pointer",
                            "transition-all duration-150 hover:brightness-110 hover:shadow-lg",
                            "shadow-md",
                            cfg.bg
                          )}
                          style={{ left, width }}
                        >
                          <span className="text-[11px] text-white font-semibold px-2.5 truncate block leading-10 drop-shadow-sm">
                            {width > 80 ? a.nome : ""}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs space-y-1 p-3">
                        <p className="font-semibold text-sm">{a.nome}</p>
                        <p>Início: {format(new Date(a.data_inicio + "T00:00:00"), "dd/MM/yyyy")}</p>
                        <p>Término: {format(new Date(a.data_termino + "T00:00:00"), "dd/MM/yyyy")}</p>
                        {a.responsavel && <p>Responsável: {a.responsavel}</p>}
                        <p>Status: <span className="font-medium">{cfg.label}</span></p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}

              {/* Today line */}
              {(() => {
                const todayOffset = differenceInDays(today, timelineStart);
                if (todayOffset >= 0 && todayOffset <= totalDays) {
                  const todayLeft = (todayOffset / totalDays) * totalWidth;
                  return (
                    <div className="absolute top-0 bottom-0 z-20 pointer-events-none" style={{ left: todayLeft }}>
                      <div className="absolute top-0 bottom-0 w-0.5 bg-destructive/60" />
                      <div className="absolute top-0 -translate-x-1/2 bg-destructive text-destructive-foreground text-[10px] font-bold px-2 py-0.5 rounded-b-md shadow-md">
                        Hoje
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
