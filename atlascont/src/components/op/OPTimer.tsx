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
};

interface Props {
  opId: string;
  timerState: TimerState;
  currentProfileId: string | null;
  disabled?: boolean;
  onUpdate: () => void;
  /** When true, blocks the Finalizar action (e.g., missing measurement values) */
  finalizeBlocked?: boolean;
  finalizeBlockedReason?: string;
  /**
   * Called before starting/resuming the timer. If it returns false (or a Promise that resolves to false),
   * the timer will NOT start. Use it to require QR Code validation, etc.
   */
  onBeforeStart?: () => boolean | Promise<boolean>;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function OPTimer({
  opId,
  timerState,
  currentProfileId,
  disabled,
  onUpdate,
  finalizeBlocked,
  finalizeBlockedReason,
  onBeforeStart,
}: Props) {
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

  const updateOP = async (patch: Record<string, unknown>) => {
    const { error } = await (supabase.from("ordens_preventivas" as any) as any)
      .update(patch)
      .eq("id", opId);
    if (error) throw error;
  };

  const handleStart = async () => {
    if (saving) return;
    if (onBeforeStart) {
      const ok = await onBeforeStart();
      if (!ok) return;
    }
    try {
      setSaving(true);
      await updateOP({
        timer_status: "running",
        timer_started_at: new Date().toISOString(),
        timer_paused_at: null,
        timer_user_id: currentProfileId,
        status: "Em Execução",
        data_inicio: new Date().toISOString().slice(0, 10),
        finalizado_em: null,
      });
      toast({ title: "Ordem iniciada" });
      onUpdate();
    } catch (e: any) {
      toast({ title: "Erro ao iniciar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePause = async () => {
    if (saving || timerState.status !== "running") return;
    try {
      setSaving(true);
      const now = new Date();
      const elapsed = timerState.started_at
        ? Math.floor((now.getTime() - new Date(timerState.started_at).getTime()) / 1000)
        : 0;
      await updateOP({
        timer_status: "paused",
        timer_total_seconds: timerState.total_seconds + Math.max(0, elapsed),
        timer_paused_at: now.toISOString(),
        timer_started_at: null,
        status: "Pausada",
      });
      toast({ title: "Ordem pausada" });
      onUpdate();
    } catch (e: any) {
      toast({ title: "Erro ao pausar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleResume = async () => {
    if (saving || timerState.status !== "paused") return;
    if (onBeforeStart) {
      const ok = await onBeforeStart();
      if (!ok) return;
    }
    try {
      setSaving(true);
      await updateOP({
        timer_status: "running",
        timer_started_at: new Date().toISOString(),
        timer_paused_at: null,
        timer_user_id: currentProfileId,
        status: "Em Execução",
      });
      toast({ title: "Ordem retomada" });
      onUpdate();
    } catch (e: any) {
      toast({ title: "Erro ao retomar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleStop = async () => {
    if (saving) return;

    if (finalizeBlocked) {
      toast({
        title: "Não é possível finalizar",
        description:
          finalizeBlockedReason ||
          "Preencha os valores das atividades de medição antes de finalizar a Ordem Preventiva.",
        variant: "destructive",
      });
      return;
    }

    if (timerState.status !== "running" && timerState.status !== "paused") return;

    try {
      setSaving(true);
      const now = new Date();
      let finalSeconds = timerState.total_seconds;
      if (timerState.status === "running" && timerState.started_at) {
        const elapsed = Math.floor((now.getTime() - new Date(timerState.started_at).getTime()) / 1000);
        finalSeconds += Math.max(0, elapsed);
      }
      await updateOP({
        timer_status: "stopped",
        timer_total_seconds: finalSeconds,
        timer_started_at: null,
        timer_paused_at: now.toISOString(),
        timer_user_id: currentProfileId,
        status: "Concluída",
        finalizado_em: now.toISOString(),
        finalizado_por: currentProfileId,
        data_termino: now.toISOString().slice(0, 10),
      });

      // Mark all activities as concluded too
      await (supabase.from("atividades_ordem_preventiva" as any) as any)
        .update({
          concluido: true,
          concluido_em: now.toISOString(),
          concluido_por: currentProfileId,
          status: "Concluído",
        })
        .eq("ordem_preventiva_id", opId);

      // Register hours in horas_atividade as Preventiva (homem-hora report)
      if (currentProfileId && finalSeconds > 0) {
        const totalMinutes = Math.max(1, Math.ceil(finalSeconds / 60));
        const dataRegistro = now.toISOString().slice(0, 10);
        const horaFim = now.toTimeString().slice(0, 8);
        await (supabase.from("horas_atividade" as any) as any).insert({
          tipo: "Preventiva",
          ordem_preventiva_id: opId,
          user_id: currentProfileId,
          data_registro: dataRegistro,
          hora_fim: horaFim,
          total_minutos: totalMinutes,
          descricao: "Cronômetro da Ordem Preventiva",
          origem: "cronometro",
        } as any);
      }

      toast({ title: "Ordem Preventiva finalizada" });
      onUpdate();
    } catch (e: any) {
      toast({ title: "Erro ao finalizar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const status = timerState.status || "none";
  const canControl = !disabled && !saving;
  const isRunning = status === "running";
  const isPaused = status === "paused";
  const isStopped = status === "stopped";

  return (
    <div className="rounded-lg border bg-muted/40 p-4">
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`font-mono text-3xl font-bold tabular-nums ${
              isRunning ? "text-emerald-600" : isPaused ? "text-amber-600" : "text-foreground"
            }`}
          >
            {formatTime(displaySeconds)}
          </span>
        </div>

        <span className="text-xs text-muted-foreground">
          {isRunning
            ? "Em execução"
            : isPaused
              ? "Pausado"
              : isStopped
                ? "Finalizado"
                : "Aguardando início"}
        </span>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {canControl && status === "none" && (
            <Button variant="default" size="sm" className="gap-1" onClick={handleStart}>
              <Play className="h-4 w-4" /> Iniciar
            </Button>
          )}

          {canControl && isRunning && (
            <>
              <Button variant="outline" size="sm" className="gap-1" onClick={handlePause}>
                <Pause className="h-4 w-4" /> Pausar
              </Button>
              <Button
                variant="default"
                size="sm"
                className="gap-1"
                onClick={handleStop}
                disabled={finalizeBlocked}
                title={finalizeBlocked ? finalizeBlockedReason : undefined}
              >
                <Square className="h-4 w-4" /> Finalizar
              </Button>
            </>
          )}

          {canControl && isPaused && (
            <>
              <Button variant="outline" size="sm" className="gap-1" onClick={handleResume}>
                <Play className="h-4 w-4" /> Retomar
              </Button>
              <Button
                variant="default"
                size="sm"
                className="gap-1"
                onClick={handleStop}
                disabled={finalizeBlocked}
                title={finalizeBlocked ? finalizeBlockedReason : undefined}
              >
                <Square className="h-4 w-4" /> Finalizar
              </Button>
            </>
          )}
        </div>

        {finalizeBlocked && !isStopped && (isRunning || isPaused) && (
          <p className="text-xs text-destructive text-center">
            {finalizeBlockedReason || "Preencha os valores das atividades de medição antes de finalizar."}
          </p>
        )}
      </div>
    </div>
  );
}
