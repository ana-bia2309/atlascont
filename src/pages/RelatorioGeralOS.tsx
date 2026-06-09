import { useCallback, useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { RefreshCw, Search, X, FileText, Download, Eye, Filter, ClipboardList } from "@/lib/icons";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type OSRow = {
  id: string;
  codigo_os: string | null;
  titulo: string | null;
  descricao: string | null;
  status: string | null;
  prioridade: string | null;
  origem: string | null;
  created_at: string | null;
  data_inicio: string | null;
  data_termino: string | null;
  finalizado_em: string | null;
  observacoes: string | null;
  responsible_user_id: string | null;
  criado_por: string | null;
  bloco_id: string | null;
  ativo_id: string | null;
  custo_total: number | null;
  equipamentos: string | null;
};

type Material = {
  id: string;
  os_id: string;
  nome_material: string;
  quantidade: number;
  unidade: string;
  custo_unitario: number;
  custo_total_item: number;
};

type Profile = { id: string; nome: string };
type Bloco = { id: string; nome: string | null };
type Ativo = { id: string; nome: string };

const STATUS_OPTIONS = [
  "Não Iniciada", "Em Triagem", "Em Execução", "Aguardando Material",
  "Aguardando Acesso", "Concluída", "Cancelada",
];

const statusColor = (s: string | null) => {
  switch (s) {
    case "Concluída": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Em Execução": return "bg-sky-50 text-sky-700 border-sky-200";
    case "Cancelada": return "bg-destructive/15 text-destructive border-destructive/30";
    case "Não Iniciada": return "bg-zinc-100 text-zinc-600 border-zinc-200";
    default: return "bg-amber-50 text-amber-700 border-amber-200";
  }
};

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return "—"; }
};

const fmtDateTime = (d: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy HH:mm"); } catch { return "—"; }
};

export default function RelatorioGeralOS() {
  const { companyId } = useCompany();
  const [osList, setOsList] = useState<OSRow[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [ativos, setAtivos] = useState<Ativo[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<OSRow | null>(null);
  const [exporting, setExporting] = useState(false);

  // Filtros
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [filterTecnico, setFilterTecnico] = useState("__all__");
  const [filterBloco, setFilterBloco] = useState("__all__");
  const [filterAtivo, setFilterAtivo] = useState("__all__");
  const [filterOrigem, setFilterOrigem] = useState("__all__");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const fetchData = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [osRes, matRes, profRes, blocoRes, ativoRes] = await Promise.all([
        (supabase as any).from("ordens_servico")
          .select("id, codigo_os, titulo, descricao, status, prioridade, origem, created_at, data_inicio, data_termino, finalizado_em, observacoes, responsible_user_id, criado_por, bloco_id, ativo_id, custo_total, equipamentos")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        (supabase as any).from("materiais_os").select("id, os_id, nome_material, quantidade, unidade, custo_unitario, custo_total_item").eq("company_id", companyId),
        (supabase as any).from("profiles").select("id, nome").eq("company_id", companyId).order("nome"),
        (supabase as any).from("blocos").select("id, nome").eq("company_id", companyId).order("nome"),
        (supabase as any).from("ativos").select("id, nome").eq("company_id", companyId).order("nome"),
      ]);
      setOsList(osRes?.data || []);
      setMateriais(matRes?.data || []);
      setProfiles(profRes?.data || []);
      setBlocos(blocoRes?.data || []);
      setAtivos(ativoRes?.data || []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar dados", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const profilesMap = useMemo(() => Object.fromEntries(profiles.map(p => [p.id, p.nome])), [profiles]);
  const blocosMap = useMemo(() => Object.fromEntries(blocos.map(b => [b.id, b.nome || "—"])), [blocos]);
  const ativosMap = useMemo(() => Object.fromEntries(ativos.map(a => [a.id, a.nome])), [ativos]);
  const materiaisByOs = useMemo(() => {
    const map: Record<string, Material[]> = {};
    materiais.forEach(m => {
      if (!map[m.os_id]) map[m.os_id] = [];
      map[m.os_id].push(m);
    });
    return map;
  }, [materiais]);

  const filtered = useMemo(() => {
    return osList.filter(os => {
      if (filterStatus !== "__all__" && os.status !== filterStatus) return false;
      if (filterTecnico !== "__all__" && os.responsible_user_id !== filterTecnico) return false;
      if (filterBloco !== "__all__" && os.bloco_id !== filterBloco) return false;
      if (filterAtivo !== "__all__" && os.ativo_id !== filterAtivo) return false;
      if (filterOrigem !== "__all__" && os.origem !== filterOrigem) return false;
      if (filterDateFrom && os.created_at && os.created_at < filterDateFrom) return false;
      if (filterDateTo && os.created_at && os.created_at.slice(0, 10) > filterDateTo) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase();
        const match = [os.codigo_os, os.titulo, os.descricao, os.equipamentos]
          .some(f => (f || "").toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [osList, filterStatus, filterTecnico, filterBloco, filterAtivo, filterOrigem, filterSearch, filterDateFrom, filterDateTo]);

  const hasFilters = filterStatus !== "__all__" || filterTecnico !== "__all__" || filterBloco !== "__all__" ||
    filterAtivo !== "__all__" || filterOrigem !== "__all__" || filterSearch.trim() || filterDateFrom || filterDateTo;

  const clearFilters = () => {
    setFilterStatus("__all__"); setFilterTecnico("__all__"); setFilterBloco("__all__");
    setFilterAtivo("__all__"); setFilterOrigem("__all__"); setFilterSearch("");
    setFilterDateFrom(""); setFilterDateTo("");
  };

  const exportExcel = () => {
    const rows = filtered.map(os => ({
      "Código": os.codigo_os || "—",
      "Título": os.titulo || "—",
      "Status": os.status || "—",
      "Prioridade": os.prioridade || "—",
      "Origem": os.origem || "—",
      "Técnico": os.responsible_user_id ? profilesMap[os.responsible_user_id] || "—" : "—",
      "Bloco": os.bloco_id ? blocosMap[os.bloco_id] || "—" : "—",
      "Ativo": os.ativo_id ? ativosMap[os.ativo_id] || "—" : "—",
      "Data Abertura": fmtDate(os.created_at),
      "Data Início": fmtDate(os.data_inicio),
      "Data Conclusão": fmtDate(os.finalizado_em || os.data_termino),
      "Custo Total (R$)": os.custo_total || 0,
      "Descrição": os.descricao || "—",
      "Observações": os.observacoes || "—",
      "Materiais": (materiaisByOs[os.id] || []).map(m => `${m.nome_material} (${m.quantidade} ${m.unidade})`).join("; ") || "—",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] || {}).map(k => ({ wch: Math.min(Math.max(k.length + 4, 12), 40) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ordens de Serviço");
    XLSX.writeFile(wb, `relatorio-os-${format(new Date(), "yyyyMMdd")}.xlsx`);
    toast({ title: "Excel exportado com sucesso!" });
  };

  const exportPDF = async () => {
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: "landscape" });
      const hoje = format(new Date(), "dd/MM/yyyy HH:mm");

      doc.setFontSize(16);
      doc.setTextColor(99, 102, 241);
      doc.text("Atlas Control — Relatório Geral de O.S.", 14, 16);
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`Gerado em ${hoje} · ${filtered.length} O.S.`, 14, 22);
      doc.setDrawColor(99, 102, 241);
      doc.setLineWidth(0.5);
      doc.line(14, 25, 283, 25);

      autoTable(doc, {
        startY: 28,
        head: [["Código", "Título", "Status", "Técnico", "Bloco", "Abertura", "Conclusão", "Custo (R$)"]],
        body: filtered.map(os => [
          os.codigo_os || "—",
          (os.titulo || os.equipamentos || "—").substring(0, 40),
          os.status || "—",
          os.responsible_user_id ? (profilesMap[os.responsible_user_id] || "—").substring(0, 20) : "—",
          os.bloco_id ? (blocosMap[os.bloco_id] || "—").substring(0, 20) : "—",
          fmtDate(os.created_at),
          fmtDate(os.finalizado_em || os.data_termino),
          os.custo_total ? `R$ ${Number(os.custo_total).toFixed(2)}` : "—",
        ]),
        headStyles: { fillColor: [99, 102, 241], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 248, 255] },
      });

      // Detalhamento por OS com materiais
      let yPos = (doc as any).lastAutoTable.finalY + 10;
      const osComMateriais = filtered.filter(os => (materiaisByOs[os.id] || []).length > 0);

      if (osComMateriais.length > 0) {
        if (yPos > 160) { doc.addPage(); yPos = 14; }
        doc.setFontSize(12);
        doc.setTextColor(30);
        doc.text("Materiais por O.S.", 14, yPos);
        yPos += 6;

        for (const os of osComMateriais.slice(0, 30)) {
          if (yPos > 180) { doc.addPage(); yPos = 14; }
          doc.setFontSize(9);
          doc.setTextColor(99, 102, 241);
          doc.text(`${os.codigo_os || "OS"} — ${(os.titulo || os.equipamentos || "").substring(0, 60)}`, 14, yPos);
          yPos += 4;

          autoTable(doc, {
            startY: yPos,
            head: [["Material", "Qtd", "Unidade", "Valor Unit.", "Subtotal"]],
            body: (materiaisByOs[os.id] || []).map(m => [
              m.nome_material,
              m.quantidade,
              m.unidade,
              `R$ ${Number(m.custo_unitario).toFixed(2)}`,
              `R$ ${Number(m.custo_total_item).toFixed(2)}`,
            ]),
            headStyles: { fillColor: [230, 230, 250], textColor: [50, 50, 100], fontSize: 7 },
            bodyStyles: { fontSize: 7 },
            margin: { left: 14 },
          });

          yPos = (doc as any).lastAutoTable.finalY + 6;
        }
      }

      doc.save(`relatorio-os-${format(new Date(), "yyyyMMdd")}.pdf`);
      toast({ title: "PDF exportado com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao exportar PDF", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const viewingMateriais = viewing ? (materiaisByOs[viewing.id] || []) : [];
  const totalGeral = filtered.reduce((s, os) => s + (os.custo_total || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Relatório Geral de O.S.</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} ordens encontradas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchData} title="Atualizar">
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

      {/* Filtros */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filtros
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={clearFilters}>
              <X className="h-3 w-3" /> Limpar
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Buscar código, título, equipamento..." className="pl-9" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os status</SelectItem>
              {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterTecnico} onValueChange={setFilterTecnico}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Técnico" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os técnicos</SelectItem>
              {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterBloco} onValueChange={setFilterBloco}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Bloco" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os blocos</SelectItem>
              {blocos.map(b => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterOrigem} onValueChange={setFilterOrigem}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Origem" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              <SelectItem value="Corretiva">Corretiva</SelectItem>
              <SelectItem value="Preventiva">Preventiva</SelectItem>
              <SelectItem value="Chamado">Chamado</SelectItem>
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total filtrado", value: filtered.length, color: "text-primary" },
          { label: "Concluídas", value: filtered.filter(o => o.status === "Concluída").length, color: "text-emerald-600" },
          { label: "Em aberto", value: filtered.filter(o => !["Concluída","Cancelada"].includes(o.status || "")).length, color: "text-amber-600" },
          { label: "Custo total", value: `R$ ${totalGeral.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, color: "text-primary" },
        ].map(s => (
          <div key={s.label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={cn("text-xl font-bold mt-1", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-muted-foreground text-center py-12">Carregando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">Nenhuma O.S. encontrada.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(os => {
            const mats = materiaisByOs[os.id] || [];
            return (
              <div key={os.id} className="rounded-xl border bg-card p-4 hover:bg-muted/20 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs font-semibold text-muted-foreground">{os.codigo_os || "—"}</span>
                      <Badge variant="outline" className={cn("text-xs border", statusColor(os.status))}>
                        {os.status || "—"}
                      </Badge>
                      {os.prioridade && (
                        <Badge variant="outline" className="text-xs border bg-muted text-muted-foreground">
                          {os.prioridade}
                        </Badge>
                      )}
                      {os.origem && (
                        <Badge variant="outline" className="text-xs border bg-muted text-muted-foreground">
                          {os.origem}
                        </Badge>
                      )}
                    </div>
                    <p className="font-medium text-sm">{os.titulo || os.equipamentos || "—"}</p>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                      {os.responsible_user_id && <span>👤 {profilesMap[os.responsible_user_id] || "—"}</span>}
                      {os.bloco_id && <span>📍 {blocosMap[os.bloco_id] || "—"}</span>}
                      {os.ativo_id && <span>🔧 {ativosMap[os.ativo_id] || "—"}</span>}
                      <span>📅 {fmtDate(os.created_at)}</span>
                      {(os.finalizado_em || os.data_termino) && <span>✅ {fmtDate(os.finalizado_em || os.data_termino)}</span>}
                      {mats.length > 0 && <span>📦 {mats.length} material(is)</span>}
                      {os.custo_total && os.custo_total > 0 && (
                        <span className="text-primary font-medium">R$ {Number(os.custo_total).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setViewing(os)} title="Ver detalhes">
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog detalhes */}
      <Dialog open={!!viewing} onOpenChange={o => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span className="font-mono">{viewing?.codigo_os}</span>
              {viewing && <Badge variant="outline" className={cn("text-xs border", statusColor(viewing.status))}>{viewing.status}</Badge>}
            </DialogTitle>
            <DialogDescription>{viewing?.titulo || viewing?.equipamentos || "Detalhes da O.S."}</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Técnico:</span> <strong>{viewing.responsible_user_id ? profilesMap[viewing.responsible_user_id] || "—" : "—"}</strong></div>
                <div><span className="text-muted-foreground">Prioridade:</span> <strong>{viewing.prioridade || "—"}</strong></div>
                <div><span className="text-muted-foreground">Bloco:</span> <strong>{viewing.bloco_id ? blocosMap[viewing.bloco_id] || "—" : "—"}</strong></div>
                <div><span className="text-muted-foreground">Ativo:</span> <strong>{viewing.ativo_id ? ativosMap[viewing.ativo_id] || "—" : "—"}</strong></div>
                <div><span className="text-muted-foreground">Abertura:</span> <strong>{fmtDateTime(viewing.created_at)}</strong></div>
                <div><span className="text-muted-foreground">Conclusão:</span> <strong>{fmtDate(viewing.finalizado_em || viewing.data_termino)}</strong></div>
                <div><span className="text-muted-foreground">Origem:</span> <strong>{viewing.origem || "—"}</strong></div>
                <div><span className="text-muted-foreground">Custo total:</span> <strong className="text-primary">{viewing.custo_total ? `R$ ${Number(viewing.custo_total).toFixed(2)}` : "—"}</strong></div>
              </div>
              {viewing.descricao && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Descrição</p>
                  <p className="rounded-lg bg-muted/50 p-3 whitespace-pre-line">{viewing.descricao}</p>
                </div>
              )}
              {viewing.observacoes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Observações</p>
                  <p className="rounded-lg bg-muted/50 p-3 whitespace-pre-line">{viewing.observacoes}</p>
                </div>
              )}
              {viewingMateriais.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Materiais utilizados ({viewingMateriais.length})</p>
                  <div className="space-y-1.5">
                    {viewingMateriais.map(m => (
                      <div key={m.id} className="flex items-center justify-between rounded-lg border px-3 py-2 bg-muted/30">
                        <div>
                          <p className="text-sm font-medium">{m.nome_material}</p>
                          <p className="text-xs text-muted-foreground">{m.quantidade} {m.unidade} × R$ {Number(m.custo_unitario).toFixed(2)}</p>
                        </div>
                        <span className="text-sm font-semibold text-primary">R$ {Number(m.custo_total_item).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between px-3 py-2 font-semibold text-sm border-t">
                      <span>Total materiais</span>
                      <span className="text-primary">R$ {viewingMateriais.reduce((s, m) => s + m.custo_total_item, 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}