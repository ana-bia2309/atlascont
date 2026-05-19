import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, ListChecks, GripVertical, Pencil } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/hooks/use-permissions";

const TIPO_SERVICO_OPTIONS = ["Elétrica", "Hidráulica", "Civil", "Climatização", "Outros"];

type Template = {
  id: string;
  tipo_servico: string;
  titulo: string;
  created_at: string;

  company_id?: string;
};

type TemplateItem = {
  id: string;
  template_id: string;
  descricao: string;
  ordem: number;
};

export default function ChecklistTemplates() {
  const { can } = usePermissions();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [titulo, setTitulo] = useState("");
  const [tipoServico, setTipoServico] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Items editor
  const [itemsDialogTemplate, setItemsDialogTemplate] = useState<Template | null>(null);
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [newItemDesc, setNewItemDesc] = useState("");

  const fetchTemplates = useCallback(async () => {
  setLoading(true);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setLoading(false);
    return;
  }

  const { data: profile }: any =
    await (supabase as any)
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();

  if (!profile?.company_id) {
    setLoading(false);
    return;
  }

  const { data } = await (supabase as any)
  .from("checklist_templates")
  .select("*")
  .eq("company_id", profile.company_id)
  .order("tipo_servico", {
    ascending: true,
  });

setTemplates(
  (data as Template[]) || []
);

setLoading(false);
}, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const openNew = () => {
    setEditingTemplate(null);
    setTitulo("");
    setTipoServico("");
    setDialogOpen(true);
  };

  const openEdit = (t: Template) => {
    setEditingTemplate(t);
    setTitulo(t.titulo);
    setTipoServico(t.tipo_servico);
    setDialogOpen(true);
  };

  const saveTemplate = async () => {
  if (
    !editingTemplate &&
    !can("checklist_templates.criar")
  ) {
    toast({
      title: "Sem permissão para criar",
      variant: "destructive",
    });

    return;
  }

  if (
    editingTemplate &&
    !can("checklist_templates.editar")
  ) {
    toast({
      title: "Sem permissão para editar",
      variant: "destructive",
    });

    return;
  }

  if (!titulo.trim() || !tipoServico)
    return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { data: profile }: any =
    await (supabase as any)
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();

  if (!profile?.company_id) return;

  if (editingTemplate) {
    await (supabase as any)
      .from("checklist_templates")
      .update({
        titulo: titulo.trim(),
        tipo_servico: tipoServico,
      })
      .eq("id", editingTemplate.id)
      .eq(
        "company_id",
        profile.company_id
      );
  } else {
    await (supabase as any)
      .from("checklist_templates")
      .insert({
        titulo: titulo.trim(),
        tipo_servico: tipoServico,
        company_id:
          profile.company_id,
      });
  }

  setDialogOpen(false);

  fetchTemplates();

  toast({
    title: editingTemplate
      ? "Template atualizado"
      : "Template criado",
  });
};

  const deleteTemplate = async () => {
    if (!deleteId) return;
    if (!can("checklist_templates.excluir")) { toast({ title: "Sem permissão para excluir", variant: "destructive" }); setDeleteId(null); return; }
    const {
  data: { user },
} = await supabase.auth.getUser();

if (!user) return;

const { data: profile }: any =
  await (supabase as any)
    .from("profiles")
    .select("company_id")
    .eq("user_id", user.id)
    .single();

if (!profile?.company_id) return;

await (supabase as any)
  .from("checklist_templates")
  .delete()
  .eq("id", deleteId)
  .eq(
    "company_id",
    profile.company_id
  );
    setDeleteId(null);
    fetchTemplates();
    toast({ title: "Template removido" });
  };

  // Items management
  const openItems = async (t: Template) => {
    setItemsDialogTemplate(t);
const { data } = await (supabase as any)
  .from("checklist_template_items")
  .select("*")
  .eq("template_id", t.id)
  .eq("company_id", t.company_id)
  .order("ordem", {
    ascending: true,
  });
    setItems((data as TemplateItem[]) || []);
  };

  const addTemplateItem = async () => {
    if (!newItemDesc.trim() || !itemsDialogTemplate) return;
  const { error } =
  await (supabase as any)
    .from("checklist_template_items")
    .insert({
      template_id:
        itemsDialogTemplate.id,

      company_id:
        itemsDialogTemplate.company_id,

      descricao:
        newItemDesc.trim(),

      ordem: items.length,
    });
    if (!error) {
      setNewItemDesc("");
      openItems(itemsDialogTemplate);
    }
  };

  const removeTemplateItem = async (id: string) => {
   await (supabase as any)
  .from("checklist_template_items")
  .delete()
  .eq("id", id)
  .eq(
    "company_id",
    itemsDialogTemplate?.company_id
  );
    setItems(prev => prev.filter(i => i.id !== id));
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Templates de Checklist</h1>
          <p className="text-muted-foreground text-sm">Crie checklists padrão por tipo de serviço</p>
        </div>
        {can("checklist_templates.criar") && (
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Novo Template
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : templates.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum template criado.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id} className="hover:border-primary/30 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-primary" />
                    {t.titulo}
                  </CardTitle>
                  <div className="flex gap-1">
                    {can("checklist_templates.editar") && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                    {can("checklist_templates.excluir") && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(t.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Badge variant="secondary" className="mb-3">{t.tipo_servico}</Badge>
                <Button variant="outline" size="sm" className="w-full" onClick={() => openItems(t)}>
                  Gerenciar Itens
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Template Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Editar Template" : "Novo Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Título</label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Checklist Climatização" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Tipo de Serviço</label>
              <Select value={tipoServico} onValueChange={setTipoServico}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {TIPO_SERVICO_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveTemplate} disabled={!titulo.trim() || !tipoServico}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Items Editor Dialog */}
      <Dialog open={!!itemsDialogTemplate} onOpenChange={(open) => !open && setItemsDialogTemplate(null)}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Itens — {itemsDialogTemplate?.titulo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {items.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">Nenhum item adicionado.</p>
            ) : (
              <div className="space-y-1">
                {items.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-2 py-1 group">
                    <span className="text-xs text-muted-foreground w-5 text-right">{idx + 1}.</span>
                    <span className="flex-1 text-sm">{item.descricao}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => removeTemplateItem(item.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Novo item do checklist..."
                value={newItemDesc}
                onChange={(e) => setNewItemDesc(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTemplateItem()}
                className="h-8 text-sm"
              />
              <Button size="sm" onClick={addTemplateItem} disabled={!newItemDesc.trim()} className="h-8">
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemsDialogTemplate(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação removerá o template e todos os seus itens.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteTemplate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
