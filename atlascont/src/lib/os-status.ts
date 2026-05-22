// Shared OS status definitions
export const STATUS_OPTIONS = [
  "Não Iniciada",
  "Em triagem",
  "Aguardando material",
  "Aguardando acesso",
  "Em execução",
  "Concluída",
  "Cancelada",
];

export const STATUS_COLORS: Record<string, string> = {
  "Não Iniciada": "bg-zinc-100 text-zinc-600 border-zinc-200",
  "Em triagem": "bg-violet-50 text-violet-700 border-violet-200",
  "Aguardando material": "bg-orange-50 text-orange-700 border-orange-200",
  "Aguardando acesso": "bg-yellow-50 text-yellow-700 border-yellow-200",
  "Em execução": "bg-sky-50 text-sky-700 border-sky-200",
  "Concluída": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Cancelada": "bg-red-50 text-red-700 border-red-200",
};

/** Status that mean "finished" (won't count as open/overdue) */
export const FINISHED_STATUSES = ["concluída", "concluida", "cancelada"];

export function isFinishedStatus(status: string | null | undefined): boolean {
  return FINISHED_STATUSES.includes((status || "").toLowerCase().trim());
}

export function getStatusColor(status: string | null | undefined): string {
  return STATUS_COLORS[status || ""] || "bg-muted text-muted-foreground border-muted";
}
