import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Minus } from "@/lib/icons";

type AvalRow = { nota_geral: number | null; avaliado_em: string | null };

function getColor(v: number) {
  if (v >= 4.25) return "#1D9E75";
  if (v >= 3.5) return "#97C459";
  if (v >= 2.5) return "#EF9F27";
  return "#E24B4A";
}

function getLabel(v: number) {
  if (v >= 4.25) return "Excelente";
  if (v >= 3.5) return "Bom";
  if (v >= 2.5) return "Regular";
  return "Crítico";
}

function GaugeCanvas({ scorePct, color }: { scorePct: number; color: string }) {
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
    const duration = 1200;
    const startTime = performance.now();
    function ease(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

    function draw(current: number) {
      ctx.clearRect(0, 0, 280, 160);
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
      if (current > 0) {
        const fillEnd = startAngle + (current / 100) * totalSpan;
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, fillEnd);
        ctx.strokeStyle = color;
        ctx.lineWidth = 14;
        ctx.lineCap = "round";
        ctx.stroke();
      }
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
      const current = Math.round(ease(t) * scorePct);
      draw(current);
      if (t < 1) animRef.current = requestAnimationFrame(animate);
    }

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [scorePct, color]);

  return (
    <canvas ref={canvasRef} width={280} height={160} style={{ display: "block", margin: "0 auto" }} role="img"
      aria-label={`Medidor do índice de satisfação: ${scorePct}%`} />
  );
}

export default function DashboardSatisfactionScore() {
  const [rows, setRows] = useState<AvalRow[]>([]);

  useEffect(() => {
    (supabase as any).from("avaliacoes_os").select("nota_geral, avaliado_em").eq("status", "avaliada")
      .then(({ data }: any) => setRows(data || []));
  }, []);

  const stats = useMemo(() => {
    const validas = rows.filter((r) => r.nota_geral != null);
    if (!validas.length) return null;

    const media = validas.reduce((s, r) => s + (r.nota_geral || 0), 0) / validas.length;

    const hoje = new Date();
    const mesAtual = hoje.toISOString().slice(0, 7);
    const mesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1).toISOString().slice(0, 7);

    const doMesAtual = validas.filter((r) => (r.avaliado_em || "").slice(0, 7) === mesAtual);
    const doMesAnterior = validas.filter((r) => (r.avaliado_em || "").slice(0, 7) === mesAnterior);

    const mediaMesAtual = doMesAtual.length ? doMesAtual.reduce((s, r) => s + (r.nota_geral || 0), 0) / doMesAtual.length : null;
    const mediaMesAnterior = doMesAnterior.length ? doMesAnterior.reduce((s, r) => s + (r.nota_geral || 0), 0) / doMesAnterior.length : null;

    const tendencia = mediaMesAtual != null && mediaMesAnterior != null ? mediaMesAtual - mediaMesAnterior : null;

    return { media, total: validas.length, tendencia };
  }, [rows]);

  if (!stats) return null;

  const scorePct = Math.round((stats.media / 5) * 100);
  const color = getColor(stats.media);
  const label = getLabel(stats.media);

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
        <h2 className="text-lg font-semibold">Índice de Satisfação</h2>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full" style={{ background: pill.bg, color: pill.color }}>
          {label}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="flex flex-col items-center shrink-0">
          <GaugeCanvas scorePct={scorePct} color={color} />
          <div className="text-center -mt-4">
            <span className="text-5xl font-semibold" style={{ color }}>{stats.media.toFixed(2)}</span>
            <span className="text-lg text-muted-foreground">/5</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 flex-1 w-full">
          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Total de Avaliações</p>
            <p className="text-xl font-semibold">{stats.total}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Tendência (mês atual vs anterior)</p>
            {stats.tendencia == null ? (
              <p className="text-xl font-semibold text-muted-foreground flex items-center gap-1"><Minus className="h-4 w-4" /> —</p>
            ) : (
              <p className={`text-xl font-semibold flex items-center gap-1 ${stats.tendencia > 0 ? "text-emerald-600" : stats.tendencia < 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                {stats.tendencia > 0 ? <TrendingUp className="h-4 w-4" /> : stats.tendencia < 0 ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                {stats.tendencia > 0 ? "+" : ""}{stats.tendencia.toFixed(2)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
