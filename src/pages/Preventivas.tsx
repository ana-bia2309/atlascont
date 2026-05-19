import React, { useState, useEffect, useCallback, useMemo } from "react";
import { usePermissions } from "@/hooks/use-permissions";
import { useUserRole } from "@/hooks/use-user-role";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/hooks/use-realtime";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, RefreshCw, Play, Pause, History, Wrench, Eye, EyeOff, CheckCircle2, Clock, Filter, ClipboardList, Circle, ChevronDown, ChevronRight } from "@/lib/icons";
import { Switch } from "@/components/ui/switch";
import { format, addMonths, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { createPreventiveOrder } from "@/lib/createPreventiveOrder";
import { getNextGenerationDate, getNextBusinessDay, isBusinessDay } from "@/lib/business-days";
import { CalendarClock } from "@/lib/icons";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

type Bloco = { id: string; nome: string | null };
type Ativo = {
  id: string;
  nome: string;
  codigo_identificacao: string | null;
  bloco_id: string | null;
  andar: string | null;
  sala: string | null;
  identificacao_ambiente: string | null;
  area_pavimento: string | null;
  grupo_areas: string | null;
};

type Profile = { id: string; nome: string; job_title?: string | null };

type Preventiva = {
  id: string;
  titulo: string;
  descricao: string | null;
  frequencia: string;
  ativo_id: string | null;
  bloco_id: string | null;
  tipo_servico: string | null;
  tipo_atividade: string | null;
  tipo_medicao: string | null;
  ordem_grandeza: string | null;
  unidade_medicao: string | null;
  prioridade: string;
  proxima_execucao: string;
  ultima_execucao: string | null;
  ativo: boolean;
  created_at: string;
  responsavel_id: string | null;
};

type HistoricoItem = {
  id: string;
  preventiva_id: string;
  os_id: string | null;
  data_geracao: string;
  observacao: string | null;
};

type OSConcluida = {
  id: string;
  codigo_os: string | null;
  titulo: string | null;
  equipamentos: string | null;
  status: string | null;
  prioridade: string;
  tipo_servico: string | null;
  data_inicio: string | null;
  data_termino: string | null;
  finalizado_em: string | null;
  bloco_id: string | null;
  preventiva_titulo: string;
  data_geracao: string;
};

type AtividadePreventiva = {
  id: string;
  preventiva_id: string;
  nome: string;
  descricao: string | null;
  frequencia: string;
  prioridade: string;
  tipo_servico: string | null;
  ordem: number;
  concluido: boolean;
  concluido_em: string | null;
  concluido_por: string | null;
  status: string;
  created_at: string;
  bloco_id: string | null;
  ativo_id: string | null;
  tipo_atividade: string | null;
  tipo_medicao: string | null;
  unidade_medicao: string | null;
  responsavel_id: string | null;
  automatico: boolean;
};

const ATIVIDADE_STATUS_OPTIONS = ["Pendente", "Em andamento", "Concluído"];

const getAtividadeStatusColor = (s: string) => {
  if (s === "Concluído") return "bg-emerald-500/10 text-emerald-600 border-emerald-300";
  if (s === "Em andamento") return "bg-amber-500/10 text-amber-600 border-amber-300";
  return "bg-muted text-muted-foreground border-border";
};

const FREQUENCIA_OPTIONS = [
  { value: "diaria", label: "Diária" },
  { value: "quinzenal", label: "Quinzenal" },
  { value: "mensal", label: "Mensal" },
  { value: "bimestral", label: "Bimestral" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];

const PRIORIDADE_OPTIONS = ["Baixa", "Média", "Alta", "Urgente"];

const TIPO_SERVICO_OPTIONS = ["Elétrica", "Hidráulica", "Civil", "Climatização", "Outros"];

const UNIDADE_MEDICAO_OPTIONS = ["Amperes (A)", "Volts (V)", "Watts (W)", "Quilogramas (kg)", "Joules (J)", "Celsius (°C)", "Pascal (Pa)", "Ohms (Ω)", "Hertz (Hz)", "Libra-força por polegada quadrada (PSI)", "Farad (F)", "Kilopascal (kPa)", "Microfarad (µF)", "Kilo ohms (kΩ)", "Mega ohms (MΩ)", "Kilowatts (kW)", "Kilovolts (kV)", "Kilovolts reativo (kVAr)", "Outros"];

type TipoAtividadeRow = { id: string; nome: string; ativo: boolean };

const FREQUENCIA_DAYS: Record<string, number> = {
  diaria: 1,
  quinzenal: 15,
};

const frequenciaToMonths: Record<string, number> = {
  mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12,
};

function calcNextExecution(fromDate: Date, frequencia: string): Date {
  if (FREQUENCIA_DAYS[frequencia]) {
    const next = new Date(fromDate);
    next.setDate(next.getDate() + FREQUENCIA_DAYS[frequencia]);
    return next;
  }
  const months = frequenciaToMonths[frequencia] || 1;
  return addMonths(fromDate, months);
}

export default function Preventivas() {
  const { can } = usePermissions();
  const { isAdmin } = useUserRole();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [preventivas, setPreventivas] = useState<Preventiva[]>([]);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [ativos, setAtivos] = useState<Ativo[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tiposAtividade, setTiposAtividade] = useState<TipoAtividadeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Preventiva | null>(null);
  const [historicoOpen, setHistoricoOpen] = useState<string | null>(null);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);

  const [showInactive, setShowInactive] = useState(false);
  const [activeTab, setActiveTab] = useState("ativas");
  const [osConcluidas, setOsConcluidas] = useState<OSConcluida[]>([]);
  const [loadingConcluidas, setLoadingConcluidas] = useState(false);
  const [filterTipoServico, setFilterTipoServico] = useState("todos");
  const [filterFrequencia, setFilterFrequencia] = useState("todos");
  const [filterAtivo, setFilterAtivo] = useState("todos");

  // Activities state
  const [drawerPrevId, setDrawerPrevId] = useState<string | null>(null);
  const [prevAtividades, setPrevAtividades] = useState<AtividadePreventiva[]>([]);
  const [atividadesCounts, setAtividadesCounts] = useState<Record<string, number>>({});
  const [loadingAtividades, setLoadingAtividades] = useState(false);
  const [atividadeDialogOpen, setAtividadeDialogOpen] = useState(false);
  const [editingAtividade, setEditingAtividade] = useState<AtividadePreventiva | null>(null);
  const [deleteAtividadeId, setDeleteAtividadeId] = useState<string | null>(null);
  const [atNome, setAtNome] = useState("");
  const [atDescricao, setAtDescricao] = useState("");
  const [atFrequencia, setAtFrequencia] = useState("mensal");
  const [atPrioridade, setAtPrioridade] = useState("Média");
  const [atTipoServico, setAtTipoServico] = useState("");
  const [atBlocoId, setAtBlocoId] = useState("");
  const [atAtivoId, setAtAtivoId] = useState("");
  const [atTipoAtividade, setAtTipoAtividade] = useState("");
  const [atTipoMedicao, setAtTipoMedicao] = useState("");
  const [atUnidadeMedicao, setAtUnidadeMedicao] = useState("");
  const [atResponsavelId, setAtResponsavelId] = useState("");
  const [atAutomatico, setAtAutomatico] = useState(false);

  // Form fields
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [frequencia, setFrequencia] = useState("mensal");
  const [ativoId, setAtivoId] = useState("");
  const [blocoId, setBlocoId] = useState("");
  const [tipoServico, setTipoServico] = useState("");
  const [prioridade, setPrioridade] = useState("Média");
  const [tipoAtividade, setTipoAtividade] = useState("Medição");
  const [tipoMedicao, setTipoMedicao] = useState("");
  const [ordemGrandeza, setOrdemGrandeza] = useState("");
  const [unidadeMedicao, setUnidadeMedicao] = useState("");
  const [proximaExecucao, setProximaExecucao] = useState<Date | undefined>();
  const [responsavelId, setResponsavelId] = useState("");
  const [autoExecucao, setAutoExecucao] = useState(true);

 const fetchData = useCallback(async () => {
  setLoading(true);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setLoading(false);
    return;
  }

  const { data: profile }: any = await supabase
    .from("profiles")
    .select("company_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.company_id) {
    setLoading(false);
    return;
  }

  const companyId = profile.company_id;

  const [prevRes, blocosRes, ativosRes, tiposAtivRes, profilesRes] =
    await Promise.all([
      (supabase.from("manutencao_preventiva" as any) as any)
        .select("*")
        .eq("company_id", companyId)
        .order("proxima_execucao"),

      (supabase.from("blocos") as any)
        .select("id, nome")
        .eq("company_id", companyId)
        .order("nome"),

      (supabase.from("ativos" as any) as any)
        .select(
          "id, nome, codigo_identificacao, bloco_id, andar, sala, identificacao_ambiente, area_pavimento, grupo_areas"
        )
        .eq("company_id", companyId)
        .order("nome"),

      (supabase.from("tipos_atividade" as any) as any)
        .select("*")
        .eq("ativo", true)
        .eq("company_id", companyId)
        .order("nome"),

      (supabase.from("profiles") as any)
        .select("id, nome, job_title")
        .eq("status", "ativo")
        .eq("company_id", companyId)
        .order("nome"),
    ]);

  setPreventivas((prevRes.data as any[]) || []);
  setBlocos(blocosRes.data || []);
  setAtivos((ativosRes.data as Ativo[]) || []);
  setTiposAtividade((tiposAtivRes.data as any[]) || []);
  setProfiles((profilesRes.data as Profile[]) || []);

  setLoading(false);
}, []);

  const fetchConcluidas = useCallback(async () => {
    setLoadingConcluidas(true);
    // Fetch historico_preventiva with related OS and preventiva data
    const { data: histData } = await supabase
      .from("historico_preventiva" as any)
      .select("*, preventiva:manutencao_preventiva(titulo)")
      .order("data_geracao", { ascending: false });

    if (!histData || histData.length === 0) {
      setOsConcluidas([]);
      setLoadingConcluidas(false);
      return;
    }

    // Get OS IDs from history
    const osIds = (histData as any[]).filter(h => h.os_id).map(h => h.os_id);
    
    if (osIds.length === 0) {
      setOsConcluidas([]);
      setLoadingConcluidas(false);
      return;
    }

    const { data: osData } = await supabase
      .from("ordens_servico")
      .select("id, codigo_os, titulo, equipamentos, status, prioridade, tipo_servico, data_inicio, data_termino, finalizado_em, bloco_id")
      .in("id", osIds)
      .eq("status", "Concluída");

    const osMap: Record<string, any> = {};
    (osData || []).forEach(os => { osMap[os.id] = os; });

    const concluidas: OSConcluida[] = (histData as any[])
      .filter(h => h.os_id && osMap[h.os_id])
      .map(h => ({
        ...osMap[h.os_id],
        preventiva_titulo: (h as any).preventiva?.titulo || "—",
        data_geracao: h.data_geracao,
      }));

    setOsConcluidas(concluidas);
    setLoadingConcluidas(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (activeTab === "concluidas") fetchConcluidas(); }, [activeTab, fetchConcluidas]);
  useRealtime(["manutencao_preventiva" as any], fetchData);

  const blocosMap = useMemo(() => {
    const m: Record<string, string> = {};
    blocos.forEach(b => { m[b.id] = b.nome || "—"; });
    return m;
  }, [blocos]);

  const ativosMap = useMemo(() => {
    const m: Record<string, string> = {};
    ativos.forEach(a => { m[a.id] = a.nome; });
    return m;
  }, [ativos]);

  const profilesMap = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach(p => { m[p.id] = p.nome; });
    return m;
  }, [profiles]);

  const resetForm = () => {
    setTitulo(""); setDescricao(""); setFrequencia("mensal");
    setAtivoId(""); setBlocoId(""); setTipoServico(""); setTipoAtividade("Medição");
    setTipoMedicao(""); setOrdemGrandeza(""); setUnidadeMedicao("");
    setPrioridade("Média"); setProximaExecucao(undefined); setEditing(null);
    setResponsavelId(""); setAutoExecucao(true);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (p: Preventiva) => {
    setEditing(p);
    setTitulo(p.titulo);
    setDescricao(p.descricao || "");
    setFrequencia(p.frequencia);
    setAtivoId(p.ativo_id || "");
    setBlocoId(p.bloco_id || "");
    setTipoServico(p.tipo_servico || "");
    setTipoAtividade(p.tipo_atividade || "");
    setTipoMedicao((p as any).tipo_medicao || "");
    setOrdemGrandeza((p as any).ordem_grandeza || "");
    setUnidadeMedicao((p as any).unidade_medicao || "");
    setPrioridade(p.prioridade);
    setResponsavelId((p as any).responsavel_id || "");
    setAutoExecucao(p.ativo);
    setProximaExecucao(new Date(p.proxima_execucao + "T00:00:00"));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editing && !can("preventivas.criar")) { toast({ title: "Sem permissão para criar", variant: "destructive" }); return; }
    if (editing && !can("preventivas.editar")) { toast({ title: "Sem permissão para editar", variant: "destructive" }); return; }
    if (!titulo.trim()) {
      toast({ title: "Preencha o título", variant: "destructive" });
      return;
    }

    // Auto-calculate proxima_execucao based on frequency
    const autoProximaExecucao = calcNextExecution(new Date(), frequencia);
    const proximaExecucaoBase = editing && proximaExecucao ? proximaExecucao : autoProximaExecucao;
    // Ajusta para o próximo dia útil se cair em fim de semana ou feriado
    const proximaExecucaoFinal = getNextBusinessDay(proximaExecucaoBase);

    const payload: any = {
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      frequencia,
      ativo_id: ativoId || null,
      bloco_id: blocoId || null,
      tipo_servico: tipoServico || null,
      tipo_atividade: tipoAtividade || null,
      tipo_medicao: tipoAtividade === "Medição" ? (tipoMedicao || null) : null,
      ordem_grandeza: tipoAtividade === "Medição" ? (ordemGrandeza || null) : null,
      unidade_medicao: tipoAtividade === "Medição" ? (unidadeMedicao || null) : null,
      prioridade,
      proxima_execucao: format(proximaExecucaoFinal, "yyyy-MM-dd"),
      responsavel_id: responsavelId || null,
      ativo: autoExecucao,
    };

    if (editing) {
      const { error } = await supabase.from("manutencao_preventiva" as any).update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Preventiva atualizada!" });
    } else {
      const { error } = await supabase.from("manutencao_preventiva" as any).insert(payload);
      if (error) { toast({ title: "Erro ao criar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Preventiva criada!" });
    }

    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    if (!can("preventivas.excluir")) { toast({ title: "Sem permissão para excluir", variant: "destructive" }); setDeleteId(null); return; }
    const { error } = await supabase.from("manutencao_preventiva" as any).delete().eq("id", deleteId);
    if (error) toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    else toast({ title: "Preventiva excluída" });
    setDeleteId(null);
    fetchData();
  };

  const toggleAtivo = async (p: Preventiva) => {
    if (!can("preventivas.editar")) { toast({ title: "Sem permissão", variant: "destructive" }); return; }
    const { error } = await supabase.from("manutencao_preventiva" as any).update({ ativo: !p.ativo } as any).eq("id", p.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({ title: p.ativo ? "Execução automática desativada" : "Execução automática ativada" });
    fetchData();
  };

  const gerarOSManual = async (p: Preventiva) => {
    if (!isAdmin) { toast({ title: "Apenas administradores podem gerar O.S. manualmente.", variant: "destructive" }); return; }
    try {
      const op = await createPreventiveOrder(p, { observacao_historico: "Geração manual (administrador)" });
      toast({ title: "Ordem Preventiva gerada!", description: `Código: ${op.codigo_op}` });
      navigate(`/ordens-preventivas?op=${op.id}`);
    } catch (error: any) {
      toast({ title: "Erro ao gerar Ordem Preventiva", description: error?.message || "Tente novamente.", variant: "destructive" });
      return;
    }
    fetchData();
  };

  const openHistorico = async (prevId: string) => {
    setHistoricoOpen(prevId);
    const { data } = await supabase.from("historico_preventiva" as any).select("*").eq("preventiva_id", prevId).order("data_geracao", { ascending: false });
    setHistorico((data as any[]) || []);
  };

  const isOverdue = (p: Preventiva) => {
    if (!p.ativo) return false;
    return new Date(p.proxima_execucao + "T00:00:00") <= new Date();
  };

  // ── Atividades da Preventiva ──
  const fetchAtividades = useCallback(async (prevId: string) => {
    setLoadingAtividades(true);
    const { data } = await supabase
      .from("atividades_preventiva" as any)
      .select("*")
      .eq("preventiva_id", prevId)
      .order("ordem");
    setPrevAtividades((data as any[]) || []);
    setLoadingAtividades(false);
  }, []);

  const fetchAtividadesCounts = useCallback(async () => {
    const { data } = await supabase
      .from("atividades_preventiva" as any)
      .select("preventiva_id");
    const counts: Record<string, number> = {};
    ((data as any[]) || []).forEach((row) => {
      counts[row.preventiva_id] = (counts[row.preventiva_id] || 0) + 1;
    });
    setAtividadesCounts(counts);
  }, []);

  useEffect(() => { fetchAtividadesCounts(); }, [fetchAtividadesCounts, preventivas.length]);

  const openAtividadesDrawer = (prevId: string) => {
    setDrawerPrevId(prevId);
    fetchAtividades(prevId);
  };

  const resetAtividadeForm = () => {
    setAtNome(""); setAtDescricao(""); setAtFrequencia("mensal"); setAtPrioridade("Média"); setAtTipoServico("");
    setAtBlocoId(""); setAtAtivoId(""); setAtTipoAtividade(""); setAtTipoMedicao(""); setAtUnidadeMedicao("");
    setAtResponsavelId(""); setAtAutomatico(false); setEditingAtividade(null);
  };

  const openCreateAtividade = () => { resetAtividadeForm(); setAtividadeDialogOpen(true); };

  const openEditAtividade = (a: AtividadePreventiva) => {
    setEditingAtividade(a);
    setAtNome(a.nome);
    setAtDescricao(a.descricao || "");
    setAtFrequencia(a.frequencia);
    setAtPrioridade(a.prioridade);
    setAtTipoServico(a.tipo_servico || "");
    setAtBlocoId(a.bloco_id || "");
    setAtAtivoId(a.ativo_id || "");
    setAtTipoAtividade(a.tipo_atividade || "");
    setAtTipoMedicao(a.tipo_medicao || "");
    setAtUnidadeMedicao(a.unidade_medicao || "");
    setAtResponsavelId(a.responsavel_id || "");
    setAtAutomatico(!!a.automatico);
    setAtividadeDialogOpen(true);
  };

  const handleSaveAtividade = async () => {
    if (!drawerPrevId || !atNome.trim()) {
      toast({ title: "Informe o nome da atividade", variant: "destructive" });
      return;
    }
    const payload: any = {
      preventiva_id: drawerPrevId,
      nome: atNome.trim(),
      descricao: atDescricao.trim() || null,
      prioridade: atPrioridade,
      tipo_servico: atTipoServico || null,
      bloco_id: atBlocoId || null,
      ativo_id: atAtivoId || null,
      tipo_atividade: atTipoAtividade || null,
      tipo_medicao: atTipoAtividade === "Medição" ? (atTipoMedicao || null) : null,
      unidade_medicao: atTipoAtividade === "Medição" ? (atUnidadeMedicao || null) : null,
      responsavel_id: atResponsavelId || null,
      ordem: editingAtividade ? editingAtividade.ordem : prevAtividades.length,
    };
    if (editingAtividade) {
      const { error } = await supabase.from("atividades_preventiva" as any).update(payload).eq("id", editingAtividade.id);
      if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Atividade atualizada!" });
    } else {
      const { error } = await supabase.from("atividades_preventiva" as any).insert(payload);
      if (error) { toast({ title: "Erro ao criar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Atividade adicionada!" });
    }
    setAtividadeDialogOpen(false);
    resetAtividadeForm();
    fetchAtividades(drawerPrevId);
    fetchAtividadesCounts();
  };

  const handleDeleteAtividade = async () => {
    if (!deleteAtividadeId || !drawerPrevId) return;
    const { error } = await supabase.from("atividades_preventiva" as any).delete().eq("id", deleteAtividadeId);
    if (error) toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    else toast({ title: "Atividade excluída" });
    setDeleteAtividadeId(null);
    fetchAtividades(drawerPrevId);
    fetchAtividadesCounts();
  };

  const handleChangeAtividadeStatus = async (atividade: AtividadePreventiva, newStatus: string) => {
    const isConcluido = newStatus === "Concluído";
    let profileId: string | null = null;
    if (isConcluido && session?.user?.id) {
      const { data: prof } = await supabase.from("profiles").select("id").eq("user_id", session.user.id).maybeSingle();
      profileId = prof?.id || null;
    }
    const payload: any = {
      status: newStatus,
      concluido: isConcluido,
      concluido_em: isConcluido ? new Date().toISOString() : null,
      concluido_por: isConcluido ? profileId : null,
    };
    const { error } = await supabase.from("atividades_preventiva" as any).update(payload).eq("id", atividade.id);
    if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Status: ${newStatus}` });
    if (drawerPrevId) fetchAtividades(drawerPrevId);
  };

  const filteredPreventivas = useMemo(() => {
    let list = showInactive ? preventivas : preventivas.filter(p => p.ativo);
    if (filterTipoServico !== "todos") {
      list = list.filter(p => p.tipo_servico === filterTipoServico);
    }
    if (filterFrequencia !== "todos") {
      list = list.filter(p => p.frequencia === filterFrequencia);
    }
    if (filterAtivo !== "todos") {
      list = list.filter(p => p.ativo_id === filterAtivo);
    }
    return list;
  }, [preventivas, showInactive, filterTipoServico, filterFrequencia, filterAtivo]);

  const tiposServicoDisponiveis = useMemo(() => {
    const set = new Set(preventivas.map(p => p.tipo_servico).filter(Boolean));
    return Array.from(set).sort();
  }, [preventivas]);

  const ativosVinculados = useMemo(() => {
    const ids = new Set(preventivas.map(p => p.ativo_id).filter(Boolean));
    return ativos.filter(a => ids.has(a.id));
  }, [preventivas, ativos]);

  const hasActiveFilters = filterTipoServico !== "todos" || filterFrequencia !== "todos" || filterAtivo !== "todos";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Wrench className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Manutenção Preventiva</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => { fetchData(); if (activeTab === "concluidas") fetchConcluidas(); }} title="Atualizar">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          {can("preventivas.criar") && activeTab === "ativas" && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Nova Preventiva
            </Button>
          )}
        </div>
      </div>

      {(() => {
        const next = getNextGenerationDate();
        const today = new Date();
        const isToday = next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth() && next.getDate() === today.getDate();
        return (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <CalendarClock className="h-5 w-5 text-primary shrink-0" />
            <div className="text-sm">
              <span className="text-muted-foreground">Próxima geração automática: </span>
              <span className="font-semibold text-foreground">
                {isToday ? "Hoje" : format(next, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </span>
              <span className="text-muted-foreground"> às 08:00 (BRT)</span>
            </div>
          </div>
        );
      })()}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="ativas" className="gap-2">
              <Clock className="h-4 w-4" />
              Preventivas Ativas
            </TabsTrigger>
            <TabsTrigger value="concluidas" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              OS Concluídas
            </TabsTrigger>
          </TabsList>
          {activeTab === "ativas" && (
            <Button
              variant={showInactive ? "default" : "outline"}
              size="sm"
              onClick={() => setShowInactive(!showInactive)}
              title={showInactive ? "Ocultar pausadas" : "Mostrar pausadas"}
            >
              {showInactive ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {showInactive ? "Ocultar Pausadas" : "Mostrar Pausadas"}
            </Button>
          )}
        </div>

        {activeTab === "ativas" && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filtros:
            </div>
            <Select value={filterTipoServico} onValueChange={setFilterTipoServico}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Tipo Serviço" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                {tiposServicoDisponiveis.map(t => (
                  <SelectItem key={t} value={t!}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterFrequencia} onValueChange={setFilterFrequencia}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Frequência" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas Frequências</SelectItem>
                {FREQUENCIA_OPTIONS.map(f => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterAtivo} onValueChange={setFilterAtivo}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="Equipamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos Equipamentos</SelectItem>
                {ativosVinculados.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.codigo_identificacao ? `${a.codigo_identificacao} - ${a.nome}` : a.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterTipoServico("todos"); setFilterFrequencia("todos"); setFilterAtivo("todos"); }}>
                Limpar Filtros
              </Button>
            )}
          </div>
        )}

        <TabsContent value="ativas">
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : filteredPreventivas.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center">
              <Wrench className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">{showInactive ? "Nenhuma manutenção preventiva cadastrada." : "Nenhuma preventiva ativa."}</p>
              <p className="text-sm text-muted-foreground mt-1">Crie uma preventiva para gerar O.S. automaticamente.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredPreventivas.map(p => {
                const overdue = isOverdue(p);
                const atividadesCount = atividadesCounts[p.id] || 0;
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden",
                      overdue && "border-destructive/40"
                    )}
                  >
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-border/60 flex items-start justify-between gap-3">

                      <div className="flex items-start gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Wrench className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm truncate">{p.titulo}</h3>
                            <Badge variant="outline" className="text-[10px]">
                              {FREQUENCIA_OPTIONS.find(f => f.value === p.frequencia)?.label || p.frequencia}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {[p.bloco_id ? blocosMap[p.bloco_id] : null, p.tipo_servico, p.prioridade].filter(Boolean).join(" • ") || "—"}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {(() => {
                          const original = new Date(p.proxima_execucao + "T00:00:00");
                          const adjusted = getNextBusinessDay(original);
                          const wasAdjusted = !isBusinessDay(original);
                          return (
                            <>
                              <span className={cn("text-xs font-medium", overdue && "text-destructive")}>
                                {format(adjusted, "dd/MM/yyyy")}
                              </span>
                              {wasAdjusted && (
                                <span className="text-[10px] text-muted-foreground line-through">
                                  {format(original, "dd/MM/yyyy")}
                                </span>
                              )}
                            </>
                          );
                        })()}
                        {overdue ? (
                          <Badge variant="destructive" className="text-[10px]">Vencida</Badge>
                        ) : (
                          <Badge variant={p.ativo ? "default" : "secondary"} className="text-[10px]">
                            {p.ativo ? "Ativa" : "Pausada"}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Info grid */}
                    <div className="px-4 py-3 border-b border-border/60 grid grid-cols-2 gap-3 text-[12.5px]">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Próxima Execução</span>
                        {(() => {
                          const original = new Date(p.proxima_execucao + "T00:00:00");
                          const adjusted = getNextBusinessDay(original);
                          const wasAdjusted = !isBusinessDay(original);
                          return (
                            <span className={cn("font-medium inline-flex items-center gap-1.5", overdue && "text-destructive")}>
                              {wasAdjusted && (
                                <span className="text-[10px] text-muted-foreground line-through">
                                  {format(original, "dd/MM/yyyy")}
                                </span>
                              )}
                              <span>{format(adjusted, "dd/MM/yyyy")}</span>
                            </span>
                          );
                        })()}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground inline-flex items-center gap-1"><History className="h-3 w-3" /> Última Execução</span>
                        <span className="font-medium">
                          {p.ultima_execucao ? format(new Date(p.ultima_execucao + "T00:00:00"), "dd/MM/yyyy") : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Ativo</span>
                        <span className="font-medium truncate ml-2">{p.ativo_id ? ativosMap[p.ativo_id] || "—" : "—"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Responsável</span>
                        <span className="font-medium truncate ml-2">{p.responsavel_id ? profilesMap[p.responsavel_id] || "—" : "—"}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="px-4 py-2 border-b border-border/60 flex items-center justify-between gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => openAtividadesDrawer(p.id)}
                        className="h-8 gap-1.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">Ver atividades ({atividadesCount})</span>
                      </Button>
                      <div className="flex items-center gap-1">
                        {can("preventivas.editar") && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title={p.ativo ? "Desativar execução automática" : "Ativar execução automática"} onClick={() => toggleAtivo(p)}>
                            {p.ativo ? <Pause className="h-4 w-4 text-amber-600" /> : <Play className="h-4 w-4 text-sky-600" />}
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Histórico" onClick={() => openHistorico(p.id)}>
                          <History className="h-4 w-4" />
                        </Button>
                        {can("preventivas.editar") && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {can("preventivas.excluir") && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(p.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>

                  </div>

                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="concluidas">
          {loadingConcluidas ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : osConcluidas.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Nenhuma O.S. de preventiva concluída.</p>
              <p className="text-sm text-muted-foreground mt-1">As O.S. concluídas aparecerão aqui para consulta.</p>
            </div>
          ) : (
            <div className="rounded-lg border bg-card overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código O.S.</TableHead>
                    <TableHead>Preventiva</TableHead>
                    <TableHead>Equipamento</TableHead>
                    <TableHead>Bloco</TableHead>
                    <TableHead>Tipo Serviço</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Data Geração</TableHead>
                    <TableHead>Data Início</TableHead>
                    <TableHead>Data Conclusão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {osConcluidas.map(os => (
                    <TableRow key={os.id}>
                      <TableCell className="font-medium">{os.codigo_os || "—"}</TableCell>
                      <TableCell>{os.preventiva_titulo}</TableCell>
                      <TableCell>{os.equipamentos || os.titulo || "—"}</TableCell>
                      <TableCell>{os.bloco_id ? blocosMap[os.bloco_id] || "—" : "—"}</TableCell>
                      <TableCell>{os.tipo_servico || "—"}</TableCell>
                      <TableCell>{os.prioridade}</TableCell>
                      <TableCell>{format(new Date(os.data_geracao), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{os.data_inicio ? format(new Date(os.data_inicio + "T00:00:00"), "dd/MM/yyyy") : "—"}</TableCell>
                      <TableCell>
                        {os.finalizado_em
                          ? format(new Date(os.finalizado_em), "dd/MM/yyyy")
                          : os.data_termino
                            ? format(new Date(os.data_termino + "T00:00:00"), "dd/MM/yyyy")
                            : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-5 pt-4 pb-2">
            <DialogTitle className="text-base">{editing ? "Editar Preventiva" : "Nova Manutenção Preventiva"}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-5 pb-2 space-y-2.5">
            <div>
              <label className="text-xs font-medium mb-0.5 block">Título *</label>
              <Input className="h-8 text-sm" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Limpar filtros, etc." />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium mb-0.5 block">Frequência *</label>
                <Select value={frequencia} onValueChange={setFrequencia}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIA_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-0.5 block">Prioridade</label>
                <Select value={prioridade} onValueChange={setPrioridade}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORIDADE_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium mb-0.5 block">Bloco</label>
                <Select value={blocoId || "__none__"} onValueChange={v => setBlocoId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {blocos.map(b => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-0.5 block">Ativo</label>
                <Select value={ativoId || "__none__"} onValueChange={v => setAtivoId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {ativos.map(a => <SelectItem key={a.id} value={a.id}>{a.nome}{a.codigo_identificacao ? ` (${a.codigo_identificacao})` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(() => {
              const a = ativos.find(x => x.id === ativoId);
              if (!a) return null;
              const fields: Array<[string, string | null]> = [
                ["Localização", [a.andar, a.sala].filter(Boolean).join(" / ") || null],
                ["Unidade de Manutenção", a.bloco_id ? blocosMap[a.bloco_id] : null],
                ["Área", a.area_pavimento || a.grupo_areas || null],
                ["Identificação do Ambiente", a.identificacao_ambiente],
                ["Código de identificação", a.codigo_identificacao],
              ];
              return (
                <div className="rounded-md border bg-muted/30 p-2.5 space-y-1">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Dados do Ativo</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    {fields.map(([label, value]) => (
                      <div key={label} className="flex flex-col">
                        <span className="text-muted-foreground text-[10.5px]">{label}</span>
                        <span className="font-medium truncate">{value || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium mb-0.5 block">Tipo de Serviço</label>
                <Select value={tipoServico || "__none__"} onValueChange={v => setTipoServico(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {TIPO_SERVICO_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-0.5 block">Tipo de Atividade</label>
                <Select value={tipoAtividade || "__none__"} onValueChange={v => setTipoAtividade(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {tiposAtividade.map(t => <SelectItem key={t.id} value={t.nome}>{t.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {tipoAtividade === "Medição" && (
              <div className="p-2 rounded-lg border bg-muted/30 space-y-2">
                <p className="text-xs font-semibold">Campos de Medição</p>
                <div>
                  <label className="text-xs font-medium mb-0.5 block">Unidade *</label>
                  <Select value={unidadeMedicao || "__none__"} onValueChange={v => setUnidadeMedicao(v === "__none__" ? "" : v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhuma</SelectItem>
                      {UNIDADE_MEDICAO_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-medium mb-0.5 block">Responsável</label>
              <Select value={responsavelId || "__none__"} onValueChange={v => setResponsavelId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}{p.job_title ? ` — ${p.job_title}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
              <Switch id="auto-execucao" checked={autoExecucao} onCheckedChange={setAutoExecucao} />
              <label htmlFor="auto-execucao" className="text-xs font-medium cursor-pointer select-none">
                Tornar automático
              </label>
              <span className="text-[11px] text-muted-foreground">
                {autoExecucao
                  ? `Repete (${FREQUENCIA_OPTIONS.find(f => f.value === frequencia)?.label || frequencia})`
                  : "Execução única"}
              </span>
            </div>
          </div>
          <DialogFooter className="px-5 py-3 border-t">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave}>{editing ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir preventiva?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. O histórico também será removido.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Historico Dialog */}
      <Dialog open={!!historicoOpen} onOpenChange={() => setHistoricoOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Histórico de Execuções</DialogTitle>
          </DialogHeader>
          {historico.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">Nenhuma execução registrada.</p>
          ) : (
            <div className="max-h-[300px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Observação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.map(h => (
                    <TableRow key={h.id}>
                      <TableCell>{format(new Date(h.data_geracao), "dd/MM/yyyy HH:mm")}</TableCell>
                      <TableCell>{h.observacao || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Atividade Dialog */}
      <Dialog open={atividadeDialogOpen} onOpenChange={setAtividadeDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-5 pt-4 pb-2">
            <DialogTitle className="text-base">{editingAtividade ? "Editar Atividade" : "Nova Atividade"}</DialogTitle>
            <DialogDescription className="text-xs">Atividade do template do plano. Será copiada para cada preventiva gerada.</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-5 pb-2 space-y-2.5">
            <div>
              <label className="text-xs font-medium mb-0.5 block">Nome *</label>
              <Input className="h-8 text-sm" value={atNome} onChange={e => setAtNome(e.target.value)} placeholder="Ex: Medir pressão de descarga" />
            </div>
            <div>
              <label className="text-xs font-medium mb-0.5 block">Descrição</label>
              <Textarea className="text-sm min-h-[2rem]" value={atDescricao} onChange={e => setAtDescricao(e.target.value)} placeholder="Detalhes da atividade" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium mb-0.5 block">Frequência *</label>
                <Select value={atFrequencia} onValueChange={setAtFrequencia}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIA_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-0.5 block">Prioridade</label>
                <Select value={atPrioridade} onValueChange={setAtPrioridade}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORIDADE_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium mb-0.5 block">Bloco</label>
                <Select value={atBlocoId || "__none__"} onValueChange={v => setAtBlocoId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {blocos.map(b => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-0.5 block">Ativo</label>
                <Select value={atAtivoId || "__none__"} onValueChange={v => setAtAtivoId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {ativos.map(a => <SelectItem key={a.id} value={a.id}>{a.nome}{a.codigo_identificacao ? ` (${a.codigo_identificacao})` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium mb-0.5 block">Tipo de Serviço</label>
                <Select value={atTipoServico || "__none__"} onValueChange={v => setAtTipoServico(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {TIPO_SERVICO_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-0.5 block">Tipo de Atividade</label>
                <Select value={atTipoAtividade || "__none__"} onValueChange={v => setAtTipoAtividade(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {tiposAtividade.map(t => <SelectItem key={t.id} value={t.nome}>{t.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {atTipoAtividade === "Medição" && (
              <div className="p-2 rounded-lg border bg-muted/30 space-y-2">
                <p className="text-xs font-semibold">Campos de Medição</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium mb-0.5 block">Valor Medido *</label>
                    <Input className="h-8 text-sm" value={atTipoMedicao} onChange={e => setAtTipoMedicao(e.target.value)} placeholder="Ex: Pressão, Capacitância" />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-0.5 block">Unidade *</label>
                    <Select value={atUnidadeMedicao || "__none__"} onValueChange={v => setAtUnidadeMedicao(v === "__none__" ? "" : v)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhuma</SelectItem>
                        {UNIDADE_MEDICAO_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-medium mb-0.5 block">Responsável</label>
              <Select value={atResponsavelId || "__none__"} onValueChange={v => setAtResponsavelId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem responsável</SelectItem>
                  {profiles.map(pr => <SelectItem key={pr.id} value={pr.id}>{pr.nome}{pr.job_title ? ` — ${pr.job_title}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="px-5 py-3 border-t">
            <Button variant="outline" size="sm" onClick={() => setAtividadeDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSaveAtividade}>{editingAtividade ? "Salvar" : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Atividade Confirm */}
      <AlertDialog open={!!deleteAtividadeId} onOpenChange={() => setDeleteAtividadeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir atividade?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAtividade} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Drawer lateral: Atividades da preventiva */}
      <Sheet open={!!drawerPrevId} onOpenChange={(open) => { if (!open) { setDrawerPrevId(null); setPrevAtividades([]); } }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {(() => {
            const prev = preventivas.find(x => x.id === drawerPrevId);
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    Atividades ({prevAtividades.length})
                  </SheetTitle>
                  <SheetDescription className="truncate">
                    {prev?.titulo || ""}
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-4 space-y-3">
                  {can("preventivas.editar") && (
                    <Button size="sm" variant="outline" className="w-full" onClick={openCreateAtividade}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Nova Atividade
                    </Button>
                  )}

                  {loadingAtividades ? (
                    <p className="text-xs text-muted-foreground">Carregando...</p>
                  ) : prevAtividades.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">Nenhuma atividade cadastrada nesta preventiva.</p>
                  ) : (
                    <div className="space-y-2">
                      {prevAtividades.map(a => (
                        <div key={a.id} className={cn("flex flex-col gap-2 rounded-md border bg-card p-2.5", a.status === "Concluído" && "opacity-60")}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className={cn("text-sm font-medium truncate", a.status === "Concluído" && "line-through")}>{a.nome}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {[a.tipo_servico, a.prioridade].filter(Boolean).join(" • ") || "—"}
                              </p>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              {can("preventivas.editar") && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditAtividade(a)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {can("preventivas.excluir") && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteAtividadeId(a.id)}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <Select value={a.status || "Pendente"} onValueChange={v => handleChangeAtividadeStatus(a, v)}>
                            <SelectTrigger className={cn("h-7 text-[11px] border", getAtividadeStatusColor(a.status || "Pendente"))}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ATIVIDADE_STATUS_OPTIONS.map(s => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
