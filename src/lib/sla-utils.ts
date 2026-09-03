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
    return { status: "concluida", label: "Concluída", colorClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800", horasRestantes: null, prazoLimite: slaPrazoLimite || null };
  }

  if (!slaPrazoLimite) {
    return { status: "sem_sla", label: "Sem SLA", colorClass: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-300 dark:border-zinc-700", horasRestantes: null, prazoLimite: null };
  }

  const now = new Date();
  const deadline = new Date(slaPrazoLimite);
  const horasRestantes = differenceInHours(deadline, now);

  if (horasRestantes < 0) {
    return {
      status: "atrasada",
      label: `SLA Estourado (${Math.abs(horasRestantes)}h)`,
      colorClass: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
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
      colorClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
      horasRestantes,
      prazoLimite: slaPrazoLimite,
    };
  }

  return {
    status: "dentro_do_prazo",
    label: `No Prazo (${horasRestantes}h)`,
    colorClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
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

export type PrazoStatus = "atrasado" | "vencendo" | "no_prazo" | "sem_prazo";

export interface PrazoInfo {
  status: PrazoStatus;
  label: string | null;
  colorClass: string;
  diasRestantes: number | null;
}

const VENCENDO_DIAS = 2; // prazo nos próximos N dias conta como "vencendo"

/**
 * Status do campo `prazo` (data simples, dd) de uma O.S. — distinto do SLA
 * (que usa `sla_prazo_limite`, um timestamp preciso). Só sinaliza quando
 * está atrasado ou perto de vencer; não gera badge para o caso normal,
 * pra não poluir a lista.
 */
export function computePrazoStatus(
  prazo: string | null | undefined,
  osStatus: string | null | undefined,
): PrazoInfo {
  if (isFinishedStatus(osStatus) || !prazo) {
    return { status: "sem_prazo", label: null, colorClass: "", diasRestantes: null };
  }

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dataPrazo = new Date(prazo + "T00:00:00");
  const diasRestantes = Math.round((dataPrazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));

  if (diasRestantes < 0) {
    return {
      status: "atrasado",
      label: diasRestantes === -1 ? "Atrasada há 1 dia" : `Atrasada há ${Math.abs(diasRestantes)} dias`,
      colorClass: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
      diasRestantes,
    };
  }

  if (diasRestantes <= VENCENDO_DIAS) {
    return {
      status: "vencendo",
      label: diasRestantes === 0 ? "Vence hoje" : diasRestantes === 1 ? "Vence amanhã" : `Vence em ${diasRestantes} dias`,
      colorClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
      diasRestantes,
    };
  }

  return { status: "no_prazo", label: null, colorClass: "", diasRestantes };
}
