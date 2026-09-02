import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { Plus, Trash2, RefreshCw, Search, ShoppingCart, Package, Send, X, Pencil, Eye, FileText, Hash } from "@/lib/icons";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { logActivity } from "@/lib/activity-log";

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
  { value: "pendente", label: "🟡 Pendente", color: "bg-warning/10 text-warning border-warning/20" },
  { value: "em_compra", label: "🔵 Em Compra", color: "bg-info/10 text-info border-info/20" },
  { value: "comprado", label: "🟢 Comprado", color: "bg-success/10 text-success border-success/20" },
  { value: "recebido", label: "✅ Armazenado", color: "bg-success/10 text-success border-success/20" },
  { value: "cancelado", label: "🔴 Cancelado", color: "bg-destructive/10 text-destructive border-destructive/20" },
];

export default function PedidosCompra() {
  const { companyId } = useCompany();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [companyNome, setCompanyNome] = useState<string>("Atlas Control");
  const [tab, setTab] = useState<"meus" | "todos">("todos");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterSearch, setFilterSearch] = useState("");

  // Dialog novo/editar
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Pedido | null>(null);
  const [responsavelId, setResponsavelId] = useState("");
  const [prazo, setPrazo] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [itens, setItens] = useState<PedidoItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [previewNumero, setPreviewNumero] = useState<string | null>(null);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPedido, setDrawerPedido] = useState<Pedido | null>(null);

  // Dialog status
  const [statusDialog, setStatusDialog] = useState(false);
  const [statusPedido, setStatusPedido] = useState<Pedido | null>(null);
  const [novoStatus, setNovoStatus] = useState("");

  // Exclusão
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteNumero, setConfirmDeleteNumero] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Item form
  const [itemMaterialId, setItemMaterialId] = useState("");
  const [itemNome, setItemNome] = useState("");
  const [itemQtd, setItemQtd] = useState("1");
  const [itemUnidade, setItemUnidade] = useState("");
  const [itemObs, setItemObs] = useState("");
  const [buscaMaterial, setBuscaMaterial] = useState("");
  const [showMaterialList, setShowMaterialList] = useState(false);

  // Novo material
  const [novoMatDialog, setNovoMatDialog] = useState(false);
  const [novoMatForm, setNovoMatForm] = useState({ descricao: "", unidade: "un", valor_unitario: "", tipo_sistema: "", fornecedor: "" });
  const [novoMatSaving, setNovoMatSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("profiles").select("id, company_id").eq("user_id", user.id).single()
        .then(({ data }: any) => { if (data) setProfileId(data.id); });
    });
  }, []);

  useEffect(() => {
    if (!companyId) return;
    (supabase as any).from("companies").select("nome").eq("id", companyId).single()
      .then(({ data }: any) => { if (data?.nome) setCompanyNome(data.nome); });
  }, [companyId]);

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [pedidosRes, matsRes, profilesRes] = await Promise.all([
        (supabase as any).from("pedidos_compra").select("*, pedidos_compra_itens(*)").eq("company_id", companyId).order("created_at", { ascending: false }),
        (supabase as any).from("materiais").select("id, codigo, descricao, unidade").eq("company_id", companyId).eq("status", "ativo").order("codigo", { ascending: true }),
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

  useEffect(() => {
    if (dialogOpen && !editing && companyId) {
      (supabase as any).from("pedidos_compra_seq").select("last_seq").eq("company_id", companyId).single()
        .then(({ data }: any) => {
          const next = (data?.last_seq || 0) + 1;
          setPreviewNumero("PC-" + String(next).padStart(6, "0"));
        });
    }
  }, [dialogOpen, editing, companyId]);

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
    setBuscaMaterial(m.codigo ? `[${m.codigo}] ${m.descricao}` : m.descricao);
    setShowMaterialList(false);
  };

  const addItem = () => {
    if (!itemNome.trim()) { toast({ title: "Informe o material", variant: "destructive" }); return; }
    setItens(prev => [...prev, {
      material_id: itemMaterialId || null,
      nome_material: itemNome.trim(),
      quantidade: parseFloat(itemQtd) || 1,
      unidade: itemUnidade || "un",
      observacoes: itemObs,
    }]);
    setItemMaterialId(""); setItemNome(""); setItemQtd("1"); setItemUnidade(""); setItemObs(""); setBuscaMaterial("");
  };

  const removeItem = (idx: number) => setItens(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!responsavelId) { toast({ title: "Responsável é obrigatório", variant: "destructive" }); return; }
if (!prazo) { toast({ title: "Prazo é obrigatório", variant: "destructive" }); return; }
if (itens.length === 0) { toast({ title: "Adicione pelo menos um item", variant: "destructive" }); return; }
    setSaving(true);
    try {
      let pedidoId = editing?.id;
      let numeroGerado = editing?.numero;
      if (editing) {
        await (supabase as any).from("pedidos_compra").update({
          responsavel_id: responsavelId || null,
          prazo: prazo || null,
          observacoes: observacoes.trim() || null,
          updated_at: new Date().toISOString(),
        }).eq("id", editing.id);
await (supabase as any).from("pedidos_compra_itens").delete().eq("pedido_id", editing.id);
      } else {
        const { data: numData } = await (supabase as any).rpc("next_pedido_numero", { p_company_id: companyId });
        console.log("numData:", numData, "tipo:", typeof numData);
        numeroGerado = Array.isArray(numData) ? numData[0] : numData;
        console.log("numeroGerado:", numeroGerado);
        const { data } = await (supabase as any).from("pedidos_compra").insert({
          company_id: companyId,
          numero: numeroGerado,
          solicitante_id: profileId,
          responsavel_id: responsavelId || null,
          prazo: prazo || null,
          observacoes: observacoes.trim() || null,
          status: "pendente",
          updated_at: new Date().toISOString(),
        }).select().single();
        pedidoId = data.id;
      }
      await (supabase as any).from("pedidos_compra_itens").insert(
        itens.map(item => ({ ...item, pedido_id: pedidoId }))
      );
      toast({ title: editing ? "Pedido atualizado!" : `Pedido ${numeroGerado} criado!` });
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
    if (drawerPedido?.id === statusPedido.id) setDrawerPedido(prev => prev ? { ...prev, status: novoStatus } : null);
    fetchData();
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      await (supabase as any).from("pedidos_compra_itens").delete().eq("pedido_id", confirmDeleteId);
      await (supabase as any).from("pedidos_compra").delete().eq("id", confirmDeleteId);
      toast({ title: `Pedido ${confirmDeleteNumero} excluído` });
      setConfirmDeleteId(null);
      if (drawerOpen && drawerPedido?.id === confirmDeleteId) setDrawerOpen(false);
      fetchData();
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveNovoMaterial = async () => {
    if (!novoMatForm.descricao.trim()) { toast({ title: "Descrição obrigatória", variant: "destructive" }); return; }
    setNovoMatSaving(true);
    try {
      const { data: numData } = await (supabase as any).rpc("next_material_codigo", { p_company_id: companyId });
      const { data } = await (supabase as any).from("materiais").insert({
        company_id: companyId, codigo: numData,
        descricao: novoMatForm.descricao.trim(), unidade: novoMatForm.unidade || null,
        valor_unitario: novoMatForm.valor_unitario ? Number(novoMatForm.valor_unitario) : null,
        tipo_sistema: novoMatForm.tipo_sistema || null, fornecedor: novoMatForm.fornecedor.trim() || null, status: "ativo",
      }).select().single();
      toast({ title: `Material ${numData} cadastrado!` });
      setNovoMatDialog(false);
      setNovoMatForm({ descricao: "", unidade: "un", valor_unitario: "", tipo_sistema: "", fornecedor: "" });
      if (data) { setItemMaterialId(data.id); setItemNome(data.descricao); setItemUnidade(data.unidade || "un"); setBuscaMaterial(`[${numData}] ${data.descricao}`); }
      fetchData();
    } catch (e: any) {
      toast({ title: "Erro ao cadastrar", description: e.message, variant: "destructive" });
    } finally {
      setNovoMatSaving(false);
    }
  };

  const resetForm = () => {
    setResponsavelId(""); setPrazo(""); setObservacoes(""); setItens([]); setEditing(null); setPreviewNumero(null);
    setItemMaterialId(""); setItemNome(""); setItemQtd("1"); setItemUnidade(""); setItemObs(""); setBuscaMaterial("");
  };

  const openEdit = (p: Pedido) => {
    setEditing(p); setResponsavelId(p.responsavel_id || ""); setPrazo(p.prazo || "");
    setObservacoes(p.observacoes || ""); setItens((p.itens || []).map(i => ({ ...i, id: undefined }))); setDialogOpen(true);
  };

  const openDrawer = (p: Pedido) => { setDrawerPedido(p); setDrawerOpen(true); };

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

  const gerarPDF = (p: Pedido) => {
    const numero = p.numero || `PED-${p.id.slice(0, 6).toUpperCase()}`;
    const dataEmissao = format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR });
    const statusOpt = STATUS_OPTIONS.find(o => o.value === p.status);
    const itensHtml = (p.itens || []).map((item, idx) => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:8px 12px;font-size:13px;">${idx + 1}</td>
        <td style="padding:8px 12px;font-size:13px;font-weight:500;">${item.nome_material}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:center;">${item.quantidade}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:center;">${item.unidade}</td>
        <td style="padding:8px 12px;font-size:13px;color:#6b7280;">${item.observacoes || "—"}</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Pedido ${numero}</title>
<style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:'Segoe UI',Arial,sans-serif; color:#111827; background:#fff; padding:40px; }
.header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #6366f1; padding-bottom:20px; margin-bottom:28px; }
.brand-name { font-size:22px; font-weight:800; color:#6366f1; } .brand-sub { font-size:12px; color:#6b7280; }
.doc-numero { font-size:20px; font-weight:800; font-family:monospace; text-align:right; } .doc-data { font-size:11px; color:#6b7280; text-align:right; }
.section { margin-bottom:24px; } .section-title { font-size:11px; font-weight:700; text-transform:uppercase; color:#6366f1; margin-bottom:10px; }
.info-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; } .info-item label { font-size:11px; color:#6b7280; display:block; }
.info-item span { font-size:13px; font-weight:500; } .status-badge { padding:3px 10px; border-radius:999px; font-size:11px; font-weight:600; background:#fef3c7; color:#92400e; }
table { width:100%; border-collapse:collapse; } thead tr { background:#f3f4f6; }
thead th { padding:10px 12px; text-align:left; font-size:11px; font-weight:700; text-transform:uppercase; color:#374151; }
.footer { margin-top:40px; padding-top:16px; border-top:1px solid #e5e7eb; display:flex; justify-content:space-between; }
.footer-left, .footer-right { font-size:11px; color:#9ca3af; } @media print { body { padding:20px; } }</style></head>
<body><div class="header"><div><div class="brand-name">⚡ ${companyNome}</div><div class="brand-sub">Atlas Control · Pedido de Compra</div></div>
<div><div class="doc-numero">${numero}</div><div class="doc-data">Emitido em ${dataEmissao}</div></div></div>
<div class="section"><div class="section-title">Informações Gerais</div><div class="info-grid">
<div class="info-item"><label>Solicitante</label><span>${p.solicitante_nome || "—"}</span></div>
<div class="info-item"><label>Responsável</label><span>${p.responsavel_nome || "—"}</span></div>
<div class="info-item"><label>Status</label><span class="status-badge">${statusOpt?.label || p.status}</span></div>
<div class="info-item"><label>Criado em</label><span>${format(new Date(p.created_at), "dd/MM/yyyy", { locale: ptBR })}</span></div>
<div class="info-item"><label>Prazo</label><span>${p.prazo ? format(new Date(p.prazo + "T00:00:00"), "dd/MM/yyyy") : "—"}</span></div>
<div class="info-item"><label>Total de Itens</label><span>${(p.itens || []).length} item(s)</span></div></div></div>
${p.observacoes ? `<div class="section"><div class="section-title">Observações</div><div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;font-size:13px;">${p.observacoes}</div></div>` : ""}
<div class="section"><div class="section-title">Itens do Pedido</div>
<table><thead><tr><th style="width:40px">#</th><th>Material</th><th style="width:80px;text-align:center">Qtd</th><th style="width:80px;text-align:center">Un.</th><th>Obs.</th></tr></thead>
<tbody>${itensHtml}</tbody></table></div>
<div class="footer"><div class="footer-left"><div>Gerado em ${dataEmissao}</div><div>Atlas Control</div></div>
<div class="footer-right"><div>${numero}</div><div>${(p.itens || []).length} item(s)</div></div></div></body></html>`;
    const win = window.open("", "_blank");
    if (!win) { toast({ title: "Popup bloqueado", variant: "destructive" }); return; }
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => { win.print(); }, 500);
  };

const gerarExcel = (pedidosList: Pedido[]) => {
    const rows = [
      ["Número", "Solicitante", "Responsável", "Prazo", "Status", "Itens", "Data"],
      ...pedidosList.map(p => [
        p.numero || "",
        p.solicitante_nome || "",
        p.responsavel_nome || "",
        p.prazo ? format(new Date(p.prazo + "T00:00:00"), "dd/MM/yyyy") : "",
        p.status,
        String((p.itens || []).length),
        format(new Date(p.created_at), "dd/MM/yyyy"),
      ])
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedidos_${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
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
          <Button variant="outline" onClick={() => gerarExcel(filtered)}><FileText className="h-4 w-4 mr-2" /> Exportar Excel</Button>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Novo Pedido</Button>
        </div>
      </div>

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

      <div className="flex flex-wrap gap-3 items-center border-b pb-3">
        <button onClick={() => setTab("todos")} className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", tab === "todos" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>Todos os Pedidos</button>
        <button onClick={() => setTab("meus")} className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", tab === "meus" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>Meus Pedidos</button>
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

      {loading ? <p className="text-muted-foreground">Carregando...</p> :
        filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-muted-foreground border rounded-lg">
            <ShoppingCart className="h-12 w-12 mb-3 opacity-20" /><p>Nenhum pedido encontrado.</p>
          </div>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/70 hover:bg-muted/70">
                  <TableHead>Número</TableHead><TableHead>Solicitante</TableHead><TableHead>Responsável</TableHead>
                  <TableHead>Prazo</TableHead><TableHead>Itens</TableHead><TableHead>Status</TableHead>
                  <TableHead>Data</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono font-semibold text-primary">{p.numero || `PED-${p.id.slice(0, 6).toUpperCase()}`}</TableCell>
                    <TableCell>{p.solicitante_nome}</TableCell>
                    <TableCell>{p.responsavel_nome}</TableCell>
                    <TableCell>{p.prazo ? format(new Date(p.prazo + "T00:00:00"), "dd/MM/yyyy") : "—"}</TableCell>
                    <TableCell><span className="text-xs bg-muted px-2 py-0.5 rounded-full">{(p.itens || []).length} item(s)</span></TableCell>
                    <TableCell>{getStatusBadge(p.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(p.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Visualizar" onClick={() => openDrawer(p)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Baixar PDF" onClick={() => gerarPDF(p)}><FileText className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setStatusPedido(p); setNovoStatus(p.status); setStatusDialog(true); }}>Atualizar Status</Button>
                        {p.solicitante_id === profileId && p.status === "pendente" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" title="Excluir"
                          onClick={() => { setConfirmDeleteId(p.id); setConfirmDeleteNumero(p.numero || `PED-${p.id.slice(0,6).toUpperCase()}`); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      }

      {/* Drawer */}
      {drawerOpen && drawerPedido && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="w-full max-w-lg bg-background shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-3">
                <ShoppingCart className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-mono font-bold text-lg text-primary">{drawerPedido.numero || `PED-${drawerPedido.id.slice(0, 6).toUpperCase()}`}</p>
                  <p className="text-xs text-muted-foreground">Criado em {format(new Date(drawerPedido.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => gerarPDF(drawerPedido)}>
                  <FileText className="h-3.5 w-3.5" /> PDF
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Excluir pedido"
                  onClick={() => { setConfirmDeleteId(drawerPedido.id); setConfirmDeleteNumero(drawerPedido.numero || `PED-${drawerPedido.id.slice(0,6).toUpperCase()}`); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDrawerOpen(false)}><X className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="flex items-center justify-between">
                {getStatusBadge(drawerPedido.status)}
                <Button variant="outline" size="sm" className="h-7 text-xs"
                  onClick={() => { setStatusPedido(drawerPedido); setNovoStatus(drawerPedido.status); setStatusDialog(true); }}>
                  Atualizar Status
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><p className="text-xs text-muted-foreground">Solicitante</p><p className="text-sm font-medium">{drawerPedido.solicitante_nome}</p></div>
                <div className="space-y-1"><p className="text-xs text-muted-foreground">Responsável</p><p className="text-sm font-medium">{drawerPedido.responsavel_nome}</p></div>
                <div className="space-y-1"><p className="text-xs text-muted-foreground">Prazo</p><p className="text-sm font-medium">{drawerPedido.prazo ? format(new Date(drawerPedido.prazo + "T00:00:00"), "dd/MM/yyyy") : "—"}</p></div>
                <div className="space-y-1"><p className="text-xs text-muted-foreground">Total de Itens</p><p className="text-sm font-medium">{(drawerPedido.itens || []).length} item(s)</p></div>
              </div>
              {drawerPedido.observacoes && (
                <div className="rounded-md bg-muted/50 border p-3"><p className="text-xs font-semibold text-muted-foreground mb-1">Observações</p><p className="text-sm">{drawerPedido.observacoes}</p></div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Itens do Pedido</p>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Material</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground w-20">Qtd</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground w-16">Un.</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Obs.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(drawerPedido.itens || []).map((item, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-3 py-2.5 font-medium">{item.nome_material}</td>
                          <td className="px-3 py-2.5 text-center">{item.quantidade}</td>
                          <td className="px-3 py-2.5 text-center text-muted-foreground">{item.unidade}</td>
                          <td className="px-3 py-2.5 text-muted-foreground text-xs">{item.observacoes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dialog Novo/Editar */}
      <Dialog open={dialogOpen} onOpenChange={o => { if (!o) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? `Editar Pedido ${editing.numero}` : "Novo Pedido de Compra"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Número do Pedido</label>
              <div className="relative">
                <Hash className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={editing ? (editing.numero || "—") : (previewNumero || "Gerando...")} readOnly className="pl-9 bg-muted text-muted-foreground cursor-not-allowed font-mono font-semibold" />
              </div>
              {!editing && <p className="text-xs text-muted-foreground mt-1">Número gerado automaticamente em sequência</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Prazo necessário <span className="text-destructive">*</span></label>
                <Input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Responsável pela compra <span className="text-destructive">*</span></label>
                <Select value={responsavelId || "__none__"} onValueChange={v => setResponsavelId(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Nenhum —</SelectItem>
                    {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Observações</label>
              <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Informações adicionais..." rows={2} />
            </div>
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 flex items-center justify-between">
                <span className="text-sm font-semibold">Itens do Pedido</span>
                <span className="text-xs text-muted-foreground">{itens.length} item(s)</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Material</label>
                    <Input value={buscaMaterial}
                      onChange={e => { setBuscaMaterial(e.target.value); setShowMaterialList(true); setItemNome(e.target.value); setItemMaterialId(""); setItemUnidade(""); }}
                      onFocus={() => setShowMaterialList(true)}
                      onBlur={() => setTimeout(() => setShowMaterialList(false), 200)}
                      placeholder="Buscar ou digitar material..." className="h-8 text-sm" />
                    {showMaterialList && (
                      <div className="w-full mt-1 rounded-md border bg-popover shadow-md max-h-[160px] overflow-y-auto">
                        {materiaisFiltrados.map(m => (
                          <button key={m.id} className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                            onMouseDown={e => { e.preventDefault(); selecionarMaterial(m); }}>
                            {m.codigo && <span className="font-mono text-xs text-primary font-semibold">{m.codigo}</span>}
                            <span className="flex-1">{m.descricao}</span>
                            {m.unidade && <span className="text-xs text-muted-foreground">{m.unidade}</span>}
                          </button>
                        ))}
                        <button className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 flex items-center gap-2 border-t text-primary font-medium"
                          onMouseDown={e => { e.preventDefault(); setShowMaterialList(false); setNovoMatDialog(true); }}>
                          <Plus className="h-3.5 w-3.5" /> + Cadastrar novo material
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
                      <Input value={itemUnidade || "—"} readOnly className="h-8 text-sm bg-muted text-muted-foreground cursor-not-allowed" />
                    </div>
                    <div className="flex items-end">
                      <Button size="sm" className="h-8 w-full" onClick={addItem} disabled={!itemNome.trim()}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
                      </Button>
                    </div>
                  </div>
                </div>
                {itens.length > 0 && (
                  <div className="space-y-1">
                    {itens.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                        <Package className="h-4 w-4 text-primary shrink-0" />
                        <span className="flex-1 text-sm font-medium">{item.nome_material}</span>
                        <span className="text-xs text-muted-foreground">{item.quantidade} {item.unidade}</span>
                        <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
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
              <Send className="h-4 w-4 mr-2" />{saving ? "Salvando..." : editing ? "Salvar" : "Enviar Pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Novo Material */}
      <Dialog open={novoMatDialog} onOpenChange={o => { if (!o) setNovoMatDialog(false); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader><DialogTitle>Cadastrar Novo Material</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><label className="text-sm font-medium mb-1 block">Código</label>
              <Input value="Gerado automaticamente" readOnly className="bg-muted text-muted-foreground cursor-not-allowed font-mono" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium mb-1 block">Unidade</label>
                <Select value={novoMatForm.unidade} onValueChange={v => setNovoMatForm(f => ({ ...f, unidade: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["un","cx","kg","g","l","ml","m","m²","m³","pc","par","rolo"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><label className="text-sm font-medium mb-1 block">Valor Unitário (R$)</label>
                <Input type="number" value={novoMatForm.valor_unitario} onChange={e => setNovoMatForm(f => ({ ...f, valor_unitario: e.target.value }))} placeholder="0,00" /></div>
            </div>
            <div><label className="text-sm font-medium mb-1 block">Descrição *</label>
              <Input value={novoMatForm.descricao} onChange={e => setNovoMatForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Filtro de ar 12000 BTU" /></div>
            <div><label className="text-sm font-medium mb-1 block">Fornecedor</label>
              <Input value={novoMatForm.fornecedor} onChange={e => setNovoMatForm(f => ({ ...f, fornecedor: e.target.value }))} placeholder="Ex: Distribuidora XYZ" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoMatDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveNovoMaterial} disabled={novoMatSaving || !novoMatForm.descricao.trim()}>{novoMatSaving ? "Salvando..." : "Cadastrar Material"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Status */}
      <Dialog open={statusDialog} onOpenChange={o => { if (!o) { setStatusDialog(false); setStatusPedido(null); } }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle>Atualizar Status do Pedido</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Pedido: <strong>{statusPedido?.numero}</strong></p>
            <Select value={novoStatus} onValueChange={setNovoStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(false)}>Cancelar</Button>
            <Button onClick={handleUpdateStatus}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Confirmar Exclusão */}
      <Dialog open={!!confirmDeleteId} onOpenChange={o => { if (!o) setConfirmDeleteId(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>Confirmar exclusão</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir o pedido <strong>{confirmDeleteNumero}</strong>?</p>
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              ⚠️ Esta ação não pode ser desfeita. Todos os itens do pedido serão removidos.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting ? "Excluindo..." : "Excluir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}