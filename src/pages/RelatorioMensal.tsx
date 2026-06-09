import { useState, useEffect, useCallback, useMemo } from "react";
import { useRealtime } from "@/hooks/use-realtime";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid,
} from "recharts";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DollarSign, ClipboardList, TrendingUp, Building2, RefreshCw, CalendarIcon, FileDown, FileSpreadsheet, X, Filter } from "@/lib/icons";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { usePermissions } from "@/hooks/use-permissions";
import { addPdfHeader, getCompanyInfo } from "@/lib/pdfHeader";

type OSRow = {
  id: string;
  codigo_os: string | null;
  bloco_id: string | null;
  status: string | null;
  custo_total: number | null;
  created_at: string | null;
};
type Bloco = { id: string; nome: string | null };
type MatCount = { os_id: string; count: number };

const STATUS_OPTIONS = ["Não Iniciada", "Em andamento", "Concluída", "Atrasada"];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => String(currentYear - i));
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, "0"),
  label: format(new Date(2000, i), "MMMM", { locale: ptBR }).replace(/^\w/, c => c.toUpperCase()),
}));

export default function RelatorioMensal() {
  const { can } = usePermissions();
  const [osList, setOsList] = useState<OSRow[]>([]);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [matCounts, setMatCounts] = useState<MatCount[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterMonth, setFilterMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [filterYear, setFilterYear] = useState(String(currentYear));
  const [filterBloco, setFilterBloco] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterFrom, setFilterFrom] = useState<Date | undefined>();
  const [filterTo, setFilterTo] = useState<Date | undefined>();

  const useCustomPeriod = !!filterFrom || !!filterTo;

const fetchData = useCallback(async () => {
  setLoading(true);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setLoading(false);
    return;
  }

  const { data: profile }: any = await (supabase as any)
    .from("profiles")
    .select("company_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.company_id) {
    setLoading(false);
    return;
  }

  const companyId = profile.company_id;

  const [osRes, blocosRes, matsRes] = await Promise.all([
    (supabase as any)
      .from("ordens_servico")
      .select("id, codigo_os, bloco_id, status, custo_total, created_at")
      .eq("company_id", companyId)
      .neq("origem", "Preventiva"),

    (supabase as any)
      .from("blocos")
      .select("id, nome")
      .eq("company_id", companyId),

    (supabase as any)
      .from("materiais_os")
      .select("id, os_id"),
  ]);

  if (osRes.error)
    toast({
      title: "Erro",
      description: osRes.error.message,
      variant: "destructive",
    });
  else setOsList(osRes.data || []);

  if (blocosRes.error)
    toast({
      title: "Erro",
      description: blocosRes.error.message,
      variant: "destructive",
    });
  else setBlocos(blocosRes.data || []);

  const countMap: Record<string, number> = {};

  (matsRes.data || []).forEach((m: any) => {
    countMap[m.os_id] = (countMap[m.os_id] || 0) + 1;
  });

  setMatCounts(
    Object.entries(countMap).map(([os_id, count]) => ({
      os_id,
      count,
    }))
  );

  setLoading(false);
}, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useRealtime(["ordens_servico", "blocos", "materiais_os"], fetchData);

  const blocoMap = useMemo(() => {
    const m: Record<string, string> = {};
    blocos.forEach(b => { m[b.id] = b.nome || "Sem nome"; });
    return m;
  }, [blocos]);

  const matCountMap = useMemo(() => {
    const m: Record<string, number> = {};
    matCounts.forEach(mc => { m[mc.os_id] = mc.count; });
    return m;
  }, [matCounts]);

  // Filtered data
  const filtered = useMemo(() => {
    let start: Date;
    let end: Date;

    if (useCustomPeriod) {
      start = filterFrom || new Date(2000, 0, 1);
      end = filterTo ? new Date(filterTo.getFullYear(), filterTo.getMonth(), filterTo.getDate(), 23, 59, 59, 999) : new Date(2099, 11, 31);
    } else {
      const y = Number(filterYear);
      const m = Number(filterMonth) - 1;
      start = startOfMonth(new Date(y, m));
      end = endOfMonth(new Date(y, m));
    }

    return osList.filter(os => {
      if (!os.created_at) return false;
      const d = new Date(os.created_at);
      if (d < start || d > end) return false;
      if (filterBloco !== "all" && os.bloco_id !== filterBloco) return false;
      if (filterStatus !== "all" && os.status !== filterStatus) return false;
      return true;
    });
  }, [osList, filterMonth, filterYear, filterBloco, filterStatus, filterFrom, filterTo, useCustomPeriod]);

  const totalGasto = filtered.reduce((s, os) => s + (os.custo_total || 0), 0);
  const qtdOS = filtered.length;
  const mediaOS = qtdOS > 0 ? totalGasto / qtdOS : 0;

  const gastosPorBloco: Record<string, number> = {};
  filtered.forEach(os => {
    const key = os.bloco_id || "_none";
    gastosPorBloco[key] = (gastosPorBloco[key] || 0) + (os.custo_total || 0);
  });
  const blocoMaiorGasto = Object.entries(gastosPorBloco).sort((a, b) => b[1] - a[1])[0];
  const blocoMaiorNome = blocoMaiorGasto ? (blocoMap[blocoMaiorGasto[0]] || "Sem bloco") : "—";

  const barData = Object.entries(gastosPorBloco)
    .filter(([, v]) => v > 0)
    .map(([id, total]) => ({ name: blocoMap[id] || "Sem bloco", total }))
    .sort((a, b) => b.total - a.total);

  const lineData = useMemo(() => {
    const now = new Date();
    const points: { name: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      const start = startOfMonth(d);
      const end = endOfMonth(d);
      const total = osList
        .filter(os => {
          if (!os.created_at) return false;
          const dt = new Date(os.created_at);
          if (dt < start || dt > end) return false;
          if (filterBloco !== "all" && os.bloco_id !== filterBloco) return false;
          if (filterStatus !== "all" && os.status !== filterStatus) return false;
          return true;
        })
        .reduce((s, os) => s + (os.custo_total || 0), 0);
      points.push({ name: format(d, "MMM/yy", { locale: ptBR }), total });
    }
    return points;
  }, [osList, filterBloco, filterStatus]);

  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDateShort = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d), "dd/MM/yyyy"); } catch { return "—"; }
  };

  const hasFilters = filterBloco !== "all" || filterStatus !== "all" || useCustomPeriod;

  const clearFilters = () => {
    setFilterMonth(String(new Date().getMonth() + 1).padStart(2, "0"));
    setFilterYear(String(currentYear));
    setFilterBloco("all");
    setFilterStatus("all");
    setFilterFrom(undefined);
    setFilterTo(undefined);
  };

  const filterLabel = useCustomPeriod
    ? `${filterFrom ? format(filterFrom, "dd/MM/yyyy") : "…"} até ${filterTo ? format(filterTo, "dd/MM/yyyy") : "…"}`
    : `${MONTH_OPTIONS[Number(filterMonth) - 1]?.label} ${filterYear}`;

  const HEADERS = ["Código", "Bloco", "Status", "Materiais", "Custo Total", "Data"];

  const buildRows = () =>
    filtered.map(os => [
      os.codigo_os || "—",
      os.bloco_id ? blocoMap[os.bloco_id] || "—" : "—",
      os.status || "—",
      String(matCountMap[os.id] || 0),
      os.custo_total ? fmtBRL(os.custo_total) : "—",
      fmtDateShort(os.created_at),
    ]);

  const exportPDF = async () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const company = await getCompanyInfo();
    const startY = await addPdfHeader(doc, "Relatório Mensal de Gastos", filterLabel, company);

    doc.setFontSize(9);
    doc.setTextColor(60, 60, 80);
    const filterInfo = [
      filterBloco !== "all" ? `Bloco: ${blocoMap[filterBloco]}` : "",
      filterStatus !== "all" ? `Status: ${filterStatus}` : "",
    ].filter(Boolean).join(" | ");
    if (filterInfo) doc.text(filterInfo, 14, startY);

    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text(`Total: ${fmtBRL(totalGasto)}   |   O.S.: ${qtdOS}   |   Média: ${qtdOS > 0 ? fmtBRL(mediaOS) : "—"}   |   Maior Gasto: ${blocoMaiorNome}`, 14, startY + 6);

    autoTable(doc, {
      startY: startY + 12,
      head: [HEADERS],
      body: buildRows(),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [240, 245, 250] },
      foot: [["", "", "", "", fmtBRL(totalGasto), ""]],
      footStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: "bold" },
    });

    doc.save(`relatorio_mensal_${filterYear}_${filterMonth}.pdf`);
    toast({ title: "PDF exportado com sucesso!" });
  };

  const exportExcel = () => {
    const wsData = [HEADERS, ...buildRows(), ["", "", "", "TOTAL", fmtBRL(totalGasto), ""]];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório Mensal");
    XLSX.writeFile(wb, `relatorio_mensal_${filterYear}_${filterMonth}.xlsx`);
    toast({ title: "Excel exportado com sucesso!" });
  };

  if (loading) return <p className="text-muted-foreground p-6">Carregando...</p>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <CalendarIcon className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Relatório Mensal de Gastos</h1>
        <div className="ml-auto flex items-center gap-2">
          {can("relatorio_mensal.exportar") && (
            <>
              <Button variant="outline" size="sm" onClick={exportPDF}>
                <FileDown className="h-4 w-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportExcel}>
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
              </Button>
            </>
          )}
          <Button variant="outline" size="icon" onClick={fetchData} title="Atualizar">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-card p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filtros</span>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto text-xs">
              <X className="mr-1 h-3 w-3" /> Limpar filtros
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Mês</label>
            <Select value={filterMonth} onValueChange={(v) => { setFilterMonth(v); setFilterFrom(undefined); setFilterTo(undefined); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTH_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Ano</label>
            <Select value={filterYear} onValueChange={(v) => { setFilterYear(v); setFilterFrom(undefined); setFilterTo(undefined); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Bloco</label>
            <Select value={filterBloco} onValueChange={setFilterBloco}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {blocos.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.nome || "Sem nome"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Data início</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10", !filterFrom && "text-muted-foreground")} size="sm">
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {filterFrom ? format(filterFrom, "dd/MM/yyyy") : "Selecionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={filterFrom} onSelect={setFilterFrom} locale={ptBR} className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Data fim</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10", !filterTo && "text-muted-foreground")} size="sm">
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {filterTo ? format(filterTo, "dd/MM/yyyy") : "Selecionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={filterTo} onSelect={setFilterTo} locale={ptBR} className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        {useCustomPeriod && (
          <p className="text-xs text-muted-foreground mt-2">Período personalizado ativo — filtros de mês/ano ignorados.</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">{filtered.length} O.S. encontrada(s)</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl border bg-card p-5 flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Gasto</p>
            <p className="text-xl font-bold">{fmtBRL(totalGasto)}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-sky-50 flex items-center justify-center">
            <ClipboardList className="h-5 w-5 text-sky-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">O.S. no Período</p>
            <p className="text-xl font-bold">{qtdOS}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-yellow-50 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-yellow-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Média por O.S.</p>
            <p className="text-xl font-bold">{qtdOS > 0 ? fmtBRL(mediaOS) : "—"}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Bloco com Maior Gasto</p>
            <p className="text-xl font-bold truncate max-w-[160px]">{blocoMaiorNome}</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold mb-4">Gastos por Bloco</h2>
          {barData.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum gasto no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData}>
                <XAxis dataKey="name" tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 11 }} />
                <YAxis tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 11 }} tickFormatter={v => `R$${v}`} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={{ background: "#fff", border: "1px solid hsl(220, 13%, 91%)", borderRadius: 8 }} labelStyle={{ color: "#111827" }} />
                <Bar dataKey="total" fill="hsl(210, 70%, 55%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold mb-4">Evolução de Gastos (6 meses)</h2>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
              <XAxis dataKey="name" tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 11 }} />
              <YAxis tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 11 }} tickFormatter={v => `R$${v}`} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={{ background: "#fff", border: "1px solid hsl(220, 13%, 91%)", borderRadius: 8 }} labelStyle={{ color: "#111827" }} />
              <Line type="monotone" dataKey="total" stroke="hsl(150, 65%, 45%)" strokeWidth={2} dot={{ r: 4, fill: "hsl(150, 65%, 45%)" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed table */}
      <div className="rounded-xl border bg-card overflow-auto">
        <div className="p-5 pb-3">
          <h2 className="text-lg font-semibold">Detalhamento do Período</h2>
        </div>
        {filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm px-5 pb-5">Nenhuma O.S. neste período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Bloco</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Materiais</TableHead>
                <TableHead className="text-right">Custo Total</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(os => (
                <TableRow key={os.id}>
                  <TableCell className="font-mono text-sm">{os.codigo_os || "—"}</TableCell>
                  <TableCell>{os.bloco_id ? blocoMap[os.bloco_id] || "—" : "—"}</TableCell>
                  <TableCell>
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border",
                      os.status === "Concluída" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                      os.status === "Em andamento" && "bg-sky-50 text-sky-700 border-sky-200",
                      os.status === "Não Iniciada" && "bg-zinc-100 text-zinc-600 border-zinc-200",
                      os.status === "Atrasada" && "bg-red-50 text-red-700 border-red-200",
                    )}>
                      {os.status || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">{matCountMap[os.id] || 0}</TableCell>
                  <TableCell className="text-right font-semibold text-primary whitespace-nowrap">
                    {os.custo_total ? fmtBRL(os.custo_total) : "—"}
                  </TableCell>
                  <TableCell>{fmtDateShort(os.created_at)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2">
                <TableCell colSpan={4} className="text-right font-bold">Total</TableCell>
                <TableCell className="text-right font-bold text-primary">{fmtBRL(totalGasto)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
