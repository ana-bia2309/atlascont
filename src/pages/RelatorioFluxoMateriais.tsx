import { useCallback, useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { RefreshCw, Search, X, Download, FileSpreadsheet, ArrowLeftRight, TrendingUp, TrendingDown, AlertTriangle } from "@/lib/icons";
import { format, differenceInCalendarDays, subDays } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addPdfHeader, getAtlasCompanyInfo } from "@/lib/pdfHeader";

type Material = { id: string; descricao: string; unidade: string | null; valor_unitario: number | null };
type EstoqueRow = { material_id: string; quantidade_disponivel: number; quantidade_minima: number | null };
type Movimentacao = { material_id: string; tipo: string; quantidade: number; data_movimentacao: string | null };
type MaterialOS = { material_id: string | null; quantidade: number; created_at: string };

type LinhaFluxo = {
  materialId: string;
  nome: string;
  unidade: string;
  estoqueAtual: number;
  estoqueMinimo: number;
  totalEntrada: number;
  totalSaidaManual: number;
  totalSaidaOS: number;
  totalSaida: number;
  saldoPeriodo: number;
  consumoMedioDia: number;
  projecaoConsumo: number;
  sugestaoCompra: number;
  coberturaDias: number | null;
};

export default function RelatorioFluxoMateriais() {
  const { companyId } = useCompany();
  const [loading, setLoading] = useState(true);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [estoque, setEstoque] = useState<EstoqueRow[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [materiaisOS, setMateriaisOS] = useState<MaterialOS[]>([]);

  const [filterSearch, setFilterSearch] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState(format(subDays(new Date(), 90), "yyyy-MM-dd"));
  const [filterDateTo, setFilterDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [diasProjecao, setDiasProjecao] = useState(30);
  const [apenasComSugestao, setApenasComSugestao] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);

    const [matRes, estRes, movRes, matOsRes] = await Promise.all([
      (supabase as any).from("materiais").select("id, descricao, unidade, valor_unitario").eq("company_id", companyId),
      (supabase as any).from("estoque").select("material_id, quantidade_disponivel, quantidade_minima").eq("company_id", companyId),
      (supabase as any).from("estoque_movimentacoes")
        .select("material_id, tipo, quantidade, data_movimentacao")
        .eq("company_id", companyId)
        .gte("data_movimentacao", filterDateFrom)
        .lte("data_movimentacao", filterDateTo),
      (supabase as any).from("materiais_os")
        .select("material_id, quantidade, created_at")
        .eq("company_id", companyId)
        .gte("created_at", `${filterDateFrom}T00:00:00`)
        .lte("created_at", `${filterDateTo}T23:59:59`),
    ]);

    if (matRes.error) toast({ title: "Erro ao carregar materiais", description: matRes.error.message, variant: "destructive" });
    setMateriais(matRes.data || []);
    setEstoque(estRes.data || []);
    setMovimentacoes(movRes.data || []);
    setMateriaisOS((matOsRes.data || []).filter((m: any) => m.material_id));
    setLoading(false);
  }, [companyId, filterDateFrom, filterDateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const diasNoPeriodo = useMemo(() => {
    const d = differenceInCalendarDays(new Date(filterDateTo), new Date(filterDateFrom)) + 1;
    return d > 0 ? d : 1;
  }, [filterDateFrom, filterDateTo]);

  const linhas = useMemo<LinhaFluxo[]>(() => {
    const estoqueMap = Object.fromEntries(estoque.map(e => [e.material_id, e]));

    return materiais.map(m => {
      const est = estoqueMap[m.id];
      const totalEntrada = movimentacoes
        .filter(mv => mv.material_id === m.id && mv.tipo === "entrada")
        .reduce((s, mv) => s + Number(mv.quantidade), 0);
      const totalSaidaManual = movimentacoes
        .filter(mv => mv.material_id === m.id && mv.tipo === "saida")
        .reduce((s, mv) => s + Number(mv.quantidade), 0);
      const totalSaidaOS = materiaisOS
        .filter(mo => mo.material_id === m.id)
        .reduce((s, mo) => s + Number(mo.quantidade), 0);
      const totalSaida = totalSaidaManual + totalSaidaOS;
      const consumoMedioDia = totalSaida / diasNoPeriodo;
      const estoqueAtual = Number(est?.quantidade_disponivel || 0);
      const projecaoConsumo = consumoMedioDia * diasProjecao;
      const sugestaoCompra = Math.max(0, Math.ceil(projecaoConsumo - estoqueAtual));
      const coberturaDias = consumoMedioDia > 0 ? estoqueAtual / consumoMedioDia : null;

      return {
        materialId: m.id,
        nome: m.descricao,
        unidade: m.unidade || "un",
        estoqueAtual,
        estoqueMinimo: Number(est?.quantidade_minima || 0),
        totalEntrada,
        totalSaidaManual,
        totalSaidaOS,
        totalSaida,
        saldoPeriodo: totalEntrada - totalSaida,
        consumoMedioDia,
        projecaoConsumo,
        sugestaoCompra,
        coberturaDias,
      };
    });
  }, [materiais, estoque, movimentacoes, materiaisOS, diasNoPeriodo, diasProjecao]);

  const filtered = useMemo(() => {
    let list = linhas.filter(l => l.totalEntrada > 0 || l.totalSaida > 0 || l.estoqueAtual > 0);
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase();
      list = list.filter(l => l.nome.toLowerCase().includes(q));
    }
    if (apenasComSugestao) list = list.filter(l => l.sugestaoCompra > 0);
    return list.sort((a, b) => b.totalSaida - a.totalSaida);
  }, [linhas, filterSearch, apenasComSugestao]);

  const totais = useMemo(() => ({
    entrada: filtered.reduce((s, l) => s + l.totalEntrada, 0),
    saida: filtered.reduce((s, l) => s + l.totalSaida, 0),
    materiaisComSugestao: filtered.filter(l => l.sugestaoCompra > 0).length,
  }), [filtered]);

  const hasFilters = filterSearch.trim() !== "" || apenasComSugestao;

  const exportarExcel = () => {
    const rows = filtered.map(l => ({
      "Material": l.nome, "Unidade": l.unidade,
      "Estoque Atual": l.estoqueAtual, "Estoque Mínimo": l.estoqueMinimo,
      "Entrada (período)": l.totalEntrada,
      "Saída Manual (período)": l.totalSaidaManual,
      "Saída via O.S. (período)": l.totalSaidaOS,
      "Saída Total (período)": l.totalSaida,
      "Saldo do Período (Entrada − Saída)": l.saldoPeriodo,
      "Consumo Médio/Dia": Number(l.consumoMedioDia.toFixed(2)),
      "Cobertura (dias)": l.coberturaDias === null ? "sem consumo" : Math.floor(l.coberturaDias),
      [`Projeção Consumo (${diasProjecao}d)`]: Number(l.projecaoConsumo.toFixed(2)),
      "Sugestão de Compra": l.sugestaoCompra,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fluxo de Materiais");
    XLSX.writeFile(wb, `fluxo-materiais-${filterDateFrom}-a-${filterDateTo}.xlsx`);
  };

  const exportarPDF = async () => {
    setExportingPdf(true);
    try {
      const doc = new jsPDF({ orientation: "landscape" });
      const pageW = doc.internal.pageSize.getWidth();
      const company = await getAtlasCompanyInfo();
      let y = await addPdfHeader(
        doc,
        "Fluxo de Materiais",
        `Período: ${format(new Date(filterDateFrom), "dd/MM/yyyy")} a ${format(new Date(filterDateTo), "dd/MM/yyyy")} · Projeção: ${diasProjecao} dia(s) · ${filtered.length} material(is)`,
        company
      );

      autoTable(doc, {
        startY: y,
        head: [["Material", "Estoque Atual", "Entrada", "Saída Manual", "Saída O.S.", "Saída Total", "Saldo Período", "Consumo Médio/Dia", "Cobertura", "Sugestão de Compra"]],
        body: filtered.map(l => [
          l.nome,
          `${l.estoqueAtual} ${l.unidade}`,
          `+${l.totalEntrada}`,
          l.totalSaidaManual,
          l.totalSaidaOS,
          `-${l.totalSaida}`,
          l.saldoPeriodo,
          l.consumoMedioDia.toFixed(2),
          l.coberturaDias === null ? "sem consumo" : `${Math.floor(l.coberturaDias)}d`,
          l.sugestaoCompra > 0 ? `${l.sugestaoCompra} ${l.unidade}` : "—",
        ]),
        foot: [[
          "TOTAL", "", `+${totais.entrada}`, "", "", `-${totais.saida}`, totais.entrada - totais.saida, "", "",
          `${totais.materiaisComSugestao} material(is)`,
        ]],
        headStyles: { fillColor: [58, 53, 92], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
        bodyStyles: { fontSize: 7.5, textColor: [40, 40, 40] },
        alternateRowStyles: { fillColor: [250, 250, 255] },
        footStyles: { fillColor: [58, 53, 92], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
        margin: { left: 10, right: 10 },
        tableWidth: pageW - 20,
      });

      doc.save(`fluxo-materiais-${filterDateFrom}-a-${filterDateTo}.pdf`);
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
            <ArrowLeftRight className="h-6 w-6 text-primary" /> Fluxo de Materiais
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Entrada, saída (manual e via O.S.) e sugestão de compra por material.</p>
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

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="h-4 w-4 text-emerald-600" /> Total de Entradas</div>
          <div className="text-2xl font-bold mt-1">{totais.entrada.toLocaleString("pt-BR")}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingDown className="h-4 w-4 text-red-600" /> Total de Saídas</div>
          <div className="text-2xl font-bold mt-1">{totais.saida.toLocaleString("pt-BR")}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4 text-amber-600" /> Materiais com Sugestão de Compra</div>
          <div className="text-2xl font-bold mt-1">{totais.materiaisComSugestao}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Buscar material</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Nome do material..." className="pl-9" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Período (histórico)</label>
          <div className="flex items-center gap-1.5">
            <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-36 h-9" />
            <span className="text-muted-foreground text-sm">até</span>
            <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-36 h-9" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Projetar compra pros próximos (dias)</label>
          <Input
            type="number"
            min={1}
            value={diasProjecao}
            onChange={e => setDiasProjecao(Math.max(1, Number(e.target.value) || 1))}
            className="w-28 h-9"
          />
        </div>
        <Button
          variant={apenasComSugestao ? "default" : "outline"}
          size="sm"
          onClick={() => setApenasComSugestao(v => !v)}
          className="gap-1.5"
        >
          <AlertTriangle className="h-3.5 w-3.5" /> Só com sugestão de compra
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterSearch(""); setApenasComSugestao(false); }}>
            <X className="mr-1 h-3 w-3" /> Limpar
          </Button>
        )}
        <span className="text-sm text-muted-foreground ml-auto">{filtered.length} material(is)</span>
      </div>

      <p className="text-xs text-muted-foreground -mt-2">
        Consumo médio calculado sobre {diasNoPeriodo} dia(s) do período selecionado. <strong>Saldo do período</strong> é só entrada menos saída
        <em> dentro desse período</em> — um saldo negativo não significa estoque negativo, só que saiu mais do que entrou nessa janela de tempo
        (o estoque real de cada material está na coluna "Estoque Atual"). <strong>Cobertura</strong> mostra quantos dias o estoque atual ainda
        aguenta no ritmo de consumo atual. A <strong>sugestão de compra</strong> só aparece quando o consumo projetado pros próximos {diasProjecao} dia(s)
        for maior do que o que já há em estoque.
      </p>

      {/* Tabela */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead className="text-right">Estoque Atual</TableHead>
              <TableHead className="text-right">Entrada</TableHead>
              <TableHead className="text-right">Saída (Manual + O.S.)</TableHead>
              <TableHead className="text-right">Saldo do Período</TableHead>
              <TableHead className="text-right">Consumo Médio/Dia</TableHead>
              <TableHead className="text-right">Cobertura</TableHead>
              <TableHead className="text-right">Sugestão de Compra</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={8} className="py-3"><Skeleton className="h-6 w-full" /></TableCell></TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8}><EmptyState icon={ArrowLeftRight} title="Nenhuma movimentação encontrada" description="Ajuste o período ou os filtros selecionados." className="py-8" /></TableCell></TableRow>
            ) : filtered.map(l => (
              <TableRow key={l.materialId}>
                <TableCell className="font-medium">
                  {l.nome}
                  {l.estoqueMinimo > 0 && l.estoqueAtual <= l.estoqueMinimo && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 text-[10px] font-medium">
                      <AlertTriangle className="h-2.5 w-2.5" /> Abaixo do mínimo
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">{l.estoqueAtual.toLocaleString("pt-BR")} {l.unidade}</TableCell>
                <TableCell className="text-right text-emerald-700">+{l.totalEntrada.toLocaleString("pt-BR")}</TableCell>
                <TableCell className="text-right text-red-700">
                  −{l.totalSaida.toLocaleString("pt-BR")}
                  <span className="block text-[10px] text-muted-foreground font-normal">
                    {l.totalSaidaOS} via O.S. · {l.totalSaidaManual} manual
                  </span>
                </TableCell>
                <TableCell className={"text-right font-medium " + (l.saldoPeriodo >= 0 ? "text-emerald-700" : "text-red-700")}>
                  {l.saldoPeriodo >= 0 ? "+" : ""}{l.saldoPeriodo.toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="text-right">{l.consumoMedioDia.toFixed(2)}</TableCell>
                <TableCell className="text-right">
                  {l.coberturaDias === null ? (
                    <span className="text-muted-foreground text-xs">sem consumo</span>
                  ) : (
                    <span className={l.coberturaDias <= diasProjecao ? "text-amber-700 font-medium" : "text-muted-foreground"}>
                      {Math.floor(l.coberturaDias)} dia(s)
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {l.sugestaoCompra > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 text-xs font-semibold">
                      {l.sugestaoCompra} {l.unidade}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
