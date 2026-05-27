import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, RefreshCw, Search, X, Package, ChevronLeft } from "@/lib/icons";
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
  status: string;
  created_at: string;
};

const emptyForm = {
  codigo: "",
  descricao: "",
  unidade: "",
  valor_unitario: "",
  tipo_sistema: "",
  status: "ativo",
};

export default function Materiais() {
  const { can } = usePermissions();
  const [list, setList] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSistema, setFilterSistema] = useState("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: profile }: any = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
    if (!profile?.company_id) { setLoading(false); return; }

    const { data, error } = await (supabase as any)
      .from("materiais")
      .select("*")
      .eq("company_id", profile.company_id)
      .order("descricao");

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile }: any = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
    if (!profile?.company_id) return;

    const payload: any = {
      company_id: profile.company_id,
      codigo: form.codigo.trim() || null,
      descricao: form.descricao.trim(),
      unidade: form.unidade || null,
      valor_unitario: form.valor_unitario ? Number(form.valor_unitario) : null,
      tipo_sistema: form.tipo_sistema || null,
      status: form.status,
    };

    if (editing) {
      const { error } = await (supabase as any).from("materiais").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Material atualizado" });
    } else {
      const { error } = await (supabase as any).from("materiais").insert(payload);
      if (error) { toast({ title: "Erro ao cadastrar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Material cadastrado" });
    }
    setOpen(false); setEditing(null); setForm(emptyForm); fetchData();
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
      codigo: m.codigo || "",
      descricao: m.descricao,
      unidade: m.unidade || "",
      valor_unitario: m.valor_unitario?.toString() || "",
      tipo_sistema: m.tipo_sistema || "",
      status: m.status,
    });
    setOpen(true);
  };

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };

  const filtered = useMemo(() => {
    return list.filter(m => {
      if (filterStatus !== "all" && m.status !== filterStatus) return false;
      if (filterSistema !== "all" && m.tipo_sistema !== filterSistema) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase();
        if (![m.descricao, m.codigo, m.tipo_sistema].some(f => (f || "").toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [list, filterStatus, filterSistema, filterSearch]);

  const hasFilters = filterStatus !== "all" || filterSistema !== "all" || filterSearch.trim() !== "";

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
            <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Descrição, código..." className="pl-9" />
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
          <Button variant="ghost" size="sm" onClick={() => { setFilterSearch(""); setFilterStatus("all"); setFilterSistema("all"); }}>
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
              <TableHead>Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Valor Unit.</TableHead>
              <TableHead>Sistema</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum material encontrado</TableCell></TableRow>
            ) : filtered.map(m => (
              <TableRow key={m.id}>
                <TableCell className="font-mono text-sm">{m.codigo || "—"}</TableCell>
                <TableCell className="font-medium">{m.descricao}</TableCell>
                <TableCell>{m.unidade || "—"}</TableCell>
                <TableCell>{m.valor_unitario != null ? `R$ ${Number(m.valor_unitario).toFixed(2)}` : "—"}</TableCell>
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Material" : "Novo Material"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Código do Material</label>
                <Input value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} placeholder="Ex: MAT-001" />
              </div>
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
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição *</label>
              <Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Filtro de ar 12000 BTU" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Valor Unitário (R$)</label>
                <Input type="number" value={form.valor_unitario} onChange={e => setForm(f => ({ ...f, valor_unitario: e.target.value }))} placeholder="0,00" />
              </div>
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
          <Button className="w-full" onClick={handleSave}>{editing ? "Salvar Alterações" : "Cadastrar Material"}</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}