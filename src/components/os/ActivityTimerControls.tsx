import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Square } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type TimerState = {
  status: string;
  total_seconds: number;
  started_at: string | null;
  paused_at: string | null;
  user_id: string | null;
};

interface ActivityTimerControlsProps {
  atividadeId: string;
  osId: string;
  timerState: TimerState;
  currentProfileId: string | null;
  isResponsible: boolean;
  disabled: boolean;
  onUpdate: () => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getTimePart(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(11, 19);
}

function getDatePart(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export default function ActivityTimerControls({
  atividadeId,
  osId,
  timerState,
  currentProfileId,
  isResponsible,
  disabled,
  onUpdate,
}: ActivityTimerControlsProps) {
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const computeDisplay = useCallback(() => {
    if (timerState.status === "running" && timerState.started_at) {
      const elapsed = Math.floor((Date.now() - new Date(timerState.started_at).getTime()) / 1000);
      return timerState.total_seconds + Math.max(0, elapsed);
    }
    return timerState.total_seconds;
  }, [timerState]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;

    if (timerState.status === "running") {
      setDisplaySeconds(computeDisplay());
      intervalRef.current = setInterval(() => setDisplaySeconds(computeDisplay()), 1000);
    } else {
      setDisplaySeconds(computeDisplay());
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerState, computeDisplay]);

  const persistSession = useCallback(
    async (startedAt: string | null, endedAt: string, elapsedSeconds: number) => {
      if (!currentProfileId || !startedAt || elapsedSeconds <= 0) return null;

      const totalMinutes = Math.max(1, Math.ceil(elapsedSeconds / 60));
      const payload = {
        tipo: "Corretiva",
        atividade_id: atividadeId,
        os_id: osId,
        user_id: currentProfileId,
        data_registro: getDatePart(startedAt) ?? getDatePart(endedAt) ?? new Date().toISOString().slice(0, 10),
        hora_inicio: getTimePart(startedAt),
        hora_fim: getTimePart(endedAt),
        total_minutos: totalMinutes,
        descricao: "Sessão automática do cronômetro",
        origem: "cronometro",
      };

      const { error } = await supabase.from("horas_atividade").insert(payload as any);
      if (error) {
        throw error;
      }
    },
    [atividadeId, currentProfileId, osId],
  );

  const setActivityMode = async () => {
    const { error } = await supabase
      .from("ordens_servico")
      .update({ time_tracking_mode: "atividades" } as any)
      .eq("id", osId);

    if (error) throw error;
  };

  const handleStart = async () => {
    if (!currentProfileId || saving) return;

    try {
      setSaving(true);
      await setActivityMode();

      const now = new Date().toISOString();
      const { error } = await supabase
        .from("atividades_os")
        .update({
          timer_status: "running",
          timer_started_at: now,
          timer_paused_at: null,
          timer_user_id: currentProfileId,
          status: "Em andamento",
        } as any)
        .eq("id", atividadeId);

      if (error) throw error;

      await supabase.from("ordens_servico").update({ status: "Em execução" } as any).eq("id", osId);
      onUpdate();
    } catch (error: any) {
      toast({ title: "Erro ao iniciar timer da atividade", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePause = async () => {
    if (saving || timerState.status !== "running") return;

    try {
      setSaving(true);
      const now = new Date();
      const endedAt = now.toISOString();
      const elapsed = timerState.started_at
        ? Math.floor((now.getTime() - new Date(timerState.started_at).getTime()) / 1000)
        : 0;

      await persistSession(timerState.started_at, endedAt, elapsed);

      const { error } = await supabase
        .from("atividades_os")
        .update({
          timer_status: "paused",
          timer_total_seconds: timerState.total_seconds + Math.max(0, elapsed),
          timer_paused_at: endedAt,
          timer_started_at: null,
        } as any)
        .eq("id", atividadeId);

      if (error) throw error;
      onUpdate();
    } catch (error: any) {
      toast({ title: "Erro ao pausar", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleResume = async () => {
    if (saving || timerState.status !== "paused") return;

    try {
      setSaving(true);
      await setActivityMode();

      const { error } = await supabase
        .from("atividades_os")
        .update({
          timer_status: "running",
          timer_started_at: new Date().toISOString(),
          timer_paused_at: null,
        } as any)
        .eq("id", atividadeId);

      if (error) throw error;
      onUpdate();
    } catch (error: any) {
      toast({ title: "Erro ao retomar", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleStop = async () => {
    if (saving || (timerState.status !== "running" && timerState.status !== "paused")) return;

    try {
      setSaving(true);
      const now = new Date();
      const endedAt = now.toISOString();
      let finalSeconds = timerState.total_seconds;

      if (timerState.status === "running" && timerState.started_at) {
        const elapsed = Math.floor((now.getTime() - new Date(timerState.started_at).getTime()) / 1000);
        await persistSession(timerState.started_at, endedAt, elapsed);
        finalSeconds += Math.max(0, elapsed);
      }

      const { error } = await supabase
        .from("atividades_os")
        .update({
          timer_status: "stopped",
          timer_total_seconds: finalSeconds,
          timer_started_at: null,
          timer_paused_at: endedAt,
          timer_user_id: currentProfileId,
          status: "Concluído",
        } as any)
        .eq("id", atividadeId);

      if (error) throw error;

      toast({ title: "Atividade finalizada" });
      onUpdate();
    } catch (error: any) {
      toast({ title: "Erro ao finalizar", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const status = timerState.status || "none";
  const isStopped = status === "stopped";
  const canControl = isResponsible && !disabled && !saving;

  return (
    <div className="mt-2 rounded border border-border/50 bg-muted/40 px-2 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`font-mono text-sm font-bold tabular-nums ${status === "running" ? "text-primary" : "text-foreground"}`}>
          {formatTime(displaySeconds)}
        </span>

        <span className="text-[10px] text-muted-foreground">
          {status === "running"
            ? "Em execução"
            : status === "paused"
              ? "Pausado"
              : isStopped
                ? "Finalizado"
                : "Aguardando início"}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {canControl && status === "none" && (
            <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={handleStart}>
              <Play className="h-3 w-3" /> Iniciar
            </Button>
          )}

          {canControl && status === "running" && (
            <>
              <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={handlePause}>
                <Pause className="h-3 w-3" /> Pausar
              </Button>
              <Button variant="default" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={handleStop}>
                <Square className="h-3 w-3" /> Finalizar
              </Button>
            </>
          )}

          {canControl && status === "paused" && (
            <>
              <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={handleResume}>
                <Play className="h-3 w-3" /> Retomar
              </Button>
              <Button variant="default" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={handleStop}>
                <Square className="h-3 w-3" /> Finalizar
              </Button>
            </>
          )}
        </div>
      </div>

      {disabled && status === "none" && (
        <p className="mt-1 text-[10px] text-muted-foreground">Bloqueado enquanto o apontamento geral estiver ativo.</p>
      )}

      {!disabled && !isResponsible && !isStopped && (
        <p className="mt-1 text-[10px] text-muted-foreground">Somente o responsável desta atividade pode controlar o cronômetro.</p>
      )}
    </div>
  );
}
