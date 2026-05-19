import { useEffect, useRef, useState, useCallback } from "react";
import { Timer } from "@/lib/icons";
import { supabase } from "@/integrations/supabase/client";

interface TimerOSSectionProps {
  osId: string;
}

function formatTime(seconds: number): string {
  if (seconds < 0) seconds = 0;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) {
    return `${d}d ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function TimerOSSection({ osId }: TimerOSSectionProps) {
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isFinished, setIsFinished] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOsDates = useCallback(async () => {
    const { data } = await supabase
      .from("ordens_servico")
      .select("created_at, data_inicio, finalizado_em, status")
      .eq("id", osId)
      .maybeSingle();

    if (data) {
      // Use data_inicio if available, otherwise created_at
      const start = data.data_inicio
        ? new Date(data.data_inicio + "T00:00:00")
        : data.created_at
          ? new Date(data.created_at)
          : null;

      const end = data.finalizado_em ? new Date(data.finalizado_em) : null;
      const finished = data.status === "Concluída" || data.status === "Cancelada";

      setStartTime(start);
      setEndTime(end);
      setIsFinished(finished);
    }
    setLoading(false);
  }, [osId]);

  useEffect(() => { fetchOsDates(); }, [fetchOsDates]);

  // Compute display
  const computeDisplay = useCallback(() => {
    if (!startTime) return 0;
    const end = endTime || new Date();
    return Math.floor((end.getTime() - startTime.getTime()) / 1000);
  }, [startTime, endTime]);

  useEffect(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setDisplaySeconds(computeDisplay());

    // If OS is still active (no endTime), tick every second
    if (startTime && !endTime && !isFinished) {
      intervalRef.current = setInterval(() => setDisplaySeconds(computeDisplay()), 1000);
    }

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [startTime, endTime, isFinished, computeDisplay]);

  if (loading) return null;
  if (!startTime) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Timer className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Tempo da O.S.</h3>
      </div>

      <div className="flex items-center justify-center gap-4 rounded-lg border bg-muted/30 p-4">
        <span
          className={`font-mono text-3xl font-bold tabular-nums ${
            isFinished || endTime ? "text-muted-foreground" : "text-emerald-600"
          }`}
        >
          {formatTime(displaySeconds)}
        </span>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        {isFinished || endTime
          ? "Tempo total da O.S. (finalizada)"
          : "Tempo decorrido desde o início da O.S."}
      </p>
    </div>
  );
}
