import { useCallback, useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { RefreshCw, Search, X, Download, FileSpreadsheet, ArrowLeftRight, AlertTriangle } from "@/lib/icons";
import { format, differenceInCalendarDays, subDays } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addPdfHeader, getAtlasCompanyInfo } from "@/lib/pdfHeader";

// Corrige imprecisao de ponto flutuante (ex: 468.40000000000003) limitando
// a no maximo 2 casas decimais, sem deixar zero a mais em numero inteiro
const fmtQtd = (n: number) => Number((n || 0).toFixed(2));

type Material = { id: string; codigo: string | null; descricao: string; unidade: string | null };
type EstoqueRow = { material_id: string; quantidade_disponivel: number };
type Movimentacao = { material_id: string; tipo: string; quantidade: number; data_movimentacao: string | null };
type MaterialOS = { material_id: string | null; quantidade: number; created_at: string };

type LinhaFluxo = {
  materialId: string;
  codigo: string;
  nome: string;
  unidade: string;
  numEntradas: number;
  qtdEntrada: number;
  estoqueAtual: number;
  qtdSaidaOS: number;
  consumoMedioDia: number;
  sugestaoCompra: number;
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
      (supabase as any).from("materiais").select("id, codigo, descricao, unidade").eq("company_id", companyId),
      (supabase as any).from("estoque").select("material_id, quantidade_disponivel").eq("company_id", companyId),
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
      const entradasDoMaterial = movimentacoes.filter(mv => mv.material_id === m.id && mv.tipo === "entrada");
      const numEntradas = entradasDoMaterial.length;
      const qtdEntrada = entradasDoMaterial.reduce((s, mv) => s + Number(mv.quantidade), 0);

      // Estatistica (consumo medio e sugestao de compra) considera SO a
      // saida via O.S. -- saida manual (ex: ajuste/zerar estoque) e uma
      // correcao administrativa, nao consumo real, e nao pode influenciar
      // quanto comprar (pedido explicito do cliente).
      const qtdSaidaOS = materiaisOS
        .filter(mo => mo.material_id === m.id)
        .reduce((s, mo) => s + Number(mo.quantidade), 0);

      const estoqueAtual = Number(est?.quantidade_disponivel || 0);
      const consumoMedioDia = qtdSaidaOS / diasNoPeriodo;
      const projecaoConsumo = consumoMedioDia * diasProjecao;
      const sugestaoCompra = Math.max(0, Math.ceil(projecaoConsumo - estoqueAtual));

      return {
        materialId: m.id,
        codigo: m.codigo || "—",
        nome: m.descricao,
        unidade: m.unidade || "un",
        numEntradas,
        qtdEntrada,
        estoqueAtual,
        qtdSaidaOS,
        consumoMedioDia,
        sugestaoCompra,
      };
    });
  }, [materiais, estoque, movimentacoes, materiaisOS, diasNoPeriodo, diasProjecao]);

  const filtered = useMemo(() => {
    let list = linhas.filter(l => l.qtdEntrada > 0 || l.qtdSaidaOS > 0 || l.estoqueAtual > 0);
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase();
      list = list.filter(l => l.nome.toLowerCase().includes(q) || l.codigo.toLowerCase().includes(q));
    }
    if (apenasComSugestao) list = list.filter(l => l.sugestaoCompra > 0);
    return list.sort((a, b) => b.qtdSaidaOS - a.qtdSaidaOS);
  }, [linhas, filterSearch, apenasComSugestao]);

  const totais = useMemo(() => {
    const idsFiltrados = new Set(filtered.map(l => l.materialId));
    const qtdEntradas = movimentacoes.filter(mv => mv.tipo === "entrada" && idsFiltrados.has(mv.material_id)).length;
    const qtdSaidasOS = materiaisOS.filter(mo => mo.material_id && idsFiltrados.has(mo.material_id)).length;
    return {
      qtdEntradas,
      qtdSaidasOS,
      materiaisComSugestao: filtered.filter(l => l.sugestaoCompra > 0).length,
    };
  }, [filtered, movimentacoes, materiaisOS]);

  const hasFilters = filterSearch.trim() !== "" || apenasComSugestao;

  const exportarExcel = () => {
    const rows = filtered.map(l => ({
      "Código": l.codigo, "Material": l.nome, "Unidade": l.unidade,
      "Nº de Entradas": l.numEntradas,
      "Qtd. Entrada (período)": fmtQtd(l.qtdEntrada),
      "Estoque Atual": fmtQtd(l.estoqueAtual),
      "Qtd. Saída via O.S. (período)": fmtQtd(l.qtdSaidaOS),
      "Consumo Médio/Dia": Number(l.consumoMedioDia.toFixed(2)),
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
      const y = await addPdfHeader(
        doc,
        "Fluxo de Materiais",
        `Período: ${format(new Date(filterDateFrom), "dd/MM/yyyy")} a ${format(new Date(filterDateTo), "dd/MM/yyyy")} · Projeção: ${diasProjecao} dia(s) · ${filtered.length} material(is)`,
        company
      );

      autoTable(doc, {
        startY: y,
        head: [["Código", "Material", "Nº Entradas", "Qtd. Entrada", "Estoque Atual", "Qtd. Saída (O.S.)", "Consumo Médio/Dia", "Sugestão de Compra"]],
        body: filtered.map(l => [
          l.codigo,
          l.nome,
          l.numEntradas,
          `${fmtQtd(l.qtdEntrada)} ${l.unidade}`,
          `${fmtQtd(l.estoqueAtual)} ${l.unidade}`,
          `${fmtQtd(l.qtdSaidaOS)} ${l.unidade}`,
          l.consumoMedioDia.toFixed(2),
          l.sugestaoCompra > 0 ? `${l.sugestaoCompra} ${l.unidade}` : "—",
        ]),
        foot: [[
          "TOTAL", "", "", "", "", "", "",
          `${totais.materiaisComSugestao} material(is) com sugestão`,
        ]],
        headStyles: { fillColor: [58, 53, 92], textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 8, textColor: [40, 40, 40] },
        alternateRowStyles: { fillColor: [250, 250, 255] },
        footStyles: { fillColor: [58, 53, 92], textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
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
          <p className="text-sm text-muted-foreground mt-1">Entradas, saídas via O.S. e sugestão de compra por material.</p>
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
          <div className="text-sm text-muted-foreground">Entradas Registradas</div>
          <div className="text-2xl font-bold mt-1">{totais.qtdEntradas.toLocaleString("pt-BR")}</div>
          <p className="text-xs text-muted-foreground mt-0.5">movimentações no período</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-sm text-muted-foreground">Saídas via O.S. Registradas</div>
          <div className="text-2xl font-bold mt-1">{totais.qtdSaidasOS.toLocaleString("pt-BR")}</div>
          <p className="text-xs text-muted-foreground mt-0.5">movimentações no período</p>
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
            <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Código ou nome do material..." className="pl-9" />
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
        Consumo médio e sugestão de compra calculados sobre {diasNoPeriodo} dia(s) do período selecionado, considerando <strong>só a saída via O.S.</strong>
        {" "}(saída manual de estoque, como ajustes ou zerar estoque, não entra nessa conta por não ser consumo real). A sugestão de compra projeta esse
        consumo pros próximos {diasProjecao} dia(s) e desconta o que já há em estoque.
      </p>

      {/* Tabela */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Material</TableHead>
              <TableHead className="text-right">Nº de Entradas</TableHead>
              <TableHead className="text-right">Qtd. Entrada</TableHead>
              <TableHead className="text-right">Estoque Atual</TableHead>
              <TableHead className="text-right">Qtd. Saída (O.S.)</TableHead>
              <TableHead className="text-right">Consumo Médio/Dia</TableHead>
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
                <TableCell className="font-mono text-sm">{l.codigo}</TableCell>
                <TableCell className="font-medium">{l.nome}</TableCell>
                <TableCell className="text-right">{l.numEntradas}</TableCell>
                <TableCell className="text-right text-emerald-700">+{fmtQtd(l.qtdEntrada).toLocaleString("pt-BR")} {l.unidade}</TableCell>
                <TableCell className="text-right">{fmtQtd(l.estoqueAtual).toLocaleString("pt-BR")} {l.unidade}</TableCell>
                <TableCell className="text-right text-red-700">−{fmtQtd(l.qtdSaidaOS).toLocaleString("pt-BR")} {l.unidade}</TableCell>
                <TableCell className="text-right">{l.consumoMedioDia.toFixed(2)}</TableCell>
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
