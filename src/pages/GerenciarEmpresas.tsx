import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Plus, Pencil, RefreshCw, Building2, Users, Eye } from "@/lib/icons";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const SUPER_ADMIN_EMAIL = "anafranca00@icloud.com";

interface Company {
  id: string;
  name: string;
  cnpj: string | null;
  endereco: string | null;
  telefone: string | null;
  is_active: boolean;
  created_at: string;
  owner_id: string | null;
  user_count?: number;
}

const formatCnpj = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

const formatTelefone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export default function GerenciarEmpresas() {
  const { session } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewingOpen, setViewingOpen] = useState(false);
  const [viewing, setViewing] = useState<Company | null>(null);
  const [editing, setEditing] = useState<Company | null>(null);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState("");
  const [formCnpj, setFormCnpj] = useState("");
  const [formEndereco, setFormEndereco] = useState("");
  const [formTelefone, setFormTelefone] = useState("");
  const [formAdminEmail, setFormAdminEmail] = useState("");
  const [formAdminNome, setFormAdminNome] = useState("");

  const isSuperAdmin = session?.user?.email === SUPER_ADMIN_EMAIL;

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const { data: companiesData, error } = await (supabase as any)
        .from("companies")
        .select("id, name, cnpj, endereco, telefone, is_active, created_at, owner_id")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const { data: profilesData } = await (supabase as any)
        .from("profiles")
        .select("company_id");

      const countMap: Record<string, number> = {};
      (profilesData || []).forEach((p: any) => {
        if (p.company_id) countMap[p.company_id] = (countMap[p.company_id] || 0) + 1;
      });

      setCompanies((companiesData || []).map((c: any) => ({
        ...c,
        user_count: countMap[c.id] || 0,
      })));
    } catch (err: any) {
      toast({ title: "Erro ao carregar empresas", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) fetchCompanies();
    else setLoading(false);
  }, [isSuperAdmin, fetchCompanies]);

  const resetForm = () => {
    setFormName(""); setFormCnpj(""); setFormEndereco("");
    setFormTelefone(""); setFormAdminEmail(""); setFormAdminNome("");
    setEditing(null);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };

  const openView = (company: Company) => {
    setViewing(company);
    setViewingOpen(true);
  };

  const openEdit = (company: Company) => {
    setEditing(company);
    setFormName(company.name);
    setFormCnpj(company.cnpj ? formatCnpj(company.cnpj) : "");
    setFormEndereco(company.endereco || "");
    setFormTelefone(company.telefone ? formatTelefone(company.telefone) : "");
    setFormAdminEmail("");
    setFormAdminNome("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast({ title: "Nome da empresa é obrigatório", variant: "destructive" });
      return;
    }
    if (!editing && !formAdminEmail.trim()) {
      toast({ title: "Email do administrador é obrigatório", variant: "destructive" });
      return;
    }
    if (!editing && !formAdminNome.trim()) {
      toast({ title: "Nome do administrador é obrigatório", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const { error } = await (supabase as any)
          .from("companies")
          .update({
            name: formName.trim(),
            cnpj: formCnpj.replace(/\D/g, "") || null,
            endereco: formEndereco.trim() || null,
            telefone: formTelefone.replace(/\D/g, "") || null,
          })
          .eq("id", editing.id);

        if (error) throw error;
        toast({ title: "Empresa atualizada com sucesso" });
      } else {
        const { data: newCompany, error: companyError } = await (supabase as any)
          .from("companies")
          .insert({
            name: formName.trim(),
            cnpj: formCnpj.replace(/\D/g, "") || null,
            endereco: formEndereco.trim() || null,
            telefone: formTelefone.replace(/\D/g, "") || null,
            is_active: true,
          })
          .select("id")
          .single();

        if (companyError) throw companyError;

        const { data, error: fnError } = await supabase.functions.invoke("invite-user", {
          body: {
            nome: formAdminNome.trim(),
            cpf: "00000000000",
            email: formAdminEmail.trim(),
            role: "administrador",
          },
        });

        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);

        if (data?.profile_id) {
          await (supabase as any)
            .from("profiles")
            .update({ company_id: newCompany.id })
            .eq("id", data.profile_id);

          await (supabase as any)
            .from("user_roles")
            .update({ company_id: newCompany.id })
            .eq("user_id", data.profile_id);
        }

        await (supabase as any)
          .from("companies")
          .update({ owner_id: data?.userId || null })
          .eq("id", newCompany.id);

        toast({
          title: "Empresa criada com sucesso!",
          description: `Convite enviado para ${formAdminEmail.trim()}.`,
        });
      }

      setDialogOpen(false);
      resetForm();
      fetchCompanies();
    } catch (err: any) {
      toast({ title: "Erro ao salvar empresa", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (company: Company) => {
    const { error } = await (supabase as any)
      .from("companies")
      .update({ is_active: !company.is_active })
      .eq("id", company.id);

    if (error) {
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
    } else {
      toast({ title: company.is_active ? "Empresa desativada" : "Empresa reativada" });
      fetchCompanies();
    }
  };

  const fmtDate = (d: string) => {
    try { return format(new Date(d), "dd/MM/yyyy"); } catch { return "—"; }
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Acesso restrito.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Gerenciar Empresas</h1>
            <p className="text-sm text-muted-foreground">Painel exclusivo — Super Admin</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchCompanies} title="Atualizar">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Nova Empresa
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total de Empresas</p>
          <p className="text-3xl font-bold">{companies.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Empresas Ativas</p>
          <p className="text-3xl font-bold text-emerald-600">{companies.filter(c => c.is_active).length}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : companies.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma empresa cadastrada.</p>
      ) : (
        <div className="rounded-lg border bg-card overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Usuários</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{company.name}</p>
                      {company.endereco && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{company.endereco}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {company.cnpj ? formatCnpj(company.cnpj) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {company.telefone ? formatTelefone(company.telefone) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">{company.user_count}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("text-xs cursor-pointer", company.is_active
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-destructive/15 text-destructive border-destructive/30"
                      )}
                      onClick={() => handleToggleActive(company)}
                    >
                      {company.is_active ? "Ativa" : "Inativa"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(company.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon" onClick={() => openView(company)} title="Ver detalhes">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(company)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog Visualizar */}
      <Dialog open={viewingOpen} onOpenChange={(open) => { if (!open) { setViewingOpen(false); setViewing(null); } }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Detalhes da Empresa</DialogTitle>
            <DialogDescription className="sr-only">Informações da empresa.</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 py-2 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <span className="text-muted-foreground">Nome:</span>{" "}
                  <span className="font-medium">{viewing.name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">CNPJ:</span>{" "}
                  <span className="font-medium">{viewing.cnpj ? formatCnpj(viewing.cnpj) : "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Telefone:</span>{" "}
                  <span className="font-medium">{viewing.telefone ? formatTelefone(viewing.telefone) : "—"}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Endereço:</span>{" "}
                  <span className="font-medium">{viewing.endereco || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Usuários:</span>{" "}
                  <span className="font-medium">{viewing.user_count}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <Badge variant="outline" className={cn("text-xs", viewing.is_active
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-destructive/15 text-destructive border-destructive/30"
                  )}>
                    {viewing.is_active ? "Ativa" : "Inativa"}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Criada em:</span>{" "}
                  <span className="font-medium">{fmtDate(viewing.created_at)}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingOpen(false)}>Fechar</Button>
            {viewing && (
              <Button onClick={() => { setViewingOpen(false); openEdit(viewing); }}>Editar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Criar/Editar */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Empresa" : "Nova Empresa"}</DialogTitle>
            <DialogDescription className="sr-only">
              Formulário para {editing ? "editar" : "cadastrar"} empresa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome da Empresa *</label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ex: Empresa ABC Ltda" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">CNPJ</label>
              <Input value={formCnpj} onChange={(e) => setFormCnpj(formatCnpj(e.target.value))} placeholder="00.000.000/0000-00" maxLength={18} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Endereço</label>
              <Input value={formEndereco} onChange={(e) => setFormEndereco(e.target.value)} placeholder="Rua, número, cidade - UF" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Telefone</label>
              <Input value={formTelefone} onChange={(e) => setFormTelefone(formatTelefone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} />
            </div>
            {!editing && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">Administrador Inicial</p>
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 mb-3">
                  📧 Um e-mail de convite será enviado para o administrador definir sua senha.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Nome do Administrador *</label>
                    <Input value={formAdminNome} onChange={(e) => setFormAdminNome(e.target.value)} placeholder="Nome completo" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Email do Administrador *</label>
                    <Input type="email" value={formAdminEmail} onChange={(e) => setFormAdminEmail(e.target.value)} placeholder="admin@empresa.com" />
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}