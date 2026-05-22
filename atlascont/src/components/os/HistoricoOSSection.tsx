import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Clock, PlusCircle, Pencil, CheckCircle2, PlayCircle, AlertCircle, Trash2 } from "@/lib/icons";

interface HistoricoEntry {
  id: string;
  acao: string;
  detalhes: string | null;
  usuario_nome: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  codigo_os: "Código",
  status: "Status",
  bloco_id: "Bloco",
  andar: "Andar",
  sala: "Sala",
  prazo: "Prazo",
  data_inicio: "Data Início",
  data_termino: "Data Término",
  observacoes: "Observações",
  equipamentos: "Equipamentos",
  cronograma_id: "Cronograma",
  ativo_id: "Ativo",
  custo_total: "Custo Total",
  prioridade: "Prioridade",
  tipo_servico: "Tipo Serviço",
  titulo: "Título",
  descricao: "Descrição",
};

const ACTION_CONFIG: Record<string, { icon: typeof Clock; color: string; dotColor: string }> = {
  Criação: { icon: PlusCircle, color: "text-emerald-600", dotColor: "bg-emerald-500" },
  Edição: { icon: Pencil, color: "text-amber-600", dotColor: "bg-amber-500" },
  Finalização: { icon: CheckCircle2, color: "text-primary", dotColor: "bg-primary" },
  Exclusão: { icon: Trash2, color: "text-destructive", dotColor: "bg-destructive" },
};

const defaultConfig = { icon: AlertCircle, color: "text-muted-foreground", dotColor: "bg-muted-foreground" };

export default function HistoricoOSSection({ osId }: { osId: string }) {
  const [entries, setEntries] = useState<HistoricoEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!osId) return;
    setLoading(true);
    supabase
      .from("historico_os")
      .select("id, acao, detalhes, usuario_nome, old_value, new_value, created_at")
      .eq("ordem_servico_id", osId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setEntries((data as unknown as HistoricoEntry[]) || []);
        setLoading(false);
      });
  }, [osId]);

  if (loading) return <p className="text-xs text-muted-foreground">Carregando timeline...</p>;
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">Nenhum evento registrado.</p>;

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d), "dd/MM/yyyy HH:mm"); } catch { return "—"; }
  };

  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined || val === "") return "(vazio)";
    return String(val);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Linha do Tempo</span>
        <span className="text-xs text-muted-foreground">({entries.length} eventos)</span>
      </div>

      <div className="relative max-h-[350px] overflow-y-auto pr-1">
        {/* Vertical line */}
        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

        <div className="space-y-0">
          {entries.map((entry, idx) => {
            const config = ACTION_CONFIG[entry.acao] || defaultConfig;
            const Icon = config.icon;
            const isLast = idx === entries.length - 1;

            return (
              <div key={entry.id} className={cn("relative pl-8 pb-4", isLast && "pb-0")}>
                {/* Dot on timeline */}
                <div className={cn(
                  "absolute left-[7px] top-1 h-[9px] w-[9px] rounded-full ring-2 ring-background",
                  config.dotColor
                )} />

                <div className="rounded-md border bg-muted/30 p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Icon className={cn("h-3.5 w-3.5", config.color)} />
                      <span className={cn("font-semibold", config.color)}>{entry.acao}</span>
                      <span className="text-muted-foreground">•</span>
                      <span className="font-medium">{entry.usuario_nome || "Sistema"}</span>
                    </div>
                    <span className="text-muted-foreground whitespace-nowrap text-[10px]">
                      {fmtDate(entry.created_at)}
                    </span>
                  </div>

                  {entry.detalhes && (
                    <p className="text-muted-foreground">{entry.detalhes}</p>
                  )}

                  {entry.old_value && entry.new_value && Object.keys(entry.new_value).length > 0 && (
                    <div className="space-y-0.5 mt-1 pt-1 border-t border-border/50">
                      {Object.keys(entry.new_value).map((key) => (
                        <div key={key} className="flex flex-wrap gap-1 items-center">
                          <span className="font-medium text-muted-foreground">{FIELD_LABELS[key] || key}:</span>
                          <span className="line-through text-destructive/70 text-[10px]">{formatValue(entry.old_value?.[key])}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-emerald-600 text-[10px]">{formatValue(entry.new_value[key])}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
