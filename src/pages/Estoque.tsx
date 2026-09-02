import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Plus, RefreshCw, Search, Package, TrendingDown, TrendingUp, History, X, Download, Check, ChevronDown } from "@/lib/icons";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

type Material = {
  id: string;
  codigo: string | null;
  descricao: string;
  unidade: string | null;
  valor_unitario: number | null;
  tipo_sistema: string | null;
};

type EstoqueItem = {
  id?: string;
  material_id: string;
  material: Material;
  quantidade_disponivel: number;
  quantidade_minima: number;
  quantidade_maxima: number;
  quantidade_empenhada: number;
  quantidade_total: number;
};

type Movimentacao = {
  id: string;
  material_id: string;
  material_nome: string;
  tipo: string;
  quantidade: number;
  data_movimentacao: string;
  fornecedor: string | null;
  numero_nf: string | null;
  observacoes: string | null;
  created_at: string;
};

type EntradaItem = { material_id: string; quantidade: string; unidade: string };
const fmtQtd = (n: number) => {
  const r = Math.round((n + Number.EPSILON) * 100) / 100;
  return r % 1 === 0 ? String(r) : r.toFixed(2);
};

export default function Estoque() {
  const { companyId } = useCompany();
  const [items, setItems] = useState<EstoqueItem[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [tab, setTab] = useState<"estoque" | "historico">("estoque");

  // Entrada
  const [entradaOpen, setEntradaOpen] = useState(false);
  const [entradaItens, setEntradaItens] = useState<EntradaItem[]>([]);
  const [entradaMatPopover, setEntradaMatPopover] = useState<Record<number, boolean>>({});
  const [entradaData, setEntradaData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [entradaFornecedor, setEntradaFornecedor] = useState("");
  const [entradaNF, setEntradaNF] = useState("");
  const [entradaObs, setEntradaObs] = useState("");
  const [entradaSaving, setEntradaSaving] = useState(false);

  // Saída — múltiplos materiais
  const [saidaOpen, setSaidaOpen] = useState(false);
  const [saidaItens, setSaidaItens] = useState<EntradaItem[]>([]);
  const [saidaMatPopover, setSaidaMatPopover] = useState<Record<number, boolean>>({});
  const [saidaData, setSaidaData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saidaMotivo, setSaidaMotivo] = useState("");
  const [saidaResponsavel, setSaidaResponsavel] = useState("");
  const [saidaDestino, setSaidaDestino] = useState("");
  const [saidaSaving, setSaidaSaving] = useState(false);

  const resetSaida = () => {
    setSaidaItens([]);
    setSaidaData(format(new Date(), "yyyy-MM-dd"));
    setSaidaMotivo(""); setSaidaResponsavel(""); setSaidaDestino("");
    setSaidaMatPopover({});
  };

  const [materiais, setMateriais] = useState<Material[]>([]);
  const [configOpen, setConfigOpen] = useState(false);
  const [configItem, setConfigItem] = useState<EstoqueItem | null>(null);
  const [configMin, setConfigMin] = useState("");
  const [configMax, setConfigMax] = useState("");

  const resetEntrada = () => {
    setEntradaItens([]);
    setEntradaData(format(new Date(), "yyyy-MM-dd"));
    setEntradaFornecedor("");
    setEntradaNF("");
    setEntradaObs("");
    setEntradaMatPopover({});
  };

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [matsRes, estoqueRes, movsRes, osMatRes] = await Promise.all([
        // categoria filtrada no cliente logo abaixo (NEQ do PostgREST excluiria categoria NULL,
        // e materiais antigos sem categoria definida devem continuar aparecendo como "Material")
        (supabase as any).from("materiais").select("id, codigo, descricao, unidade, valor_unitario, tipo_sistema, categoria").eq("company_id", companyId).eq("status", "ativo").order("codigo", { ascending: true }),
        (supabase as any).from("estoque").select("*").eq("company_id", companyId),
        (supabase as any).from("estoque_movimentacoes").select("*, materiais(descricao)").eq("company_id", companyId).order("created_at", { ascending: false }).limit(100),
        (supabase as any).from("materiais_os").select("nome_material, quantidade, material_id, ordens_servico!inner(company_id, orcamento_status)").eq("ordens_servico.company_id", companyId).eq("ordens_servico.orcamento_status", "aprovado"),
      ]);

      // Serviços não têm controle de estoque físico — exclui da lista de Entrada/Saída
      setMateriais((matsRes.data || []).filter((m: any) => m.categoria !== "Serviço"));

      const empenhado: Record<string, number> = {};
      (osMatRes.data || []).forEach((m: any) => {
        const id = m.material_id;
        if (id) empenhado[id] = (empenhado[id] || 0) + Number(m.quantidade);
      });

      const estoqueMap: Record<string, any> = {};
      (estoqueRes.data || []).forEach((e: any) => { estoqueMap[e.material_id] = e; });

      const enriched: EstoqueItem[] = (matsRes.data || []).map((m: Material) => {
        const est = estoqueMap[m.id];
        const total = Number(est?.quantidade_disponivel || 0);
        const emp = Number(empenhado[m.id] || 0);
        const disp = Math.max(total - emp, 0);
        return {
          id: est?.id,
          material_id: m.id,
          material: m,
          quantidade_disponivel: disp,
          quantidade_minima: Number(est?.quantidade_minima || 0),
          quantidade_maxima: Number(est?.quantidade_maxima || 0),
          quantidade_empenhada: emp,
          quantidade_total: total,
        };
      });

      setItems(enriched);
      setMovimentacoes((movsRes.data || []).map((m: any) => ({
        id: m.id,
        material_id: m.material_id,
        material_nome: m.materiais?.descricao || "—",
        tipo: m.tipo,
        quantidade: m.quantidade,
        data_movimentacao: m.data_movimentacao,
        fornecedor: m.fornecedor,
        numero_nf: m.numero_nf,
        observacoes: m.observacoes,
        created_at: m.created_at,
      })));
    } catch (e: any) {
      toast({ title: "Erro ao carregar estoque", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const stats = useMemo(() => ({
    total: items.length,
    criticos: items.filter(i => i.quantidade_disponivel === 0).length,
    baixos: items.filter(i => i.quantidade_disponivel > 0 && i.quantidade_minima > 0 && i.quantidade_disponivel <= i.quantidade_minima).length,
    ok: items.filter(i => i.quantidade_disponivel > (i.quantidade_minima || 0)).length,
  }), [items]);

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (filterStatus === "zerado" && i.quantidade_disponivel !== 0) return false;
      if (filterStatus === "baixo" && !(i.quantidade_disponivel > 0 && i.quantidade_minima > 0 && i.quantidade_disponivel <= i.quantidade_minima)) return false;
      if (filterStatus === "ok" && i.quantidade_disponivel <= (i.quantidade_minima || 0)) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase();
        if (!i.material.descricao.toLowerCase().includes(q) && !(i.material.codigo || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [items, filterStatus, filterSearch]);

  const getStatusBadge = (item: EstoqueItem) => {
    if (item.quantidade_disponivel === 0)
      return <Badge className="bg-red-50 text-red-700 border-red-200 border text-xs">🔴 Zerado</Badge>;
    if (item.quantidade_minima > 0 && item.quantidade_disponivel <= item.quantidade_minima)
      return <Badge className="bg-amber-50 text-amber-700 border-amber-200 border text-xs">🟡 Baixo</Badge>;
    return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 border text-xs">🟢 OK</Badge>;
  };

  const handleEntrada = async () => {
    const itensValidos = entradaItens.filter(i => i.material_id && Number(i.quantidade) > 0);
    if (itensValidos.length === 0) {
      toast({ title: "Adicione ao menos um material com quantidade", variant: "destructive" }); return;
    }
    setEntradaSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      for (const item of itensValidos) {
        const qtd = Number(item.quantidade);
        await (supabase as any).from("estoque_movimentacoes").insert({
          material_id: item.material_id, company_id: companyId, tipo: "entrada",
          quantidade: qtd, data_movimentacao: entradaData,
          fornecedor: entradaFornecedor || null, numero_nf: entradaNF || null,
          observacoes: entradaObs || null, created_by: user?.id,
        });
        const existing = items.find(i => i.material_id === item.material_id);
        if (existing?.id) {
          await (supabase as any).from("estoque").update({
            quantidade_disponivel: existing.quantidade_total + qtd,
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);
        } else {
          await (supabase as any).from("estoque").insert({
            material_id: item.material_id, company_id: companyId, quantidade_disponivel: qtd,
          });
        }
      }
      toast({ title: `${itensValidos.length} entrada(s) registrada(s) com sucesso!` });
      setEntradaOpen(false);
      resetEntrada();
      fetchData();
    } catch (e: any) {
      toast({ title: "Erro ao registrar entrada", description: e.message, variant: "destructive" });
    } finally {
      setEntradaSaving(false);
    }
  };

  const handleSaida = async () => {
    const itensValidos = saidaItens.filter(i => i.material_id && Number(i.quantidade) > 0);
    if (itensValidos.length === 0) {
      toast({ title: "Adicione ao menos um material com quantidade", variant: "destructive" }); return;
    }
    // Valida estoque suficiente para todos antes de gravar
    for (const item of itensValidos) {
      const existing = items.find(i => i.material_id === item.material_id);
      if (existing && Number(item.quantidade) > existing.quantidade_disponivel) {
        toast({ title: "Quantidade insuficiente", description: `${existing.material.descricao}: disponível ${existing.quantidade_disponivel} ${existing.material.unidade || ""}`, variant: "destructive" });
        return;
      }
    }
    setSaidaSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const obs = [saidaMotivo, saidaResponsavel, saidaDestino].filter(Boolean).join(" | ") || null;
      for (const item of itensValidos) {
        const qtd = Number(item.quantidade);
        await (supabase as any).from("estoque_movimentacoes").insert({
          material_id: item.material_id, company_id: companyId, tipo: "saida",
          quantidade: qtd, data_movimentacao: saidaData,
          observacoes: obs, created_by: user?.id,
        });
        const existing = items.find(i => i.material_id === item.material_id);
        if (existing?.id) {
          await (supabase as any).from("estoque").update({
            quantidade_disponivel: Math.max(existing.quantidade_total - qtd, 0),
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);
        }
      }
      toast({ title: `${itensValidos.length} saída(s) registrada(s) com sucesso!` });
      setSaidaOpen(false);
      resetSaida();
      fetchData();
    } catch (e: any) {
      toast({ title: "Erro ao registrar saída", description: e.message, variant: "destructive" });
    } finally {
      setSaidaSaving(false);
    }
  };
  const handleConfig = async () => {
    if (!configItem) return;
    try {
      if (configItem.id) {
        await (supabase as any).from("estoque").update({
          quantidade_minima: Number(configMin) || 0,
          quantidade_maxima: Number(configMax) || 0,
        }).eq("id", configItem.id);
      } else {
        await (supabase as any).from("estoque").insert({
          material_id: configItem.material_id, company_id: companyId,
          quantidade_disponivel: 0,
          quantidade_minima: Number(configMin) || 0,
          quantidade_maxima: Number(configMax) || 0,
        });
      }
      toast({ title: "Configuração salva!" });
      setConfigOpen(false); fetchData();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    }
  };

  const exportarExcel = () => {
    const rows = filtered.map(i => ({
      "Código": i.material.codigo || "—",
      "Material": i.material.descricao,
      "Unidade": i.material.unidade || "—",
      "Qtd Disponível": i.quantidade_disponivel,
      "Qtd Empenhada": i.quantidade_empenhada,
      "Qtd Total": i.quantidade_total,
      "Qtd Mínima": i.quantidade_minima,
      "Status": i.quantidade_disponivel === 0 ? "Zerado" : i.quantidade_disponivel <= i.quantidade_minima ? "Baixo" : "OK",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Estoque");
    XLSX.writeFile(wb, `estoque_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const itensValidos = entradaItens.filter(i => i.material_id && Number(i.quantidade) > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Package className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Controle de Estoque</h1>
            <p className="text-sm text-muted-foreground">Gestão de materiais e movimentações</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportarExcel} disabled={items.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Excel
          </Button>
          <Button variant="outline" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
          <Button variant="destructive" onClick={() => { resetSaida(); setSaidaOpen(true); }}>
            <TrendingDown className="h-4 w-4 mr-2" /> Registrar Saída
          </Button>
          <Button onClick={() => { resetEntrada(); setEntradaOpen(true); }} className="!bg-emerald-600 hover:!bg-emerald-700 !bg-none">
            <TrendingUp className="h-4 w-4 mr-2" /> Registrar Entrada
          </Button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="cursor-pointer" onClick={() => setFilterStatus("todos")}>
          <CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-xs text-muted-foreground">Total de Materiais</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4"><span className="text-3xl font-bold">{stats.total}</span></CardContent>
        </Card>
        <Card className="cursor-pointer border-red-200 bg-red-50/30" onClick={() => setFilterStatus("zerado")}>
          <CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-xs text-red-600">🔴 Zerados</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4"><span className="text-3xl font-bold text-red-700">{stats.criticos}</span></CardContent>
        </Card>
        <Card className="cursor-pointer border-amber-200 bg-amber-50/30" onClick={() => setFilterStatus("baixo")}>
          <CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-xs text-amber-600">🟡 Estoque Baixo</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4"><span className="text-3xl font-bold text-amber-700">{stats.baixos}</span></CardContent>
        </Card>
        <Card className="cursor-pointer border-emerald-200 bg-emerald-50/30" onClick={() => setFilterStatus("ok")}>
          <CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-xs text-emerald-600">🟢 Em dia</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4"><span className="text-3xl font-bold text-emerald-700">{stats.ok}</span></CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button onClick={() => setTab("estoque")}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            tab === "estoque" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          <Package className="h-4 w-4 inline mr-1.5" /> Estoque
        </button>
        <button onClick={() => setTab("historico")}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            tab === "historico" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          <History className="h-4 w-4 inline mr-1.5" /> Histórico de Movimentações
        </button>
      </div>

      {tab === "estoque" && (
        <>
          <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
                placeholder="Buscar material..." className="pl-9 h-9" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="zerado">🔴 Zerados</SelectItem>
                <SelectItem value="baixo">🟡 Estoque Baixo</SelectItem>
                <SelectItem value="ok">🟢 Em dia</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground self-center ml-auto">{filtered.length} materiais</span>
          </div>

          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-center">Disponível</TableHead>
                  <TableHead className="text-center">Empenhado</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Mínimo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={7} className="py-3"><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum material encontrado</TableCell></TableRow>
                ) : filtered.map(item => (
                  <TableRow key={item.material_id} className={cn(
                    item.quantidade_disponivel === 0 && "bg-red-50/30",
                    item.quantidade_disponivel > 0 && item.quantidade_minima > 0 && item.quantidade_disponivel <= item.quantidade_minima && "bg-amber-50/30"
                  )}>
                    <TableCell>
                      <div className="font-medium">{item.material.descricao}</div>
                      {item.material.codigo && (
                        <div className="font-mono text-sm font-semibold text-primary">{item.material.codigo}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-center font-semibold">
                      {fmtQtd(item.quantidade_disponivel)} {item.material.unidade || ""}
                    </TableCell>
                    <TableCell className="text-center text-amber-700">
                      {fmtQtd(item.quantidade_empenhada)} {item.material.unidade || ""}
                    </TableCell>
                    <TableCell className="text-center font-bold text-primary">
                      {fmtQtd(item.quantidade_total)} {item.material.unidade || ""}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {item.quantidade_minima ? fmtQtd(item.quantidade_minima) : "—"}
                    </TableCell>
                    <TableCell>{getStatusBadge(item)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={() => {
                            resetEntrada();
                            setEntradaItens([{ material_id: item.material_id, quantidade: "", unidade: item.material.unidade || "" }]);
                            setEntradaOpen(true);
                          }}>
                          <TrendingUp className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Entrada
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={() => {
                            resetSaida();
                            setSaidaItens([{ material_id: item.material_id, quantidade: "", unidade: item.material.unidade || "" }]);
                            setSaidaOpen(true);
                          }}>
                          <TrendingDown className="h-3.5 w-3.5 mr-1 text-red-600" /> Saída
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={() => { setConfigItem(item); setConfigMin(String(item.quantidade_minima)); setConfigMax(String(item.quantidade_maxima)); setConfigOpen(true); }}>
                          Configurar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {tab === "historico" && (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-center">Quantidade</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>NF</TableHead>
                <TableHead>Observações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimentacoes.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma movimentação registrada</TableCell></TableRow>
              ) : movimentacoes.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {format(new Date(m.data_movimentacao + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="font-medium">{m.material_nome}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(
                      m.tipo === "entrada" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                      m.tipo === "saida" && "bg-red-50 text-red-700 border-red-200",
                      m.tipo === "ajuste" && "bg-blue-50 text-blue-700 border-blue-200",
                    )}>
                      {m.tipo === "entrada" ? "⬆ Entrada" : m.tipo === "saida" ? "⬇ Saída" : "↕ Ajuste"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center font-semibold">{m.quantidade}</TableCell>
                  <TableCell className="text-sm">{m.fornecedor || "—"}</TableCell>
                  <TableCell className="text-sm font-mono">{m.numero_nf || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.observacoes || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog Entrada — múltiplos materiais */}
      <Dialog open={entradaOpen} onOpenChange={o => { if (!o) { setEntradaOpen(false); resetEntrada(); } }}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" /> Registrar Entrada de Materiais
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* Data, Fornecedor, NF */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Data da Entrada</label>
                <Input type="date" value={entradaData} onChange={e => setEntradaData(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Fornecedor</label>
                <Input value={entradaFornecedor} onChange={e => setEntradaFornecedor(e.target.value)} placeholder="Nome do fornecedor" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Nº da NF</label>
                <Input value={entradaNF} onChange={e => setEntradaNF(e.target.value)} placeholder="Ex: NF-12345" />
              </div>
            </div>

            {/* Tabela de itens */}
            <div className="rounded-lg border overflow-hidden">
              <div className="bg-muted/40 px-4 py-2.5 flex items-center justify-between border-b">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Itens da Entrada</p>
                <span className="text-xs text-muted-foreground">{entradaItens.length} item(s)</span>
              </div>

              {entradaItens.length > 0 && (
                <div className="grid grid-cols-[1fr_90px_60px_32px] gap-2 px-4 py-2 bg-muted/20 border-b text-xs font-medium text-muted-foreground">
                  <span>Material</span>
                  <span className="text-center">Quantidade</span>
                  <span className="text-center">Unid.</span>
                  <span />
                </div>
              )}

              <div className="divide-y">
                {entradaItens.map((item, idx) => {
                  const mat = materiais.find(m => m.id === item.material_id);
                  return (
                    <div key={idx} className="grid grid-cols-[1fr_90px_60px_32px] gap-2 px-4 py-2.5 items-center">
                      <Popover
                        open={!!entradaMatPopover[idx]}
                        onOpenChange={o => setEntradaMatPopover(prev => ({ ...prev, [idx]: o }))}
                      >
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-between font-normal h-8 text-xs">
                            {item.material_id
                              ? <span className="truncate">{mat ? `${mat.codigo ? `[${mat.codigo}] ` : ""}${mat.descricao}` : "—"}</span>
                              : <span className="text-muted-foreground">Buscar material...</span>
                            }
                            <Search className="h-3 w-3 text-muted-foreground shrink-0 ml-1" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[500px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Buscar por código ou descrição..." className="h-9" />
                            <CommandList className="max-h-56">
                              <CommandEmpty>Nenhum material encontrado.</CommandEmpty>
                              <CommandGroup>
                                {materiais.map(m => (
                                  <CommandItem
                                    key={m.id}
                                    onSelect={() => {
                                      setEntradaItens(prev => prev.map((it, i) => i !== idx ? it : {
                                        ...it, material_id: m.id, unidade: m.unidade || "",
                                      }));
                                      setEntradaMatPopover(prev => ({ ...prev, [idx]: false }));
                                    }}
                                    className="flex items-center gap-3 py-2"
                                  >
                                    <Check className={cn("h-3.5 w-3.5 shrink-0", item.material_id === m.id ? "opacity-100 text-primary" : "opacity-0")} />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{m.descricao}</p>
                                      <p className="text-xs text-muted-foreground">{m.codigo || "—"} · {m.unidade || "—"} · R$ {m.valor_unitario?.toFixed(2) || "0,00"}</p>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>

                      <Input
                        type="number" min="0.01" step="0.01"
                        value={item.quantidade}
                        onChange={e => setEntradaItens(prev => prev.map((it, i) => i !== idx ? it : { ...it, quantidade: e.target.value }))}
                        className="h-8 text-center text-xs"
                        placeholder="0"
                      />

                      <div className="text-center text-xs text-muted-foreground font-medium">
                        {item.unidade || "—"}
                      </div>

                      <button
                        onClick={() => setEntradaItens(prev => prev.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="px-4 py-3 border-t bg-muted/10">
                <Button
                  variant="ghost" size="sm"
                  className="gap-1.5 text-xs text-primary hover:text-primary"
                  onClick={() => setEntradaItens(prev => [...prev, { material_id: "", quantidade: "", unidade: "" }])}
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar material
                </Button>
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className="text-sm font-medium mb-1 block">Observações</label>
              <Textarea value={entradaObs} onChange={e => setEntradaObs(e.target.value)} placeholder="Informações adicionais sobre esta entrada..." rows={2} />
            </div>

            {/* Resumo */}
            {itensValidos.length > 0 && (
              <div className="rounded-lg border bg-emerald-50/50 px-4 py-3 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {itensValidos.length} material(is) prontos para lançamento
                </p>
                <p className="text-sm font-semibold text-emerald-700">
                  Cada um será lançado separadamente no estoque
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setEntradaOpen(false); resetEntrada(); }}>Cancelar</Button>
            <Button
              onClick={handleEntrada}
              disabled={entradaSaving || itensValidos.length === 0}
              className="!bg-emerald-600 hover:!bg-emerald-700 !bg-none"
            >
              {entradaSaving ? "Registrando..." : `Registrar ${itensValidos.length} entrada(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Saída — múltiplos materiais */}
      <Dialog open={saidaOpen} onOpenChange={o => { if (!o) { setSaidaOpen(false); resetSaida(); } }}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-600" /> Registrar Saída de Materiais
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* Data, Responsável, Destino */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Data da Saída</label>
                <Input type="date" value={saidaData} onChange={e => setSaidaData(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Responsável</label>
                <Input value={saidaResponsavel} onChange={e => setSaidaResponsavel(e.target.value)} placeholder="Nome do responsável" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Destino</label>
                <Input value={saidaDestino} onChange={e => setSaidaDestino(e.target.value)} placeholder="Ex: Bloco A" />
              </div>
            </div>

            {/* Tabela de itens */}
            <div className="rounded-lg border overflow-hidden">
              <div className="bg-muted/40 px-4 py-2.5 flex items-center justify-between border-b">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Itens da Saída</p>
                <span className="text-xs text-muted-foreground">{saidaItens.length} item(s)</span>
              </div>

              {saidaItens.length > 0 && (
                <div className="grid grid-cols-[1fr_90px_60px_32px] gap-2 px-4 py-2 bg-muted/20 border-b text-xs font-medium text-muted-foreground">
                  <span>Material</span>
                  <span className="text-center">Quantidade</span>
                  <span className="text-center">Unid.</span>
                  <span />
                </div>
              )}

              <div className="divide-y">
                {saidaItens.map((item, idx) => {
                  const mat = materiais.find(m => m.id === item.material_id);
                  const estoqueItem = items.find(i => i.material_id === item.material_id);
                  return (
                    <div key={idx} className="grid grid-cols-[1fr_90px_60px_32px] gap-2 px-4 py-2.5 items-center">
                      <Popover
                        open={!!saidaMatPopover[idx]}
                        onOpenChange={o => setSaidaMatPopover(prev => ({ ...prev, [idx]: o }))}
                      >
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-between font-normal h-8 text-xs">
                            {item.material_id
                              ? <span className="truncate">{mat ? `${mat.codigo ? `[${mat.codigo}] ` : ""}${mat.descricao}` : "—"}</span>
                              : <span className="text-muted-foreground">Buscar material...</span>
                            }
                            <Search className="h-3 w-3 text-muted-foreground shrink-0 ml-1" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[500px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Buscar por código ou descrição..." className="h-9" />
                            <CommandList className="max-h-56">
                              <CommandEmpty>Nenhum material encontrado.</CommandEmpty>
                              <CommandGroup>
                                {materiais.map(m => (
                                  <CommandItem
                                    key={m.id}
                                    onSelect={() => {
                                      setSaidaItens(prev => prev.map((it, i) => i !== idx ? it : {
                                        ...it, material_id: m.id, unidade: m.unidade || "",
                                      }));
                                      setSaidaMatPopover(prev => ({ ...prev, [idx]: false }));
                                    }}
                                    className="flex items-center gap-3 py-2"
                                  >
                                    <Check className={cn("h-3.5 w-3.5 shrink-0", item.material_id === m.id ? "opacity-100 text-primary" : "opacity-0")} />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{m.descricao}</p>
                                      <p className="text-xs text-muted-foreground">{m.codigo || "—"} · {m.unidade || "—"}</p>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>

                      <div>
                        <Input
                          type="number" min="0.01" step="0.01"
                          value={item.quantidade}
                          onChange={e => setSaidaItens(prev => prev.map((it, i) => i !== idx ? it : { ...it, quantidade: e.target.value }))}
                          className="h-8 text-center text-xs"
                          placeholder="0"
                        />
                        {estoqueItem && (
                          <p className="text-[10px] text-muted-foreground text-center mt-0.5">
                            Disp: {fmtQtd(estoqueItem.quantidade_disponivel)}
                          </p>
                        )}
                      </div>

                      <div className="text-center text-xs text-muted-foreground font-medium">
                        {item.unidade || "—"}
                      </div>

                      <button
                        onClick={() => setSaidaItens(prev => prev.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="px-4 py-3 border-t bg-muted/10">
                <Button
                  variant="ghost" size="sm"
                  className="gap-1.5 text-xs text-primary hover:text-primary"
                  onClick={() => setSaidaItens(prev => [...prev, { material_id: "", quantidade: "", unidade: "" }])}
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar material
                </Button>
              </div>
            </div>

            {/* Motivo */}
            <div>
              <label className="text-sm font-medium mb-1 block">Motivo</label>
              <Textarea value={saidaMotivo} onChange={e => setSaidaMotivo(e.target.value)} placeholder="Ex: Uso em OS-001, manutenção preventiva..." rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button  variant="outline" onClick={() => { setSaidaOpen(false); resetSaida(); }}>Cancelar</Button>
            <Button
              onClick={handleSaida}
              disabled={saidaSaving || saidaItens.filter(i => i.material_id && Number(i.quantidade) > 0).length === 0}
              variant="destructive"
            >
              {saidaSaving ? "Registrando..." : `Registrar ${saidaItens.filter(i => i.material_id && Number(i.quantidade) > 0).length} saída(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Config */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Configurar Estoque — {configItem?.material.descricao}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Quantidade Mínima</label>
              <Input type="number" min="0" value={configMin} onChange={e => setConfigMin(e.target.value)} placeholder="0" />
              <p className="text-xs text-muted-foreground mt-1">Alerta quando estoque ficar abaixo deste valor</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Quantidade Máxima</label>
              <Input type="number" min="0" value={configMax} onChange={e => setConfigMax(e.target.value)} placeholder="0" />
              <p className="text-xs text-muted-foreground mt-1">Referência para excesso de estoque</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfig}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}