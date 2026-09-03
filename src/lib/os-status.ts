// Shared OS status definitions
export const STATUS_OPTIONS = [
  "Não Iniciada",
  "Em triagem",
  "Aguardando material",
  "Aguardando acesso",
  "Em execução",
  "Suspenso",
  "Interrompido",
  "Concluída",
  "Cancelada",
];

export const STATUS_COLORS: Record<string, string> = {
  "Não Iniciada": "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-300 dark:border-zinc-700",
  "Em triagem": "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800",
  "Aguardando material": "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800",
  "Aguardando acesso": "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-800",
  "Em execução": "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800",
  "Suspenso": "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800",
  "Interrompido": "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800",
  "Concluída": "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
  "Cancelada": "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
};

export const FINISHED_STATUSES = ["concluída", "concluida", "cancelada"];
export const PAUSED_STATUSES = ["suspenso", "interrompido"];

export function isFinishedStatus(status: string | null | undefined): boolean {
  return FINISHED_STATUSES.includes((status || "").toLowerCase().trim());
}

export function isPausedStatus(status: string | null | undefined): boolean {
  return PAUSED_STATUSES.includes((status || "").toLowerCase().trim());
}

export function getStatusColor(status: string | null | undefined): string {
  return STATUS_COLORS[status || ""] || "bg-muted text-muted-foreground border-muted";
}