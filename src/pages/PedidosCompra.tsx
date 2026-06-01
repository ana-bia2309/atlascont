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
import { Plus, Trash2, RefreshCw, Search, ShoppingCart, Package, Send, X, Pencil } from "@/lib/icons";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type PedidoItem = {
  id?: string;
  material_id: string | null;
  nome_material: string;
  quantidade: number;
  unidade: string;
  observacoes: string;
};

type Pedido = {
  id: string;
  numero: string | null;
  solicitante_id: string | null;
  responsavel_id: string | null;
  prazo: string | null;
  status: string;
  observacoes: string | null;
  created_at: string;
  solicitante_nome?: string;
  responsavel_nome?: string;
  itens?: PedidoItem[];
};

type Material = {
  id: string;
  codigo: string | null;
  descricao: string;
  unidade: string | null;
};

type Profile = {
  id: string;
  nome: string;
};

const STATUS_OPTIONS = [
  { value: "pendente", label: "🟡 Pendente", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "em_compra", label: "🔵 Em Compra", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "comprado", label: "🟢 Comprado", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "recebido", label: "✅ Recebido", color: "bg-green-50 text-green-700 border-green-200" },
  { value: "cancelado", label: "🔴 Cancelado", color: "bg-red-50 text-red-700 border-red-200" },
];

export default function PedidosCompra() {
  const { companyId } = useCompany();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [tab, setTab] = useState<"meus" | "todos">("todos");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterSearch, setFilterSearch] = useState("");

  // Dialog novo pedido
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Pedido | null>(null);
  const [numero, setNumero] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [prazo, setPrazo] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [itens, setItens] = useState<PedidoItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Mini cadastro de material
  const [novoMatDialog, setNovoMatDialog] = useState(false);
  const [novoMatForm, setNovoMatForm] = useState({ codigo: "", descricao: "", unidade: "un", valor_unitario: "", tipo_sistema: "", fornecedor: "" });
  const [novoMatSaving, setNovoMatSaving] = useState(false);

  // Dialog status
  const [statusDialog, setStatusDialog] = useState(false);
  const [statusPedido, setStatusPedido] = useState<Pedido | null>(null);
  const [novoStatus, setNovoStatus] = useState("");

  // Item form
  const [itemMaterialId, setItemMaterialId] = useState("");
  const [itemNome, setItemNome] = useState("");
  const [itemQtd, setItemQtd] = useState("1");
  const [itemUnidade, setItemUnidade] = useState("un");
  const [itemObs, setItemObs] = useState("");
  const [buscaMaterial, setBuscaMaterial] = useState("");
  const [showMaterialList, setShowMaterialList] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("profiles").select("id").eq("user_id", user.id).single()
        .then(({ data }) => { if (data) setProfileId((data as any).id); });
    });
  }, []);

  const handleSaveNovoMaterial = async () => {
    if (!novoMatForm.descricao.trim()) { toast({ title: "Descrição obrigatória", variant: "destructive" }); return; }
    setNovoMatSaving(true);
    try {
      const { data } = await (supabase as any).from("materiais").insert({
        company_id: companyId,
        descricao: novoMatForm.descricao.trim(),
        codigo: novoMatForm.codigo.trim() || null,
        unidade: novoMatForm.unidade || null,
        valor_unitario: novoMatForm.valor_unitario ? Number(novoMatForm.valor_unitario) : null,
        tipo_sistema: novoMatForm.tipo_sistema || null,
        fornecedor: novoMatForm.fornecedor.trim() || null,
        status: "ativo",
      }).select().single();
      toast({ title: "Material cadastrado!" });
      setNovoMatDialog(false);
      setNovoMatForm({ codigo: "", descricao: "", unidade: "un", valor_unitario: "", tipo_sistema: "", fornecedor: "" });
      // Seleciona o novo material automaticamente
      if (data) {
        setItemMaterialId(data.id);
        setItemNome(data.descricao);
        setItemUnidade(data.unidade || "un");
        setBuscaMaterial(data.codigo ? `${data.codigo} — ${data.descricao}` : data.descricao);
      }
      fetchData();
    } catch (e: any) {
      toast({ title: "Erro ao cadastrar", description: e.message, variant: "destructive" });
    } finally {
      setNovoMatSaving(false);
    }
  };

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [pedidosRes, matsRes, profilesRes] = await Promise.all([
        (supabase as any).from("pedidos_compra").select("*, pedidos_compra_itens(*)").eq("company_id", companyId).order("created_at", { ascending: false }),
        (supabase as any).from("materiais").select("id, codigo, descricao, unidade").eq("company_id", companyId).eq("status", "ativo").order("descricao"),
        (supabase as any).from("profiles").select("id, nome").eq("company_id", companyId).order("nome"),
      ]);

      const profilesMap: Record<string, string> = {};
      (profilesRes.data || []).forEach((p: any) => { profilesMap[p.id] = p.nome; });
      setProfiles(profilesRes.data || []);
      setMateriais(matsRes.data || []);

      setPedidos((pedidosRes.data || []).map((p: any) => ({
        ...p,
        solicitante_nome: profilesMap[p.solicitante_id] || "—",
        responsavel_nome: profilesMap[p.responsavel_id] || "—",
        itens: p.pedidos_compra_itens || [],
      })));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    return pedidos.filter(p => {
      if (tab === "meus" && p.solicitante_id !== profileId) return false;
      if (filterStatus !== "todos" && p.status !== filterStatus) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase();
        if (!(p.numero || "").toLowerCase().includes(q) &&
            !(p.solicitante_nome || "").toLowerCase().includes(q) &&
            !(p.responsavel_nome || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [pedidos, tab, filterStatus, filterSearch, profileId]);

  const materiaisFiltrados = buscaMaterial.length === 0
    ? materiais
    : materiais.filter(m => {
        const q = buscaMaterial.toLowerCase();
        return m.descricao.toLowerCase().includes(q) || (m.codigo || "").toLowerCase().includes(q);
      });

  const selecionarMaterial = (m: Material) => {
    setItemMaterialId(m.id);
    setItemNome(m.descricao);
    setItemUnidade(m.unidade || "un");
    setBuscaMaterial(m.codigo ? `${m.codigo} — ${m.descricao}` : m.descricao);
    setShowMaterialList(false);
  };

  const addItem = () => {
    if (!itemNome.trim()) { toast({ title: "Informe o material", variant: "destructive" }); return; }
    setItens(prev => [...prev, {
      material_id: itemMaterialId || null,
      nome_material: itemNome.trim(),
      quantidade: parseFloat(itemQtd) || 1,
      unidade: itemUnidade,
      observacoes: itemObs,
    }]);
    setItemMaterialId(""); setItemNome(""); setItemQtd("1"); setItemUnidade("un"); setItemObs(""); setBuscaMaterial("");
  };

  const removeItem = (idx: number) => setItens(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (itens.length === 0) { toast({ title: "Adicione pelo menos um item", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        numero: numero.trim() || null,
        solicitante_id: profileId,
        responsavel_id: responsavelId || null,
        prazo: prazo || null,
        observacoes: observacoes.trim() || null,
        status: "pendente",
        updated_at: new Date().toISOString(),
      };

      let pedidoId = editing?.id;
      if (editing) {
        await (supabase as any).from("pedidos_compra").update(payload).eq("id", editing.id);
        await (supabase as any).from("pedidos_compra_itens").delete().eq("pedido_id", editing.id);
      } else {
        const { data } = await (supabase as any).from("pedidos_compra").insert(payload).select().single();
        pedidoId = data.id;
      }

      await (supabase as any).from("pedidos_compra_itens").insert(
        itens.map(item => ({ ...item, pedido_id: pedidoId }))
      );

      toast({ title: editing ? "Pedido atualizado!" : "Pedido enviado!" });
      setDialogOpen(false); resetForm(); fetchData();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!statusPedido || !novoStatus) return;
    await (supabase as any).from("pedidos_compra").update({ status: novoStatus, updated_at: new Date().toISOString() }).eq("id", statusPedido.id);
    toast({ title: "Status atualizado!" });
    setStatusDialog(false); setStatusPedido(null); setNovoStatus("");
    fetchData();
  };

  const resetForm = () => {
    setNumero(""); setResponsavelId(""); setPrazo(""); setObservacoes(""); setItens([]); setEditing(null);
    setItemMaterialId(""); setItemNome(""); setItemQtd("1"); setItemUnidade("un"); setItemObs(""); setBuscaMaterial("");
  };

  const openEdit = (p: Pedido) => {
    setEditing(p);
    setNumero(p.numero || "");
    setResponsavelId(p.responsavel_id || "");
    setPrazo(p.prazo || "");
    setObservacoes(p.observacoes || "");
    setItens((p.itens || []).map(i => ({ ...i, id: undefined })));
    setDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const opt = STATUS_OPTIONS.find(o => o.value === status);
    return <Badge variant="outline" className={cn("text-xs", opt?.color)}>{opt?.label || status}</Badge>;
  };

  const stats = useMemo(() => ({
    total: pedidos.length,
    pendentes: pedidos.filter(p => p.status === "pendente").length,
    em_compra: pedidos.filter(p => p.status === "em_compra").length,
    recebidos: pedidos.filter(p => p.status === "recebido").length,
  }), [pedidos]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Pedidos de Compra</h1>
            <p className="text-sm text-muted-foreground">Gerencie solicitações de compra de materiais</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Novo Pedido
          </Button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-xs text-muted-foreground">Total</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4"><span className="text-3xl font-bold">{stats.total}</span></CardContent></Card>
        <Card className="border-amber-200 bg-amber-50/30"><CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-xs text-amber-600">🟡 Pendentes</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4"><span className="text-3xl font-bold text-amber-700">{stats.pendentes}</span></CardContent></Card>
        <Card className="border-blue-200 bg-blue-50/30"><CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-xs text-blue-600">🔵 Em Compra</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4"><span className="text-3xl font-bold text-blue-700">{stats.em_compra}</span></CardContent></Card>
        <Card className="border-emerald-200 bg-emerald-50/30"><CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-xs text-emerald-600">✅ Recebidos</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4"><span className="text-3xl font-bold text-emerald-700">{stats.recebidos}</span></CardContent></Card>
      </div>

      {/* Tabs + Filtros */}
      <div className="flex flex-wrap gap-3 items-center border-b pb-3">
        <button onClick={() => setTab("todos")} className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", tab === "todos" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>
          Todos os Pedidos
        </button>
        <button onClick={() => setTab("meus")} className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", tab === "meus" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>
          Meus Pedidos
        </button>
        <div className="ml-auto flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Buscar..." className="pl-9 h-9 w-48" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lista */}
      {loading ? <p className="text-muted-foreground">Carregando...</p> :
        filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-muted-foreground border rounded-lg">
            <ShoppingCart className="h-12 w-12 mb-3 opacity-20" />
            <p>Nenhum pedido encontrado.</p>
          </div>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono font-semibold">{p.numero || `PED-${p.id.slice(0, 6).toUpperCase()}`}</TableCell>
                    <TableCell>{p.solicitante_nome}</TableCell>
                    <TableCell>{p.responsavel_nome}</TableCell>
                    <TableCell>{p.prazo ? format(new Date(p.prazo + "T00:00:00"), "dd/MM/yyyy") : "—"}</TableCell>
                    <TableCell>
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{(p.itens || []).length} item(s)</span>
                    </TableCell>
                    <TableCell>{getStatusBadge(p.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(p.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={() => { setStatusPedido(p); setNovoStatus(p.status); setStatusDialog(true); }}>
                          Atualizar Status
                        </Button>
                        {p.solicitante_id === profileId && p.status === "pendente" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      }

      {/* Dialog Novo/Editar Pedido */}
      <Dialog open={dialogOpen} onOpenChange={o => { if (!o) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Pedido" : "Novo Pedido de Compra"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Número do Pedido</label>
                <Input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Ex: PC-001" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Prazo necessário</label>
                <Input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Responsável pela compra</label>
              <Select value={responsavelId || "__none__"} onValueChange={v => setResponsavelId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhum —</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Observações</label>
              <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Informações adicionais..." rows={2} />
            </div>

            {/* Itens */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 flex items-center justify-between">
                <span className="text-sm font-semibold">Itens do Pedido</span>
                <span className="text-xs text-muted-foreground">{itens.length} item(s)</span>
              </div>
              <div className="p-4 space-y-3">
                {/* Form adicionar item */}
                <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Material</label>
                    <Input value={buscaMaterial}
                      onChange={e => { setBuscaMaterial(e.target.value); setShowMaterialList(true); setItemNome(e.target.value); setItemMaterialId(""); }}
                      onFocus={() => setShowMaterialList(true)}
                      onBlur={() => setTimeout(() => setShowMaterialList(false), 200)}
                      placeholder="Buscar ou digitar material..." className="h-8 text-sm" />
                    {showMaterialList && (
                      <div className="w-full mt-1 rounded-md border bg-popover shadow-md max-h-[160px] overflow-y-auto">
                        {materiaisFiltrados.map(m => (
                          <button key={m.id} className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                            onMouseDown={e => { e.preventDefault(); selecionarMaterial(m); }}>
                            {m.codigo && <span className="font-mono text-xs text-muted-foreground">{m.codigo}</span>}
                            <span className="flex-1">{m.descricao}</span>
                            {m.unidade && <span className="text-xs text-muted-foreground">{m.unidade}</span>}
                          </button>
                        ))}
                        <button
                          className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 flex items-center gap-2 border-t text-primary font-medium"
                          onMouseDown={e => {
                            e.preventDefault();
                            setShowMaterialList(false);
                            setNovoMatDialog(true);
                          }}>
                          <Plus className="h-3.5 w-3.5" />
                          + Cadastrar novo material
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Qtd</label>
                      <Input type="number" min="0.01" step="0.01" value={itemQtd} onChange={e => setItemQtd(e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Unidade</label>
                      <Input value={itemUnidade} onChange={e => setItemUnidade(e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="flex items-end">
                      <Button size="sm" className="h-8 w-full" onClick={addItem} disabled={!itemNome.trim()}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Lista de itens */}
                {itens.length > 0 && (
                  <div className="space-y-1">
                    {itens.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                        <Package className="h-4 w-4 text-primary shrink-0" />
                        <span className="flex-1 text-sm font-medium">{item.nome_material}</span>
                        <span className="text-xs text-muted-foreground">{item.quantidade} {item.unidade}</span>
                        <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || itens.length === 0}>
              <Send className="h-4 w-4 mr-2" />
              {saving ? "Salvando..." : editing ? "Salvar" : "Enviar Pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

{/* Dialog Novo Material */}
      <Dialog open={novoMatDialog} onOpenChange={o => { if (!o) setNovoMatDialog(false); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader><DialogTitle>Cadastrar Novo Material</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Código</label>
                <Input value={novoMatForm.codigo} onChange={e => setNovoMatForm(f => ({ ...f, codigo: e.target.value }))} placeholder="Ex: MAT-001" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Unidade</label>
                <Select value={novoMatForm.unidade} onValueChange={v => setNovoMatForm(f => ({ ...f, unidade: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["un", "cx", "kg", "g", "l", "ml", "m", "m²", "m³", "pc", "par", "rolo"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição *</label>
              <Input value={novoMatForm.descricao} onChange={e => setNovoMatForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Filtro de ar 12000 BTU" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Valor Unitário (R$)</label>
                <Input type="number" value={novoMatForm.valor_unitario} onChange={e => setNovoMatForm(f => ({ ...f, valor_unitario: e.target.value }))} placeholder="0,00" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Tipo de Sistema</label>
                <Select value={novoMatForm.tipo_sistema || "__none__"} onValueChange={v => setNovoMatForm(f => ({ ...f, tipo_sistema: v === "__none__" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Nenhum —</SelectItem>
                    {["Ar-condicionado","Bombeamento hidráulico","Bebedouro","Elétrico","Hidrossanitário","Incêndio","Elevador","Gerador","CFTV","Controle de acesso","Outro"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Fornecedor</label>
              <Input value={novoMatForm.fornecedor} onChange={e => setNovoMatForm(f => ({ ...f, fornecedor: e.target.value }))} placeholder="Ex: Distribuidora XYZ" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoMatDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveNovoMaterial} disabled={novoMatSaving || !novoMatForm.descricao.trim()}>
              {novoMatSaving ? "Salvando..." : "Cadastrar Material"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Status */}
      <Dialog open={statusDialog} onOpenChange={o => { if (!o) { setStatusDialog(false); setStatusPedido(null); } }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Atualizar Status do Pedido</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Pedido: <strong>{statusPedido?.numero || `PED-${statusPedido?.id.slice(0, 6).toUpperCase()}`}</strong></p>
            <Select value={novoStatus} onValueChange={setNovoStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(false)}>Cancelar</Button>
            <Button onClick={handleUpdateStatus}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}