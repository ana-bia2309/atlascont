import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, RefreshCw, Settings2, ChevronLeft } from "@/lib/icons";
import { cn } from "@/lib/utils";

const TIPOS_PADRAO = [
  "Ar-condicionado", "Bombeamento hidráulico", "Bebedouro", "Elétrico",
  "Hidrossanitário", "Incêndio", "Elevador", "Gerador", "CFTV",
  "Controle de acesso", "Climatização", "Exaustão", "Refrigeração",
  "Ventilação", "Hidráulica", "Outro",
];

type TipoSistema = {
  id: string;
  nome: string;
  descricao: string | null;
  status: string;
  created_at: string;
};

export default function TiposSistema() {
  const [list, setList] = useState<TipoSistema[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TipoSistema | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [status, setStatus] = useState("ativo");
  const [companyId, setCompanyId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: profile }: any = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
    if (!profile?.company_id) { setLoading(false); return; }
    setCompanyId(profile.company_id);

    const { data, error } = await (supabase as any)
      .from("tipos_sistema")
      .select("*")
      .eq("company_id", profile.company_id)
      .order("nome");

    if (error) toast({ title: "Erro ao carregar tipos", variant: "destructive" });
    else setList(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Popula tipos padrão se não houver nenhum
  useEffect(() => {
    if (!loading && list.length === 0 && companyId) {
      const inserirPadrao = async () => {
        const payload = TIPOS_PADRAO.map(nome => ({ company_id: companyId, nome, status: "ativo" }));
        await (supabase as any).from("tipos_sistema").insert(payload);
        fetchData();
      };
      inserirPadrao();
    }
  }, [loading, list.length, companyId]);

  const handleSave = async () => {
    if (!nome.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    if (!companyId) return;

    const payload = { company_id: companyId, nome: nome.trim(), descricao: descricao.trim() || null, status };

    if (editing) {
      const { error } = await (supabase as any).from("tipos_sistema").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro ao atualizar", variant: "destructive" }); return; }
      toast({ title: "Tipo atualizado" });
    } else {
      const { error } = await (supabase as any).from("tipos_sistema").insert(payload);
      if (error) { toast({ title: "Erro ao cadastrar", variant: "destructive" }); return; }
      toast({ title: "Tipo cadastrado" });
    }
    setOpen(false); setEditing(null); setNome(""); setDescricao(""); setStatus("ativo");
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja excluir este tipo?")) return;
    const { error } = await (supabase as any).from("tipos_sistema").delete().eq("id", id);
    if (error) { toast({ title: "Erro ao excluir", variant: "destructive" }); return; }
    toast({ title: "Tipo excluído" }); fetchData();
  };

  const openEdit = (t: TipoSistema) => {
    setEditing(t); setNome(t.nome); setDescricao(t.descricao || ""); setStatus(t.status); setOpen(true);
  };

  const openNew = () => { setEditing(null); setNome(""); setDescricao(""); setStatus("ativo"); setOpen(true); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Settings2 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Tipos de Sistema</h1>
            <p className="text-sm text-muted-foreground">Gerencie os tipos de sistema vinculados a ativos, materiais e O.S.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo Tipo</Button>
        </div>
      </div>

      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : list.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum tipo cadastrado</TableCell></TableRow>
            ) : list.map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.nome}</TableCell>
                <TableCell className="text-muted-foreground">{t.descricao || "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn(
                    t.status === "ativo" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-zinc-100 text-zinc-600 border-zinc-200"
                  )}>
                    {t.status === "ativo" ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Tipo" : "Novo Tipo de Sistema"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome *</label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Climatização" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição</label>
              <Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição opcional" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="w-full" onClick={handleSave}>{editing ? "Salvar" : "Cadastrar"}</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}