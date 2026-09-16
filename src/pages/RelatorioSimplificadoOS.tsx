import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { DateFilterButton } from "@/components/ui/date-filter-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { RefreshCw, Search, X, Download, FileSpreadsheet, ClipboardList, Wrench, Paperclip } from "@/lib/icons";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addPdfHeader, getAtlasCompanyInfo } from "@/lib/pdfHeader";
import { STATUS_OPTIONS, getStatusColor } from "@/lib/os-status";
import { computeSlaStatus } from "@/lib/sla-utils";

const PRIORIDADE_COLORS: Record<string, string> = {
  "Baixa": "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-300 dark:border-zinc-700",
  "Média": "bg-info/10 text-info border-info/20",
  "Alta": "bg-warning/10 text-warning border-warning/20",
  "Crítica": "bg-destructive/10 text-destructive border-destructive/20",
};

type OSRow = {
  id: string; codigo_os: string | null; numero_os_externo: string | null; natureza_servico: string | null;
  bloco_id: string | null; andar: string | null; sala: string | null; equipamentos: string | null;
  prioridade: string | null; status: string | null; sla_prazo_limite: string | null; prazo: string | null;
  custo_total: number | null; created_at: string; responsible_user_id: string | null;
};

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(/^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T00:00:00") : new Date(d), "dd/MM/yyyy"); } catch { return "—"; }
};
const fmtMoney = (n: number | null) => n ? `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—";

export default function RelatorioSimplificadoOS() {
  const { companyId } = useCompany();
  const [loading, setLoading] = useState(true);
  const [osList, setOsList] = useState<OSRow[]>([]);
  const [blocosMap, setBlocosMap] = useState<Record<string, string>>({});
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [responsaveisMap, setResponsaveisMap] = useState<Record<string, string[]>>({});
  const [auxiliaresMap, setAuxiliaresMap] = useState<Record<string, string[]>>({});
  const [anexosCountMap, setAnexosCountMap] = useState<Record<string, number>>({});
  const [blocosList, setBlocosList] = useState<{ id: string; nome: string }[]>([]);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [filterSearch, setFilterSearch] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterPrazoFrom, setFilterPrazoFrom] = useState("");
  const [filterPrazoTo, setFilterPrazoTo] = useState("");
  const [filterBloco, setFilterBloco] = useState("__all__");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [filterValorMin, setFilterValorMin] = useState("");
  const [filterValorMax, setFilterValorMax] = useState("");

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);

    const [osRes, blocosRes, profRes, respRes, colabRes, anexosRes] = await Promise.all([
      (supabase as any).from("ordens_servico")
        .select("id, codigo_os, numero_os_externo, natureza_servico, bloco_id, andar, sala, equipamentos, prioridade, status, sla_prazo_limite, prazo, custo_total, created_at, responsible_user_id")
        .eq("company_id", companyId)
        .eq("arquivada", false)
        .order("created_at", { ascending: false }),
      (supabase as any).from("blocos").select("id, nome").eq("company_id", companyId).order("nome"),
      (supabase as any).from("profiles").select("id, nome").eq("company_id", companyId),
      (supabase as any).from("os_responsaveis").select("os_id, profile_id").eq("company_id", companyId),
      (supabase as any).from("os_colaboradores").select("os_id, profile_id").eq("company_id", companyId),
      (supabase as any).from("anexos_os").select("os_id"),
    ]);

    if (osRes.error) toast({ title: "Erro ao carregar O.S.", description: osRes.error.message, variant: "destructive" });
    setOsList(osRes.data || []);

    const bMap: Record<string, string> = {};
    (blocosRes.data || []).forEach((b: any) => { bMap[b.id] = b.nome || "—"; });
    setBlocosMap(bMap);
    setBlocosList(blocosRes.data || []);

    const pMap: Record<string, string> = {};
    (profRes.data || []).forEach((p: any) => { pMap[p.id] = p.nome; });
    setProfilesMap(pMap);

    const rMap: Record<string, string[]> = {};
    (respRes.data || []).forEach((r: any) => {
      if (!rMap[r.os_id]) rMap[r.os_id] = [];
      if (pMap[r.profile_id]) rMap[r.os_id].push(pMap[r.profile_id]);
    });
    setResponsaveisMap(rMap);

    const cMap: Record<string, string[]> = {};
    (colabRes.data || []).forEach((r: any) => {
      if (!cMap[r.os_id]) cMap[r.os_id] = [];
      if (pMap[r.profile_id]) cMap[r.os_id].push(pMap[r.profile_id]);
    });
    setAuxiliaresMap(cMap);

    const aMap: Record<string, number> = {};
    (anexosRes.data || []).forEach((a: any) => { aMap[a.os_id] = (aMap[a.os_id] || 0) + 1; });
    setAnexosCountMap(aMap);

    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    return osList.filter((os) => {
      if (filterSearch.trim()) {
        const q = filterSearch.trim().toLowerCase();
        if (!(os.codigo_os || "").toLowerCase().includes(q) && !(os.numero_os_externo || "").toLowerCase().includes(q)) return false;
      }
      if (filterDateFrom && os.created_at.slice(0, 10) < filterDateFrom) return false;
      if (filterDateTo && os.created_at.slice(0, 10) > filterDateTo) return false;
      if (filterPrazoFrom && (!os.prazo || os.prazo < filterPrazoFrom)) return false;
      if (filterPrazoTo && (!os.prazo || os.prazo > filterPrazoTo)) return false;
      if (filterBloco !== "__all__" && os.bloco_id !== filterBloco) return false;
      if (filterStatus !== "__all__" && os.status !== filterStatus) return false;
      const valor = os.custo_total || 0;
      if (filterValorMin && valor < Number(filterValorMin)) return false;
      if (filterValorMax && valor > Number(filterValorMax)) return false;
      return true;
    });
  }, [osList, filterSearch, filterDateFrom, filterDateTo, filterPrazoFrom, filterPrazoTo, filterBloco, filterStatus, filterValorMin, filterValorMax]);

  const hasFilters = filterSearch.trim() !== "" || filterDateFrom !== "" || filterDateTo !== "" ||
    filterPrazoFrom !== "" || filterPrazoTo !== "" || filterBloco !== "__all__" || filterStatus !== "__all__" ||
    filterValorMin !== "" || filterValorMax !== "";

  const clearFilters = () => {
    setFilterSearch(""); setFilterDateFrom(""); setFilterDateTo(""); setFilterPrazoFrom(""); setFilterPrazoTo("");
    setFilterBloco("__all__"); setFilterStatus("__all__"); setFilterValorMin(""); setFilterValorMax("");
  };

  const localTexto = (os: OSRow) => {
    const parts = [os.bloco_id ? blocosMap[os.bloco_id] : null, os.andar ? `${os.andar}º andar` : null, os.sala ? `Sala ${os.sala}` : null].filter(Boolean);
    return parts.join(", ") || "—";
  };
  const equipCount = (os: OSRow) => os.equipamentos ? os.equipamentos.split("\n").filter((l) => l.trim()).length : 0;
  const responsavelTexto = (os: OSRow) => {
    const r = responsaveisMap[os.id];
    if (r?.length) return r.join(", ");
    if (os.responsible_user_id) return profilesMap[os.responsible_user_id] || null;
    return null;
  };

  const exportarExcel = () => {
    const rows = filtered.map((os) => ({
      "Código": os.codigo_os || "—", "OS Externa": os.numero_os_externo || "—", "Tipo de Serviço": os.natureza_servico || "—",
      "Local": localTexto(os), "Responsável": responsavelTexto(os) || "Sem responsável",
      "Auxiliares": (auxiliaresMap[os.id] || []).join(", ") || "—",
      "Equipamentos": equipCount(os), "Prioridade": os.prioridade || "—", "Status": os.status || "—",
      "SLA": computeSlaStatus(os.sla_prazo_limite, os.status, os.created_at).label,
      "Abertura": fmtDate(os.created_at), "Prazo": fmtDate(os.prazo), "Custo": os.custo_total || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "OS Simplificado");
    XLSX.writeFile(wb, `os-simplificado-${format(new Date(), "yyyyMMdd")}.xlsx`);
  };

  const exportarPDF = async () => {
    setExportingPdf(true);
    try {
      const doc = new jsPDF({ orientation: "landscape" });
      const pageW = doc.internal.pageSize.getWidth();
      const company = await getAtlasCompanyInfo();
      const y = await addPdfHeader(doc, "Relatório Simplificado de O.S.", `${filtered.length} O.S.`, company);

      autoTable(doc, {
        startY: y,
        head: [["Código", "OS Ext.", "Local", "Responsável", "Prioridade", "Status", "SLA", "Prazo", "Custo"]],
        body: filtered.map((os) => [
          os.codigo_os || "—", os.numero_os_externo || "—", localTexto(os),
          responsavelTexto(os) || "Sem responsável", os.prioridade || "—", os.status || "—",
          computeSlaStatus(os.sla_prazo_limite, os.status, os.created_at).label,
          fmtDate(os.prazo), fmtMoney(os.custo_total),
        ]),
        headStyles: { fillColor: [58, 53, 92], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
        bodyStyles: { fontSize: 7.2, textColor: [40, 40, 40] },
        alternateRowStyles: { fillColor: [250, 250, 255] },
        margin: { left: 10, right: 10 },
        tableWidth: pageW - 20,
      });

      doc.save(`os-simplificado-${format(new Date(), "yyyyMMdd")}.pdf`);
      toast({ title: "PDF exportado!" });
    } catch (err: any) {
      toast({ title: "Erro ao exportar PDF", description: err?.message, variant: "destructive" });
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" /> Relatório Simplificado de O.S.
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Lista das ordens de serviço com filtros por período, unidade, prazo, status e valor.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={exportarPDF} disabled={exportingPdf} className="gap-1.5">
            <Download className="h-4 w-4" /> {exportingPdf ? "Gerando..." : "PDF"}
          </Button>
          <Button variant="outline" onClick={exportarExcel} className="gap-1.5">
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="flex-1 min-w-[160px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Buscar código</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Ex: OS-001" className="pl-9" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Período (abertura)</label>
          <div className="flex items-center gap-1.5">
            <DateFilterButton value={filterDateFrom} onChange={setFilterDateFrom} placeholder="Início" />
            <span className="text-muted-foreground text-sm">até</span>
            <DateFilterButton value={filterDateTo} onChange={setFilterDateTo} placeholder="Fim" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Prazo</label>
          <div className="flex items-center gap-1.5">
            <DateFilterButton value={filterPrazoFrom} onChange={setFilterPrazoFrom} placeholder="Início" />
            <span className="text-muted-foreground text-sm">até</span>
            <DateFilterButton value={filterPrazoTo} onChange={setFilterPrazoTo} placeholder="Fim" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Unidade de Manutenção</label>
          <Select value={filterBloco} onValueChange={setFilterBloco}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {blocosList.map((b) => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Faixa de Valor (R$)</label>
          <div className="flex items-center gap-1.5">
            <Input type="number" placeholder="Mín." value={filterValorMin} onChange={e => setFilterValorMin(e.target.value)} className="w-24 h-9" />
            <span className="text-muted-foreground text-sm">até</span>
            <Input type="number" placeholder="Máx." value={filterValorMax} onChange={e => setFilterValorMax(e.target.value)} className="w-24 h-9" />
          </div>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-3 w-3" /> Limpar
          </Button>
        )}
        <span className="text-sm text-muted-foreground ml-auto">{filtered.length} O.S.</span>
      </div>

      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>OS Externa</TableHead>
              <TableHead>Local</TableHead>
              <TableHead>Equipamentos</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead className="text-right">Custo</TableHead>
              <TableHead>Auxiliares</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={10} className="py-3"><Skeleton className="h-6 w-full" /></TableCell></TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={10}><EmptyState icon={ClipboardList} title="Nenhuma O.S. encontrada" description="Ajuste os filtros selecionados." className="py-8" /></TableCell></TableRow>
            ) : filtered.map((os) => {
              const sla = computeSlaStatus(os.sla_prazo_limite, os.status, os.created_at);
              const responsavel = responsavelTexto(os);
              const auxiliares = auxiliaresMap[os.id] || [];
              const anexos = anexosCountMap[os.id] || 0;
              return (
                <TableRow key={os.id}>
                  <TableCell>
                    <span className="font-mono text-sm font-bold">{os.codigo_os || "—"}</span>
                    {os.natureza_servico && <p className="text-xs text-muted-foreground mt-0.5">{os.natureza_servico}</p>}
                  </TableCell>
                  <TableCell className="text-sm">{os.numero_os_externo || "—"}</TableCell>
                  <TableCell>
                    <span className="text-sm">{localTexto(os)}</span>
                    {responsavel ? (
                      <p className="text-xs text-muted-foreground mt-0.5">{responsavel}</p>
                    ) : (
                      <p className="text-xs text-amber-600 dark:text-amber-500 italic mt-0.5">Sem responsável</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm flex items-center gap-1"><Wrench className="h-3 w-3 text-muted-foreground" /> {equipCount(os)} equipamento(s)</span>
                    {anexos > 0 && <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Paperclip className="h-3 w-3" /> {anexos}</p>}
                  </TableCell>
                  <TableCell>
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border", PRIORIDADE_COLORS[os.prioridade || "Média"] || "")}>
                      {os.prioridade || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border", getStatusColor(os.status))}>
                      {os.status || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border", sla.colorClass)}>
                      {sla.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{fmtDate(os.prazo)}</TableCell>
                  <TableCell className="text-right text-sm">{fmtMoney(os.custo_total)}</TableCell>
                  <TableCell className="text-sm">{auxiliares.length > 0 ? auxiliares.join(", ") : "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
