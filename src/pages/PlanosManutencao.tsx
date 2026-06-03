import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/use-permissions";
import { useCompany } from "@/hooks/use-company";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Plus, Pencil, Trash2, RefreshCw, ClipboardList, X,
  Settings, Search, Filter, ExternalLink, Wrench, Zap,
  CheckCircle2, AlertCircle, Activity, Gauge, Eye, Sparkles, Clock,
  Link2, FolderPlus, ChevronRight, CalendarIcon,
} from "@/lib/icons";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { migrateLegacyPreventiveOrdersIfNeeded } from "@/lib/migrateLegacyPreventiveOrders";
import { createPreventiveOrder } from "@/lib/createPreventiveOrder";
import { autoGeneratePreventivas } from "@/lib/autoGeneratePreventivas";

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
type Profile = { id: string; nome: string };

type Plano = {
  id: string;
  nome: string;
  descricao: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  frequencia: string;
  prioridade: string;
  bloco_id: string | null;
  ativo_id: string | null;
  tipo_servico: string | null;
  tipo_atividade: string | null;
  tipo_medicao: string | null;
  unidade_medicao: string | null;
  responsavel_id: string | null;
  automatico: boolean;
  data_inicio: string | null;
  qr_code_obrigatorio: boolean;
};

type PlanoAtividade = {
  id: string;
  plano_id: string;
  nome: string;
  descricao: string | null;
  frequencia: string;
  prioridade: string;
  tipo_servico: string | null;
  tipo_atividade: string | null;
  tipo_medicao: string | null;
  unidade_medicao: string | null;
  responsavel_id: string | null;
  ordem: number;
};

type PlanoAtivo = { id: string; plano_id: string; ativo_id: string };

type Preventiva = {
  id: string;
  titulo: string;
  ativo_id: string | null;
  bloco_id: string | null;
  frequencia: string;
  proxima_execucao: string;
  ultima_execucao: string | null;
  ativo: boolean;
  plano_id: string | null;
};

type OrdemPreventiva = {
  id: string;
  codigo_op: string;
  status: string;
  ativo_id: string | null;
  created_at: string;
  preventiva_id: string | null;
};

const FREQUENCIA_OPTIONS = [
  { value: "diaria", label: "Diária" },
  { value: "semanal", label: "Semanal" },
  { value: "quinzenal", label: "Quinzenal" },
  { value: "mensal", label: "Mensal" },
  { value: "bimestral", label: "Bimestral" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];

const PRIORIDADE_OPTIONS = ["Baixa", "Média", "Alta", "Urgente"];
const TIPO_SERVICO_OPTIONS = ["Elétrica", "Hidráulica", "Civil", "Climatização", "Outros"];
const TIPO_ATIVIDADE_OPTIONS = ["Medição", "Inspeção", "Limpeza", "Lubrificação", "Substituição", "Ajuste", "Teste"];
const UNIDADE_MEDICAO_OPTIONS = [
  "Amperes (A)", "Volts (V)", "Watts (W)", "Quilogramas (kg)", "Joules (J)",
  "Celsius (°C)", "Pascal (Pa)", "Ohms (Ω)", "Hertz (Hz)",
  "Libra-força por polegada quadrada (PSI)", "Farad (F)", "Kilopascal (kPa)",
  "Microfarad (µF)", "Kilo ohms (kΩ)", "Mega ohms (MΩ)",
  "Kilowatts (kW)", "Kilovolts (kV)", "Kilovolts reativo (kVAr)", "Outros",
];

const fmtFreq = (f: string) => FREQUENCIA_OPTIONS.find(o => o.value === f)?.label || f;
const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d.includes("T") ? d : d + "T00:00:00"), "dd/MM/yyyy"); } catch { return d; }
};
const isOverdue = (d: string | null) => {
  if (!d) return false;
  try {
    const target = new Date(d.includes("T") ? d : d + "T00:00:00");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return target < today;
  } catch { return false; }
};

const freqBadgeClass = (f: string) => {
  const v = (f || "").toLowerCase();
  if (v === "diaria") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (v === "semanal") return "bg-sky-50 text-sky-700 border-sky-200";
  if (v === "quinzenal") return "bg-cyan-50 text-cyan-700 border-cyan-200";
  if (v === "mensal") return "bg-amber-50 text-amber-700 border-amber-200";
  if (v === "trimestral") return "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200";
  if (v === "semestral" || v === "anual") return "bg-indigo-50 text-indigo-700 border-indigo-200";
  return "bg-muted text-muted-foreground border-border";
};

const tipoServicoColor = (t: string | null) => {
  const v = (t || "").toLowerCase();
  if (v === "elétrica" || v === "eletrica") return "bg-amber-50 text-amber-700 border-amber-200";
  if (v === "hidráulica" || v === "hidraulica") return "bg-sky-50 text-sky-700 border-sky-200";
  if (v === "civil") return "bg-stone-100 text-stone-700 border-stone-200";
  if (v === "climatização" || v === "climatizacao") return "bg-cyan-50 text-cyan-700 border-cyan-200";
  return "bg-muted text-muted-foreground border-border";
};

const tipoAtividadeMeta = (t: string | null): { color: string; Icon: any } => {
  const v = (t || "").toLowerCase();
  if (v === "medição" || v === "medicao") return { color: "bg-blue-50 text-blue-700 border-blue-200", Icon: Gauge };
  if (v === "inspeção" || v === "inspecao") return { color: "bg-violet-50 text-violet-700 border-violet-200", Icon: Eye };
  if (v === "limpeza") return { color: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: Sparkles };
  if (v === "lubrificação" || v === "lubrificacao") return { color: "bg-amber-50 text-amber-700 border-amber-200", Icon: Activity };
  if (v === "substituição" || v === "substituicao") return { color: "bg-rose-50 text-rose-700 border-rose-200", Icon: RefreshCw };
  if (v === "ajuste") return { color: "bg-orange-50 text-orange-700 border-orange-200", Icon: Settings };
  if (v === "teste") return { color: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200", Icon: CheckCircle2 };
  return { color: "bg-muted text-muted-foreground border-border", Icon: Activity };
};

const FREQ_DAYS: Record<string, number> = { diaria: 1, semanal: 7, quinzenal: 15 };
const FREQ_MONTHS: Record<string, number> = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
function calcProximaExecucao(from: Date, frequencia: string): Date {
  const d = new Date(from);
  if (FREQ_DAYS[frequencia]) { d.setDate(d.getDate() + FREQ_DAYS[frequencia]); return d; }
  d.setMonth(d.getMonth() + (FREQ_MONTHS[frequencia] || 1));
  return d;
}

const priorityDotColor = (p: string) => {
  const v = (p || "").toLowerCase();
  if (v === "urgente") return "bg-rose-500";
  if (v === "alta") return "bg-amber-500";
  if (v === "média" || v === "media") return "bg-sky-500";
  return "bg-emerald-500";
};

const initialsOf = (nome: string | null | undefined) => {
  if (!nome) return "—";
  const parts = nome.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() || "").join("") || "—";
};

const colorForInitials = (s: string) => {
  const palette = [
    "bg-sky-100 text-sky-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-fuchsia-100 text-fuchsia-700",
    "bg-violet-100 text-violet-700",
    "bg-rose-100 text-rose-700",
  ];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
};

const opStatusColor = (s: string | null | undefined) => {
  const v = (s || "").toLowerCase();
  if (v.includes("conclu")) return "text-emerald-600";
  if (v.includes("execu") || v.includes("andamento")) return "text-amber-600";
  if (v.includes("atras")) return "text-rose-600";
  return "text-muted-foreground";
};
const opStatusDot = (s: string | null | undefined) => {
  const v = (s || "").toLowerCase();
  if (v.includes("conclu")) return "bg-emerald-500";
  if (v.includes("execu") || v.includes("andamento")) return "bg-amber-500";
  if (v.includes("atras")) return "bg-rose-500";
  return "bg-muted-foreground";
};

export default function PlanosManutencao() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { companyId } = useCompany();

  const [planos, setPlanos] = useState<Plano[]>([]);
  const [ativos, setAtivos] = useState<Ativo[]>([]);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [allPlanoAtivos, setAllPlanoAtivos] = useState<PlanoAtivo[]>([]);
  const [allPlanoAtividades, setAllPlanoAtividades] = useState<PlanoAtividade[]>([]);
  const [allPreventivas, setAllPreventivas] = useState<Preventiva[]>([]);
  const [ordensPreventivas, setOrdensPreventivas] = useState<OrdemPreventiva[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [filterFreq, setFilterFreq] = useState<string>("__all__");
  const [filterBloco, setFilterBloco] = useState<string>("__all__");
  const [filterStatus, setFilterStatus] = useState<"ativo" | "inativo" | "all">("all");

  // Plano dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Plano | null>(null);
  const [dialog_mode, set_dialog_mode] = useState<"create" | "view" | "edit">("create");
  const is_view_mode = dialog_mode === "view";
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [planoFrequencia, setPlanoFrequencia] = useState("mensal");
  const [planoPrioridade, setPlanoPrioridade] = useState("Média");
  const [planoBlocoId, setPlanoBlocoId] = useState("");
  const [planoAtivoId, setPlanoAtivoId] = useState("");
  const [planoTipoServico, setPlanoTipoServico] = useState("");
  const [planoTipoAtividade, setPlanoTipoAtividade] = useState("");
  const [planoTipoMedicao, setPlanoTipoMedicao] = useState("");
  const [planoUnidadeMedicao, setPlanoUnidadeMedicao] = useState("");
  const [planoResponsavelId, setPlanoResponsavelId] = useState("");
  const [planoAutomatico, setPlanoAutomatico] = useState(false);
  const [planoDataInicio, setPlanoDataInicio] = useState<Date | undefined>(undefined);
  const [planoQrCodeObrigatorio, setPlanoQrCodeObrigatorio] = useState(true);
  const [localAtividades, setLocalAtividades] = useState<any[]>([]);
  const [localAtNome, setLocalAtNome] = useState("");
  const [localAtTipoAtividade, setLocalAtTipoAtividade] = useState("");
  const [localAtTipoServico, setLocalAtTipoServico] = useState("");
  const [localAtPrioridade, setLocalAtPrioridade] = useState("Média");

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Atividade dialog
  const [atividadeDialogOpen, setAtividadeDialogOpen] = useState(false);
  const [atividadePlanoId, setAtividadePlanoId] = useState<string | null>(null);
  const [editingAtividade, setEditingAtividade] = useState<PlanoAtividade | null>(null);
  const [atNome, setAtNome] = useState("");
  const [atDescricao, setAtDescricao] = useState("");
  const [atFrequencia, setAtFrequencia] = useState("mensal");
  const [atPrioridade, setAtPrioridade] = useState("Média");
  const [atTipoServico, setAtTipoServico] = useState("");
  const [atTipoAtividade, setAtTipoAtividade] = useState("");
  const [atTipoMedicao, setAtTipoMedicao] = useState("");
  const [atUnidadeMedicao, setAtUnidadeMedicao] = useState("");
  const [atResponsavelId, setAtResponsavelId] = useState("");
  const [deleteAtividadeId, setDeleteAtividadeId] = useState<string | null>(null);

  // Ativo link dialog
  const [ativoDialogOpen, setAtivoDialogOpen] = useState(false);
  const [ativoDialogPlanoId, setAtivoDialogPlanoId] = useState<string | null>(null);
  const [selectedAtivoId, setSelectedAtivoId] = useState("");

  // Vincular preventiva avulsa a um plano
  const [linkPrevDialogOpen, setLinkPrevDialogOpen] = useState(false);
  const [linkPrevId, setLinkPrevId] = useState<string | null>(null);
  const [linkPrevPlanoId, setLinkPrevPlanoId] = useState("");

  // Excluir preventiva avulsa
  const [deletePrevId, setDeletePrevId] = useState<string | null>(null);
  const [openingPreventivaId, setOpeningPreventivaId] = useState<string | null>(null);

  
  const fetchAll = useCallback(async () => {
    if (!companyId) return;
    console.log("fetchAll companyId:", companyId);
    setLoading(true);
    await migrateLegacyPreventiveOrdersIfNeeded();
    await autoGeneratePreventivas(true);
    const [planosRes, ativosRes, blocosRes, profilesRes, paRes, atRes, prevRes, opRes, histPrevRes] = await Promise.all([
      supabase.from("planos_manutencao").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("ativos").select("id, nome, codigo_identificacao, bloco_id, andar, sala, identificacao_ambiente, area_pavimento, grupo_areas").eq("company_id", companyId).order("nome"),
      supabase.from("blocos").select("id, nome"),
      (supabase as any).from("profiles").select("id, nome").eq("status", "ativo").eq("company_id", companyId).order("nome"),
      supabase.from("plano_ativos").select("*"),
      supabase.from("plano_atividades").select("*").order("ordem"),
      supabase.from("manutencao_preventiva").select("id, titulo, ativo_id, bloco_id, frequencia, proxima_execucao, ultima_execucao, ativo, plano_id"),
      (supabase.from("ordens_preventivas" as any).select("id, codigo_op, status, ativo_id, created_at, preventiva_id") as any).order("created_at", { ascending: false }),
      (supabase.from("historico_preventiva" as any).select("preventiva_id, ordem_preventiva_id") as any).not("ordem_preventiva_id", "is", null),
    ]);
    setPlanos((planosRes.data as Plano[]) || []);
    setAtivos((ativosRes.data as Ativo[]) || []);
    setBlocos((blocosRes.data as Bloco[]) || []);
    setProfiles((profilesRes.data as Profile[]) || []);
    setAllPlanoAtivos((paRes.data as PlanoAtivo[]) || []);
    setAllPlanoAtividades((atRes.data as PlanoAtividade[]) || []);
    setAllPreventivas((prevRes.data as Preventiva[]) || []);
    const historyMap = new Map<string, string>();
    ((histPrevRes?.data as any[]) || []).forEach((item) => {
      if (item?.ordem_preventiva_id && item?.preventiva_id && !historyMap.has(item.ordem_preventiva_id)) {
        historyMap.set(item.ordem_preventiva_id, item.preventiva_id);
      }
    });
    const opsHydrated = ((opRes.data as OrdemPreventiva[]) || []).map((op) => ({
      ...op,
      preventiva_id: op.preventiva_id || historyMap.get(op.id) || null,
    }));
    setOrdensPreventivas(opsHydrated);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchAtividadesOnly = useCallback(async () => {
    const { data } = await supabase.from("plano_atividades").select("*").order("ordem");
    setAllPlanoAtividades((data as PlanoAtividade[]) || []);
  }, []);

  const ativosMap = useMemo(() => {
    const m: Record<string, Ativo> = {};
    ativos.forEach(a => { m[a.id] = a; });
    return m;
  }, [ativos]);

  const blocosMap = useMemo(() => {
    const m: Record<string, string> = {};
    blocos.forEach(b => { if (b.nome) m[b.id] = b.nome; });
    return m;
  }, [blocos]);

  const profilesMap = useMemo(() => {
    const m: Record<string, Profile> = {};
    profiles.forEach(p => { m[p.id] = p; });
    return m;
  }, [profiles]);

  // Pre-compute per plano
  const planoMeta = useMemo(() => {
    const meta: Record<string, {
      ativoIds: string[];
      blocosNames: string[];
      preventivas: Preventiva[];
      proxima: string | null;
      ultima: string | null;
      frequencias: string[];
      atividades: PlanoAtividade[];
      tipoServicos: string[];
      tipoAtividades: string[];
    }> = {};

    planos.forEach(p => {
      const ativoIds = allPlanoAtivos.filter(pa => pa.plano_id === p.id).map(pa => pa.ativo_id);
      const blocosSet = new Set<string>();
      ativoIds.forEach(aid => {
        const a = ativosMap[aid];
        if (a?.bloco_id && blocosMap[a.bloco_id]) blocosSet.add(blocosMap[a.bloco_id]);
      });
      // Vincular preventivas pelo plano_id (autoritativo) e por ativo (legado)
      const ativoIdSet = new Set(ativoIds);
      const preventivas = allPreventivas.filter(pv =>
        pv.plano_id === p.id || (pv.ativo_id && ativoIdSet.has(pv.ativo_id))
      );
      const freqsSet = new Set<string>();
      let proxima: string | null = null;
      let ultima: string | null = null;
      preventivas.forEach(pv => {
        freqsSet.add(pv.frequencia);
        if (pv.proxima_execucao && (!proxima || pv.proxima_execucao < proxima)) proxima = pv.proxima_execucao;
        if (pv.ultima_execucao && (!ultima || pv.ultima_execucao > ultima)) ultima = pv.ultima_execucao;
      });
      const atividades = allPlanoAtividades.filter(a => a.plano_id === p.id);
      atividades.forEach(a => freqsSet.add(a.frequencia));

      const tipoServicos = Array.from(new Set(atividades.map(a => a.tipo_servico).filter(Boolean) as string[]));
      const tipoAtividades = Array.from(new Set(atividades.map(a => a.tipo_atividade).filter(Boolean) as string[]));

      meta[p.id] = {
        ativoIds,
        blocosNames: Array.from(blocosSet),
        preventivas,
        proxima,
        ultima,
        frequencias: Array.from(freqsSet),
        atividades,
        tipoServicos,
        tipoAtividades,
      };
    });
    return meta;
  }, [planos, allPlanoAtivos, ativosMap, blocosMap, allPreventivas, allPlanoAtividades]);

  // Preventivas legadas/avulsas: não estão associadas a nenhum plano (nem por plano_id, nem por ativo do plano)
  const preventivasLegadas = useMemo(() => {
    const ativosDePlanos = new Set<string>();
    allPlanoAtivos.forEach(pa => ativosDePlanos.add(pa.ativo_id));
    return allPreventivas.filter(pv =>
      !pv.plano_id && (!pv.ativo_id || !ativosDePlanos.has(pv.ativo_id))
    );
  }, [allPreventivas, allPlanoAtivos]);

  // OPs por preventiva
  const opsByPreventiva = useMemo(() => {
    const m: Record<string, OrdemPreventiva[]> = {};
    ordensPreventivas.forEach(op => {
      if (op.preventiva_id) {
        if (!m[op.preventiva_id]) m[op.preventiva_id] = [];
        m[op.preventiva_id].push(op);
      }
    });
    return m;
  }, [ordensPreventivas]);

  const handleOpenOpFromCard = useCallback(async (pv: Preventiva, fallbackOpId?: string | null) => {
    if (fallbackOpId) {
      navigate(`/ordens-preventivas?op=${fallbackOpId}`);
      return;
    }
    setOpeningPreventivaId(pv.id);
    try {
      const { data: histData } = await (supabase.from("historico_preventiva" as any)
        .select("ordem_preventiva_id")
        .eq("preventiva_id", pv.id)
        .not("ordem_preventiva_id", "is", null) as any)
        .order("data_geracao", { ascending: false })
        .limit(1)
        .maybeSingle();
      const existingId = (histData as any)?.ordem_preventiva_id;
      if (existingId) {
        navigate(`/ordens-preventivas?op=${existingId}`);
        return;
      }
      const created = await createPreventiveOrder(pv as any, { observacao_historico: "Geração via card de plano" });
      await fetchAll();
      navigate(`/ordens-preventivas?op=${created.id}`);
    } catch (error: any) {
      toast({
        title: "Erro ao abrir Ordem Preventiva",
        description: error?.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setOpeningPreventivaId(null);
    }
  }, [fetchAll, navigate]);

  // Apply filters
  const filteredPlanos = useMemo(() => {
    const s = search.trim().toLowerCase();
    return planos.filter(p => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (s && !p.nome.toLowerCase().includes(s) && !(p.descricao || "").toLowerCase().includes(s)) return false;
      const meta = planoMeta[p.id];
      if (filterFreq !== "__all__" && !(meta?.frequencias || []).includes(filterFreq)) return false;
      if (filterBloco !== "__all__") {
        const blocoName = blocosMap[filterBloco];
        if (!blocoName || !(meta?.blocosNames || []).includes(blocoName)) return false;
      }
      return true;
    });
  }, [planos, planoMeta, search, filterFreq, filterBloco, filterStatus, blocosMap]);

  // ── Plano CRUD ──
  const resetPlanoForm = () => {
    setNome(""); setDescricao(""); setEditing(null);
    setPlanoFrequencia("mensal"); setPlanoPrioridade("Média");
    setPlanoBlocoId(""); setPlanoAtivoId("");
    setPlanoTipoServico(""); setPlanoTipoAtividade("");
    setPlanoTipoMedicao(""); setPlanoUnidadeMedicao("");
    setPlanoResponsavelId(""); setPlanoAutomatico(false);
    setPlanoDataInicio(undefined);
    setPlanoQrCodeObrigatorio(true);
    setLocalAtividades([]); setLocalAtNome(""); setLocalAtTipoAtividade(""); setLocalAtTipoServico(""); setLocalAtPrioridade("Média");
  };
  const fillPlanoForm = (p: Plano) => {
    setEditing(p);
    setNome(p.nome);
    setDescricao(p.descricao || "");
    setPlanoFrequencia(p.frequencia || "mensal");
    setPlanoPrioridade(p.prioridade || "Média");
    setPlanoBlocoId(p.bloco_id || "");
    setPlanoAtivoId(p.ativo_id || "");
    setPlanoTipoServico(p.tipo_servico || "");
    setPlanoTipoAtividade(p.tipo_atividade || "");
    setPlanoTipoMedicao(p.tipo_medicao || "");
    setPlanoUnidadeMedicao(p.unidade_medicao || "");
    setPlanoResponsavelId(p.responsavel_id || "");
    setPlanoAutomatico(!!p.automatico);
    setPlanoDataInicio(p.data_inicio ? new Date(p.data_inicio + "T00:00:00") : undefined);
    setPlanoQrCodeObrigatorio(p.qr_code_obrigatorio !== false);
  };

  const openCreatePlano = () => {
    resetPlanoForm();
    set_dialog_mode("create");
    setDialogOpen(true);
  };

  const openViewPlano = (p: Plano) => {
    fillPlanoForm(p);
    set_dialog_mode("view");
    setDialogOpen(true);
  };

  const openEditPlano = (p: Plano) => {
    fillPlanoForm(p);
    set_dialog_mode("edit");
    setDialogOpen(true);
  };

  const handleSavePlano = async () => {
    if (!nome.trim()) {
      toast({ title: "Informe o nome do plano", variant: "destructive" });
      return;
    }
    const isMedicao = planoTipoAtividade === "Medição";
    const payload: any = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      frequencia: planoFrequencia,
      prioridade: planoPrioridade,
      bloco_id: planoBlocoId || null,
      ativo_id: planoAtivoId || null,
      tipo_servico: planoTipoServico || null,
      tipo_atividade: planoTipoAtividade || null,
      tipo_medicao: isMedicao ? (planoTipoMedicao || null) : null,
      unidade_medicao: isMedicao ? (planoUnidadeMedicao || null) : null,
      responsavel_id: planoResponsavelId || null,
      automatico: planoAutomatico,
      data_inicio: planoDataInicio ? format(planoDataInicio, "yyyy-MM-dd") : null,
      qr_code_obrigatorio: planoQrCodeObrigatorio,
    };
    if (editing) {
      const { error } = await supabase.from("planos_manutencao").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Plano atualizado!" });
    } else {
      const { error } = await supabase.from("planos_manutencao").insert(payload);
      if (error) { toast({ title: "Erro ao criar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Plano criado!" });
      if (localAtividades.length > 0) {
        const { data: planoCriado } = await supabase.from("planos_manutencao").select("id").eq("nome", nome.trim()).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (planoCriado?.id) {
          await supabase.from("plano_atividades").insert(localAtividades.map((a, idx) => ({ ...a, plano_id: planoCriado.id, ordem: idx })));
        }
      }

      // Auto-vínculo do ativo selecionado ao plano (se houver)
      if (planoAtivoId) {
        // Recuperar o id recém-criado
        const { data: planoCriado } = await supabase
          .from("planos_manutencao")
          .select("id")
          .eq("nome", nome.trim())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (planoCriado?.id) {
          await supabase.from("plano_ativos").insert({ plano_id: planoCriado.id, ativo_id: planoAtivoId });
        }
      }
    }
    setDialogOpen(false);
    resetPlanoForm();
    fetchAll();
  };

  const handleDeletePlano = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("planos_manutencao").delete().eq("id", deleteId);
    if (error) toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    else toast({ title: "Plano excluído" });
    setDeleteId(null);
    fetchAll();
  };

  const handleTogglePlanoStatus = async (p: Plano) => {
    const newStatus = p.status === "ativo" ? "inativo" : "ativo";
    const { error } = await supabase.from("planos_manutencao").update({ status: newStatus }).eq("id", p.id);
    if (error) { toast({ title: "Erro ao alterar status", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Plano ${newStatus === "ativo" ? "ativado" : "pausado"}` });
    fetchAll();
  };

  // ── Vincular preventiva avulsa a um plano ──
  const openLinkPrev = (prevId: string) => {
    setLinkPrevId(prevId);
    setLinkPrevPlanoId("");
    setLinkPrevDialogOpen(true);
  };

  const handleLinkPreventivaToPlano = async () => {
    if (!linkPrevId || !linkPrevPlanoId) {
      toast({ title: "Selecione um plano", variant: "destructive" });
      return;
    }
    const pv = allPreventivas.find(p => p.id === linkPrevId);
    const { error } = await supabase
      .from("manutencao_preventiva")
      .update({ plano_id: linkPrevPlanoId })
      .eq("id", linkPrevId);
    if (error) {
      toast({ title: "Erro ao vincular", description: error.message, variant: "destructive" });
      return;
    }
    if (pv?.ativo_id) {
      const jaVinculado = allPlanoAtivos.some(pa => pa.plano_id === linkPrevPlanoId && pa.ativo_id === pv.ativo_id);
      if (!jaVinculado) {
        await supabase.from("plano_ativos").insert({ plano_id: linkPrevPlanoId, ativo_id: pv.ativo_id });
      }
    }
    toast({ title: "Preventiva vinculada ao plano" });
    setLinkPrevDialogOpen(false);
    setLinkPrevId(null);
    setLinkPrevPlanoId("");
    fetchAll();
  };

  const handleConvertPrevToPlano = async (pv: Preventiva) => {
    const ativo = pv.ativo_id ? ativosMap[pv.ativo_id] : null;
    const nomePlano = pv.titulo || (ativo ? `Plano - ${ativo.nome}` : "Plano convertido");
    const { data: novoPlano, error: errPlano } = await supabase
      .from("planos_manutencao")
      .insert({ nome: nomePlano, descricao: `Plano gerado a partir da preventiva avulsa "${pv.titulo}"` })
      .select()
      .single();
    if (errPlano || !novoPlano) {
      toast({ title: "Erro ao criar plano", description: errPlano?.message, variant: "destructive" });
      return;
    }
    await supabase.from("manutencao_preventiva").update({ plano_id: novoPlano.id }).eq("id", pv.id);
    if (pv.ativo_id) {
      await supabase.from("plano_ativos").insert({ plano_id: novoPlano.id, ativo_id: pv.ativo_id });
    }
    toast({ title: "Preventiva convertida em plano!", description: `Plano "${nomePlano}" criado.` });
    fetchAll();
  };

  const handleDeletePreventivaAvulsa = async () => {
    if (!deletePrevId) return;
    if (!can("preventivas.excluir")) {
      toast({ title: "Sem permissão para excluir", variant: "destructive" });
      setDeletePrevId(null);
      return;
    }
    const { error } = await supabase.from("manutencao_preventiva").delete().eq("id", deletePrevId);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Preventiva excluída" });
    setDeletePrevId(null);
    fetchAll();
  };


  // ── Atividade CRUD ──
  const resetAtividadeForm = () => {
    setAtNome(""); setAtDescricao(""); setAtFrequencia(""); setAtPrioridade("");
    setAtTipoServico(""); setAtTipoAtividade(""); setAtTipoMedicao(""); setAtUnidadeMedicao("");
    setAtResponsavelId(""); setEditingAtividade(null);
  };
  const openCreateAtividade = (planoId: string) => {
    resetAtividadeForm(); setAtividadePlanoId(planoId); setAtividadeDialogOpen(true);
  };
  const openEditAtividade = (planoId: string, a: PlanoAtividade) => {
    setEditingAtividade(a); setAtividadePlanoId(planoId);
    setAtNome(a.nome); setAtDescricao(a.descricao || "");
    setAtFrequencia(a.frequencia); setAtPrioridade(a.prioridade);
    setAtTipoServico(a.tipo_servico || "");
    setAtTipoAtividade(a.tipo_atividade || "");
    setAtTipoMedicao(a.tipo_medicao || "");
    setAtUnidadeMedicao(a.unidade_medicao || "");
    setAtResponsavelId(a.responsavel_id || "");
    setAtividadeDialogOpen(true);
  };

  const handleSaveAtividade = async () => {
    if (!atividadePlanoId) return;
    const faltando: string[] = [];
    if (!atNome.trim()) faltando.push("Nome");
    if (!atPrioridade) faltando.push("Prioridade");
    if (!atTipoServico) faltando.push("Tipo de Serviço");
    if (!atTipoAtividade) faltando.push("Tipo de Atividade");
    if (faltando.length > 0) {
      toast({
        title: "Campos obrigatórios",
        description: `Preencha: ${faltando.join(", ")}.`,
        variant: "destructive",
      });
      return;
    }
    const list = allPlanoAtividades.filter(a => a.plano_id === atividadePlanoId);
    const isMedicao = atTipoAtividade === "Medição";
    const payload: any = {
      plano_id: atividadePlanoId,
      nome: atNome.trim(),
      descricao: atDescricao.trim() || null,
      prioridade: atPrioridade,
      tipo_servico: atTipoServico || null,
      tipo_atividade: atTipoAtividade || null,
      tipo_medicao: isMedicao ? (atTipoMedicao || null) : null,
      unidade_medicao: isMedicao ? (atUnidadeMedicao || null) : null,
      responsavel_id: atResponsavelId || null,
      ordem: editingAtividade ? editingAtividade.ordem : list.length,
    };
    if (editingAtividade) {
      const { error } = await supabase.from("plano_atividades").update(payload).eq("id", editingAtividade.id);
      if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Atividade atualizada!" });
    } else {
      const { error } = await supabase.from("plano_atividades").insert(payload);
      if (error) { toast({ title: "Erro ao criar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Atividade adicionada!" });
    }
    setAtividadeDialogOpen(false);
    resetAtividadeForm();
    fetchAtividadesOnly();
  };

  const handleDeleteAtividade = async () => {
    if (!deleteAtividadeId) return;
    const { error } = await supabase.from("plano_atividades").delete().eq("id", deleteAtividadeId);
    if (error) toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    else toast({ title: "Atividade excluída" });
    setDeleteAtividadeId(null);
    fetchAtividadesOnly();
  };

  // ── Ativo Link ──
  const handleLinkAtivo = async () => {
    if (!ativoDialogPlanoId || !selectedAtivoId) return;
    const { error } = await supabase.from("plano_ativos").insert({ plano_id: ativoDialogPlanoId, ativo_id: selectedAtivoId });
    if (error) { toast({ title: "Erro ao vincular", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Ativo vinculado!" });
    setAtivoDialogOpen(false);
    setSelectedAtivoId("");
    fetchAll();
  };

  const handleUnlinkAtivo = async (paId: string) => {
    const { error } = await supabase.from("plano_ativos").delete().eq("id", paId);
    if (error) toast({ title: "Erro ao desvincular", description: error.message, variant: "destructive" });
    else toast({ title: "Ativo desvinculado" });
    fetchAll();
  };

  // ── Gerar Preventivas a partir do Plano (Plano → Preventiva) ──
  const [generatingPlanoId, setGeneratingPlanoId] = useState<string | null>(null);
  const [drawerPlanoId, setDrawerPlanoId] = useState<string | null>(null);
  const [gerarDialogPlano, setGerarDialogPlano] = useState<Plano | null>(null);

  const handleGerarPreventivas = async (plano: Plano, modo: "data_plano" | "agora") => {
    if (!can("preventivas.criar")) {
      toast({ title: "Sem permissão para criar preventivas", variant: "destructive" });
      return;
    }
    const meta = planoMeta[plano.id];
    if (!meta || meta.atividades.length === 0) {
      toast({ title: "Cadastre pelo menos uma atividade no plano", variant: "destructive" });
      return;
    }

    setGeneratingPlanoId(plano.id);
    try {
      // Buscar Preventivas (mestres) já existentes vinculadas a este plano
      const { data: existentes } = await (supabase as any)
        .from("manutencao_preventiva")
        .select("id, ativo_id, titulo, descricao, frequencia, prioridade, tipo_servico, bloco_id, qr_code_obrigatorio")
        .eq("plano_id", plano.id);

      // Sincroniza configuração de QR obrigatório do plano nas preventivas mestres já existentes
      const planoQrObrig = (plano as any).qr_code_obrigatorio !== false;
      if ((existentes || []).length > 0) {
        await (supabase as any)
          .from("manutencao_preventiva")
          .update({ qr_code_obrigatorio: planoQrObrig })
          .eq("plano_id", plano.id);
      }

      const existentesArr: any[] = existentes || [];
      const ativoIdsComPreventiva = new Set(existentesArr.map((e: any) => e.ativo_id).filter(Boolean));
      const planoSemAtivoJaExiste = existentesArr.some((e: any) => !e.ativo_id);

      // Determinar quais ativos precisam de NOVA Preventiva mestre
      const ativosParaCriarMestre: (string | null)[] = meta.ativoIds.length > 0
        ? meta.ativoIds.filter(aid => !ativoIdsComPreventiva.has(aid))
        : (planoSemAtivoJaExiste ? [] : [null]);

      const freqPlano = plano.frequencia || "mensal";
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      let proximaDate: Date;
      if (modo === "data_plano" && plano.data_inicio) {
        const inicioDate = new Date(plano.data_inicio + "T00:00:00");
        proximaDate = inicioDate >= hoje ? inicioDate : calcProximaExecucao(new Date(), freqPlano);
      } else {
        // "agora" — gera a partir da data atual
        proximaDate = new Date();
      }
      const proxima = format(proximaDate, "yyyy-MM-dd");

      // 1) Criar Preventivas mestres faltantes (uma por ativo sem mestre)
      const novasMestres: any[] = [];
      for (const ativoId of ativosParaCriarMestre) {
        const ativo = ativoId ? ativosMap[ativoId] : null;
        const tituloPreventiva = `${plano.nome}${ativo?.nome ? ` — ${ativo.nome}` : ""}`;

        const { data: novaPrev, error: prevErr } = await supabase
          .from("manutencao_preventiva")
          .insert({
            titulo: tituloPreventiva,
            descricao: plano.descricao,
            frequencia: freqPlano,
            prioridade: meta.atividades[0]?.prioridade || "Média",
            tipo_servico: meta.atividades[0]?.tipo_servico || null,
            ativo_id: ativoId,
            bloco_id: ativo?.bloco_id || null,
            proxima_execucao: proxima,
            ativo: true,
            plano_id: plano.id,
            qr_code_obrigatorio: (plano as any).qr_code_obrigatorio !== false,
          } as any)
          .select("id, ativo_id, titulo, descricao, frequencia, prioridade, tipo_servico, bloco_id, qr_code_obrigatorio")
          .single();

        if (prevErr || !novaPrev) {
          console.error("Erro ao criar preventiva mestre:", prevErr);
          continue;
        }

        // Snapshot de atividades do plano para a Preventiva mestre
        const atividadesPayload = meta.atividades.map((a, idx) => ({
          preventiva_id: novaPrev.id,
          nome: a.nome,
          descricao: a.descricao,
          prioridade: a.prioridade,
          tipo_servico: a.tipo_servico,
          tipo_atividade: a.tipo_atividade,
          tipo_medicao: a.tipo_medicao,
          unidade_medicao: a.unidade_medicao,
          responsavel_id: a.responsavel_id,
          ordem: idx,
        }));
        if (atividadesPayload.length > 0) {
          const { error: atvErr } = await supabase
            .from("atividades_preventiva")
            .insert(atividadesPayload as any);
          if (atvErr) console.error("Erro ao copiar atividades:", atvErr);
        }
        novasMestres.push(novaPrev);
      }
// Sincroniza atividades das mestres existentes com o plano atual
for (const mestre of existentesArr) {
  // Remove atividades antigas
  await (supabase as any)
    .from("atividades_preventiva")
    .delete()
    .eq("preventiva_id", mestre.id);

  // Insere atividades atuais do plano
  const atividadesPayload = meta.atividades.map((a, idx) => ({
    preventiva_id: mestre.id,
    nome: a.nome,
    descricao: a.descricao,
    prioridade: a.prioridade,
    tipo_servico: a.tipo_servico,
    tipo_atividade: a.tipo_atividade,
    tipo_medicao: a.tipo_medicao,
    unidade_medicao: a.unidade_medicao,
    responsavel_id: a.responsavel_id,
    ordem: idx,
  }));
  if (atividadesPayload.length > 0) {
    await (supabase as any)
      .from("atividades_preventiva")
      .insert(atividadesPayload);
  }
}

// 2) Lista FINAL de Preventivas mestres para gerar OP imediatamente
      // 2) Lista FINAL de Preventivas mestres para gerar OP imediatamente
      // (sempre sobrepõe agendamento — cada clique gera nova OP para todas as mestres do plano)
      const todasMestres = [...existentesArr, ...novasMestres];

      if (todasMestres.length === 0) {
        toast({ title: "Não foi possível gerar Ordens Preventivas", variant: "destructive" });
        return;
      }

      let criadas = 0;
      let comErro = 0;
      let primeiraOpId: string | null = null;

      for (const mestre of todasMestres) {
        const ativo = mestre.ativo_id ? ativosMap[mestre.ativo_id] : null;
        try {
          const op = await createPreventiveOrder(
            {
              id: mestre.id,
              titulo: mestre.titulo || `${plano.nome}${ativo?.nome ? ` — ${ativo.nome}` : ""}`,
              descricao: mestre.descricao ?? plano.descricao,
              frequencia: mestre.frequencia || freqPlano,
              prioridade: mestre.prioridade || meta.atividades[0]?.prioridade || "Média",
              bloco_id: mestre.bloco_id || ativo?.bloco_id || null,
              ativo_id: mestre.ativo_id ?? null,
              tipo_servico: mestre.tipo_servico || meta.atividades[0]?.tipo_servico || null,
              tipo_atividade: meta.atividades[0]?.tipo_atividade || null,
              responsavel_id: meta.atividades[0]?.responsavel_id || null,
              qr_code_obrigatorio: planoQrObrig,
            } as any,
            { observacao_historico: "Geração manual via Plano (sobrepõe agendamento)" },
          );
          if (!primeiraOpId) primeiraOpId = op.id;
          criadas++;
        } catch (opErr: any) {
          console.error("Erro ao gerar Ordem Preventiva imediata:", opErr);
          comErro++;
        }
      }

      toast({
        title: criadas > 0 ? `${criadas} Ordem(ns) Preventiva(s) gerada(s)` : "Nenhuma Ordem Preventiva criada",
        description: comErro > 0 ? `${comErro} falha(s) durante a geração.` : `Disponíveis imediatamente em Ordens Preventivas.`,
        variant: comErro > 0 && criadas === 0 ? "destructive" : "default",
      });
      fetchAll();
      if (criadas > 0) {
        navigate(primeiraOpId ? `/ordens-preventivas?op=${primeiraOpId}` : "/ordens-preventivas");
      }
    } finally {
      setGeneratingPlanoId(null);
    }
  };

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div>
          <button onClick={() => navigate("/dashboard")} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-1">
            ← Dashboard
          </button>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Planos de Manutenção</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gerenciamento de planos e ordens de serviço preventivas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchAll} title="Atualizar">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          {can("preventivas.criar") && (
            <Button onClick={openCreatePlano}>
              <Plus className="mr-2 h-4 w-4" /> Novo Plano
            </Button>
          )}
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2 mt-5 mb-5 p-3 rounded-xl border bg-card">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filtros:
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar plano..."
            className="h-8 text-sm pl-8"
          />
        </div>

        <Select value={filterFreq} onValueChange={setFilterFreq}>
          <SelectTrigger className="h-8 text-sm w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Frequência: Todas</SelectItem>
            {FREQUENCIA_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterBloco} onValueChange={setFilterBloco}>
          <SelectTrigger className="h-8 text-sm w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Área: Todas</SelectItem>
            {blocos.filter(b => b.nome).map(b => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1 rounded-lg bg-muted p-0.5">
          <button
            onClick={() => setFilterStatus("all")}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-colors",
              filterStatus === "all" ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Todos
          </button>
          <button
            onClick={() => setFilterStatus("ativo")}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-colors",
              filterStatus === "ativo" ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Ativos
          </button>
          <button
            onClick={() => setFilterStatus("inativo")}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-colors",
              filterStatus === "inativo" ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Pausados
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : filteredPlanos.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            {planos.length === 0 ? "Nenhum plano de manutenção cadastrado." : "Nenhum plano corresponde aos filtros."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredPlanos.map(p => {
            const meta = planoMeta[p.id] || { ativoIds: [], blocosNames: [], preventivas: [], proxima: null, ultima: null, frequencias: [], atividades: [], tipoServicos: [], tipoAtividades: [] };
            const mainFreq = meta.frequencias[0];
            const planoAtivos = allPlanoAtivos.filter(pa => pa.plano_id === p.id);
            const subtitleParts = [
              meta.blocosNames[0],
              mainFreq ? fmtFreq(mainFreq) : null,
            ].filter(Boolean);

            return (
              <div key={p.id}>
                {/* ── CARD DO PLANO (template) ── */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('button, a, input, textarea, [data-no-card-click]')) return;
                    openViewPlano(p);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      const target = e.target as HTMLElement;
                      if (target.closest('button, a, input, textarea, [data-no-card-click]')) return;
                      e.preventDefault();
                      openViewPlano(p);
                    }
                  }}
                  className="relative rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col cursor-pointer hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {/* Borda azul lateral */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />

                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 p-4 pl-5 border-b border-border/60">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Settings className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-[17px] leading-tight truncate">
                          {p.nome}
                          {mainFreq && <span className="text-muted-foreground font-normal"> — {fmtFreq(mainFreq)}</span>}
                        </h3>
                        {subtitleParts.length > 0 && (
                          <p className="text-[12.5px] text-muted-foreground mt-0.5 truncate">
                            {subtitleParts.join(", ")}
                          </p>
                        )}
                        {(meta.tipoServicos.length > 0 || meta.tipoAtividades.length > 0) && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {meta.tipoServicos.map(ts => (
                              <span key={ts} className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border", tipoServicoColor(ts))}>
                                {ts}
                              </span>
                            ))}
                            {meta.tipoAtividades.map(ta => {
                              const m = tipoAtividadeMeta(ta);
                              return (
                                <span key={ta} className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border", m.color)}>
                                  <m.Icon className="h-2.5 w-2.5" />
                                  {ta}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {mainFreq && (
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border",
                          freqBadgeClass(mainFreq)
                        )}>
                          {fmtFreq(mainFreq)} <Zap className="h-2.5 w-2.5" />
                        </span>
                      )}
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border",
                        p.status === "ativo"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-muted text-muted-foreground border-border"
                      )}>
                        {p.status === "ativo" ? "Ativa" : "Pausada"}
                      </span>
                    </div>
                  </div>

                  {/* Equipamentos vinculados */}
                  <div className="px-4 pl-5 py-3 border-b border-border/60">
                    <p className="text-[10.5px] font-bold tracking-wider uppercase text-muted-foreground inline-flex items-center gap-1.5 mb-2.5">
                      <Wrench className="h-3 w-3" /> Equipamentos vinculados
                    </p>
                    {planoAtivos.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Nenhum equipamento vinculado.</p>
                    ) : (
                      <div className="space-y-1">
                        {planoAtivos.map(pa => {
                          const a = ativosMap[pa.ativo_id];
                          const blocoName = a?.bloco_id ? blocosMap[a.bloco_id] : null;
                          const codNome = a ? `${a.codigo_identificacao || "—"}/${a.nome}` : "—";
                          return (
                            <div key={pa.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-accent/50 group text-[12.5px]">
                              <div className="h-5 w-5 rounded bg-muted flex items-center justify-center shrink-0">
                                <Settings className="h-3 w-3 text-muted-foreground" />
                              </div>
                              <span className="flex-1 font-medium truncate font-mono text-[12px]">{codNome}</span>
                              {a?.andar && (
                                <span className="text-[10.5px] px-1.5 py-0.5 rounded border bg-muted/50 text-muted-foreground inline-flex items-center gap-0.5">
                                  {a.andar} <Search className="h-2.5 w-2.5" />
                                </span>
                              )}
                              <span className="text-[10.5px] px-1.5 py-0.5 rounded border bg-muted/50 text-muted-foreground">
                                {blocoName || "—"}
                              </span>
                              {can("preventivas.excluir") && (
                                <button
                                  onClick={() => handleUnlinkAtivo(pa.id)}
                                  className="opacity-0 group-hover:opacity-100 ml-1 inline-flex items-center justify-center h-5 w-5 rounded hover:bg-destructive/10"
                                  title="Desvincular"
                                >
                                  <X className="h-3 w-3 text-destructive" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Ações agrupadas: Vincular atividade + Nova atividade */}
                  {can("preventivas.criar") && (
                    <div className="px-4 pl-5 py-3 border-b border-border/60 bg-muted/20">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openCreateAtividade(p.id)}
                          className="h-8 gap-1.5 text-xs font-medium"
                          title="Adicionar nova atividade"
                        >
                          <Plus className="h-3.5 w-3.5" /> Nova atividade
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Atividades — gatilho discreto que abre drawer lateral */}
                  <div className="px-4 pl-5 py-2.5 border-b border-border/60">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setDrawerPlanoId(p.id)}
                      className="h-8 gap-1.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                      title="Ver atividades do plano"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium">
                        Ver atividades ({meta.atividades.length})
                      </span>
                    </Button>
                  </div>

                  {/* Footer: actions */}
                  <div className="mt-auto flex items-center justify-end gap-1 px-4 pl-5 py-2.5 bg-muted/40">
                    {can("preventivas.criar") && (
                      <button
                        onClick={() => setGerarDialogPlano(p)}
                        disabled={generatingPlanoId === p.id || meta.atividades.length === 0}
                        className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md border bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Gerar Preventivas para todos os ativos do plano"
                      >
                        <Zap className="h-3 w-3" />
                        {generatingPlanoId === p.id ? "Gerando..." : "Gerar Preventivas"}
                      </button>
                    )}
                    {can("preventivas.editar") && (
                      <button
                        onClick={() => handleTogglePlanoStatus(p)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md border bg-card hover:bg-accent transition-colors"
                        title={p.status === "ativo" ? "Pausar" : "Ativar"}
                      >
                        {p.status === "ativo" ? (
                          <svg width="11" height="11" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                        ) : (
                          <svg width="11" height="11" fill="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        )}
                      </button>
                    )}
                    {can("preventivas.editar") && (
                      <button
                        onClick={() => openEditPlano(p)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md border bg-card hover:bg-accent transition-colors"
                        title="Editar"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    {can("preventivas.excluir") && (
                      <button
                        onClick={() => setDeleteId(p.id)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md border bg-card hover:bg-destructive/10 hover:border-destructive/40 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </button>
                    )}
                  </div>
              </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preventivas legadas / avulsas (sem plano vinculado) */}
      {!loading && preventivasLegadas.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold tracking-tight inline-flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                Preventivas avulsas (sem plano)
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Preventivas antigas ou criadas diretamente, sem vínculo com um plano modelo. Mantidas para preservar histórico.
              </p>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 font-semibold">
              {preventivasLegadas.length} {preventivasLegadas.length === 1 ? "registro" : "registros"}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {preventivasLegadas.map(pv => {
              const ativo = pv.ativo_id ? ativosMap[pv.ativo_id] : null;
              const blocoName = (pv.bloco_id && blocosMap[pv.bloco_id]) || (ativo?.bloco_id ? blocosMap[ativo.bloco_id] : null);
              const overdue = isOverdue(pv.proxima_execucao);
              const ops = opsByPreventiva[pv.id] || [];
              const lastOp = ops[0] || null;
              const opStatus = (lastOp?.status || "").toLowerCase();
              const isConcluida = opStatus.includes("conclu");
              const subtitle = [blocoName, fmtFreq(pv.frequencia)].filter(Boolean).join(", ");

              return (
                <div
                  key={pv.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenOpFromCard(pv as any, lastOp?.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOpenOpFromCard(pv as any, lastOp?.id); } }}
                  className="rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
                  title={lastOp ? "Abrir detalhes da Ordem Preventiva" : "Gerar e abrir Ordem Preventiva"}
                >
                  <div className="flex items-start justify-between gap-3 p-4 border-b border-border/60">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                        overdue ? "bg-rose-50" : isConcluida ? "bg-emerald-50" : "bg-amber-50"
                      )}>
                        <AlertCircle className={cn(
                          "h-5 w-5",
                          overdue ? "text-rose-600" : isConcluida ? "text-emerald-600" : "text-amber-600"
                        )} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-[15px] leading-tight truncate">
                          {ativo?.nome || pv.titulo}
                          <span className="text-muted-foreground font-normal"> — {fmtFreq(pv.frequencia)}</span>
                        </h4>
                        {subtitle && (
                          <p className="text-[12px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border",
                        overdue
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : isConcluida
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                      )}>
                        {overdue ? "Atrasada" : isConcluida ? "Concluída" : "Pendente"}
                      </div>
                      <p className="text-[10.5px] text-muted-foreground mt-1 font-mono">
                        {fmtDate(pv.proxima_execucao)}
                      </p>
                    </div>
                  </div>

                  <div className="px-4 py-3 border-b border-border/60 grid grid-cols-2 gap-3 text-[12.5px]">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Próxima</span>
                      <span className={cn("font-mono font-semibold", overdue && "text-rose-600")}>
                        {fmtDate(pv.proxima_execucao)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Última</span>
                      <span className="font-mono font-semibold">{fmtDate(pv.ultima_execucao)}</span>
                    </div>
                  </div>

                  <div className="px-4 py-2 border-b border-border/60 flex flex-wrap items-center gap-1.5 bg-muted/30">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11.5px]"
                      onClick={(e) => { e.stopPropagation(); navigate(`/preventivas?prev=${pv.id}`); }}
                      title="Abrir detalhes"
                    >
                      <Eye className="h-3 w-3 mr-1" /> Ver
                    </Button>
                    {can("preventivas.editar") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11.5px]"
                        onClick={(e) => { e.stopPropagation(); navigate(`/preventivas?prev=${pv.id}&edit=1`); }}
                        title="Editar preventiva"
                      >
                        <Pencil className="h-3 w-3 mr-1" /> Editar
                      </Button>
                    )}
                    {can("preventivas.excluir") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11.5px] text-destructive hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeletePrevId(pv.id); }}
                        title="Excluir preventiva"
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Excluir
                      </Button>
                    )}
                    <div className="w-full h-px bg-border/60 my-1" />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11.5px] flex-1"
                      onClick={(e) => { e.stopPropagation(); openLinkPrev(pv.id); }}
                      disabled={planos.length === 0}
                      title={planos.length === 0 ? "Crie um plano antes" : "Vincular a um plano existente"}
                    >
                      <Link2 className="h-3 w-3 mr-1" /> Vincular a plano
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11.5px] flex-1"
                      onClick={(e) => { e.stopPropagation(); handleConvertPrevToPlano(pv); }}
                      title="Criar um novo plano com base nesta preventiva"
                    >
                      <FolderPlus className="h-3 w-3 mr-1" /> Converter em plano
                    </Button>
                  </div>

                  {lastOp && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleOpenOpFromCard(pv as any, lastOp.id); }}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors",
                        isConcluida ? "bg-emerald-50/60 hover:bg-emerald-50" : "bg-amber-50/40 hover:bg-amber-50/70"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn("h-2 w-2 rounded-full shrink-0", opStatusDot(lastOp.status))} />
                        <span className="font-bold text-[12.5px] font-mono shrink-0">{lastOp.codigo_op}</span>
                        <span className={cn("text-[12.5px] font-medium truncate", opStatusColor(lastOp.status))}>
                          {lastOp.status}
                        </span>
                      </div>
                      <span className="text-primary font-semibold text-[11.5px] inline-flex items-center gap-0.5 shrink-0">
                        Ver <ExternalLink className="h-3 w-3" />
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create/Edit Plano Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog_mode === "view" ? "Visualizar Plano" : editing ? "Editar Plano" : "Novo Plano de Manutenção"}
            </DialogTitle>
            <DialogDescription>
              {dialog_mode === "view"
                ? "Visualize as informações do plano. Para alterar, use o botão Editar do card."
                : "Informe os dados do plano. Estes campos servem como padrão e são herdados pelas preventivas geradas a partir dele."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-0.5 block">Nome *</label>
              <Input className="h-9 text-sm" value={nome} onChange={e => setNome(e.target.value)} readOnly={is_view_mode} placeholder="Ex: Bombas - Mensal" />
            </div>
            <div>
              <label className="text-xs font-medium mb-0.5 block">Descrição</label>
              <Textarea className="text-sm" value={descricao} onChange={e => setDescricao(e.target.value)} readOnly={is_view_mode} placeholder="Detalhes do plano" rows={2} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium mb-0.5 block">Frequência <span className="text-destructive">*</span></label>
                <Select value={planoFrequencia} onValueChange={setPlanoFrequencia} disabled={is_view_mode}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIA_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-0.5 block">Prioridade *</label>
                <Select value={planoPrioridade} onValueChange={setPlanoPrioridade} disabled={is_view_mode}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORIDADE_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium mb-0.5 block">Data de início (opcional)</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={is_view_mode}
                    className={cn(
                      "w-full h-9 justify-start text-left font-normal text-sm",
                      !planoDataInicio && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {planoDataInicio ? format(planoDataInicio, "dd/MM/yyyy", { locale: ptBR }) : "Definir data específica"}
                    {planoDataInicio && !is_view_mode && (
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setPlanoDataInicio(undefined); }}
                        className="ml-auto text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={planoDataInicio}
                    onSelect={setPlanoDataInicio}
                    disabled={(date) => {
                      const t = new Date(); t.setHours(0, 0, 0, 0);
                      return date < t;
                    }}
                    initialFocus
                    locale={ptBR}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <p className="text-[11px] text-muted-foreground mt-1">
                Se definida, a primeira preventiva será agendada para esta data. As próximas seguirão a frequência do plano.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium mb-0.5 block">Bloco</label>
                <Select value={planoBlocoId || "__none__"} onValueChange={v => setPlanoBlocoId(v === "__none__" ? "" : v)} disabled={is_view_mode}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {blocos.filter(b => b.nome).map(b => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-0.5 block">Ativo</label>
                <Select value={planoAtivoId || "__none__"} onValueChange={v => setPlanoAtivoId(v === "__none__" ? "" : v)} disabled={is_view_mode}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {ativos
                      .filter(a => !planoBlocoId || a.bloco_id === planoBlocoId)
                      .map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.nome}{a.codigo_identificacao ? ` (${a.codigo_identificacao})` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(() => {
              const a = ativos.find(x => x.id === planoAtivoId);
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
                <Select value={planoTipoServico || "__none__"} onValueChange={v => setPlanoTipoServico(v === "__none__" ? "" : v)} disabled={is_view_mode}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {TIPO_SERVICO_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-0.5 block">Tipo de Atividade</label>
                <Select value={planoTipoAtividade || "__none__"} onValueChange={v => setPlanoTipoAtividade(v === "__none__" ? "" : v)} disabled={is_view_mode}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {TIPO_ATIVIDADE_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {planoTipoAtividade === "Medição" && (
              <div className="rounded-md border border-dashed p-2">
                <label className="text-xs font-medium mb-0.5 block">Unidade de Medição</label>
                <Select value={planoUnidadeMedicao || "__none__"} onValueChange={v => setPlanoUnidadeMedicao(v === "__none__" ? "" : v)} disabled={is_view_mode}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {UNIDADE_MEDICAO_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-xs font-medium mb-0.5 block">Responsável</label>
              <Select value={planoResponsavelId || "__none__"} onValueChange={v => setPlanoResponsavelId(v === "__none__" ? "" : v)} disabled={is_view_mode}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem responsável</SelectItem>
                  {profiles.map(pr => <SelectItem key={pr.id} value={pr.id}>{pr.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
              <div className="min-w-0 pr-3">
                <p className="text-sm font-medium">Tornar automático</p>
                <p className="text-xs text-muted-foreground">
                  Quando ativado, o sistema gera as preventivas deste plano automaticamente conforme a frequência.
                </p>
              </div>
              <Switch checked={planoAutomatico} onCheckedChange={setPlanoAutomatico} disabled={is_view_mode} />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
              <div className="min-w-0 pr-3">
                <p className="text-sm font-medium">QR Code obrigatório</p>
                <p className="text-xs text-muted-foreground">
                  Quando ativado, a execução das Ordens Preventivas exige escanear o QR Code do equipamento antes de iniciar o cronômetro.
                </p>
              </div>
              <Switch checked={planoQrCodeObrigatorio} onCheckedChange={setPlanoQrCodeObrigatorio} disabled={is_view_mode} />
            </div>
          </div>
          {dialog_mode === "create" && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 flex items-center justify-between border-b">
                  <span className="text-sm font-semibold">Atividades do Plano</span>
                  <span className="text-xs text-muted-foreground">{localAtividades.length} atividade(s)</span>
                </div>
                <div className="p-3 space-y-2">
                  {localAtividades.map((a, idx) => (
                    <div key={idx} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                      <span className="flex-1 font-medium truncate">{a.nome}</span>
                      <span className="text-xs text-muted-foreground">{a.tipo_atividade || "—"}</span>
                      <button onClick={() => setLocalAtividades(prev => prev.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  <div className="rounded-md border bg-muted/20 p-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Nome *</label>
                        <Input value={localAtNome} onChange={e => setLocalAtNome(e.target.value)} placeholder="Ex: Medir pressão" className="h-8 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Tipo de Atividade *</label>
                        <Select value={localAtTipoAtividade || "__none__"} onValueChange={v => setLocalAtTipoAtividade(v === "__none__" ? "" : v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Selecione</SelectItem>
                            {TIPO_ATIVIDADE_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Tipo de Serviço</label>
                        <Select value={localAtTipoServico || "__none__"} onValueChange={v => setLocalAtTipoServico(v === "__none__" ? "" : v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Nenhum</SelectItem>
                            {TIPO_SERVICO_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Prioridade</label>
                        <Select value={localAtPrioridade} onValueChange={setLocalAtPrioridade}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PRIORIDADE_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button size="sm" className="w-full h-8" disabled={!localAtNome.trim() || !localAtTipoAtividade}
                      onClick={() => {
                        setLocalAtividades(prev => [...prev, { nome: localAtNome.trim(), tipo_atividade: localAtTipoAtividade, tipo_servico: localAtTipoServico || null, prioridade: localAtPrioridade, descricao: null, tipo_medicao: null, unidade_medicao: null, responsavel_id: null }]);
                        setLocalAtNome(""); setLocalAtTipoAtividade(""); setLocalAtTipoServico("");
                      }}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar atividade
                    </Button>
                  </div>
                </div>
              </div>
            )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              {is_view_mode ? "Fechar" : "Cancelar"}
            </Button>
            {!is_view_mode && can("preventivas.editar") && (
              <Button size="sm" onClick={handleSavePlano}>{editing ? "Salvar" : "Criar"}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Atividade Dialog */}
      <Dialog open={atividadeDialogOpen} onOpenChange={setAtividadeDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAtividade ? "Editar Atividade" : "Nova Atividade"}</DialogTitle>
            <DialogDescription>Atividade do template do plano. Será copiada para cada preventiva gerada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-0.5 block">Nome <span className="text-destructive">*</span></label>
              <Input className="h-8 text-sm" value={atNome} onChange={e => setAtNome(e.target.value)} placeholder="Ex: Medir pressão de descarga" />
            </div>
            <div>
              <label className="text-xs font-medium mb-0.5 block">Descrição</label>
              <Textarea className="text-sm min-h-[2rem]" value={atDescricao} onChange={e => setAtDescricao(e.target.value)} placeholder="Detalhes da atividade" rows={2} />
            </div>
            <div>
              <label className="text-xs font-medium mb-0.5 block">Prioridade <span className="text-destructive">*</span></label>
              <Select value={atPrioridade} onValueChange={setAtPrioridade}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {PRIORIDADE_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                A frequência é definida no plano principal e aplicada a todas as atividades.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium mb-0.5 block">Tipo de Serviço <span className="text-destructive">*</span></label>
                <Select value={atTipoServico} onValueChange={setAtTipoServico}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    {TIPO_SERVICO_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-0.5 block">Tipo de Atividade <span className="text-destructive">*</span></label>
                <Select value={atTipoAtividade} onValueChange={setAtTipoAtividade}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    {TIPO_ATIVIDADE_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {atTipoAtividade === "Medição" && (
              <div>
                <label className="text-xs font-medium mb-0.5 block">Unidade de Medição</label>
                <Select value={atUnidadeMedicao || "__none__"} onValueChange={v => setAtUnidadeMedicao(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {UNIDADE_MEDICAO_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium mb-0.5 block">Responsável</label>
              <Select value={atResponsavelId || "__none__"} onValueChange={v => setAtResponsavelId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem responsável</SelectItem>
                  {profiles.map(pr => <SelectItem key={pr.id} value={pr.id}>{pr.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAtividadeDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSaveAtividade}>{editingAtividade ? "Salvar" : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vincular Ativo Dialog */}
      <Dialog open={ativoDialogOpen} onOpenChange={setAtivoDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Vincular Ativo</DialogTitle>
            <DialogDescription>Selecione o ativo para vincular a este plano.</DialogDescription>
          </DialogHeader>
          <div>
            <Select value={selectedAtivoId || "__none__"} onValueChange={v => setSelectedAtivoId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione um ativo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Selecione</SelectItem>
                {ativos
                  .filter(a => !allPlanoAtivos.some(pa => pa.plano_id === ativoDialogPlanoId && pa.ativo_id === a.id))
                  .map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nome}{a.codigo_identificacao ? ` (${a.codigo_identificacao})` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAtivoDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleLinkAtivo} disabled={!selectedAtivoId}>Vincular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vincular Preventiva avulsa a um Plano */}
      <Dialog open={linkPrevDialogOpen} onOpenChange={setLinkPrevDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Vincular preventiva a um plano</DialogTitle>
            <DialogDescription>Selecione o plano modelo que esta preventiva passará a seguir.</DialogDescription>
          </DialogHeader>
          <div>
            <Select value={linkPrevPlanoId || "__none__"} onValueChange={v => setLinkPrevPlanoId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione um plano" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Selecione</SelectItem>
                {planos.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {planos.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">Nenhum plano cadastrado. Crie um plano primeiro ou use "Converter em plano".</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLinkPrevDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleLinkPreventivaToPlano} disabled={!linkPrevPlanoId}>Vincular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drawer lateral: Atividades do plano */}
      <Sheet open={!!drawerPlanoId} onOpenChange={(open) => !open && setDrawerPlanoId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          {(() => {
            const plano = planos.find(p => p.id === drawerPlanoId);
            const atividades = drawerPlanoId ? (planoMeta[drawerPlanoId]?.atividades || []) : [];
            return (
              <>
                <SheetHeader className="px-5 py-4 border-b shrink-0">
                  <SheetTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Atividades
                    <span className="text-muted-foreground font-normal">({atividades.length})</span>
                  </SheetTitle>
                  <SheetDescription className="text-xs truncate">
                    {plano?.nome || ""}
                  </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-5 py-3">
                  {atividades.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic text-center py-8">
                      Nenhuma atividade cadastrada.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {atividades.map(a => {
                        const tipoMeta = tipoAtividadeMeta(a.tipo_atividade);
                        const responsavel = a.responsavel_id ? profilesMap[a.responsavel_id] : null;
                        return (
                          <div key={a.id} className="group flex items-start gap-2 py-2 px-2.5 rounded-md hover:bg-accent/50 text-sm border border-transparent hover:border-border/60 transition-colors">
                            {a.tipo_atividade ? (
                              <tipoMeta.Icon className={cn("h-4 w-4 mt-0.5 shrink-0", tipoMeta.color.split(" ")[1])} />
                            ) : (
                              <span className={cn("h-2 w-2 rounded-full shrink-0 mt-2", priorityDotColor(a.prioridade))} />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{a.nome}</p>
                              {a.descricao && (
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{a.descricao}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                {a.tipo_atividade && (
                                  <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border", tipoMeta.color)}>
                                    <tipoMeta.Icon className="h-2.5 w-2.5" />
                                    {a.tipo_atividade}
                                  </span>
                                )}
                                {a.tipo_servico && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                                    {a.tipo_servico}
                                  </span>
                                )}
                                {responsavel && (
                                  <span
                                    className={cn("inline-flex items-center justify-center h-5 min-w-[22px] px-1 rounded text-[10px] font-bold", colorForInitials(responsavel.nome))}
                                    title={responsavel.nome}
                                  >
                                    {initialsOf(responsavel.nome)}
                                  </span>
                                )}
                              </div>
                            </div>
                            {can("preventivas.editar") && (
                              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity shrink-0">
                                <button
                                  onClick={() => { const id = drawerPlanoId; setDrawerPlanoId(null); openEditAtividade(id!, a); }}
                                  className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-accent"
                                  title="Editar"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                {can("preventivas.excluir") && (
                                  <button
                                    onClick={() => setDeleteAtividadeId(a.id)}
                                    className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-accent"
                                    title="Excluir"
                                  >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {can("preventivas.criar") && drawerPlanoId && (
                  <div className="px-5 py-3 border-t shrink-0 bg-muted/30">
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => { const id = drawerPlanoId; setDrawerPlanoId(null); openCreateAtividade(id!); }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Nova atividade
                    </Button>
                  </div>
                )}
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Delete Plano */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir plano?</AlertDialogTitle>
            <AlertDialogDescription>Todas as atividades e vínculos serão removidos. Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePlano} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Atividade */}
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

      <AlertDialog open={!!deletePrevId} onOpenChange={() => setDeletePrevId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir preventiva?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os registros vinculados a esta preventiva serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePreventivaAvulsa} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Gerar Preventivas — escolher modo */}
      <Dialog open={!!gerarDialogPlano} onOpenChange={(open) => !open && setGerarDialogPlano(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Gerar Preventivas
            </DialogTitle>
            <DialogDescription>
              Escolha como deseja gerar as ordens preventivas para o plano{" "}
              <span className="font-semibold text-foreground">{gerarDialogPlano?.nome}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <button
              onClick={async () => {
                const plano = gerarDialogPlano;
                if (!plano) return;
                setGerarDialogPlano(null);
                await handleGerarPreventivas(plano, "data_plano");
              }}
              disabled={!gerarDialogPlano?.data_inicio}
              className="w-full text-left rounded-lg border bg-card hover:bg-accent hover:border-primary/40 transition-all p-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-start gap-3">
                <CalendarIcon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Gerar a partir da data do plano</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {gerarDialogPlano?.data_inicio
                      ? `Usar a data configurada: ${format(new Date(gerarDialogPlano.data_inicio + "T00:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`
                      : "Plano sem data de início configurada."}
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={async () => {
                const plano = gerarDialogPlano;
                if (!plano) return;
                setGerarDialogPlano(null);
                await handleGerarPreventivas(plano, "agora");
              }}
              className="w-full text-left rounded-lg border bg-card hover:bg-accent hover:border-primary/40 transition-all p-3"
            >
              <div className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Gerar agora</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Gerar imediatamente com base na data atual ({format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}).
                  </p>
                </div>
              </div>
            </button>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setGerarDialogPlano(null)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
