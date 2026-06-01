import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Plus, RefreshCw, Search, Package, AlertTriangle, TrendingDown, TrendingUp, History, X, Upload } from "@/lib/icons";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { Download } from "@/lib/icons";

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

export default function Estoque() {
  const { companyId } = useCompany();
  const [items, setItems] = useState<EstoqueItem[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [tab, setTab] = useState<"estoque" | "historico">("estoque");

  // Dialog entrada
  const [entradaOpen, setEntradaOpen] = useState(false);
  const [entradaMaterialId, setEntradaMaterialId] = useState("");
  const [entradaQtd, setEntradaQtd] = useState("");
  const [entradaData, setEntradaData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [entradaFornecedor, setEntradaFornecedor] = useState("");
  const [entradaNF, setEntradaNF] = useState("");
  const [entradaObs, setEntradaObs] = useState("");
  const [entradaSaving, setEntradaSaving] = useState(false);
  const [saidaOpen, setSaidaOpen] = useState(false);
  const [saidaMaterialId, setSaidaMaterialId] = useState("");
  const [saidaQtd, setSaidaQtd] = useState("");
  const [saidaMotivo, setSaidaMotivo] = useState("");
  const [saidaResponsavel, setSaidaResponsavel] = useState("");
  const [saidaDestino, setSaidaDestino] = useState("");
  const [saidaData, setSaidaData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saidaSaving, setSaidaSaving] = useState(false);
  const [materiais, setMateriais] = useState<Material[]>([]);

  // Dialog config estoque
  const [configOpen, setConfigOpen] = useState(false);
  const [configItem, setConfigItem] = useState<EstoqueItem | null>(null);
  const [configMin, setConfigMin] = useState("");
  const [configMax, setConfigMax] = useState("");

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [matsRes, estoqueRes, movsRes, osMatRes] = await Promise.all([
        (supabase as any).from("materiais").select("id, codigo, descricao, unidade, valor_unitario, tipo_sistema").eq("company_id", companyId).eq("status", "ativo").order("descricao"),
        (supabase as any).from("estoque").select("*").eq("company_id", companyId),
        (supabase as any).from("estoque_movimentacoes").select("*, materiais(descricao)").eq("company_id", companyId).order("created_at", { ascending: false }).limit(100),
        (supabase as any).from("materiais_os").select("nome_material, quantidade, material_id, ordens_servico!inner(company_id, orcamento_status)").eq("ordens_servico.company_id", companyId).eq("ordens_servico.orcamento_status", "aprovado"),
      ]);

      setMateriais(matsRes.data || []);

      // Calcula quantidade empenhada por material_id
      const empenhado: Record<string, number> = {};
      (osMatRes.data || []).forEach((m: any) => {
        const id = m.material_id;
        if (id) empenhado[id] = (empenhado[id] || 0) + Number(m.quantidade);
      });

      // Monta items de estoque
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
    if (!entradaMaterialId || !entradaQtd || Number(entradaQtd) <= 0) {
      toast({ title: "Preencha material e quantidade", variant: "destructive" }); return;
    }
    setEntradaSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const qtd = Number(entradaQtd);

      // Registra movimentação
      await (supabase as any).from("estoque_movimentacoes").insert({
        material_id: entradaMaterialId,
        company_id: companyId,
        tipo: "entrada",
        quantidade: qtd,
        data_movimentacao: entradaData,
        fornecedor: entradaFornecedor || null,
        numero_nf: entradaNF || null,
        observacoes: entradaObs || null,
        created_by: user?.id,
      });

      // Atualiza ou cria registro de estoque
      const existing = items.find(i => i.material_id === entradaMaterialId);
      if (existing?.id) {
        await (supabase as any).from("estoque").update({
          quantidade_disponivel: existing.quantidade_disponivel + qtd,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await (supabase as any).from("estoque").insert({
          material_id: entradaMaterialId,
          company_id: companyId,
          quantidade_disponivel: qtd,
        });
      }

      toast({ title: "Entrada registrada com sucesso!" });
      setEntradaOpen(false);
      setEntradaMaterialId(""); setEntradaQtd(""); setEntradaFornecedor(""); setEntradaNF(""); setEntradaObs("");
      fetchData();
    } catch (e: any) {
      toast({ title: "Erro ao registrar entrada", description: e.message, variant: "destructive" });
    } finally {
      setEntradaSaving(false);
    }
  };

  const handleSaida = async () => {
    if (!saidaMaterialId || !saidaQtd || Number(saidaQtd) <= 0) {
      toast({ title: "Preencha material e quantidade", variant: "destructive" }); return;
    }
    setSaidaSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const qtd = Number(saidaQtd);
      const existing = items.find(i => i.material_id === saidaMaterialId);

      if (existing && qtd > existing.quantidade_disponivel) {
        toast({ title: "Quantidade insuficiente", description: `Disponível: ${existing.quantidade_disponivel} ${existing.material.unidade || ""}`, variant: "destructive" });
        setSaidaSaving(false); return;
      }

      await (supabase as any).from("estoque_movimentacoes").insert({
        material_id: saidaMaterialId,
        company_id: companyId,
        tipo: "saida",
        quantidade: qtd,
        data_movimentacao: saidaData,
        observacoes: [saidaMotivo, saidaResponsavel, saidaDestino].filter(Boolean).join(" | ") || null,
        created_by: user?.id,
      });

      if (existing?.id) {
        await (supabase as any).from("estoque").update({
          quantidade_disponivel: Math.max(existing.quantidade_disponivel - qtd, 0),
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      }

      toast({ title: "Saída registrada com sucesso!" });
      setSaidaOpen(false);
      setSaidaMaterialId(""); setSaidaQtd(""); setSaidaMotivo(""); setSaidaResponsavel(""); setSaidaDestino("");
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
          material_id: configItem.material_id,
          company_id: companyId,
          quantidade_disponivel: 0,
          quantidade_minima: Number(configMin) || 0,
          quantidade_maxima: Number(configMax) || 0,
        });
      }
      toast({ title: "Configuração salva!" });
      setConfigOpen(false);
      fetchData();
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

  return (
    <div className="space-y-6">
      {/* Header */}
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
          <Button variant="outline" size="icon" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setEntradaOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Registrar Entrada
          </Button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="cursor-pointer" onClick={() => setFilterStatus("todos")}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground">Total de Materiais</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <span className="text-3xl font-bold">{stats.total}</span>
          </CardContent>
        </Card>
        <Card className="cursor-pointer border-red-200 bg-red-50/30" onClick={() => setFilterStatus("zerado")}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-red-600">🔴 Zerados</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <span className="text-3xl font-bold text-red-700">{stats.criticos}</span>
          </CardContent>
        </Card>
        <Card className="cursor-pointer border-amber-200 bg-amber-50/30" onClick={() => setFilterStatus("baixo")}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-amber-600">🟡 Estoque Baixo</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <span className="text-3xl font-bold text-amber-700">{stats.baixos}</span>
          </CardContent>
        </Card>
        <Card className="cursor-pointer border-emerald-200 bg-emerald-50/30" onClick={() => setFilterStatus("ok")}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-emerald-600">🟢 Em dia</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <span className="text-3xl font-bold text-emerald-700">{stats.ok}</span>
          </CardContent>
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
          {/* Filtros */}
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

          {/* Tabela */}
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
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum material encontrado</TableCell></TableRow>
                ) : filtered.map(item => (
                  <TableRow key={item.material_id} className={cn(
                    item.quantidade_disponivel === 0 && "bg-red-50/30",
                    item.quantidade_disponivel > 0 && item.quantidade_minima > 0 && item.quantidade_disponivel <= item.quantidade_minima && "bg-amber-50/30"
                  )}>
                    <TableCell>
                      <div className="font-medium">{item.material.descricao}</div>
                      {item.material.codigo && <div className="text-xs text-muted-foreground font-mono">{item.material.codigo}</div>}
                    </TableCell>
                    <TableCell className="text-center font-semibold">
                      {item.quantidade_disponivel} {item.material.unidade || ""}
                    </TableCell>
                    <TableCell className="text-center text-amber-700">
                      {item.quantidade_empenhada} {item.material.unidade || ""}
                    </TableCell>
                    <TableCell className="text-center font-bold text-primary">
                      {item.quantidade_total} {item.material.unidade || ""}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {item.quantidade_minima || "—"}
                    </TableCell>
                    <TableCell>{getStatusBadge(item)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={() => { setEntradaMaterialId(item.material_id); setEntradaOpen(true); }}>
                          <TrendingUp className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Entrada
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={() => { setSaidaMaterialId(item.material_id); setSaidaOpen(true); }}>
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

      {/* Dialog Entrada */}
      <Dialog open={entradaOpen} onOpenChange={o => { if (!o) { setEntradaOpen(false); setEntradaMaterialId(""); setEntradaQtd(""); setEntradaFornecedor(""); setEntradaNF(""); setEntradaObs(""); } }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" /> Registrar Entrada de Material
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Material *</label>
              <Select value={entradaMaterialId} onValueChange={setEntradaMaterialId}>
                <SelectTrigger><SelectValue placeholder="Selecione o material" /></SelectTrigger>
                <SelectContent>
                  {materiais.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.codigo ? `${m.codigo} — ` : ""}{m.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Quantidade *</label>
                <Input type="number" min="0.01" step="0.01" value={entradaQtd} onChange={e => setEntradaQtd(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Data da Entrada</label>
                <Input type="date" value={entradaData} onChange={e => setEntradaData(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Fornecedor</label>
                <Input value={entradaFornecedor} onChange={e => setEntradaFornecedor(e.target.value)} placeholder="Nome do fornecedor" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Nº da NF</label>
                <Input value={entradaNF} onChange={e => setEntradaNF(e.target.value)} placeholder="Ex: NF-12345" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Observações</label>
              <Textarea value={entradaObs} onChange={e => setEntradaObs(e.target.value)} placeholder="Informações adicionais..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntradaOpen(false)}>Cancelar</Button>
            <Button onClick={handleEntrada} disabled={entradaSaving || !entradaMaterialId || !entradaQtd}
              className="bg-emerald-600 hover:bg-emerald-700">
              {entradaSaving ? "Salvando..." : "Registrar Entrada"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

{/* Dialog Saída */}
      <Dialog open={saidaOpen} onOpenChange={o => { if (!o) { setSaidaOpen(false); setSaidaMaterialId(""); setSaidaQtd(""); setSaidaMotivo(""); setSaidaResponsavel(""); setSaidaDestino(""); } }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-600" /> Registrar Saída de Material
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Material *</label>
              <Select value={saidaMaterialId} onValueChange={setSaidaMaterialId}>
                <SelectTrigger><SelectValue placeholder="Selecione o material" /></SelectTrigger>
                <SelectContent>
                  {materiais.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.codigo ? `${m.codigo} — ` : ""}{m.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {saidaMaterialId && (() => {
                const item = items.find(i => i.material_id === saidaMaterialId);
                return item ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    Disponível: <strong>{item.quantidade_disponivel} {item.material.unidade || ""}</strong>
                  </p>
                ) : null;
              })()}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Quantidade *</label>
                <Input type="number" min="0.01" step="0.01" value={saidaQtd} onChange={e => setSaidaQtd(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Data da Saída</label>
                <Input type="date" value={saidaData} onChange={e => setSaidaData(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Motivo</label>
              <Input value={saidaMotivo} onChange={e => setSaidaMotivo(e.target.value)} placeholder="Ex: Uso em OS-001" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Responsável</label>
              <Input value={saidaResponsavel} onChange={e => setSaidaResponsavel(e.target.value)} placeholder="Nome do responsável" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Destino</label>
              <Input value={saidaDestino} onChange={e => setSaidaDestino(e.target.value)} placeholder="Ex: Bloco A, Sala 101" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaidaOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaida} disabled={saidaSaving || !saidaMaterialId || !saidaQtd}
              className="bg-red-600 hover:bg-red-700">
              {saidaSaving ? "Salvando..." : "Registrar Saída"}
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