// Shared Orçamento (orcamento_status) label/color definitions.
// O Atlas Control não tem uma tabela "orçamentos" separada: o orçamento é a
// própria O.S. na fase de aprovação, controlada pela coluna
// ordens_servico.orcamento_status. Hoje o valor é null/"pendente"/"aprovado"/"reprovado";
// este módulo centraliza os rótulos exibidos para esses valores.

export type OrcamentoStatus = "pendente" | "aprovado" | "reprovado" | null | undefined;

export function getOrcamentoStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "aprovado": return "Aprovado";
    case "reprovado": return "Reprovado";
    case "pendente": return "Em Análise";
    default: return "Em Análise";
  }
}

export function getOrcamentoStatusBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case "aprovado": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "reprovado": return "bg-rose-50 text-rose-700 border-rose-200";
    default: return "bg-amber-50 text-amber-700 border-amber-200";
  }
}
// Variant do <Badge> do design system — mesmo vocabulário de cor usado em
// Aprovações, OS, Chamados etc. Use este em telas novas.
export function getOrcamentoStatusVariant(
  status: string | null | undefined,
): "success" | "destructive" | "warning" {
  switch (status) {
    case "aprovado": return "success";
    case "reprovado": return "destructive";
    default: return "warning";
  }
}