import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw, Search, X, Clock, ChevronLeft, ChevronRight, FileText, TrendingUp, TrendingDown, SearchX,
} from "@/lib/icons";
import { EmptyState } from "@/components/ui/empty-state";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type ReajusteRow = {
  id: string;
  tipo_operacao: "majorar" | "reduzir";
  tipo_reajuste: "percentual" | "valor_fixo";
  percentual: number | null;
  valor_fixo: number | null;
  criterio_selecao: "todos" | "categoria" | "intervalo" | "especificos";
  categorias_selecionadas: string[] | null;
  codigo_inicial: string | null;
  codigo_final: string | null;
  codigos_especificos: string[] | null;
  quantidade_materiais_afetados: number;
  valor_total_antes: number;
  valor_total_depois: number;
  justificativa: string;
  created_by_nome: string | null;
  created_at: string;
};

type ItemRow = {
  id: string;
  codigo: string | null;
  descricao: string;
  categoria: string | null;
  valor_anterior: number;
  valor_novo: number;
  diferenca: number;
};

const CATEGORIA_OPTIONS = ["Material", "Ferramenta", "EPI", "Serviço"];
const PAGE_SIZE = 20;

const CRITERIO_LABELS: Record<string, string> = {
  todos: "Todos os materiais",
  categoria: "Por categoria",
  intervalo: "Por intervalo de códigos",
  especificos: "Materiais específicos",
};

const money = (v: number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy HH:mm"); } catch { return "—"; }
};

export default function HistoricoReajustes() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ReajusteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  const [filterSearch, setFilterSearch] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterOperacao, setFilterOperacao] = useState("__all__");
  const [filterTipoReajuste, setFilterTipoReajuste] = useState("__all__");
  const [filterCriterio, setFilterCriterio] = useState("__all__");
  const [filterCategoria, setFilterCategoria] = useState("__all__");
  const [filterMaterial, setFilterMaterial] = useState("");

  const [detail, setDetail] = useState<ReajusteRow | null>(null);
  const [detailItens, setDetailItens] = useState<ItemRow[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Quando o filtro é por categoria ou material/código, esses dados só existem
  // na tabela de itens (reajustes_materiais_itens) — resolve primeiro os IDs
  // de reajuste que têm ao menos um item correspondente.
  const resolveIdsByItemFilter = useCallback(async (): Promise<string[] | null> => {
    if (filterCategoria === "__all__" && !filterMaterial.trim()) return null;

    let q = (supabase as any).from("reajustes_materiais_itens").select("reajuste_id");
    if (filterCategoria !== "__all__") q = q.eq("categoria", filterCategoria);
    if (filterMaterial.trim()) {
      const term = filterMaterial.trim();
      q = q.or(`codigo.ilike.%${term}%,descricao.ilike.%${term}%`);
    }
    const { data, error } = await q;
    if (error) return [];
    const ids: string[] = [...new Set<string>((data || []).map((r: any) => r.reajuste_id as string))];
    return ids;
  }, [filterCategoria, filterMaterial]);

  const fetchRows = useCallback(async () => {
    setLoading(true);

    const itemIds = await resolveIdsByItemFilter();
    if (itemIds !== null && itemIds.length === 0) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    let query = (supabase as any)
      .from("reajustes_materiais")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (itemIds !== null) query = query.in("id", itemIds);
    if (filterOperacao !== "__all__") query = query.eq("tipo_operacao", filterOperacao);
    if (filterTipoReajuste !== "__all__") query = query.eq("tipo_reajuste", filterTipoReajuste);
    if (filterCriterio !== "__all__") query = query.eq("criterio_selecao", filterCriterio);
    if (filterDateFrom) query = query.gte("created_at", filterDateFrom + "T00:00:00");
    if (filterDateTo) query = query.lte("created_at", filterDateTo + "T23:59:59");
    if (filterSearch.trim()) {
      const term = filterSearch.trim();
      query = query.or(`created_by_nome.ilike.%${term}%,justificativa.ilike.%${term}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      toast({ title: "Erro ao carregar histórico de reajustes", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setRows((data as ReajusteRow[]) || []);
    setTotal(count || 0);
    setLoading(false);
  }, [page, filterOperacao, filterTipoReajuste, filterCriterio, filterDateFrom, filterDateTo, filterSearch, resolveIdsByItemFilter]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  useEffect(() => { setPage(0); }, [filterOperacao, filterTipoReajuste, filterCriterio, filterCategoria, filterMaterial, filterDateFrom, filterDateTo, filterSearch]);

  const hasFilters =
    filterSearch.trim() !== "" || !!filterDateFrom || !!filterDateTo ||
    filterOperacao !== "__all__" || filterTipoReajuste !== "__all__" ||
    filterCriterio !== "__all__" || filterCategoria !== "__all__" || filterMaterial.trim() !== "";

  const clearFilters = () => {
    setFilterSearch(""); setFilterDateFrom(""); setFilterDateTo("");
    setFilterOperacao("__all__"); setFilterTipoReajuste("__all__");
    setFilterCriterio("__all__"); setFilterCategoria("__all__"); setFilterMaterial("");
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const criterioDescricao = (r: ReajusteRow) => {
    if (r.criterio_selecao === "categoria") return (r.categorias_selecionadas || []).join(", ") || "—";
    if (r.criterio_selecao === "intervalo") return `${r.codigo_inicial} a ${r.codigo_final}`;
    if (r.criterio_selecao === "especificos") return `${(r.codigos_especificos || []).length} código(s)`;
    return "—";
  };

  const openDetail = async (r: ReajusteRow) => {
    setDetail(r);
    setLoadingDetail(true);
    const { data, error } = await (supabase as any)
      .from("reajustes_materiais_itens")
      .select("*")
      .eq("reajuste_id", r.id)
      .order("codigo", { ascending: true });
    if (error) {
      toast({ title: "Erro ao carregar itens do reajuste", description: error.message, variant: "destructive" });
    } else {
      setDetailItens((data as ItemRow[]) || []);
    }
    setLoadingDetail(false);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const itemIds = await resolveIdsByItemFilter();
      if (itemIds !== null && itemIds.length === 0) {
        toast({ title: "Nenhum registro para exportar com os filtros atuais" });
        return;
      }
      let query = (supabase as any)
        .from("reajustes_materiais")
        .select("*")
        .order("created_at", { ascending: false });

      if (itemIds !== null) query = query.in("id", itemIds);
      if (filterOperacao !== "__all__") query = query.eq("tipo_operacao", filterOperacao);
      if (filterTipoReajuste !== "__all__") query = query.eq("tipo_reajuste", filterTipoReajuste);
      if (filterCriterio !== "__all__") query = query.eq("criterio_selecao", filterCriterio);
      if (filterDateFrom) query = query.gte("created_at", filterDateFrom + "T00:00:00");
      if (filterDateTo) query = query.lte("created_at", filterDateTo + "T23:59:59");
      if (filterSearch.trim()) {
        const term = filterSearch.trim();
        query = query.or(`created_by_nome.ilike.%${term}%,justificativa.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) {
        toast({ title: "Erro ao exportar", description: error.message, variant: "destructive" });
        return;
      }

      const sheetRows = ((data as ReajusteRow[]) || []).map((r) => ({
        "Data/Hora": fmtDate(r.created_at),
        "Usuário": r.created_by_nome || "",
        "Operação": r.tipo_operacao === "majorar" ? "Majorar" : "Reduzir",
        "Tipo": r.tipo_reajuste === "percentual" ? `${r.percentual}%` : money(r.valor_fixo || 0),
        "Critério": CRITERIO_LABELS[r.criterio_selecao],
        "Detalhe do Critério": criterioDescricao(r),
        "Materiais Afetados": r.quantidade_materiais_afetados,
        "Valor Total Antes": r.valor_total_antes,
        "Valor Total Depois": r.valor_total_depois,
        "Variação": r.valor_total_depois - r.valor_total_antes,
        "Justificativa": r.justificativa,
      }));
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Histórico de Reajustes");
      XLSX.writeFile(wb, `historico_reajustes_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast({ title: "Excel exportado!" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/materiais")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Clock className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Histórico de Reajustes</h1>
            <p className="text-sm text-muted-foreground">Operações de reajuste de valores em lote no Cadastro de Materiais</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExport} disabled={exporting}>
            <FileText className="h-4 w-4" /> {exporting ? "Exportando..." : "Exportar Excel"}
          </Button>
          <Button variant="outline" size="icon" onClick={fetchRows}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Buscar</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Usuário ou justificativa..." className="pl-9" />
          </div>
        </div>
        <div className="min-w-[140px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Material ou código</label>
          <Input value={filterMaterial} onChange={(e) => setFilterMaterial(e.target.value)} placeholder="Ex: 0008" />
        </div>
        <div className="min-w-[140px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Categoria</label>
          <Select value={filterCategoria} onValueChange={setFilterCategoria}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {CATEGORIA_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Operação</label>
          <Select value={filterOperacao} onValueChange={setFilterOperacao}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              <SelectItem value="majorar">Majorar</SelectItem>
              <SelectItem value="reduzir">Reduzir</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de Reajuste</label>
          <Select value={filterTipoReajuste} onValueChange={setFilterTipoReajuste}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              <SelectItem value="percentual">Percentual</SelectItem>
              <SelectItem value="valor_fixo">Valor fixo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Critério Utilizado</label>
          <Select value={filterCriterio} onValueChange={setFilterCriterio}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {Object.entries(CRITERIO_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[130px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">De</label>
          <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="h-9" />
        </div>
        <div className="min-w-[130px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Até</label>
          <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="h-9" />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            <X className="mr-1 h-3 w-3" /> Limpar
          </Button>
        )}
        <span className="text-sm text-muted-foreground ml-auto">{total} registro(s)</span>
      </div>

      {/* Tabela */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Operação</TableHead>
              <TableHead>Critério</TableHead>
              <TableHead className="text-center">Materiais</TableHead>
              <TableHead>Valor Total</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={7} className="py-3"><Skeleton className="h-6 w-full" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyState
                    icon={hasFilters ? SearchX : Clock}
                    title="Nenhum reajuste encontrado"
                    description={hasFilters ? "Nenhum reajuste bate com os filtros aplicados." : "Ainda não foi feito nenhum reajuste de valores em lote."}
                    action={hasFilters ? { label: "Limpar filtros", onClick: clearFilters } : undefined}
                  />
                </TableCell>
              </TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(r)}>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(r.created_at)}</TableCell>
                <TableCell className="text-sm font-medium">{r.created_by_nome || "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn(
                    "gap-1 text-xs",
                    r.tipo_operacao === "majorar"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-red-50 text-red-700 border-red-200"
                  )}>
                    {r.tipo_operacao === "majorar" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {r.tipo_operacao === "majorar" ? "Majorou" : "Reduziu"}{" "}
                    {r.tipo_reajuste === "percentual" ? `${r.percentual}%` : money(r.valor_fixo || 0)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {CRITERIO_LABELS[r.criterio_selecao]}
                </TableCell>
                <TableCell className="text-center text-sm font-medium">{r.quantidade_materiais_afetados}</TableCell>
                <TableCell className="text-sm">
                  {money(r.valor_total_antes)} → <span className="font-medium">{money(r.valor_total_depois)}</span>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openDetail(r); }}>
                    Visualizar detalhes
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page + 1} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              Próxima <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Modal de Detalhes */}
      <Dialog open={!!detail} onOpenChange={(v) => { if (!v) { setDetail(null); setDetailItens([]); } }}>
        <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Reajuste</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-card p-4 space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-muted-foreground">Data/Hora: </span>
                    <span className="font-medium">{fmtDate(detail.created_at)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Usuário: </span>
                    <span className="font-medium">{detail.created_by_nome || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Operação: </span>
                    <span className="font-medium">
                      {detail.tipo_operacao === "majorar" ? "Majorar" : "Reduzir"}{" "}
                      {detail.tipo_reajuste === "percentual" ? `${detail.percentual}%` : money(detail.valor_fixo || 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Critério: </span>
                    <span className="font-medium">{CRITERIO_LABELS[detail.criterio_selecao]} — {criterioDescricao(detail)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Valor total antes: </span>
                    <span className="font-medium">{money(detail.valor_total_antes)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Valor total depois: </span>
                    <span className="font-medium">{money(detail.valor_total_depois)}</span>
                  </div>
                </div>
                <div className="pt-1 border-t mt-2">
                  <span className="text-muted-foreground">Justificativa: </span>
                  <span>{detail.justificativa}</span>
                </div>
              </div>

              <div className="rounded-md border overflow-auto max-h-72">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Código</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Valor anterior</TableHead>
                      <TableHead>Valor novo</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingDetail ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}><TableCell colSpan={5} className="py-3"><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                      ))
                    ) : detailItens.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Nenhum item encontrado</TableCell></TableRow>
                    ) : detailItens.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="font-mono text-sm">{it.codigo}</TableCell>
                        <TableCell>{it.descricao}</TableCell>
                        <TableCell>{money(it.valor_anterior)}</TableCell>
                        <TableCell className="font-medium">{money(it.valor_novo)}</TableCell>
                        <TableCell className={cn("text-right", Number(it.diferenca) >= 0 ? "text-emerald-600" : "text-red-600")}>
                          {Number(it.diferenca) >= 0 ? "+" : ""}{money(it.diferenca)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
