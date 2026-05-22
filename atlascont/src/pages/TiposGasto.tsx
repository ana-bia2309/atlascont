import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { useRealtime } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Tags, RefreshCw } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type TipoGasto = {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
};

export default function TiposGasto() {
  const { can } = usePermissions();
  const [tipos, setTipos] = useState<TipoGasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TipoGasto | null>(null);
  const [nome, setNome] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tipos_gasto")
      .select("*")
      .order("nome");
    if (error) {
      toast({ title: "Erro ao carregar tipos", description: error.message, variant: "destructive" });
    } else {
      setTipos((data as TipoGasto[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useRealtime(["tipos_gasto"], fetchData);

  const resetForm = () => { setNome(""); setEditing(null); };

  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (t: TipoGasto) => {
    setEditing(t);
    setNome(t.nome);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editing && !can("tipos_gasto.criar")) { toast({ title: "Sem permissão para criar", variant: "destructive" }); return; }
    if (editing && !can("tipos_gasto.editar")) { toast({ title: "Sem permissão para editar", variant: "destructive" }); return; }
    if (!nome.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    if (editing) {
      const { error } = await supabase.from("tipos_gasto").update({ nome: nome.trim() }).eq("id", editing.id);
      if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Tipo atualizado" });
    } else {
      const { error } = await supabase.from("tipos_gasto").insert({ nome: nome.trim() });
      if (error) { toast({ title: "Erro ao criar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Tipo criado" });
    }
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleToggleAtivo = async (t: TipoGasto) => {
    if (!can("tipos_gasto.editar")) { toast({ title: "Sem permissão para editar", variant: "destructive" }); return; }
    const { error } = await supabase.from("tipos_gasto").update({ ativo: !t.ativo }).eq("id", t.id);
    if (error) { toast({ title: "Erro ao alterar status", description: error.message, variant: "destructive" }); return; }
    toast({ title: t.ativo ? "Tipo desativado" : "Tipo ativado" });
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    if (!can("tipos_gasto.excluir")) { toast({ title: "Sem permissão para excluir", variant: "destructive" }); setDeleteId(null); return; }
    const { error } = await supabase.from("tipos_gasto").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message.includes("violates foreign key") ? "Este tipo está vinculado a gastos existentes. Desative-o em vez de excluir." : error.message, variant: "destructive" });
    } else {
      toast({ title: "Tipo excluído" });
      fetchData();
    }
    setDeleteId(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Tags className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Tipos de Gasto</h1>
            <p className="text-sm text-muted-foreground">{tipos.length} tipos cadastrados</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchData} title="Atualizar">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          {can("tipos_gasto.criar") && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Novo Tipo
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : tipos.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <Tags className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">Nenhum tipo de gasto cadastrado.</p>
          <Button variant="outline" className="mt-4" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Cadastrar primeiro tipo
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[160px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tipos.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.nome}</TableCell>
                  <TableCell>
                    <Badge variant={t.ativo ? "default" : "secondary"}>
                      {t.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Switch checked={t.ativo} onCheckedChange={() => handleToggleAtivo(t)} title={t.ativo ? "Desativar" : "Ativar"} />
                      {can("tipos_gasto.editar") && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(t)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {can("tipos_gasto.excluir") && (
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(t.id)} title="Excluir">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Tipo" : "Novo Tipo de Gasto"}</DialogTitle>
            <DialogDescription>{editing ? "Altere o nome do tipo." : "Cadastre um novo tipo de gasto."}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium mb-1 block">Nome</label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Combustível" onKeyDown={(e) => e.key === "Enter" && handleSave()} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tipo de gasto?</AlertDialogTitle>
            <AlertDialogDescription>Se houver gastos vinculados, a exclusão falhará. Nesse caso, desative o tipo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
