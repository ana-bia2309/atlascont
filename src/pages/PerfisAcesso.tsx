import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/hooks/use-company";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Plus, Pencil, Trash2, RefreshCw, ShieldCheck, Settings2, Users, Eye,
  ChevronRight, Menu,
} from "@/lib/icons";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { MENU_ITEMS_TREE, ALL_MENU_KEYS } from "@/lib/menu-permissions";
import { PERMISSION_SCREENS, ALL_PERMISSIONS, ACTION_LABELS } from "@/hooks/use-permissions";

const ALL_PERMISSION_KEYS = ALL_PERMISSIONS;

type PerfilAcesso = {
  id: string;
  nome: string;
  descricao: string | null;
  created_at: string;
  _count: number;
  _permissions: string[];
};

/* ── Helpers ── */
function permissionSummary(perms: string[]) {
  if (perms.length === 0) return "Nenhuma permissão";
  if (perms.length === ALL_PERMISSION_KEYS.length) return "Acesso total";
  return `${perms.length}/${ALL_PERMISSION_KEYS.length} permissões`;
}

function screenSummary(perms: string[], screen: typeof PERMISSION_SCREENS[number]) {
  const keys = screen.actions.map((a) => `${screen.screen}.${a}`);
  const active = keys.filter((k) => perms.includes(k)).length;
  return { active, total: keys.length };
}

export default function PerfisAcesso() {
  const { can } = usePermissions();
  const { companyId } = useCompany();
  const [perfis, setPerfis] = useState<PerfilAcesso[]>([]);
  const [loading, setLoading] = useState(true);

  // form
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PerfilAcesso | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");

  // delete
  const [deleteTarget, setDeleteTarget] = useState<PerfilAcesso | null>(null);

  // permissions dialog
  const [permDialogPerfil, setPermDialogPerfil] = useState<PerfilAcesso | null>(null);
  const [permSelected, setPermSelected] = useState<Set<string>>(new Set());
  const [menuPermSelected, setMenuPermSelected] = useState<Set<string>>(new Set());
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);

  // expanded card
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchPerfis = useCallback(async () => {
    if (!companyId) return; // ✅ guard: não executa com companyId nulo
    setLoading(true);
    const [perfisRes, profilesRes, permsRes] = await Promise.all([
      (supabase as any).from("perfis_acesso").select("*").eq("company_id", companyId).order("nome"),
      (supabase as any).from("profiles").select("perfil_acesso_id").eq("company_id", companyId),
      (supabase as any).from("permissoes_perfil").select("perfil_acesso_id, permissao"),
    ]);

    if (perfisRes.error) {
      toast({ title: "Erro ao carregar perfis", variant: "destructive" });
      setLoading(false);
      return;
    }

    const countMap: Record<string, number> = {};
    (profilesRes.data || []).forEach((p: any) => {
      if (p.perfil_acesso_id) countMap[p.perfil_acesso_id] = (countMap[p.perfil_acesso_id] || 0) + 1;
    });

    const permsMap: Record<string, string[]> = {};
    (permsRes.data || []).forEach((p: any) => {
      if (!permsMap[p.perfil_acesso_id]) permsMap[p.perfil_acesso_id] = [];
      permsMap[p.perfil_acesso_id].push(p.permissao);
    });

    setPerfis(
      (perfisRes.data || []).map((d: any) => ({
        ...d,
        _count: countMap[d.id] || 0,
        _permissions: permsMap[d.id] || [],
      }))
    );
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchPerfis(); }, [fetchPerfis]);

  const resetForm = () => { setNome(""); setDescricao(""); setEditing(null); setDialogOpen(false); };
  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (p: PerfilAcesso) => { setEditing(p); setNome(p.nome); setDescricao(p.descricao || ""); setDialogOpen(true); };

  const handleSave = async () => {
    if (!nome.trim()) { toast({ title: "Informe o nome do perfil", variant: "destructive" }); return; }
    if (editing) {
      const { error } = await (supabase as any).from("perfis_acesso").update({ nome: nome.trim(), descricao: descricao.trim() || null }).eq("id", editing.id);
      if (error) { toast({ title: error.message.includes("unique") ? "Já existe um perfil com este nome" : "Erro ao atualizar", variant: "destructive" }); return; }
      toast({ title: "Perfil atualizado" });
    } else {
      const { error } = await (supabase as any).from("perfis_acesso").insert({ nome: nome.trim(), descricao: descricao.trim() || null, company_id: companyId });
      if (error) { toast({ title: error.message.includes("unique") ? "Já existe um perfil com este nome" : "Erro ao criar", variant: "destructive" }); return; }
      toast({ title: "Perfil criado com sucesso" });
    }
    resetForm();
    fetchPerfis();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if ((deleteTarget._count || 0) > 0) { toast({ title: "Perfil em uso. Remova o vínculo antes.", variant: "destructive" }); setDeleteTarget(null); return; }
    const { error } = await (supabase as any).from("perfis_acesso").delete().eq("id", deleteTarget.id);
    if (error) toast({ title: "Erro ao excluir", variant: "destructive" });
    else toast({ title: "Perfil excluído" });
    setDeleteTarget(null);
    fetchPerfis();
  };

  /* ── Permissions ── */
  const openPermissions = async (p: PerfilAcesso) => {
    setPermDialogPerfil(p);
    setPermLoading(true);
    const [permsRes, menuPermsRes] = await Promise.all([
      (supabase as any).from("permissoes_perfil").select("permissao").eq("perfil_acesso_id", p.id),
      (supabase as any).from("permissoes_menu_perfil").select("menu_key").eq("perfil_acesso_id", p.id),
    ]);
    setPermSelected(new Set((permsRes.data || []).map((d: any) => d.permissao)));
    setMenuPermSelected(new Set((menuPermsRes.data || []).map((d: any) => d.menu_key)));
    setPermLoading(false);
  };

  const togglePerm = (key: string) => {
    setPermSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleAllGroup = (keys: string[]) => {
    setPermSelected((prev) => {
      const next = new Set(prev);
      const allChecked = keys.every((k) => next.has(k));
      keys.forEach((k) => { if (allChecked) next.delete(k); else next.add(k); });
      return next;
    });
  };

  const selectAll = () => setPermSelected(new Set(ALL_PERMISSION_KEYS));
  const clearAll = () => setPermSelected(new Set());

  const savePermissions = async () => {
    if (!permDialogPerfil) return;

    // ✅ guard: garante que companyId existe antes de salvar
    if (!companyId) {
      toast({ title: "Erro: empresa não identificada. Recarregue a página.", variant: "destructive" });
      return;
    }

    setPermSaving(true);

    // Save action permissions
    await (supabase as any).from("permissoes_perfil").delete().eq("perfil_acesso_id", permDialogPerfil.id);
    if (permSelected.size > 0) {
     const rows = Array.from(permSelected).map((p) => ({
  perfil_acesso_id: permDialogPerfil.id,
  permissao: p,
}));
      const { error } = await (supabase as any).from("permissoes_perfil").insert(rows);
      if (error) {
        console.error("Erro permissoes_perfil:", error);
        toast({ title: "Erro ao salvar permissões", variant: "destructive" });
        setPermSaving(false);
        return;
      }
    }

    // Save menu permissions
    await (supabase as any).from("permissoes_menu_perfil").delete().eq("perfil_acesso_id", permDialogPerfil.id);
    if (menuPermSelected.size > 0) {
    const menuRows = Array.from(menuPermSelected).map((k) => ({
  perfil_acesso_id: permDialogPerfil.id,
  menu_key: k,
}));
      const { error } = await (supabase as any).from("permissoes_menu_perfil").insert(menuRows);
      if (error) {
        console.error("Erro permissoes_menu_perfil:", error);
        toast({ title: "Erro ao salvar permissões de menu", variant: "destructive" });
        setPermSaving(false);
        return;
      }
    }

    toast({ title: "Permissões salvas com sucesso" });
    setPermSaving(false);
    setPermDialogPerfil(null);
    fetchPerfis();
  };

  if (!can("perfis_acesso.visualizar")) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          Acesso restrito.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Perfis de Acesso</h1>
            <p className="text-sm text-muted-foreground">
              {perfis.length} {perfis.length === 1 ? "perfil cadastrado" : "perfis cadastrados"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchPerfis} title="Atualizar">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Novo Perfil
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{perfis.length}</p>
                <p className="text-xs text-muted-foreground">Perfis criados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{perfis.reduce((sum, p) => sum + p._count, 0)}</p>
                <p className="text-xs text-muted-foreground">Usuários vinculados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <Eye className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{ALL_PERMISSION_KEYS.length}</p>
                <p className="text-xs text-muted-foreground">Permissões disponíveis</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Profile List */}
      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : perfis.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">Nenhum perfil cadastrado.</p>
          <Button variant="outline" className="mt-4" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Criar primeiro perfil
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {perfis.map((p) => {
            const isExpanded = expandedId === p.id;
            return (
              <Card key={p.id} className={cn("transition-all", isExpanded && "ring-1 ring-primary/30")}>
                <CardContent className="p-0">
                  {/* Profile Row */}
                  <div className="flex items-center gap-4 p-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <ShieldCheck className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{p.nome}</h3>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          <Users className="h-3 w-3 mr-1" />
                          {p._count} {p._count === 1 ? "usuário" : "usuários"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {p.descricao || "Sem descrição"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          p._permissions.length === ALL_PERMISSION_KEYS.length
                            ? "border-emerald-500/30 text-emerald-600"
                            : p._permissions.length === 0
                              ? "border-destructive/30 text-destructive"
                              : "border-primary/30 text-primary"
                        )}
                      >
                        {permissionSummary(p._permissions)}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedId(isExpanded ? null : p.id)}
                        className="text-muted-foreground"
                      >
                        <ChevronRight className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-90")} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openPermissions(p)} title="Editar permissões">
                        <Settings2 className="h-4 w-4 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Editar perfil">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(p)} title="Excluir">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {/* Expandable Permission Summary */}
                  {isExpanded && (
                    <div className="border-t px-4 py-4">
                      <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                        Resumo de permissões
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {PERMISSION_SCREENS.map((screen) => {
                          const { active, total } = screenSummary(p._permissions, screen);
                          const hasNone = active === 0;
                          const hasAll = active === total;
                          return (
                            <div
                              key={screen.screen}
                              className={cn(
                                "rounded-lg border p-3 transition-colors",
                                hasNone && "border-border/50 opacity-50",
                                hasAll && "border-emerald-500/30 bg-emerald-500/5",
                                !hasNone && !hasAll && "border-primary/20 bg-primary/5",
                              )}
                            >
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-xs font-semibold">{screen.label}</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {screen.actions.map((action) => {
                                  const key = `${screen.screen}.${action}`;
                                  const isActive = p._permissions.includes(key);
                                  return (
                                    <span
                                      key={key}
                                      className={cn(
                                        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                                        isActive
                                          ? "bg-emerald-500/15 text-emerald-600"
                                          : "bg-muted text-muted-foreground/50 line-through"
                                      )}
                                    >
                                      {ACTION_LABELS[action] || action}
                                    </span>
                                  );
                                })}
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-1.5">
                                {active}/{total} ativas
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Perfil" : "Novo Perfil de Acesso"}</DialogTitle>
            <DialogDescription>
              {editing ? "Altere o nome e descrição do perfil." : "Crie um novo perfil de acesso para organizar permissões."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome do perfil *</label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Almoxarifado, Supervisor, Fiscal..." />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição</label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Breve descrição do perfil" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={!!permDialogPerfil} onOpenChange={(open) => { if (!open) setPermDialogPerfil(null); }}>
        <DialogContent className="sm:max-w-[620px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Permissões — {permDialogPerfil?.nome}
            </DialogTitle>
            <DialogDescription>
              Marque as permissões que este perfil deve ter. Usuários vinculados herdarão essas permissões automaticamente.
            </DialogDescription>
          </DialogHeader>
          {permLoading ? (
            <p className="text-muted-foreground py-4">Carregando permissões...</p>
          ) : (
            <>
              <div className="flex items-center gap-2 pb-2">
                <Button variant="outline" size="sm" onClick={selectAll}>Marcar todas</Button>
                <Button variant="outline" size="sm" onClick={clearAll}>Desmarcar todas</Button>
                <span className="ml-auto text-xs text-muted-foreground">
                  {permSelected.size}/{ALL_PERMISSION_KEYS.length} selecionadas
                </span>
              </div>

              <Accordion type="multiple" defaultValue={PERMISSION_SCREENS.map((s) => s.screen)} className="space-y-1">
                {PERMISSION_SCREENS.map((screen) => {
                  const screenKeys = screen.actions.map((a) => `${screen.screen}.${a}`);
                  const allChecked = screenKeys.every((k) => permSelected.has(k));
                  const someChecked = screenKeys.some((k) => permSelected.has(k));
                  const checkedCount = screenKeys.filter((k) => permSelected.has(k)).length;

                  return (
                    <AccordionItem key={screen.screen} value={screen.screen} className="rounded-lg border px-3">
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-3 flex-1">
                          <Checkbox
                            checked={allChecked ? true : someChecked ? "indeterminate" : false}
                            onCheckedChange={() => toggleAllGroup(screenKeys)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="text-sm font-semibold">{screen.label}</span>
                          <Badge variant="secondary" className="text-[10px] ml-auto mr-2">
                            {checkedCount}/{screenKeys.length}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pb-2 pl-9">
                          {screen.actions.map((action) => {
                            const key = `${screen.screen}.${action}`;
                            return (
                              <label
                                key={key}
                                className={cn(
                                  "flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1.5 transition-colors",
                                  permSelected.has(key)
                                    ? "bg-primary/5 text-foreground"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                                )}
                              >
                                <Checkbox
                                  checked={permSelected.has(key)}
                                  onCheckedChange={() => togglePerm(key)}
                                />
                                {ACTION_LABELS[action] || action}
                              </label>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>

              {/* ── Menu Permissions Section ── */}
              <div className="border-t pt-4 mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Menu className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Permissões de Menu</h3>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {menuPermSelected.size}/{ALL_MENU_KEYS.length} itens visíveis
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <Button variant="outline" size="sm" onClick={() => setMenuPermSelected(new Set(ALL_MENU_KEYS))}>Marcar todos</Button>
                  <Button variant="outline" size="sm" onClick={() => setMenuPermSelected(new Set())}>Desmarcar todos</Button>
                </div>
                <div className="space-y-2">
                  {MENU_ITEMS_TREE.map((item) => {
                    const hasChildren = item.children.length > 0;
                    const childKeys = item.children.map((c) => c.key);
                    const allChildrenChecked = hasChildren && childKeys.every((k) => menuPermSelected.has(k));
                    const someChildrenChecked = hasChildren && childKeys.some((k) => menuPermSelected.has(k));

                    const toggleParent = () => {
                      setMenuPermSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.key)) {
                          next.delete(item.key);
                          childKeys.forEach((k) => next.delete(k));
                        } else {
                          next.add(item.key);
                          childKeys.forEach((k) => next.add(k));
                        }
                        return next;
                      });
                    };

                    const toggleChild = (childKey: string) => {
                      setMenuPermSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(childKey)) {
                          next.delete(childKey);
                        } else {
                          next.add(childKey);
                          next.add(item.key);
                        }
                        return next;
                      });
                    };

                    return (
                      <div key={item.key} className="rounded-lg border px-3 py-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={
                              menuPermSelected.has(item.key)
                                ? hasChildren
                                  ? allChildrenChecked ? true : someChildrenChecked ? "indeterminate" : true
                                  : true
                                : false
                            }
                            onCheckedChange={toggleParent}
                          />
                          <span className="text-sm font-medium">{item.label}</span>
                        </label>
                        {hasChildren && menuPermSelected.has(item.key) && (
                          <div className="ml-6 mt-2 space-y-1">
                            {item.children.map((child) => (
                              <label key={child.key} className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                                <Checkbox
                                  checked={menuPermSelected.has(child.key)}
                                  onCheckedChange={() => toggleChild(child.key)}
                                />
                                {child.label}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
          <DialogFooter>
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-muted-foreground">
                {permSelected.size} de {ALL_PERMISSION_KEYS.length} permissões ativas
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPermDialogPerfil(null)}>Cancelar</Button>
                <Button onClick={savePermissions} disabled={permSaving}>
                  {permSaving ? "Salvando..." : "Salvar Permissões"}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir perfil "{deleteTarget?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {(deleteTarget?._count || 0) > 0
                ? `Este perfil está em uso por ${deleteTarget?._count} usuário(s). Remova o vínculo dos usuários antes de excluir.`
                : "Esta ação não pode ser desfeita. Todas as permissões vinculadas também serão removidas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={(deleteTarget?._count || 0) > 0}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}