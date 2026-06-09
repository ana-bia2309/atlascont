import { useState, useEffect, useCallback, useMemo } from "react";
import { usePermissions } from "@/hooks/use-permissions";
import { useRealtime } from "@/hooks/use-realtime";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { BarChart3, ClipboardList, DollarSign, TrendingUp, RefreshCw, FileDown, FileSpreadsheet, Filter, X, CalendarIcon, Users } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { STATUS_OPTIONS, getStatusColor } from "@/lib/os-status";
import { addPdfHeader, getCompanyInfo } from "@/lib/pdfHeader";

type OSFull = {
  id: string;
  codigo_os: string | null;
  bloco_id: string | null;
  andar: string | null;
  sala: string | null;
  equipamentos: string | null;
  status: string | null;
  prioridade: string | null;
  prazo: string | null;
  data_inicio: string | null;
  data_termino: string | null;
  observacoes: string | null;
  custo_total: number | null;
  created_at: string | null;
  criado_por: string | null;
  tipo_servico: string | null;
};
type Bloco = { id: string; nome: string | null };
type MatOS = { id: string; os_id: string; nome_material: string; quantidade: number; custo_unitario: number; custo_total_item: number | null };

const STATUS_COLORS_CHART: Record<string, string> = {
  "Não Iniciada": "hsl(0, 0%, 55%)",
  "Em triagem": "hsl(270, 60%, 55%)",
  "Aguardando material": "hsl(30, 80%, 55%)",
  "Aguardando acesso": "hsl(45, 80%, 55%)",
  "Em execução": "hsl(200, 80%, 55%)",
  "Concluída": "hsl(150, 65%, 45%)",
  "Cancelada": "hsl(0, 70%, 55%)",
};
const FALLBACK_COLOR = "hsl(220, 15%, 45%)";

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d.includes("T") ? d : d + "T00:00:00"), "dd/MM/yyyy"); } catch { return "—"; }
};
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtBRLVal = (v: number | null) => v != null ? fmtBRL(v) : "—";

export default function Relatorios() {
  const { can } = usePermissions();
  const [osList, setOsList] = useState<OSFull[]>([]);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [materiais, setMateriais] = useState<MatOS[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("periodo");

  // Filters
  const [filterBloco, setFilterBloco] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterFrom, setFilterFrom] = useState<Date | undefined>();
  const [filterTo, setFilterTo] = useState<Date | undefined>();

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

  const [osRes, blocosRes, matsRes, profilesRes] = await Promise.all([
    (supabase as any)
      .from("ordens_servico")
      .select(
        "id, codigo_os, bloco_id, andar, sala, equipamentos, status, prioridade, prazo, data_inicio, data_termino, observacoes, custo_total, created_at, criado_por, tipo_servico"
      )
      .eq("company_id", companyId)
      .neq("origem", "Preventiva"),

    (supabase as any)
      .from("blocos")
      .select("id, nome")
      .eq("company_id", companyId),

    (supabase as any)
  .from("materiais_os")
  .select(
    "id, os_id, nome_material, quantidade, custo_unitario, custo_total_item"
  )
  .eq("company_id", companyId),

    (supabase as any)
      .from("profiles")
      .select("id, nome")
      .eq("company_id", companyId),
  ]);

  if (!osRes.error) setOsList(osRes.data || []);
  if (!blocosRes.error) setBlocos(blocosRes.data || []);
  if (!matsRes.error) setMateriais(matsRes.data || []);

  const pMap: Record<string, string> = {};

  ((profilesRes.data as any[]) || []).forEach((p: any) => {
    pMap[p.id] = p.nome;
  });

  setProfilesMap(pMap);

  setLoading(false);
}, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useRealtime(["ordens_servico", "blocos", "materiais_os"], fetchData);

  const blocoMap = useMemo(() => {
    const m: Record<string, string> = {};
    blocos.forEach(b => { m[b.id] = b.nome || "—"; });
    return m;
  }, [blocos]);

  const filtered = useMemo(() => {
    return osList.filter(os => {
      if (filterBloco !== "all" && os.bloco_id !== filterBloco) return false;
      if (filterStatus !== "all" && os.status !== filterStatus) return false;
      if (filterFrom && os.created_at) {
        if (new Date(os.created_at) < filterFrom) return false;
      }
      if (filterTo && os.created_at) {
        const to = new Date(filterTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(os.created_at) > to) return false;
      }
      return true;
    });
  }, [osList, filterBloco, filterStatus, filterFrom, filterTo]);

  const hasFilters = filterBloco !== "all" || filterStatus !== "all" || !!filterFrom || !!filterTo;
  const clearFilters = () => { setFilterBloco("all"); setFilterStatus("all"); setFilterFrom(undefined); setFilterTo(undefined); };

  // ---- Computed data ----

  // Status count
  const statusCount = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.forEach(o => { const s = o.status || "Sem status"; m[s] = (m[s] || 0) + 1; });
    return m;
  }, [filtered]);
  const pieData = Object.entries(statusCount).map(([name, value]) => ({ name, value }));

  // Monthly count (período)
  const monthlyData = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.forEach(os => {
      if (os.created_at) {
        try {
          const key = format(new Date(os.created_at), "yyyy-MM");
          m[key] = (m[key] || 0) + 1;
        } catch { /* skip */ }
      }
    });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([month, total]) => {
      const [y, mo] = month.split("-");
      return { name: `${mo}/${y}`, total };
    });
  }, [filtered]);

  // By responsável (criado_por)
  const byResponsavel = useMemo(() => {
    const m: Record<string, { nome: string; total: number; concluidas: number; abertas: number }> = {};
    filtered.forEach(os => {
      const key = os.criado_por || "__none__";
      const nome = os.criado_por ? (profilesMap[os.criado_por] || "Desconhecido") : "Sem responsável";
      if (!m[key]) m[key] = { nome, total: 0, concluidas: 0, abertas: 0 };
      m[key].total++;
      if (os.status === "Concluída") m[key].concluidas++;
      else if (os.status !== "Cancelada") m[key].abertas++;
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [filtered, profilesMap]);

  // Custos por OS
  const custosData = useMemo(() => {
    return filtered
      .filter(os => (os.custo_total || 0) > 0)
      .sort((a, b) => (b.custo_total || 0) - (a.custo_total || 0))
      .map(os => ({
        id: os.id,
        codigo: os.codigo_os || "—",
        bloco: blocoMap[os.bloco_id || ""] || "—",
        status: os.status || "—",
        custo: os.custo_total || 0,
        materiais: materiais.filter(m => m.os_id === os.id),
      }));
  }, [filtered, materiais, blocoMap]);

  const totalCustos = filtered.reduce((s, o) => s + (o.custo_total || 0), 0);

  // ---- Export functions ----

  const getFilterLabel = () => {
    const parts: string[] = [];
    if (filterBloco !== "all") parts.push(`Bloco: ${blocoMap[filterBloco] || filterBloco}`);
    if (filterStatus !== "all") parts.push(`Status: ${filterStatus}`);
    if (filterFrom) parts.push(`De: ${format(filterFrom, "dd/MM/yyyy")}`);
    if (filterTo) parts.push(`Até: ${format(filterTo, "dd/MM/yyyy")}`);
    return parts.length ? parts.join(" | ") : "Todos os dados";
  };

  const exportPeriodoPDF = async () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const company = await getCompanyInfo();
    const startY = await addPdfHeader(doc, "Relatório de O.S. por Período", getFilterLabel(), company);

    const headers = ["Código", "Bloco", "Andar", "Sala", "Equipamentos", "Status", "Prioridade", "Tipo Serviço", "Prazo", "Início", "Término", "Custo"];
    const rows = filtered.map(os => [
      os.codigo_os || "—", blocoMap[os.bloco_id || ""] || "—", os.andar || "—", os.sala || "—",
      (os.equipamentos || "—").replace(/\n/g, ", "), os.status || "—", os.prioridade || "—",
      os.tipo_servico || "—", fmtDate(os.prazo), fmtDate(os.data_inicio), fmtDate(os.data_termino), fmtBRLVal(os.custo_total),
    ]);

    autoTable(doc, {
      startY, head: [headers], body: rows,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [240, 245, 250] },
    });
    doc.save(`relatorio_periodo_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
    toast({ title: "PDF exportado!" });
  };

  const exportStatusPDF = async () => {
    const doc = new jsPDF();
    const company = await getCompanyInfo();
    const startY = await addPdfHeader(doc, "Relatório de O.S. por Status", getFilterLabel(), company);

    const headers = ["Status", "Quantidade", "% do Total"];
    const rows = pieData.map(e => [e.name, String(e.value), `${((e.value / filtered.length) * 100).toFixed(1)}%`]);
    rows.push(["TOTAL", String(filtered.length), "100%"]);

    autoTable(doc, {
      startY, head: [headers], body: rows,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [30, 58, 95], textColor: 255 },
    });
    doc.save(`relatorio_status_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
    toast({ title: "PDF exportado!" });
  };

  const exportResponsavelPDF = async () => {
    const doc = new jsPDF();
    const company = await getCompanyInfo();
    const startY = await addPdfHeader(doc, "Relatório de O.S. por Responsável", getFilterLabel(), company);

    const headers = ["Responsável", "Total O.S.", "Concluídas", "Abertas"];
    const rows = byResponsavel.map(r => [r.nome, String(r.total), String(r.concluidas), String(r.abertas)]);

    autoTable(doc, {
      startY, head: [headers], body: rows,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [30, 58, 95], textColor: 255 },
    });
    doc.save(`relatorio_responsavel_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
    toast({ title: "PDF exportado!" });
  };

  const exportCustosPDF = async () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const company = await getCompanyInfo();
    const startY = await addPdfHeader(doc, "Relatório de Custos por O.S.", `Total: ${fmtBRL(totalCustos)} | ${getFilterLabel()}`, company);

    const headers = ["Código O.S.", "Bloco", "Status", "Custo Total", "Materiais"];
    const rows = custosData.map(c => [
      c.codigo, c.bloco, c.status, fmtBRL(c.custo),
      c.materiais.map(m => `${m.nome_material} (${m.quantidade}x ${fmtBRL(m.custo_unitario)})`).join("; ") || "—",
    ]);
    rows.push(["", "", "TOTAL", fmtBRL(totalCustos), ""]);

    autoTable(doc, {
      startY, head: [headers], body: rows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 95], textColor: 255 },
    });
    doc.save(`relatorio_custos_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
    toast({ title: "PDF exportado!" });
  };

  const exportCurrentPDF = async () => {
    if (activeTab === "periodo") await exportPeriodoPDF();
    else if (activeTab === "status") await exportStatusPDF();
    else if (activeTab === "responsavel") await exportResponsavelPDF();
    else await exportCustosPDF();
  };

  const exportCurrentExcel = () => {
    const wb = XLSX.utils.book_new();

    if (activeTab === "periodo") {
      const headers = ["Código", "Bloco", "Andar", "Sala", "Equipamentos", "Status", "Prioridade", "Tipo Serviço", "Prazo", "Início", "Término", "Custo Total"];
      const rows = filtered.map(os => [
        os.codigo_os, blocoMap[os.bloco_id || ""] || "", os.andar, os.sala,
        os.equipamentos, os.status, os.prioridade, os.tipo_servico,
        fmtDate(os.prazo), fmtDate(os.data_inicio), fmtDate(os.data_termino), os.custo_total,
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws["!cols"] = headers.map(() => ({ wch: 16 }));
      XLSX.utils.book_append_sheet(wb, ws, "OS por Período");
    } else if (activeTab === "status") {
      const headers = ["Status", "Quantidade", "% do Total"];
      const rows = pieData.map(e => [e.name, e.value, `${((e.value / filtered.length) * 100).toFixed(1)}%`]);
      rows.push(["TOTAL", filtered.length, "100%"]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, "OS por Status");
    } else if (activeTab === "responsavel") {
      const headers = ["Responsável", "Total OS", "Concluídas", "Abertas"];
      const rows = byResponsavel.map(r => [r.nome, r.total, r.concluidas, r.abertas]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, "OS por Responsável");
    } else {
      const headers = ["Código OS", "Bloco", "Status", "Custo Total"];
      const rows = custosData.map(c => [c.codigo, c.bloco, c.status, c.custo]);
      rows.push(["", "", "TOTAL", totalCustos]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, "Custos por OS");

      // Sheet 2: detail materials
      const mHeaders = ["Código OS", "Material", "Qtd", "Custo Unit.", "Custo Total"];
      const mRows = custosData.flatMap(c => c.materiais.map(m => [c.codigo, m.nome_material, m.quantidade, m.custo_unitario, m.custo_total_item]));
      if (mRows.length) {
        const ws2 = XLSX.utils.aoa_to_sheet([mHeaders, ...mRows]);
        XLSX.utils.book_append_sheet(wb, ws2, "Materiais Detalhado");
      }
    }

    XLSX.writeFile(wb, `relatorio_${activeTab}_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
    toast({ title: "Excel exportado!" });
  };

  if (loading) return <p className="text-muted-foreground p-6">Carregando...</p>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {can("relatorios.exportar") && (
            <>
              <Button variant="outline" size="sm" onClick={exportCurrentPDF}>
                <FileDown className="h-4 w-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportCurrentExcel}>
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
              <X className="h-3 w-3 mr-1" /> Limpar filtros
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select value={filterBloco} onValueChange={setFilterBloco}>
            <SelectTrigger><SelectValue placeholder="Bloco" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Blocos</SelectItem>
              {blocos.map(b => <SelectItem key={b.id} value={b.id}>{b.nome || "Sem nome"}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("justify-start text-left font-normal", !filterFrom && "text-muted-foreground")}>
                <CalendarIcon className="h-4 w-4 mr-2" />
                {filterFrom ? format(filterFrom, "dd/MM/yyyy") : "Data início"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={filterFrom} onSelect={setFilterFrom} locale={ptBR} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("justify-start text-left font-normal", !filterTo && "text-muted-foreground")}>
                <CalendarIcon className="h-4 w-4 mr-2" />
                {filterTo ? format(filterTo, "dd/MM/yyyy") : "Data fim"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={filterTo} onSelect={setFilterTo} locale={ptBR} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        {hasFilters && <p className="text-xs text-muted-foreground mt-2">{filtered.length} O.S. encontrada(s)</p>}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border bg-card p-5 flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-sky-50 flex items-center justify-center">
            <ClipboardList className="h-5 w-5 text-sky-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total de O.S.</p>
            <p className="text-2xl font-bold">{filtered.length}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Custo Total</p>
            <p className="text-2xl font-bold">{fmtBRL(totalCustos)}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Média por O.S.</p>
            <p className="text-2xl font-bold">{filtered.length > 0 ? fmtBRL(totalCustos / filtered.length) : "—"}</p>
          </div>
        </div>
      </div>

      {/* Report tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="periodo">Por Período</TabsTrigger>
          <TabsTrigger value="status">Por Status</TabsTrigger>
          <TabsTrigger value="responsavel">Por Responsável</TabsTrigger>
          <TabsTrigger value="custos">Custos por O.S.</TabsTrigger>
        </TabsList>

        {/* --- Tab: Por Período --- */}
        <TabsContent value="periodo">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-lg font-semibold mb-4">O.S. Criadas por Mês</h2>
              {monthlyData.length === 0 ? (
                <p className="text-muted-foreground text-sm">Sem dados no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyData}>
                    <XAxis dataKey="name" tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} />
                    <YAxis tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#fff", border: "1px solid hsl(220, 13%, 91%)" }} />
                    <Bar dataKey="total" fill="hsl(210, 70%, 55%)" radius={[4, 4, 0, 0]} name="O.S. criadas" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-lg font-semibold mb-4">Detalhamento</h2>
              <div className="max-h-[280px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Bloco</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.slice(0, 50).map(os => (
                      <TableRow key={os.id}>
                        <TableCell className="font-mono text-sm">{os.codigo_os || "—"}</TableCell>
                        <TableCell>{blocoMap[os.bloco_id || ""] || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[10px]", getStatusColor(os.status))}>{os.status || "—"}</Badge>
                        </TableCell>
                        <TableCell>{fmtDate(os.created_at)}</TableCell>
                        <TableCell className="text-right">{fmtBRLVal(os.custo_total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filtered.length > 50 && <p className="text-xs text-muted-foreground mt-2 text-center">Mostrando 50 de {filtered.length}. Exporte para ver todos.</p>}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* --- Tab: Por Status --- */}
        <TabsContent value="status">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-lg font-semibold mb-4">Distribuição por Status</h2>
              {pieData.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhuma O.S. cadastrada.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label={({ name, value }) => `${name}: ${value}`}>
                      {pieData.map(entry => <Cell key={entry.name} fill={STATUS_COLORS_CHART[entry.name] || FALLBACK_COLOR} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-lg font-semibold mb-4">Resumo por Status</h2>
              <div className="space-y-3">
                {pieData.map(entry => (
                  <div key={entry.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: STATUS_COLORS_CHART[entry.name] || FALLBACK_COLOR }} />
                      <span className="text-sm">{entry.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium">{entry.value}</span>
                      <span className="text-xs text-muted-foreground w-12 text-right">{((entry.value / filtered.length) * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
                {pieData.length === 0 && <p className="text-muted-foreground text-sm">Sem dados.</p>}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* --- Tab: Por Responsável --- */}
        <TabsContent value="responsavel">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-lg font-semibold mb-4">O.S. por Responsável</h2>
              {byResponsavel.length === 0 ? (
                <p className="text-muted-foreground text-sm">Sem dados.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={byResponsavel.slice(0, 10)} layout="vertical">
                    <XAxis type="number" tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="nome" width={120} tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#fff", border: "1px solid hsl(220, 13%, 91%)" }} />
                    <Bar dataKey="total" fill="hsl(210, 70%, 55%)" radius={[0, 4, 4, 0]} name="Total" />
                    <Bar dataKey="concluidas" fill="hsl(150, 65%, 45%)" radius={[0, 4, 4, 0]} name="Concluídas" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-lg font-semibold mb-4">Detalhamento</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Responsável</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Concluídas</TableHead>
                    <TableHead className="text-center">Abertas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byResponsavel.map(r => (
                    <TableRow key={r.nome}>
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell className="text-center">{r.total}</TableCell>
                      <TableCell className="text-center text-emerald-600">{r.concluidas}</TableCell>
                      <TableCell className="text-center text-sky-600">{r.abertas}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* --- Tab: Custos por OS --- */}
        <TabsContent value="custos">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-lg font-semibold mb-4">Top O.S. por Custo</h2>
              {custosData.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhuma O.S. com custos.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={custosData.slice(0, 10)}>
                    <XAxis dataKey="codigo" tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} tickFormatter={v => `R$${v}`} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={{ background: "#fff", border: "1px solid hsl(220, 13%, 91%)" }} />
                    <Bar dataKey="custo" fill="hsl(30, 80%, 55%)" radius={[4, 4, 0, 0]} name="Custo" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-lg font-semibold mb-4">Detalhamento de Custos</h2>
              <div className="max-h-[300px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Bloco</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {custosData.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-sm">{c.codigo}</TableCell>
                        <TableCell>{c.bloco}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[10px]", getStatusColor(c.status))}>{c.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{fmtBRL(c.custo)}</TableCell>
                      </TableRow>
                    ))}
                    {custosData.length > 0 && (
                      <TableRow className="border-t-2">
                        <TableCell colSpan={3} className="font-bold">TOTAL</TableCell>
                        <TableCell className="text-right font-bold">{fmtBRL(totalCustos)}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
