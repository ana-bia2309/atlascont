import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Search, X, Activity, ChevronLeft, ChevronRight } from "@/lib/icons";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action_type: string;
  module: string | null;
  description: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  device: string | null;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  criacao: "bg-emerald-50 text-emerald-700 border-emerald-200",
  edicao: "bg-amber-50 text-amber-700 border-amber-200",
  exclusao: "bg-destructive/15 text-destructive border-destructive/30",
  finalizacao: "bg-primary/10 text-primary border-primary/20",
  login: "bg-blue-50 text-blue-700 border-blue-200",
  logout: "bg-slate-100 text-slate-600 border-slate-200",
  acesso: "bg-violet-50 text-violet-700 border-violet-200",
};

const ACTION_LABELS: Record<string, string> = {
  criacao: "Criação",
  edicao: "Edição",
  exclusao: "Exclusão",
  finalizacao: "Finalização",
  login: "Login",
  logout: "Logout",
  acesso: "Acesso",
};

const PAGE_SIZE = 50;

export default function HistoricoAtividades() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterAction, setFilterAction] = useState("__all__");
  const [filterModule, setFilterModule] = useState("__all__");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [detailEntry, setDetailEntry] = useState<LogEntry | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("activity_logs" as any)
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filterAction !== "__all__") {
      query = query.eq("action_type", filterAction);
    }
    if (filterModule !== "__all__") {
      query = query.eq("module", filterModule);
    }
    if (filterDateFrom) {
      query = query.gte("created_at", filterDateFrom + "T00:00:00");
    }
    if (filterDateTo) {
      query = query.lte("created_at", filterDateTo + "T23:59:59");
    }
    if (filterSearch.trim()) {
      query = query.or(
        `description.ilike.%${filterSearch.trim()}%,user_name.ilike.%${filterSearch.trim()}%`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      toast({ title: "Erro ao carregar histórico", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    setEntries((data as any[]) || []);
    setTotal(count || 0);
    setLoading(false);
  }, [page, filterAction, filterModule, filterSearch]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [filterAction, filterModule, filterSearch, filterDateFrom, filterDateTo]);

  const uniqueModules = useMemo(() => {
    const mods = new Set(entries.map((e) => e.module).filter(Boolean));
    return [...mods] as string[];
  }, [entries]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasActiveFilters = filterAction !== "__all__" || filterModule !== "__all__" || filterSearch.trim() !== "" || !!filterDateFrom || !!filterDateTo;

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d), "dd/MM/yyyy HH:mm:ss"); } catch { return "—"; }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Histórico de Atividades</h1>
        </div>
        <Button variant="outline" size="icon" onClick={fetchEntries} title="Atualizar">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4 rounded-lg border bg-card p-4">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Buscar</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Descrição ou usuário" className="pl-9" />
          </div>
        </div>
        <div className="min-w-[150px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de Ação</label>
          <Select value={filterAction} onValueChange={setFilterAction}>
            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[150px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Módulo</label>
          <Select value={filterModule} onValueChange={setFilterModule}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {uniqueModules.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">De</label>
          <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="h-9" />
        </div>
        <div className="min-w-[140px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Até</label>
          <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="h-9" />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterSearch(""); setFilterAction("__all__"); setFilterModule("__all__"); setFilterDateFrom(""); setFilterDateTo(""); }} className="text-muted-foreground">
            <X className="mr-1 h-3 w-3" /> Limpar
          </Button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground">
          {hasActiveFilters ? "Nenhum registro encontrado com os filtros aplicados." : "Nenhum registro de atividade."}
        </p>
      ) : (
        <>
          <div className="rounded-lg border bg-card overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Dispositivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow
                    key={entry.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setDetailEntry(entry)}
                  >
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(entry.created_at)}</TableCell>
                    <TableCell className="text-sm font-medium">{entry.user_name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-xs", ACTION_COLORS[entry.action_type] || "")}>
                        {ACTION_LABELS[entry.action_type] || entry.action_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{entry.module || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">{entry.description || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{entry.device || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                {total} registro{total !== 1 ? "s" : ""} — Página {page + 1} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  Próxima <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail Modal */}
      <Dialog open={!!detailEntry} onOpenChange={() => setDetailEntry(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Registro</DialogTitle>
          </DialogHeader>
          {detailEntry && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Data/Hora:</span>
                  <p className="font-medium">{fmtDate(detailEntry.created_at)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Usuário:</span>
                  <p className="font-medium">{detailEntry.user_name || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Ação:</span>
                  <p>
                    <Badge variant="outline" className={cn("text-xs", ACTION_COLORS[detailEntry.action_type] || "")}>
                      {ACTION_LABELS[detailEntry.action_type] || detailEntry.action_type}
                    </Badge>
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Módulo:</span>
                  <p className="font-medium">{detailEntry.module || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Dispositivo:</span>
                  <p className="font-medium">{detailEntry.device || "—"}</p>
                </div>
              </div>

              <div>
                <span className="text-muted-foreground">Descrição:</span>
                <p className="font-medium">{detailEntry.description || "—"}</p>
              </div>

              {detailEntry.old_value && Object.keys(detailEntry.old_value).length > 0 && (
                <div>
                  <span className="text-muted-foreground font-medium block mb-1">Valores Anteriores:</span>
                  <pre className="bg-muted/50 rounded p-2 text-xs overflow-auto max-h-40">
                    {JSON.stringify(detailEntry.old_value, null, 2)}
                  </pre>
                </div>
              )}
              {detailEntry.new_value && Object.keys(detailEntry.new_value).length > 0 && (
                <div>
                  <span className="text-muted-foreground font-medium block mb-1">Valores Novos:</span>
                  <pre className="bg-muted/50 rounded p-2 text-xs overflow-auto max-h-40">
                    {JSON.stringify(detailEntry.new_value, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
