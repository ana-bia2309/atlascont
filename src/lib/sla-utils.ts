import { differenceInHours, addHours, format } from "date-fns";
import { isFinishedStatus } from "@/lib/os-status";

export type SlaStatus = "dentro_do_prazo" | "em_risco" | "atrasada" | "concluida" | "sem_sla";

export interface SlaInfo {
  status: SlaStatus;
  label: string;
  colorClass: string;
  horasRestantes: number | null;
  prazoLimite: string | null;
}

const RISK_THRESHOLD = 0.2; // 20% of remaining time = "em risco"

export function computeSlaStatus(
  slaPrazoLimite: string | null | undefined,
  osStatus: string | null | undefined,
  createdAt: string | null | undefined,
): SlaInfo {
  if (isFinishedStatus(osStatus)) {
    return { status: "concluida", label: "Concluída", colorClass: "bg-emerald-50 text-emerald-700 border-emerald-200", horasRestantes: null, prazoLimite: slaPrazoLimite || null };
  }

  if (!slaPrazoLimite) {
    return { status: "sem_sla", label: "Sem SLA", colorClass: "bg-zinc-100 text-zinc-600 border-zinc-200", horasRestantes: null, prazoLimite: null };
  }

  const now = new Date();
  const deadline = new Date(slaPrazoLimite);
  const horasRestantes = differenceInHours(deadline, now);

  if (horasRestantes < 0) {
    return {
      status: "atrasada",
      label: `SLA Estourado (${Math.abs(horasRestantes)}h)`,
      colorClass: "bg-red-50 text-red-700 border-red-200",
      horasRestantes,
      prazoLimite: slaPrazoLimite,
    };
  }

  // Calculate total SLA window
  const created = createdAt ? new Date(createdAt) : null;
  const totalHoras = created ? differenceInHours(deadline, created) : null;
  const riskThreshold = totalHoras ? totalHoras * RISK_THRESHOLD : 4;

  if (horasRestantes <= riskThreshold) {
    return {
      status: "em_risco",
      label: `Em Risco (${horasRestantes}h)`,
      colorClass: "bg-amber-50 text-amber-700 border-amber-200",
      horasRestantes,
      prazoLimite: slaPrazoLimite,
    };
  }

  return {
    status: "dentro_do_prazo",
    label: `No Prazo (${horasRestantes}h)`,
    colorClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    horasRestantes,
    prazoLimite: slaPrazoLimite,
  };
}

export function calculateSlaPrazoLimite(
  prazoHoras: number,
  createdAt?: string | null,
): string {
  const base = createdAt ? new Date(createdAt) : new Date();
  return addHours(base, prazoHoras).toISOString();
}

export function formatSlaDeadline(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm");
  } catch {
    return "—";
  }
}
