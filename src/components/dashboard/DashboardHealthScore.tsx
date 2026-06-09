import { useMemo, useEffect, useRef } from "react";
import { computeSlaStatus } from "@/lib/sla-utils";
import { isFinishedStatus } from "@/lib/os-status";
import { differenceInCalendarDays, startOfDay } from "date-fns";

type OSRow = {
  id: string;
  status: string | null;
  created_at: string | null;
  prazo: string | null;
  sla_prazo_limite: string | null;
  origem: string | null;
  data_inicio: string | null;
  finalizado_em: string | null;
};

type Props = {
  rows: OSRow[];
  ordensPreventivasCount: number;
};

function getColor(v: number) {
  if (v >= 75) return "#1D9E75";
  if (v >= 50) return "#EF9F27";
  return "#E24B4A";
}

function getLabel(v: number) {
  if (v >= 85) return "Excelente";
  if (v >= 70) return "Bom";
  if (v >= 50) return "Regular";
  return "Crítico";
}

function GaugeCanvas({ score, color }: { score: number; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cx = 140, cy = 140, r = 110;
    const startAngle = Math.PI;
    const endAngle = 2 * Math.PI;
    const totalSpan = endAngle - startAngle;

    const duration = 1400;
    const startTime = performance.now();

    function ease(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

    function draw(current: number) {
      ctx.clearRect(0, 0, 280, 160);

      // Track segments
      const segments = [
        { from: 0, to: 0.33, colors: ["#E24B4A", "#EF9F27"] },
        { from: 0.33, to: 0.66, colors: ["#EF9F27", "#97C459"] },
        { from: 0.66, to: 1, colors: ["#97C459", "#1D9E75"] },
      ];

      segments.forEach(({ from, to, colors }) => {
        const a1 = startAngle + from * totalSpan;
        const a2 = startAngle + to * totalSpan;
        const grad = ctx.createLinearGradient(
          cx + r * Math.cos(a1), cy + r * Math.sin(a1),
          cx + r * Math.cos(a2), cy + r * Math.sin(a2)
        );
        grad.addColorStop(0, colors[0]);
        grad.addColorStop(1, colors[1]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, a1, a2);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 14;
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.18;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      // Filled arc
      if (current > 0) {
        const fillEnd = startAngle + (current / 100) * totalSpan;
        const grad2 = ctx.createLinearGradient(
          cx + r * Math.cos(startAngle), cy + r * Math.sin(startAngle),
          cx + r * Math.cos(fillEnd), cy + r * Math.sin(fillEnd)
        );
        grad2.addColorStop(0, color === "#E24B4A" ? "#E24B4A" : color === "#EF9F27" ? "#EF9F27" : "#97C459");
        grad2.addColorStop(1, color);
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, fillEnd);
        ctx.strokeStyle = color;
        ctx.lineWidth = 14;
        ctx.lineCap = "round";
        ctx.globalAlpha = 1;
        ctx.stroke();
      }

      // Needle
      const needleAngle = startAngle + (current / 100) * totalSpan;
      const tipX = cx + (r - 10) * Math.cos(needleAngle);
      const tipY = cy + (r - 10) * Math.sin(needleAngle);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(tipX, tipY);
      ctx.strokeStyle = "rgba(100,100,100,0.6)";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(100,100,100,0.7)";
      ctx.fill();
    }

    function animate(now: number) {
      const t = Math.min((now - startTime) / duration, 1);
      const current = Math.round(ease(t) * score);
      draw(current);
      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    }

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [score, color]);

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={160}
      style={{ display: "block", margin: "0 auto" }}
      role="img"
      aria-label={`Gauge mostrando score de saúde operacional: ${score}/100`}
    />
  );
}

export default function DashboardHealthScore({ rows, ordensPreventivasCount }: Props) {
  const factors = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const currentMonth = today.slice(0, 7);
    const todayDate = startOfDay(new Date());

    // 1. OS no prazo — % OS concluídas dentro do SLA
    const concluidasComSla = rows.filter(r => {
      const st = (r.status || "").toLowerCase().trim();
      return (st === "concluída" || st === "concluida") && r.sla_prazo_limite;
    });
    const noPrazoSla = concluidasComSla.filter(r => {
      const sla = computeSlaStatus(r.sla_prazo_limite, r.status, r.created_at);
      return sla.status === "dentro_do_prazo";
    });
    const osPrazo = concluidasComSla.length > 0
      ? Math.round((noPrazoSla.length / concluidasComSla.length) * 100)
      : null;

    // 2. Preventivas executadas — % preventivas concluídas
    const preventivas = rows.filter(r => r.origem === "Preventiva");
    const totalPreventivas = preventivas.length + ordensPreventivasCount;
    const prevConc = preventivas.filter(r => {
      const st = (r.status || "").toLowerCase().trim();
      return st === "concluída" || st === "concluida";
    }).length;
    const prevExec = totalPreventivas > 0
      ? Math.round((prevConc / totalPreventivas) * 100)
      : null;

    // 3. OS sem atraso — % OS abertas que não estão atrasadas
    const abertas = rows.filter(r => !isFinishedStatus(r.status));
    const atrasadas = abertas.filter(r => r.prazo && r.prazo < today);
    const semAtraso = abertas.length > 0
      ? Math.round(((abertas.length - atrasadas.length) / abertas.length) * 100)
      : null;

    // 4. Conclusão no mês — % OS do mês atual concluídas
    const doMes = rows.filter(r => r.created_at && r.created_at.slice(0, 7) === currentMonth);
    const conclMes = doMes.filter(r => {
      const st = (r.status || "").toLowerCase().trim();
      return st === "concluída" || st === "concluida";
    });
    const conclusaoMes = doMes.length > 0
      ? Math.round((conclMes.length / doMes.length) * 100)
      : null;

    return [
      { key: "prazo", label: "OS no prazo", desc: "Concluídas dentro do SLA", value: osPrazo, weight: 0.30 },
      { key: "prev", label: "Preventivas executadas", desc: "Taxa de execução preventiva", value: prevExec, weight: 0.25 },
      { key: "atraso", label: "OS sem atraso", desc: "OS ativas dentro do prazo", value: semAtraso, weight: 0.25 },
      { key: "conc", label: "Conclusão no mês", desc: "Ritmo de conclusão mensal", value: conclusaoMes, weight: 0.20 },
    ];
  }, [rows, ordensPreventivasCount]);

  const score = useMemo(() => {
    const valid = factors.filter(f => f.value !== null);
    if (valid.length === 0) return null;
    const totalWeight = valid.reduce((s, f) => s + f.weight, 0);
    const weighted = valid.reduce((s, f) => s + (f.value! * f.weight), 0);
    return Math.round(weighted / totalWeight);
  }, [factors]);

  if (score === null) return null;

  const color = getColor(score);
  const label = getLabel(score);

  const pillStyles: Record<string, { bg: string; color: string }> = {
    "Excelente": { bg: "#E1F5EE", color: "#0F6E56" },
    "Bom":       { bg: "#EAF3DE", color: "#3B6D11" },
    "Regular":   { bg: "#FAEEDA", color: "#854F0B" },
    "Crítico":   { bg: "#FCEBEB", color: "#A32D2D" },
  };
  const pill = pillStyles[label];

  return (
    <div className="rounded-xl border bg-card p-5 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Saúde Operacional</h2>
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full"
          style={{ background: pill.bg, color: pill.color }}
        >
          {label}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Gauge */}
        <div className="flex flex-col items-center shrink-0">
          <GaugeCanvas score={score} color={color} />
          <div className="text-center -mt-4">
            <span className="text-5xl font-semibold" style={{ color }}>{score}</span>
            <span className="text-lg text-muted-foreground">/100</span>
          </div>
        </div>

        {/* Fatores */}
        <div className="grid grid-cols-2 gap-3 flex-1 w-full">
          {factors.map(f => {
            const v = f.value;
            const c = v !== null ? getColor(v) : "var(--color-text-secondary)";
            return (
              <div
                key={f.key}
                className="rounded-lg border bg-muted/30 px-4 py-3"
              >
                <p className="text-xs text-muted-foreground mb-1">{f.label}</p>
                <p className="text-xl font-semibold" style={{ color: c }}>
                  {v !== null ? `${v}%` : "—"}
                </p>
                <div className="mt-2 h-1 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-1 rounded-full transition-all duration-1000"
                    style={{ width: v !== null ? `${v}%` : "0%", background: c }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}