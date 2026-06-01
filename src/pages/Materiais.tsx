import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, RefreshCw, Search, X, Package, ChevronLeft, Hash } from "@/lib/icons";
import { cn } from "@/lib/utils";

const SISTEMA_OPTIONS = [
  "Ar-condicionado", "Bombeamento hidráulico", "Bebedouro", "Elétrico",
  "Hidrossanitário", "Incêndio", "Elevador", "Gerador", "CFTV",
  "Controle de acesso", "Outro",
];

const UNIDADE_OPTIONS = [
  "un", "cx", "kg", "g", "l", "ml", "m", "m²", "m³", "pc", "par", "rolo", "outro"
];

type Material = {
  id: string;
  codigo: string | null;
  descricao: string;
  unidade: string | null;
  valor_unitario: number | null;
  tipo_sistema: string | null;
  fornecedor: string | null;
  status: string;
  created_at: string;
  data_compra: string | null;
  categoria: string | null;
};

const emptyForm = {
  descricao: "",
  unidade: "",
  valor_unitario: "",
  data_compra: "",
  tipo_sistema: "",
  fornecedor: "",
  status: "ativo",
  categoria: "Material",
};

export default function Materiais() {
  const { can } = usePermissions();
  const [list, setList] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSistema, setFilterSistema] = useState("all");
  const [filterCategoria, setFilterCategoria] = useState("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: profile }: any = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
    if (!profile?.company_id) { setLoading(false); return; }
    setCompanyId(profile.company_id);

    const { data, error } = await (supabase as any)
      .from("materiais")
      .select("*")
      .eq("company_id", profile.company_id)
      .order("codigo", { ascending: true });

    if (error) toast({ title: "Erro ao carregar materiais", variant: "destructive" });
    else setList(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    if (!form.descricao.trim()) {
      toast({ title: "Descrição é obrigatória", variant: "destructive" });
      return;
    }
    if (!companyId) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (editing) {
        // Edição — não altera o código
        const payload: any = {
          descricao: form.descricao.trim(),
          unidade: form.unidade || null,
          valor_unitario: form.valor_unitario ? Number(form.valor_unitario) : null,
          tipo_sistema: form.tipo_sistema || null,
          fornecedor: form.fornecedor.trim() || null,
          status: form.status,
          data_compra: form.data_compra || null,
          categoria: form.categoria || "Material",
        };
        const { error } = await (supabase as any).from("materiais").update(payload).eq("id", editing.id);
        if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
        toast({ title: "Material atualizado" });
      } else {
        // Novo — gera código automático
        const { data: codigoData, error: codigoError } = await (supabase as any)
          .rpc("next_material_codigo", { p_company_id: companyId });
        if (codigoError) {
          toast({ title: "Erro ao gerar código", description: codigoError.message, variant: "destructive" });
          return;
        }
        const payload: any = {
          company_id: companyId,
          codigo: codigoData,
          descricao: form.descricao.trim(),
          unidade: form.unidade || null,
          valor_unitario: form.valor_unitario ? Number(form.valor_unitario) : null,
          tipo_sistema: form.tipo_sistema || null,
          fornecedor: form.fornecedor.trim() || null,
          status: form.status,
          data_compra: form.data_compra || null,
          categoria: form.categoria || "Material",
        };
        const { error } = await (supabase as any).from("materiais").insert(payload);
        if (error) { toast({ title: "Erro ao cadastrar", description: error.message, variant: "destructive" }); return; }
        toast({ title: `Material cadastrado — código ${codigoData}` });
      }
      setOpen(false); setEditing(null); setForm(emptyForm); fetchData();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja excluir este material?")) return;
    const { error } = await (supabase as any).from("materiais").delete().eq("id", id);
    if (error) { toast({ title: "Erro ao excluir", variant: "destructive" }); return; }
    toast({ title: "Material excluído" }); fetchData();
  };

  const openEdit = (m: Material) => {
    setEditing(m);
    setForm({
      descricao: m.descricao,
      unidade: m.unidade || "",
      valor_unitario: m.valor_unitario?.toString() || "",
      data_compra: m.data_compra || "",
      tipo_sistema: m.tipo_sistema || "",
      fornecedor: m.fornecedor || "",
      status: m.status,
      categoria: (m as any).categoria || "Material",
    });
    setOpen(true);
  };

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };

  const filtered = useMemo(() => {
    return list.filter(m => {
      if (filterStatus !== "all" && m.status !== filterStatus) return false;
      if (filterSistema !== "all" && m.tipo_sistema !== filterSistema) return false;
      if (filterCategoria !== "all" && (m as any).categoria !== filterCategoria) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase();
        if (![m.descricao, m.codigo, m.tipo_sistema, m.fornecedor].some(f => (f || "").toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [list, filterStatus, filterSistema, filterSearch, filterCategoria]);

  const hasFilters = filterStatus !== "all" || filterSistema !== "all" || filterSearch.trim() !== "" || filterCategoria !== "all";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Package className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Cadastro de Materiais</h1>
            <p className="text-sm text-muted-foreground">Gerencie os materiais utilizados nas Ordens de Serviço</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo Material</Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Buscar</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Descrição, código, fornecedor..." className="pl-9" />
          </div>
        </div>
        <div className="min-w-[160px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Sistema</label>
          <Select value={filterSistema} onValueChange={setFilterSistema}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {SISTEMA_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Categoria</label>
          <Select value={filterCategoria} onValueChange={setFilterCategoria}>
            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="Material">📦 Material</SelectItem>
              <SelectItem value="Ferramenta">🔧 Ferramenta</SelectItem>
              <SelectItem value="EPI">🦺 EPI</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterSearch(""); setFilterStatus("all"); setFilterSistema("all"); setFilterCategoria("all"); }}>
            <X className="mr-1 h-3 w-3" /> Limpar
          </Button>
        )}
        <span className="text-sm text-muted-foreground ml-auto">{filtered.length} material(is)</span>
      </div>

      {/* Tabela */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Valor Unit.</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Sistema</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum material encontrado</TableCell></TableRow>
            ) : filtered.map(m => (
              <TableRow key={m.id}>
                <TableCell>
                  <span className="font-mono text-sm font-semibold text-primary">{m.codigo || "—"}</span>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{m.descricao}</div>
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border mt-0.5",
                    (m as any).categoria === "Ferramenta" && "bg-blue-50 text-blue-700 border-blue-200",
                    (m as any).categoria === "EPI" && "bg-amber-50 text-amber-700 border-amber-200",
                    (!((m as any).categoria) || (m as any).categoria === "Material") && "bg-emerald-50 text-emerald-700 border-emerald-200",
                  )}>
                    {(m as any).categoria === "Ferramenta" ? "🔧 Ferramenta" : (m as any).categoria === "EPI" ? "🦺 EPI" : "📦 Material"}
                  </span>
                </TableCell>
                <TableCell>{m.unidade || "—"}</TableCell>
                <TableCell>{m.valor_unitario != null ? `R$ ${Number(m.valor_unitario).toFixed(2)}` : "—"}</TableCell>
                <TableCell>{m.fornecedor || "—"}</TableCell>
                <TableCell>{m.tipo_sistema || "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn(
                    m.status === "ativo" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-zinc-100 text-zinc-600 border-zinc-200"
                  )}>
                    {m.status === "ativo" ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={v => { if (!v) { setOpen(false); setEditing(null); setForm(emptyForm); } }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Material" : "Novo Material"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* Código — sempre read-only */}
            <div>
              <label className="text-sm font-medium mb-1 block">Código do Material</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Hash className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={editing ? (editing.codigo || "—") : "Gerado automaticamente"}
                    readOnly
                    className="pl-9 bg-muted text-muted-foreground cursor-not-allowed font-mono"
                  />
                </div>
              </div>
              {!editing && (
                <p className="text-xs text-muted-foreground mt-1">O código será gerado automaticamente na sequência (ex: 0047)</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Descrição *</label>
              <Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Filtro de ar 12000 BTU" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Unidade</label>
                <Select value={form.unidade || "__none__"} onValueChange={v => setForm(f => ({ ...f, unidade: v === "__none__" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Nenhuma —</SelectItem>
                    {UNIDADE_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Valor Unitário (R$)</label>
                <Input type="number" value={form.valor_unitario} onChange={e => setForm(f => ({ ...f, valor_unitario: e.target.value }))} placeholder="0,00" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Tipo de Sistema</label>
                <Select value={form.tipo_sistema || "__none__"} onValueChange={v => setForm(f => ({ ...f, tipo_sistema: v === "__none__" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Nenhum —</SelectItem>
                    {SISTEMA_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Categoria</label>
                <Select value={(form as any).categoria || "Material"} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Material">📦 Material</SelectItem>
                    <SelectItem value="Ferramenta">🔧 Ferramenta</SelectItem>
                    <SelectItem value="EPI">🦺 EPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Fornecedor</label>
              <Input value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} placeholder="Ex: Distribuidora XYZ" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Data de Compra</label>
                <Input type="date" value={form.data_compra} onChange={e => setForm(f => ({ ...f, data_compra: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Status</label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : editing ? "Salvar Alterações" : "Cadastrar Material"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}