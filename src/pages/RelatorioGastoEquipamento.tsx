import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Label as RechartsLabel,
} from "recharts";
import {
  RefreshCw, Search, X, FileText, Download, Wrench, ChevronDown, Check, Info, Package, Calendar as CalendarIcon,
} from "@/lib/icons";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addPdfHeader, getAtlasCompanyInfo } from "@/lib/pdfHeader";

type Ativo = {
  id: string;
  nome: string;
  codigo_identificacao: string | null;
  categoria: string | null;
};

type OSRow = {
  id: string;
  codigo_os: string | null;
  ativo_id: string | null;
  status: string | null;
  created_at: string | null;
  titulo: string | null;
};

type MatOS = {
  id: string;
  os_id: string;
  nome_material: string;
  quantidade: number;
  unidade: string;
  custo_unitario: number;
  custo_total_item: number;
  created_at: string | null;
};

// Corrige imprecisao de ponto flutuante (ex: 468.40000000000003)
const fmtQtd = (n: number) => Number((n || 0).toFixed(2));

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return "—"; }
};

const fmtMoney = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function RelatorioGastoEquipamento() {
  const { companyId } = useCompany();
  const [ativos, setAtivos] = useState<Ativo[]>([]);
  const [osList, setOsList] = useState<OSRow[]>([]);
  const [materiais, setMateriais] = useState<MatOS[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [ativoId, setAtivoId] = useState<string>("");
  const [ativoPopoverOpen, setAtivoPopoverOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");

  const fetchData = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [ativosRes, osRes, matRes] = await Promise.all([
        (supabase as any).from("ativos")
          .select("id, nome, codigo_identificacao, categoria")
          .eq("company_id", companyId)
          .order("nome"),
        (supabase as any).from("ordens_servico")
          .select("id, codigo_os, ativo_id, status, created_at, titulo")
          .eq("company_id", companyId)
          .eq("arquivada", false)
          .not("ativo_id", "is", null),
        (supabase as any).from("materiais_os")
          .select("id, os_id, nome_material, quantidade, unidade, custo_unitario, custo_total_item, created_at")
          .eq("company_id", companyId),
      ]);
      setAtivos(ativosRes?.data || []);
      setOsList(osRes?.data || []);
      setMateriais(matRes?.data || []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar dados", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const ativoSelecionado = useMemo(() => ativos.find(a => a.id === ativoId) || null, [ativos, ativoId]);

  // O.S. vinculadas ao ativo selecionado
  const osDoAtivo = useMemo(() => {
    if (!ativoId) return [];
    return osList.filter(os => os.ativo_id === ativoId);
  }, [osList, ativoId]);

  const osDoAtivoMap = useMemo(() => Object.fromEntries(osDoAtivo.map(os => [os.id, os])), [osDoAtivo]);

  // Materiais usados nas O.S. desse ativo
  const usos = useMemo(() => {
    if (!ativoId) return [];
    return materiais
      .filter(m => osDoAtivoMap[m.os_id])
      .map(m => ({
        ...m,
        os: osDoAtivoMap[m.os_id],
      }))
      .filter(u => {
        if (!filterSearch.trim()) return true;
        return u.nome_material.toLowerCase().includes(filterSearch.trim().toLowerCase());
      })
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }, [materiais, osDoAtivoMap, ativoId, filterSearch]);

  // Quantas O.S. distintas do ativo tiveram algum material lançado
  const osComMaterial = useMemo(() => new Set(usos.map(u => u.os_id)), [usos]);

  const totalGasto = useMemo(() => usos.reduce((s, u) => s + (u.custo_total_item || 0), 0), [usos]);
  const totalItens = useMemo(() => usos.reduce((s, u) => s + (u.quantidade || 0), 0), [usos]);

  // Série mensal de gastos, para o gráfico de média ao longo do tempo
  const serieMensal = useMemo(() => {
    const map: Record<string, number> = {};
    usos.forEach(u => {
      const d = u.created_at;
      if (!d) return;
      const key = d.slice(0, 7); // yyyy-MM
      map[key] = (map[key] || 0) + (u.custo_total_item || 0);
    });
    const meses = Object.keys(map).sort();
    return meses.map(key => {
      const [ano, mes] = key.split("-");
      const label = format(new Date(Number(ano), Number(mes) - 1, 1), "MMM/yy", { locale: ptBR });
      return { mes: key, label: label.replace(/^\w/, c => c.toUpperCase()), total: Number(map[key].toFixed(2)) };
    });
  }, [usos]);

  const mediaMensal = useMemo(() => {
    if (serieMensal.length === 0) return 0;
    return serieMensal.reduce((s, m) => s + m.total, 0) / serieMensal.length;
  }, [serieMensal]);

  const mediaPorOS = useMemo(() => {
    if (osComMaterial.size === 0) return 0;
    return totalGasto / osComMaterial.size;
  }, [totalGasto, osComMaterial]);

  const exportExcel = () => {
    if (!ativoSelecionado) return;
    const rows = usos.map(u => ({
      "Material": u.nome_material,
      "O.S.": u.os?.codigo_os || "—",
      "Status da O.S.": u.os?.status || "—",
      "Data": fmtDate(u.created_at),
      "Quantidade": fmtQtd(u.quantidade),
      "Unidade": u.unidade,
      "Valor Unitário (R$)": u.custo_unitario,
      "Valor Total (R$)": u.custo_total_item,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Materiais");
    const resumo = [{
      "Equipamento": ativoSelecionado.nome,
      "Código": ativoSelecionado.codigo_identificacao || "—",
      "Nº de O.S.": osComMaterial.size,
      "Gasto Total (R$)": totalGasto,
      "Gasto Médio por O.S. (R$)": Number(mediaPorOS.toFixed(2)),
      "Gasto Médio Mensal (R$)": Number(mediaMensal.toFixed(2)),
    }];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo");
    XLSX.writeFile(wb, `gasto-material-${(ativoSelecionado.codigo_identificacao || ativoSelecionado.nome).replace(/\s+/g, "-")}-${format(new Date(), "yyyyMMdd")}.xlsx`);
    toast({ title: "Excel exportado!" });
  };

  const exportPDF = async () => {
    if (!ativoSelecionado) return;
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: "landscape" });
      const pageW = doc.internal.pageSize.getWidth();
      const company = await getAtlasCompanyInfo();
      const subtitulo = `${ativoSelecionado.nome}${ativoSelecionado.codigo_identificacao ? ` · ${ativoSelecionado.codigo_identificacao}` : ""}`;
      let y = await addPdfHeader(doc, "Gasto de Material por Equipamento", subtitulo, company);

      doc.setFontSize(9);
      doc.setTextColor(30, 30, 60);
      doc.setFont("helvetica", "bold");
      doc.text(
        `Gasto Total: R$ ${fmtMoney(totalGasto)}   |   Nº de O.S.: ${osComMaterial.size}   |   Gasto Médio por O.S.: R$ ${fmtMoney(mediaPorOS)}   |   Gasto Médio Mensal: R$ ${fmtMoney(mediaMensal)}`,
        10, y
      );
      doc.setFont("helvetica", "normal");
      y += 6;

      autoTable(doc, {
        startY: y,
        head: [["Material", "O.S.", "Status", "Data", "Quantidade", "Valor Unit.", "Valor Total"]],
        body: usos.map(u => [
          u.nome_material,
          u.os?.codigo_os || "—",
          u.os?.status || "—",
          fmtDate(u.created_at),
          `${fmtQtd(u.quantidade)} ${u.unidade}`,
          `R$ ${fmtMoney(u.custo_unitario)}`,
          `R$ ${fmtMoney(u.custo_total_item)}`,
        ]),
        foot: [["TOTAL", "", "", "", `${fmtQtd(totalItens)}`, "", `R$ ${fmtMoney(totalGasto)}`]],
        headStyles: { fillColor: [58, 53, 92], textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 8, textColor: [40, 40, 40] },
        alternateRowStyles: { fillColor: [250, 250, 255] },
        footStyles: { fillColor: [58, 53, 92], textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
        margin: { left: 10, right: 10 },
        tableWidth: pageW - 20,
      });

      doc.save(`gasto-material-${(ativoSelecionado.codigo_identificacao || ativoSelecionado.nome).replace(/\s+/g, "-")}-${format(new Date(), "yyyyMMdd")}.pdf`);
      toast({ title: "PDF exportado!" });
    } catch (err: any) {
      toast({ title: "Erro ao exportar", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wrench className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Gasto de Material por Equipamento</h1>
            <p className="text-sm text-muted-foreground">Selecione um equipamento para ver os materiais utilizados nele</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchData}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          {ativoSelecionado && (
            <>
              <Button variant="outline" onClick={exportExcel} disabled={usos.length === 0}>
                <Download className="mr-2 h-4 w-4" /> Excel
              </Button>
              <Button variant="outline" onClick={exportPDF} disabled={usos.length === 0 || exporting}>
                <FileText className="mr-2 h-4 w-4" /> {exporting ? "Gerando..." : "PDF"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Aviso sobre o pré-requisito de vínculo do equipamento na O.S. */}
      <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-sm text-muted-foreground">
        <Info className="h-4 w-4 text-info shrink-0 mt-0.5" />
        <p>
          Este relatório usa o campo <strong>"Ativo Vinculado"</strong> preenchido na O.S. Só aparecem aqui os materiais
          de O.S.s em que esse campo foi selecionado ao abrir ou editar a ordem de serviço.
        </p>
      </div>

      {/* Seletor de equipamento */}
      <div className="flex flex-wrap items-center gap-3">
        <Popover open={ativoPopoverOpen} onOpenChange={setAtivoPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full sm:w-80 justify-between font-normal">
              {ativoSelecionado ? (
                <span className="truncate">
                  {ativoSelecionado.nome}
                  {ativoSelecionado.codigo_identificacao ? ` · ${ativoSelecionado.codigo_identificacao}` : ""}
                </span>
              ) : (
                <span className="text-muted-foreground">Selecione um equipamento...</span>
              )}
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar equipamento..." className="h-9" />
              <CommandList>
                <CommandEmpty>Nenhum equipamento encontrado.</CommandEmpty>
                <CommandGroup>
                  {ativos.map(a => (
                    <CommandItem
                      key={a.id}
                      value={`${a.nome} ${a.codigo_identificacao || ""}`}
                      onSelect={() => { setAtivoId(a.id); setAtivoPopoverOpen(false); }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", ativoId === a.id ? "opacity-100" : "opacity-0")} />
                      <div className="flex flex-col">
                        <span className="text-sm">{a.nome}</span>
                        {a.codigo_identificacao && (
                          <span className="text-xs text-muted-foreground font-mono">{a.codigo_identificacao}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {ativoSelecionado && (
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Pesquisar material..." className="pl-9" />
            {filterSearch && <Button variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7" onClick={() => setFilterSearch("")}><X className="h-3 w-3" /></Button>}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
        </div>
      ) : !ativoId ? (
        <EmptyState icon={Wrench} title="Selecione um equipamento" description="Escolha um equipamento acima para ver o histórico de materiais e gastos." />
      ) : usos.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum material registrado para este equipamento"
          description="Não há O.S. com este equipamento vinculado que tenha materiais lançados."
        />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">Gasto total</p>
              <p className="text-2xl font-bold text-primary">R$ {fmtMoney(totalGasto)}</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">O.S. com material lançado</p>
              <p className="text-2xl font-bold">{osComMaterial.size}</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">Gasto médio por O.S.</p>
              <p className="text-2xl font-bold">R$ {fmtMoney(mediaPorOS)}</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">Gasto médio mensal</p>
              <p className="text-2xl font-bold">R$ {fmtMoney(mediaMensal)}</p>
            </div>
          </div>

          {/* Gráfico */}
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Gasto por mês (linha tracejada = média)</h3>
            {serieMensal.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem datas suficientes para montar o gráfico.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={serieMensal} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => `R$ ${v}`} />
                  <Tooltip formatter={(v: number) => [`R$ ${fmtMoney(v)}`, "Gasto"]} />
                  <Bar dataKey="total" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  <ReferenceLine y={mediaMensal} stroke="#7C3AED" strokeDasharray="4 4">
                    <RechartsLabel value={`Média: R$ ${fmtMoney(mediaMensal)}`} position="insideTopRight" fontSize={11} fill="#7C3AED" />
                  </ReferenceLine>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Lista de materiais utilizados */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="text-sm font-semibold">Materiais utilizados ({usos.length})</h3>
            </div>
            <div className="divide-y">
              {usos.map(u => (
                <div key={u.id} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/30">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{u.nome_material}</p>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono">{u.os?.codigo_os || "—"}</span>
                      {u.os?.status && <span>{u.os.status}</span>}
                      <span className="flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> {fmtDate(u.created_at)}</span>
                      <span>{fmtQtd(u.quantidade)} {u.unidade}</span>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-primary shrink-0">R$ {fmtMoney(u.custo_total_item)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
