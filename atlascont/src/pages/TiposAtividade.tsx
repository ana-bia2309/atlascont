import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, RefreshCw, ClipboardList } from "@/lib/icons";
import { cn } from "@/lib/utils";

type TipoAtividade = {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
};

export default function TiposAtividade() {
  const [tipos, setTipos] = useState<TipoAtividade[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TipoAtividade | null>(null);
  const [nome, setNome] = useState("");

 const fetchData = useCallback(async () => {
  setLoading(true);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setLoading(false);
    return;
  }

  const { data: profile }: any = await (supabase as any)
    .from("profiles")
    .select("company_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.company_id) {
    setLoading(false);
    return;
  }

  const companyId = profile.company_id;

  const { data } = await (supabase as any)
    .from("tipos_atividade")
    .select("*")
    .eq("company_id", companyId)
    .order("nome");

  setTipos((data as any[]) || []);

  setLoading(false);
}, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => { setNome(""); setEditing(null); };

  const openCreate = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (t: TipoAtividade) => {
    setEditing(t);
    setNome(t.nome);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!nome.trim()) {
      toast({ title: "Preencha o nome do tipo de atividade", variant: "destructive" });
      return;
    }

    if (editing) {
      const result = await (supabase as any)
        .from("tipos_atividade" as any)
        .update({ nome: nome.trim() } as any)
        .eq("id", editing.id);
     if (result.error) { toast({ title: "Erro ao atualizar", description: result.error.message, variant: "destructive" }); return; }
      toast({ title: "Tipo de atividade atualizado!" });
    } else {
      const result = await (supabase as any)
        .from("tipos_atividade" as any)
        const {
  data: { user },
} = await supabase.auth.getUser();

if (!deleteId) return;

const { data: profile }: any = await (supabase as any)
  .from("profiles")
  .select("company_id")
  .eq("user_id", user.id)
  .single();

if (!profile?.company_id) return;

const { error } = await (supabase as any)
  .from("tipos_atividade")
  .insert({
    nome: nome.trim(),
    company_id: profile.company_id,
  });
      if (error) {
        if (error.message.includes("duplicate") || error.message.includes("unique")) {
          toast({ title: "Esse tipo já existe", variant: "destructive" });
        } else {
          toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
        }
        return;
      }
      toast({ title: "Tipo de atividade criado!" });
    }

    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const result = await (supabase as any).from("tipos_atividade" as any).delete().eq("id", deleteId);
    if (result.error) toast({ title: "Erro ao excluir", description: result.error.message, variant: "destructive" });
    else toast({ title: "Tipo de atividade excluído" });
    setDeleteId(null);
    fetchData();
  };

 const toggleAtivo = async (t: TipoAtividade) => {
  const result = await (supabase as any)
    .from("tipos_atividade")
    .update({
      ativo: !t.ativo,
    } as any)
    .eq("id", t.id);

  if (result.error) {
    toast({
      title: "Erro",
      description: result.error.message,
      variant: "destructive",
    });
  } else {
    toast({
      title: t.ativo
        ? "Tipo desativado"
        : "Tipo ativado",
    });

    fetchData();
  }
};

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Tipos de Atividade</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchData} title="Atualizar">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Novo Tipo
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : tipos.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhum tipo de atividade cadastrado.</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-[150px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tipos.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.nome}</TableCell>
                  <TableCell>
                    <Badge variant={t.ativo ? "default" : "secondary"} className="text-xs cursor-pointer" onClick={() => toggleAtivo(t)}>
                      {t.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(t.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Tipo de Atividade" : "Novo Tipo de Atividade"}</DialogTitle>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium mb-1 block">Nome *</label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Inspeção Visual" onKeyDown={e => e.key === "Enter" && handleSave()} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editing ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tipo de atividade?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
