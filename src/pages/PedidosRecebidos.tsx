import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { RefreshCw, Search, ShoppingCart, Package, Clock, Filter, Trash2, Eye, FileText, X } from "@/lib/icons";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type PedidoItem = {
  id: string;
  nome_material: string;
  quantidade: number;
  unidade: string;
  observacoes: string | null;
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
  itens: PedidoItem[];
};

const STATUS_OPTIONS = [
  { value: "pendente", label: "🟡 Pendente", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "em_compra", label: "🔵 Em Compra", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "comprado", label: "🟢 Comprado", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "recebido", label: "✅ Recebido", color: "bg-green-50 text-green-700 border-green-200" },
  { value: "cancelado", label: "🔴 Cancelado", color: "bg-red-50 text-red-700 border-red-200" },
];

export default function PedidosRecebidos() {
  const { companyId } = useCompany();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteNumero, setConfirmDeleteNumero] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterSearch, setFilterSearch] = useState("");
  const [selected, setSelected] = useState<Pedido | null>(null);
  const [novoStatus, setNovoStatus] = useState("");
  const [statusDialog, setStatusDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPedido, setDrawerPedido] = useState<Pedido | null>(null);
  const [companyNome, setCompanyNome] = useState("Atlas Control");

  useEffect(() => {
    if (!companyId) return;
    (supabase as any).from("companies").select("nome").eq("id", companyId).single()
      .then(({ data }: any) => { if (data?.nome) setCompanyNome(data.nome); });
  }, [companyId]);

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [pedidosRes, profilesRes] = await Promise.all([
        (supabase as any).from("pedidos_compra")
          .select("*, pedidos_compra_itens(*)")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        (supabase as any).from("profiles").select("id, nome").eq("company_id", companyId),
      ]);
      const profilesMap: Record<string, string> = {};
      (profilesRes.data || []).forEach((p: any) => { profilesMap[p.id] = p.nome; });
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
      if (filterStatus !== "todos" && p.status !== filterStatus) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase();
        if (!(p.numero || "").toLowerCase().includes(q) &&
            !(p.solicitante_nome || "").toLowerCase().includes(q) &&
            !(p.responsavel_nome || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [pedidos, filterStatus, filterSearch]);

  const stats = useMemo(() => ({
    total: pedidos.length,
    pendentes: pedidos.filter(p => p.status === "pendente").length,
    em_compra: pedidos.filter(p => p.status === "em_compra").length,
    recebidos: pedidos.filter(p => p.status === "recebido").length,
  }), [pedidos]);

  const handleUpdateStatus = async () => {
    if (!selected || !novoStatus) return;
    setSaving(true);
    try {
      await (supabase as any).from("pedidos_compra")
        .update({ status: novoStatus, updated_at: new Date().toISOString() })
        .eq("id", selected.id);
      toast({ title: "Status atualizado!" });
      setStatusDialog(false); setSelected(null); setNovoStatus("");
      if (drawerPedido?.id === selected.id) setDrawerPedido(prev => prev ? { ...prev, status: novoStatus } : null);
      fetchData();
    } catch (e: any) {
      toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
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

  const getStatusBadge = (status: string) => {
    const opt = STATUS_OPTIONS.find(o => o.value === status);
    return <Badge variant="outline" className={cn("text-xs", opt?.color)}>{opt?.label || status}</Badge>;
  };

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
            <h1 className="text-2xl font-bold">Pedidos Recebidos</h1>
            <p className="text-sm text-muted-foreground">Acompanhe e gerencie todos os pedidos de compra</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => gerarExcel(filtered)}>
            <FileText className="h-4 w-4 mr-2" /> Exportar Excel
          </Button>
          <Button variant="outline" size="icon" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
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

      <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filtros:
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
            placeholder="Número, solicitante, responsável..." className="pl-9 h-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filterStatus !== "todos" || filterSearch) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterStatus("todos"); setFilterSearch(""); }}>
            Limpar filtros
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground self-center">{filtered.length} resultado(s)</span>
      </div>

      {loading ? <p className="text-muted-foreground text-sm">Carregando...</p> :
        filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Nenhum pedido encontrado.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-bold">Número</TableHead>
                  <TableHead className="font-bold">Solicitante</TableHead>
                  <TableHead className="font-bold">Responsável</TableHead>
                  <TableHead className="font-bold">Prazo</TableHead>
                  <TableHead className="font-bold">Itens</TableHead>
                  <TableHead className="font-bold">Status</TableHead>
                  <TableHead className="font-bold">Data</TableHead>
                  <TableHead className="font-bold text-right">Ações</TableHead>
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
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Visualizar" onClick={() => { setDrawerPedido(p); setDrawerOpen(true); }}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Baixar PDF" onClick={() => gerarPDF(p)}><FileText className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setSelected(p); setNovoStatus(p.status); setStatusDialog(true); }}>Atualizar Status</Button>
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
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDrawerOpen(false)}><X className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="flex items-center justify-between">
                {getStatusBadge(drawerPedido.status)}
                <Button variant="outline" size="sm" className="h-7 text-xs"
                  onClick={() => { setSelected(drawerPedido); setNovoStatus(drawerPedido.status); setStatusDialog(true); }}>
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

      {/* Dialog Status */}
      <Dialog open={statusDialog} onOpenChange={o => { if (!o) { setStatusDialog(false); setSelected(null); } }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle>Atualizar Status</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Pedido: <strong>{selected?.numero}</strong></p>
            <Select value={novoStatus} onValueChange={setNovoStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(false)}>Cancelar</Button>
            <Button onClick={handleUpdateStatus} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
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
              ⚠️ Esta ação não pode ser desfeita.
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