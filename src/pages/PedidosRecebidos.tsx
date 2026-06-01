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
import { RefreshCw, Search, ShoppingCart, Package, Clock, Filter } from "@/lib/icons";
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
  const [profileId, setProfileId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterSearch, setFilterSearch] = useState("");
  const [selected, setSelected] = useState<Pedido | null>(null);
  const [novoStatus, setNovoStatus] = useState("");
  const [statusDialog, setStatusDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("profiles").select("id").eq("user_id", user.id).single()
        .then(({ data }) => { if (data) setProfileId((data as any).id); });
    });
  }, []);

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
      fetchData();
    } catch (e: any) {
      toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const opt = STATUS_OPTIONS.find(o => o.value === status);
    return <Badge variant="outline" className={cn("text-xs", opt?.color)}>{opt?.label || status}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Pedidos Recebidos</h1>
            <p className="text-sm text-muted-foreground">Acompanhe e gerencie todos os pedidos de compra</p>
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={fetchData}>
          <RefreshCw className="h-4 w-4" />
        </Button>
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

      {/* Filtros */}
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

      {/* Lista */}
      {loading ? <p className="text-muted-foreground text-sm">Carregando...</p> :
        filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Nenhum pedido encontrado.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map(p => (
              <Card key={p.id} className={cn(
                "border transition-colors",
                p.status === "recebido" && "border-emerald-200 bg-emerald-50/20",
                p.status === "cancelado" && "border-red-200 bg-red-50/20",
                p.status === "pendente" && "border-amber-200",
                p.status === "em_compra" && "border-blue-200 bg-blue-50/20",
              )}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-primary" />
                      {p.numero || `PED-${p.id.slice(0, 6).toUpperCase()}`}
                      {getStatusBadge(p.status)}
                    </CardTitle>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {format(new Date(p.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Solicitante: </span><span className="font-medium">{p.solicitante_nome}</span></div>
                    <div><span className="text-muted-foreground">Responsável: </span><span className="font-medium">{p.responsavel_nome}</span></div>
                    <div><span className="text-muted-foreground">Prazo: </span><span className="font-medium">{p.prazo ? format(new Date(p.prazo + "T00:00:00"), "dd/MM/yyyy") : "—"}</span></div>
                  </div>

                  {p.itens.length > 0 && (
                    <div className="rounded-md border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="text-left px-3 py-1.5 font-medium">Material</th>
                            <th className="text-center px-3 py-1.5 font-medium">Qtd</th>
                            <th className="text-left px-3 py-1.5 font-medium">Observações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.itens.map(item => (
                            <tr key={item.id} className="border-t">
                              <td className="px-3 py-1.5 font-medium">{item.nome_material}</td>
                              <td className="px-3 py-1.5 text-center">{item.quantidade} {item.unidade}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{item.observacoes || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {p.observacoes && (
                    <div className="rounded-md bg-muted/30 px-3 py-2 text-xs">
                      <span className="font-semibold text-muted-foreground">Observações: </span>{p.observacoes}
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <Button size="sm" variant="outline"
                      onClick={() => { setSelected(p); setNovoStatus(p.status); setStatusDialog(true); }}>
                      Atualizar Status
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      }

      {/* Dialog Status */}
      <Dialog open={statusDialog} onOpenChange={o => { if (!o) { setStatusDialog(false); setSelected(null); } }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Atualizar Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Pedido: <strong>{selected?.numero || `PED-${selected?.id.slice(0, 6).toUpperCase()}`}</strong>
            </p>
            <Select value={novoStatus} onValueChange={setNovoStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(false)}>Cancelar</Button>
            <Button onClick={handleUpdateStatus} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}