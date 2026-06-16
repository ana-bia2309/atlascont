import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/use-user-role";
import { usePermissions } from "@/hooks/use-permissions";
import { useCompany } from "@/hooks/use-company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Eye, UserX, RefreshCw, Search, X, ShieldCheck, Mail, Calendar } from "@/lib/icons";
import { buildPublicAppUrl } from "@/lib/publicAppUrl";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AppRole = "administrador" | "gestor" | "tecnico" | "visualizacao";
type AppUserStatus = "ativo" | "inativo";

type WorkScheduleType = "administrativo" | "noturno" | "escala_12x36";

interface UserProfile {
  id: string;
  company_id?: string;
  user_id: string | null;
  nome: string;
  cpf: string;
  email: string;
  status: AppUserStatus;
  created_at: string;
  role: AppRole;
  perfil_acesso_id: string | null;
  perfil_acesso_nome: string | null;
  job_title: string | null;
  work_start: string | null;
  work_end: string | null;
  work_days: string[];
  work_schedule_type: WorkScheduleType;
  scale_start_date: string | null;
  scale_starts_working: boolean;
}

type PerfilAcessoOption = { id: string; nome: string };

/* ── CPF helpers ── */
const formatCpf = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

const validateCpf = (cpf: string): boolean => {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== parseInt(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  return rest === parseInt(d[10]);
};

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "administrador", label: "Administrador" },
  { value: "gestor", label: "Gestor" },
  { value: "tecnico", label: "Técnico" },
  { value: "visualizacao", label: "Visualização" },
];

const SCHEDULE_TYPE_OPTIONS: { value: WorkScheduleType; label: string; description: string }[] = [
  { value: "administrativo", label: "Jornada Padrão", description: "Horário fixo com dias da semana" },
  { value: "noturno", label: "Noturno", description: "Horário que pode cruzar meia-noite" },
  { value: "escala_12x36", label: "Escala 12x36", description: "12h trabalho / 36h descanso" },
];

const WEEK_DAYS = [
  { value: "seg", label: "Seg" },
  { value: "ter", label: "Ter" },
  { value: "qua", label: "Qua" },
  { value: "qui", label: "Qui" },
  { value: "sex", label: "Sex" },
  { value: "sab", label: "Sáb" },
  { value: "dom", label: "Dom" },
];

const ROLE_COLORS: Record<AppRole, string> = {
  administrador: "bg-primary/10 text-primary border-primary/20",
  gestor: "bg-blue-50 text-blue-700 border-blue-200",
  tecnico: "bg-amber-50 text-amber-700 border-amber-200",
  visualizacao: "bg-muted text-muted-foreground border-border",
};

const STATUS_COLORS: Record<AppUserStatus, string> = {
  ativo: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inativo: "bg-destructive/15 text-destructive border-destructive/30",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ControleAcesso() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { companyId } = useCompany();
  const { can } = usePermissions();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewing, setViewing] = useState<UserProfile | null>(null);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<UserProfile | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterRole, setFilterRole] = useState("__all__");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [filterPerfil, setFilterPerfil] = useState("__all__");
  const [sendingResetTo, setSendingResetTo] = useState<string | null>(null);

  // Perfis de acesso
  const [perfisAcesso, setPerfisAcesso] = useState<PerfilAcessoOption[]>([]);

  // Form state
  const [formNome, setFormNome] = useState("");
  const [formCpf, setFormCpf] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState<AppRole>("visualizacao");
  const [formStatus, setFormStatus] = useState<AppUserStatus>("ativo");
  const [formPerfilAcessoId, setFormPerfilAcessoId] = useState<string>("__none__");
  const [formJobTitle, setFormJobTitle] = useState("");
  const [formWorkStart, setFormWorkStart] = useState("");
  const [formWorkEnd, setFormWorkEnd] = useState("");
  const [formWorkDays, setFormWorkDays] = useState<string[]>([]);
  const [formScheduleType, setFormScheduleType] = useState<WorkScheduleType>("administrativo");
  const [formScaleStartDate, setFormScaleStartDate] = useState("");
  const [formScaleStartsWorking, setFormScaleStartsWorking] = useState(true);
  const [saving, setSaving] = useState(false);

  /* ── Fetch perfis de acesso ── */
  const fetchPerfisAcesso = useCallback(async () => {
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

  const { data } = await (supabase as any)
    .from("perfis_acesso")
    .select("id, nome")
    .eq(
      "company_id",
      profile.company_id
    )
    .order("nome");

  setPerfisAcesso(
    (data || []) as PerfilAcessoOption[]
  );
}, []);

  /* ── Fetch users ── */
const fetchUsers = useCallback(async () => {

  console.log("USE COMPANY ID:", companyId);
  if (!companyId) {
    setLoading(false);
    return;
  }

  setLoading(true);

  console.log("COMPANY ID LOGADO:", companyId);

  const {
    data: profiles,
    error: pErr,
  } = await (supabase as any)
    .from("profiles")
    .select(`
      id,
      user_id,
      nome,
      cpf,
      email,
      status,
      created_at,
      perfil_acesso_id,
      job_title,
      work_start,
      work_end,
      work_days,
      work_schedule_type,
      scale_start_date,
      scale_starts_working
    `)
    .eq("company_id", companyId)
    .order("created_at", {
      ascending: false,
    });

    console.log("PROFILES:", profiles);
  if (pErr) {

    toast({
      title: "Erro ao carregar usuários",
      description: pErr.message,
      variant: "destructive",
    });

    setLoading(false);

    return;
  }

const {
  data: roles,
  error: rErr,
} = await (supabase as any)
  .from("user_roles")
  .select("user_id, role")
  .eq("company_id", companyId);
  if (rErr) {

    toast({
      title: "Erro ao carregar perfis",
      description: rErr.message,
      variant: "destructive",
    });

    setLoading(false);

    return;
  }

 const { data: perfisData } =
  await (supabase as any)
    .from("perfis_acesso")
    .select("id, nome");

  const perfisMap: Record<string, string> = {};

  (perfisData || []).forEach((p: any) => {
    perfisMap[p.id] = p.nome;
  });

  const rolesMap: Record<string, AppRole> = {};

  (roles || []).forEach((r: any) => {
    rolesMap[r.user_id] =
      r.role as AppRole;
  });

  const merged: UserProfile[] =
    (profiles || []).map((p: any) => ({

      id: p.id,
      user_id: p.user_id,
      nome: p.nome,
      cpf: p.cpf || "",
      email: p.email,
      status: p.status as AppUserStatus,
      created_at: p.created_at,

     role:
  rolesMap[p.id] ||
  "visualizacao",

      perfil_acesso_id:
        p.perfil_acesso_id || null,

      perfil_acesso_nome:
        p.perfil_acesso_id
          ? (
              perfisMap[
                p.perfil_acesso_id
              ] || null
            )
          : null,

      job_title:
        p.job_title || null,

      work_start:
        p.work_start || null,

      work_end:
        p.work_end || null,

      work_days:
        p.work_days || [],

      work_schedule_type:
        (
          p.work_schedule_type ||
          "administrativo"
        ) as WorkScheduleType,

      scale_start_date:
        p.scale_start_date || null,

      scale_starts_working:
        p.scale_starts_working ?? true,

    }));

  setUsers(merged);

  setLoading(false);

}, [companyId]);

  useEffect(() => {
    fetchPerfisAcesso();
    fetchUsers();
  }, [fetchPerfisAcesso, fetchUsers]);

  /* ── Derived data ── */
  const adminCount = useMemo(() => users.filter((u) => u.role === "administrador" && u.status === "ativo").length, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (filterRole !== "__all__" && u.role !== filterRole) return false;
      if (filterStatus !== "__all__" && u.status !== filterStatus) return false;
      if (filterPerfil !== "__all__") {
        if (filterPerfil === "__none__" && u.perfil_acesso_id) return false;
        if (filterPerfil !== "__none__" && u.perfil_acesso_id !== filterPerfil) return false;
      }
      if (filterSearch.trim()) {
        const q = filterSearch.trim().toLowerCase();
        const qDigits = q.replace(/\D/g, "");
        const matchesNome = u.nome.toLowerCase().includes(q);
        const matchesEmail = u.email.toLowerCase().includes(q);
        const matchesCpf = qDigits.length > 0 && u.cpf && u.cpf.includes(qDigits);
        if (!matchesNome && !matchesEmail && !matchesCpf) return false;
      }
      return true;
    }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [users, filterRole, filterStatus, filterSearch, filterPerfil]);

  const hasActiveFilters = filterRole !== "__all__" || filterStatus !== "__all__" || filterSearch.trim() !== "" || filterPerfil !== "__all__";

  /* ── Form helpers ── */
  const resetForm = () => {
    setFormNome(""); setFormCpf(""); setFormEmail("");
    setFormRole("visualizacao"); setFormStatus("ativo"); setFormPerfilAcessoId("__none__");
    setFormJobTitle(""); setFormWorkStart(""); setFormWorkEnd(""); setFormWorkDays([]);
    setFormScheduleType("administrativo"); setFormScaleStartDate(""); setFormScaleStartsWorking(true);
    setEditing(null);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };

    const openEdit = (user: UserProfile) => {
    setEditing(user);
    setFormNome(user.nome);
    setFormCpf(user.cpf ? formatCpf(user.cpf) : "");
    setFormEmail(user.email);
    setFormRole(user.role);
    setFormStatus(user.status);
    setFormPerfilAcessoId(user.perfil_acesso_id || "__none__");
    setFormJobTitle(user.job_title || "");
    setFormWorkStart(user.work_start || "");
    setFormWorkEnd(user.work_end || "");
    setFormWorkDays(user.work_days || []);
    setFormScheduleType(
      user.work_schedule_type || "administrativo"
    );
    setFormScaleStartDate(
      user.scale_start_date || ""
    );
    setFormScaleStartsWorking(
      user.scale_starts_working ?? true
    );

    setDialogOpen(true);
  };

  /* ── Save (create or update) ── */

  const handleSave = async () => {

    if (
      !editing &&
      !can("controle_acesso.criar")
    ) {
      toast({
        title: "Sem permissão para criar",
        variant: "destructive",
      });

      return;
    }

    if (
      editing &&
      !can("controle_acesso.editar")
    ) {
      toast({
        title: "Sem permissão para editar",
        variant: "destructive",
      });

      return;
    }

    if (!formNome.trim()) {
      toast({
        title: "Nome é obrigatório",
        variant: "destructive",
      });

      return;
    }

    const cpfDigits =
      formCpf.replace(/\D/g, "");

    if (
      !cpfDigits ||
      !validateCpf(cpfDigits)
    ) {
      toast({
        title: "CPF inválido",
        description:
          "Informe um CPF válido com 11 dígitos.",
        variant: "destructive",
      });

      return;
    }

    if (
      !formEmail.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        formEmail.trim()
      )
    ) {
      toast({
        title: "Email inválido",
        variant: "destructive",
      });

      return;
    }

    const perfilId =
      formPerfilAcessoId === "__none__"
        ? null
        : formPerfilAcessoId;

    setSaving(true);

    try {

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setSaving(false);
        return;
      }

      const { data: profile }: any =
        await (supabase as any)
          .from("profiles")
          .select("company_id")
          .eq("user_id", user.id)
          .single();

      if (!profile?.company_id) {
        setSaving(false);
        return;
      }

      const currentCompanyId =
        profile.company_id;

      /* ───────────────────────────── */
      /* EDIT USER                     */
      /* ───────────────────────────── */

     if (editing) {

  const { error: pErr } =
    await (supabase as any)
      .from("profiles")
      .update({

        nome:
          formNome.trim(),

        cpf:
          cpfDigits,

        status:
          formStatus,

        perfil_acesso_id:
          perfilId,

        job_title:
          formJobTitle.trim() || null,

        work_start:
          formWorkStart || null,

        work_end:
          formWorkEnd || null,

        work_days:
          formScheduleType ===
          "administrativo"
            ? formWorkDays
            : [],

        work_schedule_type:
          formScheduleType,

        scale_start_date:
          formScheduleType ===
            "escala_12x36" &&
          formScaleStartDate
            ? formScaleStartDate
            : null,

        scale_starts_working:
          formScheduleType ===
          "escala_12x36"
            ? formScaleStartsWorking
            : true,

      })
      .eq("id", editing.id);

  if (pErr) {

    toast({
      title:
        "Erro ao atualizar usuário",

      description:
        pErr.message,

      variant:
        "destructive",
    });

    setSaving(false);

    return;
  }

 console.log("EDITING COMPLETO", editing);
console.log("EDITING USER ID", editing.user_id);
console.log("CURRENT COMPANY", currentCompanyId);
console.log("FORM ROLE", formRole);

console.log("FORM ROLE FINAL", formRole);

const { error: rErr } =
  await (supabase as any)
    .from("user_roles")
    .upsert(
      {
        user_id: editing.id,
        company_id: currentCompanyId,
        role: formRole,
      },
      { onConflict: "user_id,company_id" }
    );

console.log("ROLE UPDATE ERROR", rErr);

if (rErr) {

  toast({
    title:
      "Erro ao atualizar perfil",

    description:
      rErr.message,

    variant:
      "destructive",
  });

  setSaving(false);

  return;
}
await fetchUsers();
toast({ title: "Usuário atualizado" });
setDialogOpen(false);
resetForm();

}

      /* ───────────────────────────── */
      /* CREATE USER                   */
      /* ───────────────────────────── */

      else {

        const {
          data,
          error: fnErr,
        } =
          await supabase.functions.invoke(
            "invite-user",
            {
              body: {

                nome:
                  formNome.trim(),

                cpf:
                  cpfDigits,

                email:
                  formEmail.trim(),

                role:
                  formRole,

                perfil_acesso_id:
                  perfilId,

                redirectTo:
                  buildPublicAppUrl(
                    "/auth/callback"
                  ),

              },
            }
          );

        if (fnErr) {

          toast({
            title:
              "Erro ao criar usuário",

            description:
              fnErr.message,

            variant:
              "destructive",
          });

          setSaving(false);

          return;
        }

        if (data?.error) {

          toast({
            title:
              "Erro ao criar usuário",

            description:
              data.error,

            variant:
              "destructive",
          });

          setSaving(false);

          return;
        }

        if (data?.profile_id) {

          await (supabase as any)
            .from("profiles")
            .update({

              job_title:
                formJobTitle.trim() || null,

              work_start:
                formWorkStart || null,

              work_end:
                formWorkEnd || null,

              work_days:
                formScheduleType ===
                "administrativo"
                  ? formWorkDays
                  : [],

              work_schedule_type:
                formScheduleType,

              scale_start_date:
                formScheduleType ===
                  "escala_12x36" &&
                formScaleStartDate
                  ? formScaleStartDate
                  : null,

              scale_starts_working:
                formScheduleType ===
                "escala_12x36"
                  ? formScaleStartsWorking
                  : true,

            })
            .eq(
              "id",
              data.profile_id
            )
            .eq(
              "company_id",
              currentCompanyId
            );
        }

        toast({
          title:
            "Convite enviado com sucesso",

          description:
            `Um e-mail de convite foi enviado para ${formEmail.trim()}.`,
        });
      }

      setDialogOpen(false);

      resetForm();

      fetchUsers();

    } catch (err: any) {

      console.error(err);

      toast({
        title:
          "Erro inesperado",

        description:
          err?.message ||
          "Falha ao salvar usuário",

        variant:
          "destructive",
      });

    } finally {

      setSaving(false);

    }
  };

  /* ── Deactivate ── */
  const handleDeactivate = async () => {
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

const companyId = profile.company_id;
    if (!deactivateTarget) return;
    if (!can("controle_acesso.editar")) { toast({ title: "Sem permissão", variant: "destructive" }); setDeactivateTarget(null); return; }
    if (deactivateTarget.role === "administrador" && adminCount <= 1) {
      toast({ title: "Operação bloqueada", description: "Não é possível desativar o último administrador.", variant: "destructive" });
      setDeactivateTarget(null);
      return;
    }
    const newStatus: AppUserStatus = deactivateTarget.status === "ativo" ? "inativo" : "ativo";
    const { error } = await (supabase as any).from("profiles").update({ status: newStatus }).eq("id", deactivateTarget.id).eq("company_id", companyId);
    if (error) { toast({ title: "Erro ao alterar status", description: error.message, variant: "destructive" }); }
    else { toast({ title: newStatus === "inativo" ? "Usuário desativado" : "Usuário reativado" }); fetchUsers(); }
    setDeactivateTarget(null);
  };

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d), "dd/MM/yyyy HH:mm"); } catch { return "—"; }
  };

  const handleSendReset = async (user: UserProfile) => {
    if (sendingResetTo) return;
    setSendingResetTo(user.id);
    try {
      const { error } = await (supabase as any).auth.resetPasswordForEmail(user.email, { redirectTo: buildPublicAppUrl("/auth/callback") });
      if (error) toast({ title: "Erro ao enviar e-mail", description: "Tente novamente.", variant: "destructive" });
      else toast({ title: "E-mail de redefinição enviado com sucesso", description: `Enviado para ${user.email}` });
    } catch { toast({ title: "Erro ao enviar e-mail", description: "Tente novamente.", variant: "destructive" }); }
    finally { setTimeout(() => setSendingResetTo(null), 5000); }
  };

  if (roleLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Verificando permissões...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Controle de Acesso</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => { fetchPerfisAcesso(); fetchUsers(); }} title="Atualizar">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          {can("controle_acesso.criar") && <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Novo Usuário</Button>}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4 rounded-lg border bg-card p-4">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Buscar</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Nome, email ou CPF" className="pl-9" />
          </div>
        </div>
        <div className="min-w-[150px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Perfil de Acesso</label>
          <Select value={filterPerfil} onValueChange={setFilterPerfil}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              <SelectItem value="__none__">Sem perfil</SelectItem>
              {perfisAcesso.map((p) => (<SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[150px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Nível (RLS)</label>
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {ROLE_OPTIONS.map((r) => (<SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[130px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterSearch(""); setFilterRole("__all__"); setFilterStatus("__all__"); setFilterPerfil("__all__"); }} className="text-muted-foreground">
            <X className="mr-1 h-3 w-3" /> Limpar
          </Button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : filteredUsers.length === 0 ? (
        <p className="text-muted-foreground">
          {hasActiveFilters ? "Nenhum usuário encontrado com os filtros aplicados." : "Nenhum usuário cadastrado."}
        </p>
      ) : (
        <div className="rounded-lg border bg-card overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Perfil de Acesso</TableHead>
                <TableHead>Nível</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="w-[120px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.nome}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.cpf ? formatCpf(user.cpf) : "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    {user.perfil_acesso_nome ? (
                      <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">{user.perfil_acesso_nome}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs capitalize", ROLE_COLORS[user.role])}>
                      {ROLE_OPTIONS.find((r) => r.value === user.role)?.label || user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs capitalize", STATUS_COLORS[user.status])}>
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(user.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon" onClick={() => handleSendReset(user)} disabled={sendingResetTo === user.id} title="Enviar redefinição de senha" className="text-muted-foreground hover:text-primary">
                        <Mail className={cn("h-4 w-4", sendingResetTo === user.id && "animate-pulse")} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setViewing(user)} title="Ver detalhes"><Eye className="h-4 w-4" /></Button>
                      {can("controle_acesso.editar") && <Button variant="ghost" size="icon" onClick={() => openEdit(user)} title="Editar"><Pencil className="h-4 w-4" /></Button>}
                      {can("controle_acesso.editar") && (
                        <Button variant="ghost" size="icon" onClick={() => setDeactivateTarget(user)} title={user.status === "ativo" ? "Desativar" : "Reativar"} className={user.status === "ativo" ? "text-destructive" : "text-emerald-600"}>
                          <UserX className="h-4 w-4" />
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
            <DialogDescription className="sr-only">Formulário para {editing ? "editar" : "cadastrar"} usuário no sistema.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome *</label>
              <Input value={formNome} onChange={(e) => setFormNome(e.target.value)} placeholder="Nome completo" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">CPF *</label>
              <Input value={formCpf} onChange={(e) => setFormCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" maxLength={14} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Email *</label>
              <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="email@exemplo.com" disabled={!!editing} />
              {editing && <p className="text-xs text-muted-foreground mt-1">O email não pode ser alterado.</p>}
            </div>
            {!editing && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
                📧 Um e-mail de convite será enviado para o usuário definir sua senha no primeiro acesso.
              </p>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">Perfil de Acesso</label>
              <Select value={formPerfilAcessoId} onValueChange={setFormPerfilAcessoId}>
                <SelectTrigger><SelectValue placeholder="Selecione um perfil" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {perfisAcesso.map((p) => (<SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Define as permissões do usuário no sistema.</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Nível de Acesso (RLS) *</label>
              <Select value={formRole} onValueChange={(v) => setFormRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (<SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Controla o acesso a dados no banco de dados.</p>
            </div>
            {editing && (
              <div>
                <label className="text-sm font-medium mb-1 block">Status</label>
                <Select value={formStatus} onValueChange={(v) => setFormStatus(v as AppUserStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Jornada de trabalho */}
            <div className="border-t pt-4 mt-2">
              <p className="text-sm font-medium mb-3">Jornada de Trabalho</p>
              <div>
                <label className="text-sm font-medium mb-1 block">Cargo / Função</label>
                <Input value={formJobTitle} onChange={(e) => setFormJobTitle(e.target.value)} placeholder="Ex: Técnico de Manutenção" />
              </div>
              <div className="mt-3">
                <label className="text-sm font-medium mb-1 block">Tipo de Jornada *</label>
                <Select value={formScheduleType} onValueChange={(v) => setFormScheduleType(v as WorkScheduleType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {SCHEDULE_TYPE_OPTIONS.find((o) => o.value === formScheduleType)?.description}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Horário de entrada</label>
                  <Input type="time" value={formWorkStart} onChange={(e) => setFormWorkStart(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Horário de saída</label>
                  <Input type="time" value={formWorkEnd} onChange={(e) => setFormWorkEnd(e.target.value)} />
                </div>
              </div>
              {formScheduleType === "noturno" && (
                <p className="text-xs text-muted-foreground mt-2 bg-muted/50 rounded-md p-2">
                  🌙 Horários noturnos que cruzam meia-noite são suportados (ex: 19:00 às 07:00).
                </p>
              )}
              {formScheduleType === "administrativo" && (
                <div className="mt-3">
                  <label className="text-sm font-medium mb-2 block">Dias de trabalho</label>
                  <div className="flex flex-wrap gap-3">
                    {WEEK_DAYS.map((day) => (
                      <label key={day.value} className="flex items-center gap-1.5 cursor-pointer">
                        <Checkbox
                          checked={formWorkDays.includes(day.value)}
                          onCheckedChange={(checked) => {
                            setFormWorkDays((prev) =>
                              checked ? [...prev, day.value] : prev.filter((d) => d !== day.value)
                            );
                          }}
                        />
                        <span className="text-sm">{day.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {formScheduleType === "escala_12x36" && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Data de início da escala</label>
                    <Input type="date" value={formScaleStartDate} onChange={(e) => setFormScaleStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Inicia</label>
                    <Select value={formScaleStartsWorking ? "trabalhando" : "folgando"} onValueChange={(v) => setFormScaleStartsWorking(v === "trabalhando")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="trabalhando">Trabalhando</SelectItem>
                        <SelectItem value="folgando">Folgando</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                    ⏱️ Escala 12x36: 12h de trabalho seguidas por 36h de descanso. Dias da semana não se aplicam.
                  </p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Detail Dialog */}
      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Detalhes do Usuário</DialogTitle>
            <DialogDescription className="sr-only">Informações detalhadas do usuário.</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 py-2 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Nome:</span> <span className="font-medium">{viewing.nome}</span></div>
                <div><span className="text-muted-foreground">CPF:</span> <span className="font-medium">{viewing.cpf ? formatCpf(viewing.cpf) : "—"}</span></div>
                <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{viewing.email}</span></div>
                <div>
                  <span className="text-muted-foreground">Perfil:</span>{" "}
                  {viewing.perfil_acesso_nome ? (
                    <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">{viewing.perfil_acesso_nome}</Badge>
                  ) : <span className="font-medium">—</span>}
                </div>
                <div>
                  <span className="text-muted-foreground">Nível:</span>{" "}
                  <Badge variant="outline" className={cn("text-xs capitalize", ROLE_COLORS[viewing.role])}>
                    {ROLE_OPTIONS.find((r) => r.value === viewing.role)?.label || viewing.role}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <Badge variant="outline" className={cn("text-xs capitalize", STATUS_COLORS[viewing.status])}>{viewing.status}</Badge>
                </div>
                <div><span className="text-muted-foreground">Criado em:</span> <span className="font-medium">{fmtDate(viewing.created_at)}</span></div>
                <div><span className="text-muted-foreground">Cargo:</span> <span className="font-medium">{viewing.job_title || "—"}</span></div>
                <div><span className="text-muted-foreground">Jornada:</span> <span className="font-medium">{SCHEDULE_TYPE_OPTIONS.find(o => o.value === viewing.work_schedule_type)?.label || viewing.work_schedule_type}</span></div>
                <div><span className="text-muted-foreground">Horário:</span> <span className="font-medium">{viewing.work_start && viewing.work_end ? `${viewing.work_start.slice(0,5)} – ${viewing.work_end.slice(0,5)}` : "—"}</span></div>
                {viewing.work_schedule_type === "administrativo" && (
                  <div className="col-span-2"><span className="text-muted-foreground">Dias:</span> <span className="font-medium">{viewing.work_days?.length ? viewing.work_days.map(d => WEEK_DAYS.find(w => w.value === d)?.label || d).join(", ") : "—"}</span></div>
                )}
                {viewing.work_schedule_type === "escala_12x36" && (
                  <>
                    <div><span className="text-muted-foreground">Início escala:</span> <span className="font-medium">{viewing.scale_start_date || "—"}</span></div>
                    <div><span className="text-muted-foreground">Inicia:</span> <span className="font-medium">{viewing.scale_starts_working ? "Trabalhando" : "Folgando"}</span></div>
                  </>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>Fechar</Button>
            {viewing && can("controle_acesso.editar") && <Button onClick={() => { setViewing(null); openEdit(viewing); }}>Editar</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deactivateTarget?.status === "ativo" ? "Desativar usuário?" : "Reativar usuário?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget?.status === "ativo"
                ? `O usuário "${deactivateTarget?.nome}" será desativado e perderá acesso ao sistema.`
                : `O usuário "${deactivateTarget?.nome}" será reativado e poderá acessar o sistema novamente.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate}>{deactivateTarget?.status === "ativo" ? "Desativar" : "Reativar"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
