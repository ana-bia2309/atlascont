import { useCallback, useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Search, X, FileText, Download, Filter, Package, ChevronDown, ChevronRight } from "@/lib/icons";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addPdfHeader, getAtlasCompanyInfo } from "@/lib/pdfHeader";

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
  origem: string | null;
  numero_os_externo: string | null;
  created_at: string | null;
  responsible_user_id: string | null;
  titulo: string | null;
  equipamentos: string | null;
  bloco_id: string | null;
  andar: string | null;
  sala: string | null;
};

type Profile = { id: string; nome: string };

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return "—"; }
};

export default function RelatorioMateriais() {
  const { companyId } = useCompany();
  const [osList, setOsList] = useState<OSRow[]>([]);
  const [materiais, setMateriais] = useState<MatOS[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [blocos, setBlocos] = useState<{id: string; nome: string | null}[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOs, setExpandedOs] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Filtros
  const [filterSearch, setFilterSearch] = useState("");
  const [filterTecnico, setFilterTecnico] = useState("__all__");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const fetchData = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [osRes, matRes, profRes, blocoRes] = await Promise.all([
        (supabase as any).from("ordens_servico")
          .select("id, codigo_os, status, origem, numero_os_externo, created_at, responsible_user_id, titulo, equipamentos, bloco_id, andar, sala")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        (supabase as any).from("materiais_os")
          .select("id, os_id, nome_material, quantidade, unidade, custo_unitario, custo_total_item")
          .eq("company_id", companyId),
        (supabase as any).from("profiles").select("id, nome").eq("company_id", companyId).order("nome"),
        (supabase as any).from("blocos").select("id, nome").eq("company_id", companyId),
      ]);
      setOsList(osRes?.data || []);
      setMateriais(matRes?.data || []);
      setProfiles(profRes?.data || []);
      setBlocos(blocoRes?.data || []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar dados", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const profilesMap = useMemo(() => Object.fromEntries(profiles.map(p => [p.id, p.nome])), [profiles]);
  const blocosMap = useMemo(() => Object.fromEntries(blocos.map(b => [b.id, b.nome || "—"])), [blocos]);
  const materiaisByOs = useMemo(() => {
    const map: Record<string, MatOS[]> = {};
    materiais.forEach(m => {
      if (!map[m.os_id]) map[m.os_id] = [];
      map[m.os_id].push(m);
    });
    return map;
  }, [materiais]);

  // Apenas OS que têm materiais
  const osComMateriais = useMemo(() => {
    return osList.filter(os => {
      const mats = materiaisByOs[os.id] || [];
      if (mats.length === 0) return false;
      if (filterStatus !== "__all__" && os.status !== filterStatus) return false;
      if (filterTecnico !== "__all__" && os.responsible_user_id !== filterTecnico) return false;
      if (filterDateFrom && os.created_at && os.created_at < filterDateFrom) return false;
      if (filterDateTo && os.created_at && os.created_at.slice(0, 10) > filterDateTo) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase();
        const matchOs = [os.codigo_os, os.titulo, os.equipamentos].some(f => (f || "").toLowerCase().includes(q));
        const matchMat = mats.some(m => m.nome_material.toLowerCase().includes(q));
        if (!matchOs && !matchMat) return false;
      }
      return true;
    });
  }, [osList, materiaisByOs, filterStatus, filterTecnico, filterSearch, filterDateFrom, filterDateTo]);

  const toggleExpand = (id: string) => {
    setExpandedOs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedOs(new Set(osComMateriais.map(os => os.id)));
  const collapseAll = () => setExpandedOs(new Set());

  const hasFilters = filterStatus !== "__all__" || filterTecnico !== "__all__" || filterSearch.trim() || filterDateFrom || filterDateTo;

  const exportExcel = () => {
    const rows: any[] = [];
    osComMateriais.forEach(os => {
      const mats = materiaisByOs[os.id] || [];
      mats.forEach(m => {
        rows.push({
          "Código OS": os.codigo_os || "—",
          "Título": os.titulo || os.equipamentos || "—",
          "Status": os.status || "—",
          "Origem": os.origem || "—",
          "Portal do Cliente": os.origem === "Portal do Cliente" ? "Sim" : "Não",
          "Técnico": os.responsible_user_id ? profilesMap[os.responsible_user_id] || "—" : "—",
          "Data": fmtDate(os.created_at),
          "Material": m.nome_material,
          "Quantidade": m.quantidade,
          "Unidade": m.unidade,
          "Valor Unit. (R$)": m.custo_unitario,
          "Subtotal (R$)": m.custo_total_item,
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materiais por OS");
    XLSX.writeFile(wb, `relatorio-materiais-os-${format(new Date(), "yyyyMMdd")}.xlsx`);
    toast({ title: "Excel exportado!" });
  };

  const exportPDF = async () => {
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: "landscape" });
      const pageW = doc.internal.pageSize.getWidth();
      const company = await getAtlasCompanyInfo();
      let y = await addPdfHeader(doc, "Relatório de Materiais por O.S.", `${osComMateriais.length} O.S. com materiais`, company);

      for (const os of osComMateriais) {
        const mats = materiaisByOs[os.id] || [];
        const totalOS = mats.reduce((s, m) => s + m.custo_total_item, 0);
        const estimatedHeight = 22 + mats.length * 8;

        if (y + estimatedHeight > 195) { doc.addPage(); y = 14; }

        // ── Cabeçalho da OS ──
        const pageW2 = doc.internal.pageSize.getWidth();

        // Linha 1 — fundo escuro com código, status e data
        doc.setFillColor(58, 53, 92);
        doc.rect(10, y, pageW2 - 20, 9, "F");
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text(os.codigo_os || "OS", 13, y + 6);

        // Badge status colorido
        const statusColors: Record<string, [number, number, number]> = {
          "Concluída": [34, 197, 94],
          "Em Execução": [59, 130, 246],
          "Em execução": [59, 130, 246],
          "Não Iniciada": [156, 163, 175],
          "Cancelada": [239, 68, 68],
        };
        const sc = statusColors[os.status || ""] || [156, 163, 175];
        const statusText = os.status || "—";
        doc.setFontSize(7);
        const statusW = Math.max(doc.getTextWidth(statusText) + 8, 22);
        doc.setFillColor(sc[0], sc[1], sc[2]);
        doc.roundedRect(45, y + 1.5, statusW, 6, 1, 1, "F");
        doc.setTextColor(255, 255, 255);
        doc.text(statusText, 45 + statusW / 2, y + 5.8, { align: "center" });

        // Badge Portal do Cliente (posição calculada após o selo de status)
        if (os.origem === "Portal do Cliente") {
          const portalX = 45 + statusW + 3;
          doc.setFontSize(6.5);
          const portalW = doc.getTextWidth("Portal do Cliente") + 6;
          doc.setFillColor(108, 100, 152);
          doc.roundedRect(portalX, y + 1.5, portalW, 6, 1, 1, "F");
          doc.setTextColor(255, 255, 255);
          doc.text("Portal do Cliente", portalX + portalW / 2, y + 5.8, { align: "center" });
        }

        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(200, 200, 220);
        doc.text(os.created_at ? new Date(os.created_at).toLocaleDateString("pt-BR") : "—", pageW2 - 13, y + 6, { align: "right" });
        y += 10;

        // Linha 2 — título
        doc.setFillColor(240, 241, 248);
        doc.rect(10, y, pageW2 - 20, 7, "F");
        doc.setFontSize(7.5);
        doc.setTextColor(40, 40, 60);
        doc.setFont("helvetica", "italic");
        doc.text((os.titulo || os.equipamentos || "").substring(0, 110), 13, y + 4.8);
        doc.setFont("helvetica", "normal");
        y += 8;

        // Linha 3 — localização
        const locParts2 = [
          os.bloco_id ? `Bloco: ${blocosMap[os.bloco_id]}` : null,
          os.andar ? `Andar: ${os.andar}` : null,
          os.sala ? `Sala: ${os.sala}` : null,
        ].filter(Boolean);

        if (locParts2.length > 0) {
          doc.setFillColor(220, 222, 240);
          doc.rect(10, y, pageW2 - 20, 6, "F");
          doc.setFontSize(7.5);
          doc.setTextColor(30, 30, 60);
          doc.setFont("helvetica", "normal");
          doc.text(locParts2.join("   |   "), 13, y + 4.2);
          y += 7;
        }
        y += 3;

        // ── Tabela de materiais ──
        autoTable(doc, {
          startY: y,
          head: [["Material", "Qtd", "Unidade", "Valor Unit.", "Subtotal"]],
          body: mats.map(m => [
            m.nome_material,
            m.quantidade,
            m.unidade,
            `R$ ${Number(m.custo_unitario).toFixed(2)}`,
            `R$ ${Number(m.custo_total_item).toFixed(2)}`,
          ]),
          foot: [["Total da O.S.", "", "", "", `R$ ${totalOS.toFixed(2)}`]],
          headStyles: { fillColor: [58, 53, 92], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
          bodyStyles: { fontSize: 7.5, textColor: [40, 40, 40] },
          alternateRowStyles: { fillColor: [241, 239, 245] },
          footStyles: { fillColor: [108, 100, 152], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
          margin: { left: 10, right: 10 },
          tableWidth: pageW - 20,
        });

        y = (doc as any).lastAutoTable.finalY + 10;
      }

      // ── Rodapé com total geral ──
      const totalGeral = osComMateriais.reduce((s, os) => {
        return s + (materiaisByOs[os.id] || []).reduce((ss, m) => ss + m.custo_total_item, 0);
      }, 0);

      if (y + 10 > 195) { doc.addPage(); y = 14; }
      doc.setDrawColor(180, 180, 200);
      doc.setLineWidth(0.5);
      doc.line(10, y, pageW - 10, y);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 60);
      doc.text(`Total Geral: R$ ${totalGeral.toFixed(2)}`, pageW - 13, y + 6, { align: "right" });

      doc.save(`relatorio-materiais-os-${format(new Date(), "yyyyMMdd")}.pdf`);
      toast({ title: "PDF exportado!" });
    } catch (err: any) {
      toast({ title: "Erro ao exportar", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const totalMateriais = osComMateriais.reduce((s, os) => s + (materiaisByOs[os.id] || []).reduce((ss, m) => ss + m.custo_total_item, 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Relatório de Materiais por O.S.</h1>
            <p className="text-sm text-muted-foreground">{osComMateriais.length} O.S. com materiais</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchData}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button variant="outline" onClick={exportExcel} disabled={osComMateriais.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" onClick={exportPDF} disabled={osComMateriais.length === 0 || exporting}>
            <FileText className="mr-2 h-4 w-4" /> {exporting ? "Gerando..." : "PDF Completo"}
          </Button>
          {hasFilters && osComMateriais.length > 0 && (
            <Button onClick={exportPDF} disabled={exporting}>
              <FileText className="mr-2 h-4 w-4" /> {exporting ? "Gerando..." : "PDF Filtrado"}
            </Button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filtros
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => { setFilterSearch(""); setFilterStatus("__all__"); setFilterTecnico("__all__"); setFilterDateFrom(""); setFilterDateTo(""); }}>
              <X className="h-3 w-3" /> Limpar
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Buscar OS ou material..." className="pl-9" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os status</SelectItem>
              {["Não Iniciada","Em Execução","Concluída","Cancelada"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterTecnico} onValueChange={setFilterTecnico}>
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
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">O.S. com materiais</p>
          <p className="text-2xl font-bold text-primary">{osComMateriais.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total de itens</p>
          <p className="text-2xl font-bold">{osComMateriais.reduce((s, os) => s + (materiaisByOs[os.id] || []).length, 0)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Custo total materiais</p>
          <p className="text-2xl font-bold text-primary">R$ {totalMateriais.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Controles */}
      {osComMateriais.length > 0 && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>Expandir tudo</Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>Recolher tudo</Button>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <p className="text-muted-foreground text-center py-12">Carregando...</p>
      ) : osComMateriais.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">Nenhuma O.S. com materiais encontrada.</p>
      ) : (
        <div className="space-y-3">
          {osComMateriais.map(os => {
            const mats = materiaisByOs[os.id] || [];
            const total = mats.reduce((s, m) => s + m.custo_total_item, 0);
            const expanded = expandedOs.has(os.id);
            return (
              <div key={os.id} className="rounded-xl border bg-card overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
                  onClick={() => toggleExpand(os.id)}
                >
                  {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-muted-foreground">{os.codigo_os || "—"}</span>
                      <span className="text-sm font-medium truncate">{os.titulo || os.equipamentos || "—"}</span>
                      {os.origem === "Portal do Cliente" && (
                        <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                          🌐 Portal do Cliente
                        </span>
                      )}
                    </div>
                    <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{os.status || "—"}</span>
                      {os.responsible_user_id && <span>👤 {profilesMap[os.responsible_user_id] || "—"}</span>}
                      <span>📅 {fmtDate(os.created_at)}</span>
                      <span>📦 {mats.length} item(ns)</span>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-primary shrink-0">R$ {total.toFixed(2)}</span>
                </button>
                {expanded && (
                  <div className="border-t px-4 pb-4 pt-3 space-y-2">
                    {mats.map(m => (
                      <div key={m.id} className="flex items-center justify-between rounded-lg border px-3 py-2 bg-muted/30">
                        <div>
                          <p className="text-sm font-medium">{m.nome_material}</p>
                          <p className="text-xs text-muted-foreground">{m.quantidade} {m.unidade} × R$ {Number(m.custo_unitario).toFixed(2)}</p>
                        </div>
                        <span className="text-sm font-semibold text-primary">R$ {Number(m.custo_total_item).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between px-3 py-2 font-semibold text-sm border-t mt-2">
                      <span className="text-muted-foreground">Total desta O.S.</span>
                      <span className="text-primary">R$ {total.toFixed(2)}</span>
                    </div>
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