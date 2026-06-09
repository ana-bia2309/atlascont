import { useCallback, useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search, X, FileText, Download, Package, ChevronDown, ChevronRight, TrendingUp } from "@/lib/icons";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addPdfHeader, getCompanyInfo } from "@/lib/pdfHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
const [filterOS, setFilterOS] = useState("__all__");

type MatOS = {
  id: string;
  os_id: string;
  nome_material: string;
  quantidade: number;
  unidade: string;
  custo_unitario: number;
  custo_total_item: number;
};

type OSRow = {
  id: string;
  codigo_os: string | null;
  status: string | null;
  created_at: string | null;
  responsible_user_id: string | null;
  titulo: string | null;
  equipamentos: string | null;
};

type Profile = { id: string; nome: string };

type MaterialConsolidado = {
  nome: string;
  unidade: string;
  totalQtd: number;
  totalCusto: number;
  totalOS: number;
  ultimaUtilizacao: string | null;
  ocorrencias: { osId: string; codigoOs: string | null; quantidade: number; status: string | null; tecnico: string | null; data: string | null }[];
};

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return "—"; }
};

export default function RelatorioConsolidadoMateriais() {
  const { companyId } = useCompany();
  const [osList, setOsList] = useState<OSRow[]>([]);
  const [materiais, setMateriais] = useState<MatOS[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterSearch, setFilterSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [sortBy, setSortBy] = useState<"nome" | "qtd" | "custo" | "os">("custo");
  const [filterStatus, setFilterStatus] = useState("__all__");
const [filterTecnico, setFilterTecnico] = useState("__all__");
const [filterDateFrom, setFilterDateFrom] = useState("");
const [filterDateTo, setFilterDateTo] = useState("");

  const fetchData = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [osRes, matRes, profRes] = await Promise.all([
        (supabase as any).from("ordens_servico")
          .select("id, codigo_os, status, created_at, responsible_user_id, titulo, equipamentos")
          .eq("company_id", companyId),
        (supabase as any).from("materiais_os")
          .select("id, os_id, nome_material, quantidade, unidade, custo_unitario, custo_total_item")
          .eq("company_id", companyId),
        (supabase as any).from("profiles").select("id, nome").eq("company_id", companyId),
      ]);
      setOsList(osRes?.data || []);
      setMateriais(matRes?.data || []);
      setProfiles(profRes?.data || []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar dados", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const profilesMap = useMemo(() => Object.fromEntries(profiles.map(p => [p.id, p.nome])), [profiles]);
  const osMap = useMemo(() => Object.fromEntries(osList.map(os => [os.id, os])), [osList]);

  const consolidado = useMemo(() => {
    const map: Record<string, MaterialConsolidado> = {};
    materiais.forEach(m => {
      const key = m.nome_material.trim().toLowerCase();
      if (!map[key]) {
        map[key] = {
          nome: m.nome_material,
          unidade: m.unidade,
          totalQtd: 0,
          totalCusto: 0,
          totalOS: 0,
          ultimaUtilizacao: null,
          ocorrencias: [],
        };
      }
      const os = osMap[m.os_id];
      map[key].totalQtd += m.quantidade;
      map[key].totalCusto += m.custo_total_item;
      map[key].totalOS++;
      if (os?.created_at) {
        if (!map[key].ultimaUtilizacao || os.created_at > map[key].ultimaUtilizacao!) {
          map[key].ultimaUtilizacao = os.created_at;
        }
      }
      map[key].ocorrencias.push({
        osId: m.os_id,
        codigoOs: os?.codigo_os || null,
        quantidade: m.quantidade,
        status: os?.status || null,
        tecnico: os?.responsible_user_id ? profilesMap[os.responsible_user_id] || null : null,
        data: os?.created_at || null,
      });
    });
    return Object.values(map);
  }, [materiais, osMap, profilesMap]);

  const filtered = useMemo(() => {
    let list = consolidado.map(m => ({
      ...m,
      ocorrencias: m.ocorrencias.filter(o => {
        if (filterStatus !== "__all__" && o.status !== filterStatus) return false;
        if (filterTecnico !== "__all__" && o.tecnico !== profilesMap[filterTecnico]) return false;
        if (filterDateFrom && o.data && o.data.slice(0, 10) < filterDateFrom) return false;
        if (filterDateTo && o.data && o.data.slice(0, 10) > filterDateTo) return false;
        if (filterOS !== "__all__" && o.osId !== filterOS) return false;
        return true;
      }),
    })).filter(m => m.ocorrencias.length > 0);
    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase();
      list = list.filter(m => m.nome.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (sortBy === "nome") return a.nome.localeCompare(b.nome);
      if (sortBy === "qtd") return b.totalQtd - a.totalQtd;
      if (sortBy === "os") return b.totalOS - a.totalOS;
      return b.totalCusto - a.totalCusto;
    });
  }, [consolidado, filterSearch, sortBy]);

  const toggleExpand = (nome: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(nome)) next.delete(nome); else next.add(nome);
      return next;
    });
  };

  const exportExcel = () => {
    const rows: any[] = [];
    filtered.forEach(m => {
      rows.push({
        "Material": m.nome,
        "Unidade": m.unidade,
        "Qtd Total": m.totalQtd,
        "Custo Total (R$)": m.totalCusto.toFixed(2),
        "Qtd de O.S.": m.totalOS,
        "Última Utilização": fmtDate(m.ultimaUtilizacao),
      });
    });
    const wsResumo = XLSX.utils.json_to_sheet(rows);

    const rowsDetalhe: any[] = [];
    filtered.forEach(m => {
      m.ocorrencias.forEach(o => {
        rowsDetalhe.push({
          "Material": m.nome,
          "O.S.": o.codigoOs || "—",
          "Data": fmtDate(o.data),
          "Status": o.status || "—",
          "Técnico": o.tecnico || "—",
          "Quantidade": o.quantidade,
          "Unidade": m.unidade,
        });
      });
    });
    const wsDetalhe = XLSX.utils.json_to_sheet(rowsDetalhe);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");
    XLSX.utils.book_append_sheet(wb, wsDetalhe, "Detalhamento");
    XLSX.writeFile(wb, `relatorio-consolidado-materiais-${format(new Date(), "yyyyMMdd")}.xlsx`);
    toast({ title: "Excel exportado!" });
  };

 const exportPDF = async () => {
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: "landscape" });
      const company = await getCompanyInfo();
      const startY = await addPdfHeader(doc, "Consolidado de Materiais", `${filtered.length} materiais diferentes`, company);

      // Tabela resumo
      autoTable(doc, {
        startY,
        head: [["Material", "Unidade", "Qtd Total", "Custo Total", "Qtd O.S.", "Última Utilização"]],
        body: filtered.map(m => [
          m.nome,
          m.unidade,
          m.totalQtd,
          `R$ ${m.totalCusto.toFixed(2)}`,
          m.totalOS,
          fmtDate(m.ultimaUtilizacao),
        ]),
        foot: [["TOTAL", "", filtered.reduce((s,m) => s + m.totalQtd, 0), `R$ ${filtered.reduce((s,m) => s + m.totalCusto, 0).toFixed(2)}`, filtered.reduce((s,m) => s + m.totalOS, 0), ""]],
        headStyles: { fillColor: [99, 102, 241], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 248, 255] },
        footStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: "bold", fontSize: 8 },
      });

      // Detalhamento por material
      let y = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(11);
      doc.setTextColor(50, 50, 80);
      if (y > 170) { doc.addPage(); y = 14; }
      doc.text("Detalhamento por Material", 14, y);
      y += 6;

      for (const m of filtered) {
        if (y > 175) { doc.addPage(); y = 14; }
        doc.setFontSize(9);
        doc.setTextColor(99, 102, 241);
        doc.text(`${m.nome} — ${m.totalQtd} ${m.unidade} em ${m.totalOS} O.S. — Total: R$ ${m.totalCusto.toFixed(2)}`, 14, y);
        y += 4;

        autoTable(doc, {
          startY: y,
          head: [["O.S.", "Status", "Técnico", "Data", "Quantidade"]],
          body: m.ocorrencias
            .sort((a, b) => (b.data || "").localeCompare(a.data || ""))
            .map(o => [
              o.codigoOs || "—",
              o.status || "—",
              o.tecnico || "—",
              fmtDate(o.data),
              `${o.quantidade} ${m.unidade}`,
            ]),
          headStyles: { fillColor: [230, 230, 250], textColor: [50, 50, 100], fontSize: 7 },
          bodyStyles: { fontSize: 7 },
          margin: { left: 14 },
        });
        y = (doc as any).lastAutoTable.finalY + 8;
      }

      doc.save(`relatorio-consolidado-materiais-${format(new Date(), "yyyyMMdd")}.pdf`);
      toast({ title: "PDF exportado!" });
    } catch (err: any) {
      toast({ title: "Erro ao exportar", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const totalCusto = filtered.reduce((s, m) => s + m.totalCusto, 0);
  const totalItens = filtered.reduce((s, m) => s + m.totalQtd, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Consolidado de Materiais</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} materiais diferentes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchData}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button variant="outline" onClick={exportExcel} disabled={filtered.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" onClick={exportPDF} disabled={filtered.length === 0 || exporting}>
            <FileText className="mr-2 h-4 w-4" /> {exporting ? "Gerando..." : "PDF"}
          </Button>
        </div>
      </div>

      {/* Busca e ordenação */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Pesquisar material..." className="pl-9" />
          {filterSearch && <Button variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7" onClick={() => setFilterSearch("")}><X className="h-3 w-3" /></Button>}
        </div>
        <div className="flex gap-2">
          <span className="text-xs text-muted-foreground self-center">Ordenar por:</span>
          {[
            { value: "custo", label: "Custo" },
            { value: "qtd", label: "Quantidade" },
            { value: "os", label: "Nº OS" },
            { value: "nome", label: "Nome" },
          ].map(s => (
            <Button key={s.value} variant={sortBy === s.value ? "default" : "outline"} size="sm" onClick={() => setSortBy(s.value as any)}>
              {s.label}
            </Button>
          ))}
        </div>
      </div>

  {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os status</SelectItem>
            {["Não Iniciada","Em Execução","Concluída","Cancelada"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTecnico} onValueChange={setFilterTecnico}>
          <Select value={filterOS} onValueChange={setFilterOS}>
  <SelectTrigger className="w-48"><SelectValue placeholder="Filtrar por O.S." /></SelectTrigger>
  <SelectContent>
    <SelectItem value="__all__">Todas as O.S.</SelectItem>
    {osList
      .filter(os => materiais.some(m => m.os_id === os.id))
      .sort((a, b) => (a.codigo_os || "").localeCompare(b.codigo_os || ""))
      .map(os => <SelectItem key={os.id} value={os.id}>{os.codigo_os || os.titulo || os.id}</SelectItem>)
    }
  </SelectContent>
</Select>
          <SelectTrigger className="w-44"><SelectValue placeholder="Técnico" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">De</span>
          <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-36 h-9" />
          <span className="text-xs text-muted-foreground">até</span>
          <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-36 h-9" />
        </div>
        {(filterStatus !== "__all__" || filterTecnico !== "__all__" || filterDateFrom || filterDateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterStatus("__all__"); setFilterTecnico("__all__"); setFilterDateFrom(""); setFilterDateTo("");setFilterDateTo("") }}>
            <X className="h-3 w-3 mr-1" /> Limpar
          </Button>
        )}
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Materiais distintos</p>
          <p className="text-2xl font-bold text-primary">{filtered.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total de itens consumidos</p>
          <p className="text-2xl font-bold">{totalItens.toLocaleString("pt-BR")}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Custo total</p>
          <p className="text-2xl font-bold text-primary">R$ {totalCusto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Lista consolidada */}
      {loading ? (
        <p className="text-muted-foreground text-center py-12">Carregando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">Nenhum material encontrado.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(m => {
            const isExpanded = expanded.has(m.nome);
            return (
              <div key={m.nome} className="rounded-xl border bg-card overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
                  onClick={() => toggleExpand(m.nome)}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Package className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{m.nome}</p>
                    <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>📦 {m.totalQtd.toLocaleString("pt-BR")} {m.unidade}</span>
                      <span>🔧 {m.totalOS} O.S.</span>
                      {m.ultimaUtilizacao && <span>📅 Último uso: {fmtDate(m.ultimaUtilizacao)}</span>}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-primary shrink-0">R$ {m.totalCusto.toFixed(2)}</span>
                </button>
                {isExpanded && (
                  <div className="border-t px-4 pb-4 pt-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground mb-2">O.S. onde este material foi utilizado:</p>
                    {m.ocorrencias
                      .sort((a, b) => (b.data || "").localeCompare(a.data || ""))
                      .map((o, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg border px-3 py-2 bg-muted/30">
                          <div>
                            <p className="text-sm font-medium">{o.codigoOs || "—"}</p>
                            <div className="flex gap-2 text-xs text-muted-foreground">
                              <span>{o.status || "—"}</span>
                              {o.tecnico && <span>👤 {o.tecnico}</span>}
                              {o.data && <span>📅 {fmtDate(o.data)}</span>}
                            </div>
                          </div>
                          <span className="text-sm font-semibold">{o.quantidade} {m.unidade}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}