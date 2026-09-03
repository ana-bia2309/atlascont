import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usePermissions } from "@/hooks/use-permissions";
import { useCompany } from "@/hooks/use-company";
import { useUserRole } from "@/hooks/use-user-role";
import { useAuth } from "@/hooks/useAuth";
import { useSearchParams } from "react-router-dom";
import { useRealtime } from "@/hooks/use-realtime";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import MemorialMateriaisSection from "@/components/os/MemorialMateriaisSection";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Pencil, Trash2, CalendarIcon, RefreshCw, Search, X, Eye, CheckCircle2, Paperclip, Download as DownloadIcon, SlidersHorizontal, Star, StarOff, Wrench, Package, FileText, MoreVertical } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import MateriaisSection, { MateriaisSectionHandle } from "@/components/os/MateriaisSection";
import AnexosSection, { AnexosSectionHandle } from "@/components/os/AnexosSection";
import FotosOSSection, { FotosOSSectionHandle } from "@/components/os/FotosOSSection";
import AtividadesNovaOSSection, { AtividadesNovaOSSectionHandle } from "@/components/os/AtividadesNovaOSSection";
import TimerOSSection from "@/components/os/TimerOSSection";
import CronogramaSection from "@/components/os/CronogramaSection";
import HistoricoOSSection from "@/components/os/HistoricoOSSection";
import AvaliacaoResumoSection from "@/components/os/AvaliacaoResumoSection";
import ComentariosOSSection from "@/components/os/ComentariosOSSection";
import AttachmentFileRow from "@/components/os/AttachmentFileRow";
import ChecklistOSSection from "@/components/os/ChecklistOSSection";
import AtividadesUsuarioSection from "@/components/os/AtividadesUsuarioSection";
import ColaboradoresOSSection from "@/components/os/ColaboradoresOSSection";
import MultiUserSelect from "@/components/os/MultiUserSelect";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import SignatureCanvas from "react-signature-canvas";
import { cn } from "@/lib/utils";
import { logActivity, computeDiff } from "@/lib/activity-log";
import { computeSlaStatus, formatSlaDeadline, computePrazoStatus } from "@/lib/sla-utils";
import { STATUS_OPTIONS, getStatusColor, isFinishedStatus } from "@/lib/os-status";
import AtivoQuickModal from "@/components/os/AtivoQuickModal";
import AtivoDisponibilidadeSection from "@/components/os/AtivoDisponibilidadeSection";

type Bloco = { id: string; nome: string | null };
type CronogramaOption = { id: string; titulo: string };
type AtivoOption = { id: string; nome: string; codigo_identificacao: string | null };

type TecnicoOption = { id: string; nome: string; job_title: string | null };

type OrdemServico = {
  id: string;
  codigo_os: string | null;
  status: string | null;
  prioridade: string | null;
  bloco_id: string | null;
  andar: string | null;
  sala: string | null;
  prazo: string | null;
  data_inicio: string | null;
  data_termino: string | null;
  observacoes: string | null;
  equipamentos: string | null;
  custo_total: number | null;
  created_at: string | null;
  criado_por: string | null;
  editado_por: string | null;
  finalizado_por: string | null;
  editado_em: string | null;
  finalizado_em: string | null;
  responsible_user_id: string | null;
  responsible_user_ids?: string[];
  time_tracking_mode: string | null;
};

type MaterialOS = {
  id: string;
  os_id: string;
  nome_material: string;
  quantidade: number;
  unidade: string | null;
  custo_unitario: number;
  custo_total_item: number | null;
};

import type { AttachmentRecord } from "@/lib/os-attachments";

type AnexoOS = AttachmentRecord;

// STATUS_OPTIONS imported from os-status.ts
const PRIORIDADE_OPTIONS = ["Baixa", "Média", "Alta", "Crítica"];
const TIPO_SERVICO_OPTIONS = ["Elétrica", "Hidráulica", "Civil", "Climatização", "Outros"];
const NATUREZA_SERVICO_OPTIONS = ["Instalação", "Manutenção"];
const PRIORIDADE_COLORS: Record<string, string> = {
  "Baixa": "bg-zinc-100 text-zinc-600 border-zinc-200",
  "Média": "bg-info/10 text-info border-info/20",
  "Alta": "bg-warning/10 text-warning border-warning/20",
  "Crítica": "bg-destructive/10 text-destructive border-destructive/20",
};

const PRIORIDADE_ICONS: Record<string, string> = {
  "Baixa": "🔵",
  "Média": "🟡",
  "Alta": "🟠",
  "Crítica": "🔴",
};

function DatePickerField({
  label, value, onChange,
}: { label: React.ReactNode; value: Date | undefined; onChange: (date: Date | undefined) => void }) {
  return (
    <div>
      <label className="text-sm font-medium mb-1 block">{label}</label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(value, "dd/MM/yyyy") : "Selecione uma data"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={value} onSelect={onChange} initialFocus className={cn("p-3 pointer-events-auto")} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function AtivoStatusBadge({ ativoId, nome }: { ativoId: string; nome: string }) {
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    (supabase as any).from("ativos").select("disponibilidade_status")
      .eq("id", ativoId).single()
      .then(({ data }: any) => setStatus(data?.disponibilidade_status || null));
  }, [ativoId]);
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-medium">{nome}</span>
      {status && (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${status === "indisponivel"
          ? "bg-destructive/10 text-destructive border-destructive/20"
          : "bg-success/10 text-success border-success/20"
          }`}>
          {status === "indisponivel" ? "🔴 Indisponível" : "🟢 Disponível"}
        </span>
      )}
    </div>
  );
}
export default function OrdensServico() {
  const { companyId } = useCompany();
  const { can } = usePermissions();
  const { role } = useUserRole();
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);

  // Resolve current user's profile id once
  useEffect(() => {
    if (!session?.user) { setCurrentProfileId(null); return; }
    supabase.from("profiles").select("id").eq("user_id", session.user.id).maybeSingle()
      .then(({ data }) => setCurrentProfileId(data?.id || null));
  }, [session?.user?.id]);

  const isTecnico = role === "tecnico";
  // Check if current user is a responsible assigned to the OS being edited
  const isTecnicoAssigned = (os: OrdemServico | null) =>
    isTecnico && !!currentProfileId && (os?.responsible_user_ids?.includes(currentProfileId) || os?.responsible_user_id === currentProfileId);
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [cronogramas, setCronogramas] = useState<CronogramaOption[]>([]);
  const [ativosOptions, setAtivosOptions] = useState<AtivoOption[]>([]);
  const [tecnicosOptions, setTecnicosOptions] = useState<TecnicoOption[]>([]);
  const [blocosMap, setBlocosMap] = useState<Record<string, string>>({});
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [responsaveisByOs, setResponsaveisByOs] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [materiaisMap, setMateriaisMap] = useState<Record<string, MaterialOS[]>>({});
  const [anexosMap, setAnexosMap] = useState<Record<string, AttachmentRecord[]>>({});
  const [colaboradoresMap, setColaboradoresMap] = useState<Record<string, string[]>>({});
  const [responsaveisMap, setResponsaveisMap] = useState<Record<string, string[]>>({});
  const [anexosModalOsId, setAnexosModalOsId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState<string>("");
  const [bulkStatusSaving, setBulkStatusSaving] = useState(false);
  const [editing, setEditing] = useState<OrdemServico | null>(null);
  const [viewing, setViewing] = useState<OrdemServico | null>(null);
  const [assinaturaOpen, setAssinaturaOpen] = useState(false);
  const sigCanvasRef = useRef<any>(null);
  const [salvandoAssinatura, setSalvandoAssinatura] = useState(false);

  useEffect(() => {
    if (!viewing) return;
    // Registra clima para qualquer OS ao abrir, independente de status
    // A função só atualiza se ainda não tiver clima registrado
    (supabase as any)
      .from("ordens_servico")
      .select("clima_temperatura")
      .eq("id", viewing.id)
      .single()
      .then(({ data }: any) => {
        if (!data?.clima_temperatura) {
          import("@/lib/registrarClima").then(({ registrarClimaOS }) => {
            registrarClimaOS(viewing.id).then(async () => {
              await fetchData();
              const { data } = await (supabase as any)
                .from("ordens_servico")
                .select("clima_temperatura, clima_condicao")
                .eq("id", viewing.id)
                .single();
              if (data?.clima_temperatura) {
                setViewing(prev => prev ? { ...prev, ...data } : prev);
              }
            });
          });
        }
      });
  }, [viewing?.id]);
  const [pendingEdit, setPendingEdit] = useState<OrdemServico | null>(null);

  // Filter state

  // Filter state
  const [filterBlocoId, setFilterBlocoId] = useState<string>(searchParams.get("bloco") || "__all__");
  const [filterStatus, setFilterStatus] = useState<string>(searchParams.get("status") || "__all__");
  const [filterPrioridade, setFilterPrioridade] = useState<string>(searchParams.get("prioridade") || "__all__");
  const [filterAtrasada, setFilterAtrasada] = useState<boolean>(searchParams.get("atrasada") === "true");
  const [filterCodigo, setFilterCodigo] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [sortColumn, setSortColumn] = useState<"data" | "prazo" | "custo" | "prioridade">("data");
  const [filterAndar, setFilterAndar] = useState("__all__");
  const [filterSala, setFilterSala] = useState("__all__");
  const [filterTipoServico, setFilterTipoServico] = useState("__all__");
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>();
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>();

  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Saved filters (localStorage)
  type SavedFilter = {
    name: string;
    blocoId: string; status: string; prioridade: string;
    andar: string; sala: string; tipoServico: string;
    dateFrom?: string; dateTo?: string;
  };
  const SAVED_FILTERS_KEY = "atlas_saved_filters";
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => {
    try { return JSON.parse(localStorage.getItem(SAVED_FILTERS_KEY) || "[]"); } catch { return []; }
  });
  const [filterName, setFilterName] = useState("");

  const persistSavedFilters = (filters: SavedFilter[]) => {
    setSavedFilters(filters);
    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(filters));
  };

  const saveCurrentFilter = () => {
    const name = filterName.trim();
    if (!name) return;
    const f: SavedFilter = {
      name,
      blocoId: filterBlocoId, status: filterStatus, prioridade: filterPrioridade,
      andar: filterAndar, sala: filterSala, tipoServico: filterTipoServico,
      dateFrom: filterDateFrom?.toISOString(), dateTo: filterDateTo?.toISOString(),
    };
    persistSavedFilters([...savedFilters.filter(s => s.name !== name), f]);
    setFilterName("");
    toast({ title: "Filtro salvo", description: `"${name}" salvo com sucesso.` });
  };

  const applySavedFilter = (f: SavedFilter) => {
    setFilterBlocoId(f.blocoId); setFilterStatus(f.status); setFilterPrioridade(f.prioridade);
    setFilterAndar(f.andar); setFilterSala(f.sala); setFilterTipoServico(f.tipoServico);
    setFilterDateFrom(f.dateFrom ? new Date(f.dateFrom) : undefined);
    setFilterDateTo(f.dateTo ? new Date(f.dateTo) : undefined);
    setAdvancedOpen(true);
  };

  const removeSavedFilter = (name: string) => {
    persistSavedFilters(savedFilters.filter(s => s.name !== name));
  };

  // Sync URL params on mount
  useEffect(() => {
    const s = searchParams.get("status");
    if (s) setFilterStatus(s);
    const b = searchParams.get("bloco");
    if (b) setFilterBlocoId(b);
    const p = searchParams.get("prioridade");
    if (p) setFilterPrioridade(p);
    setFilterAtrasada(searchParams.get("atrasada") === "true");
  }, [searchParams]);

  // Auto-open create dialog when ?criar=true (e.g. from Chamados)
  const criarHandledRef = useRef(false);
  useEffect(() => {
    if (criarHandledRef.current) return;
    if (searchParams.get("criar") !== "true") return;
    if (loading) return;
    criarHandledRef.current = true;
    // Clear the param
    const next = new URLSearchParams(searchParams);
    next.delete("criar");
    setSearchParams(next, { replace: true });
    // Pre-fill from chamado data if available
    resetForm();
    try {
      const raw = sessionStorage.getItem("chamado_prefill");
      if (raw) {
        const prefill = JSON.parse(raw);
        sessionStorage.removeItem("chamado_prefill");
        if (prefill.ativo_id) setAtivoId(prefill.ativo_id);
        if (prefill.bloco_id) setBlocoId(prefill.bloco_id);
        if (prefill.andar) setAndar(prefill.andar);
        if (prefill.sala) setSala(prefill.sala);
        if (prefill.descricao) setObservacoes(prefill.descricao);
        if (prefill.prioridade) setPrioridade(prefill.prioridade);
        if (prefill.chamado_id) setChamadoOrigemId(prefill.chamado_id);
      }
      // External chamado (Chamados Externos panel)
      const rawExt = sessionStorage.getItem("chamado_externo_prefill");
      if (rawExt) {
        const prefill = JSON.parse(rawExt);
        sessionStorage.removeItem("chamado_externo_prefill");
        if (prefill.ativo_id) setAtivoId(prefill.ativo_id);
        if (prefill.bloco_id) setBlocoId(prefill.bloco_id);
        if (prefill.andar) setAndar(prefill.andar);
        if (prefill.sala) setSala(prefill.sala);
        if (prefill.descricao) setObservacoes(prefill.descricao);
        if (prefill.prioridade) setPrioridade(prefill.prioridade);
        if (prefill.chamado_externo_id) setChamadoExternoId(prefill.chamado_externo_id);
        if (prefill.numero_os_externo) setNumeroOsExterno(prefill.numero_os_externo);
      }
    } catch { /* ignore */ }
    setDialogOpen(true);
  }, [searchParams, loading]);

  const fetchData = useCallback(async () => {
    if (!companyId) return; // ✅ guard

    setLoading(true);

    const [ordensRes, blocosRes, matsRes, anexosRes, cronosRes, ativosRes, profilesRes, slaRes, tecnicosRes]: any =
      await Promise.all([
        (supabase as any)
          .from("ordens_servico")
          .select("*")
          .eq("company_id", companyId)
          .not("origem", "in", "(Preventiva,Chamado)")
          .order("created_at", { ascending: false }),

        (supabase as any)
          .from("blocos")
          .select("id, nome")
          .eq("company_id", companyId)
          .order("nome"),

        (supabase as any)
          .from("materiais_os")
          .select("id, os_id, nome_material, quantidade, unidade, custo_unitario, custo_total_item"),

        (supabase as any)
          .from("anexos_os")
          .select("id, os_id, nome_arquivo, url_arquivo, tipo_arquivo, file_path, tamanho_arquivo, bucket_name, created_at"),

        (supabase as any)
          .from("cronogramas")
          .select("id, titulo")
          .eq("company_id", companyId)
          .order("titulo"),

        (supabase as any)
          .from("ativos")
          .select("id, nome, codigo_identificacao")
          .eq("company_id", companyId)
          .order("nome"),

        (supabase as any)
          .from("profiles")
          .select("id, nome")
          .eq("company_id", companyId),

        (supabase as any)
          .from("sla_definicoes")
          .select("*")
          .eq("company_id", companyId),

        (supabase as any)
          .from("profiles")
          .select("id, nome, job_title, status")
          .eq("company_id", companyId),
      ]);
    if (ordensRes.error) {
      console.error("Erro ao carregar O.S.:", ordensRes.error);
      toast({ title: "Erro ao carregar O.S.", description: ordensRes.error.message, variant: "destructive" });
    } else {
      setOrdens(ordensRes.data || []);
    }

    if (blocosRes.error) {
      toast({ title: "Erro ao carregar blocos", description: blocosRes.error.message, variant: "destructive" });
    } else {
      const bList = blocosRes.data || [];
      setBlocos(bList);
      const map: Record<string, string> = {};
      bList.forEach((b) => { map[b.id] = b.nome || ""; });
      setBlocosMap(map);
    }

    const mMap: Record<string, MaterialOS[]> = {};
    (matsRes.data || []).forEach((m) => {
      if (!mMap[m.os_id]) mMap[m.os_id] = [];
      mMap[m.os_id].push(m);
    });
    setMateriaisMap(mMap);

    const aMap: Record<string, AttachmentRecord[]> = {};
    ((anexosRes.data || []) as unknown as AttachmentRecord[]).forEach((a) => {
      if (!aMap[a.os_id]) aMap[a.os_id] = [];
      aMap[a.os_id].push(a);
    });
    setAnexosMap(aMap);

    // Fetch responsáveis grouped by OS
    const { data: respData } = await (supabase as any)
      .from("os_responsaveis")
      .select(`
    os_id,
    profile_id,
    profiles(nome),
    ordens_servico!inner(company_id)
  `)
      .eq("ordens_servico.company_id", companyId);
    const rMap: Record<string, string[]> = {};
    const rIdsMap: Record<string, string[]> = {};
    (respData || []).forEach((r: any) => {
      if (!rMap[r.os_id]) rMap[r.os_id] = [];
      if (!rIdsMap[r.os_id]) rIdsMap[r.os_id] = [];
      rMap[r.os_id].push(r.profiles?.nome || "—");
      rIdsMap[r.os_id].push(r.profile_id);
    });
    setResponsaveisMap(rMap);

    // Enrich OS data with responsible_user_ids
    setOrdens((prev) => prev.map((os) => ({
      ...os,
      responsible_user_ids: rIdsMap[os.id] || [],
    })));

    // Fetch auxiliares grouped by OS
    const { data: colabData } = await (supabase as any)
      .from("os_colaboradores")
      .select(`
    os_id,
    profile_id,
    profiles(nome),
    ordens_servico!inner(company_id)
  `)
      .eq("ordens_servico.company_id", companyId);
    const cMap: Record<string, string[]> = {};
    (colabData || []).forEach((c: any) => {
      if (!cMap[c.os_id]) cMap[c.os_id] = [];
      cMap[c.os_id].push(c.profiles?.nome || "—");
    });
    setColaboradoresMap(cMap);

    setCronogramas((cronosRes.data as any[]) || []);
    setAtivosOptions((ativosRes.data as AtivoOption[]) || []);

    const pMap: Record<string, string> = {};
    ((profilesRes.data as any[]) || []).forEach((p: any) => { pMap[p.id] = p.nome; });
    setProfilesMap(pMap);

    setSlaDefinicoes((slaRes?.data as any[]) || []);

    // All active profiles can be assigned as responsible
    const allProfiles = (tecnicosRes?.data as any[]) || [];
    const allUsers: TecnicoOption[] = allProfiles
      .map((p: any) => ({ id: p.id, nome: p.nome, job_title: p.job_title || null }));
    setTecnicosOptions(allUsers);

    // Carrega campos obrigatórios
    if (companyId) {
      const { data: camposConfig } = await (supabase as any)
        .from("os_campos_config")
        .select("campo")
        .eq("company_id", companyId)
        .eq("obrigatorio", true);
      setCamposObrigatorios((camposConfig || []).map((c: any) => c.campo));
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useRealtime(
    ["ordens_servico", "blocos", "materiais_os", "anexos_os"],
    fetchData,
    companyId
  );

  // Auto-open OS detail when ?os=<id> is present
  useEffect(() => {
    const osId = searchParams.get("os");
    if (!osId || loading || ordens.length === 0) return;
    const found = ordens.find((o) => o.id === osId);
    if (found) {
      setViewing(found);
      // Clear the param so it doesn't re-trigger
      const next = new URLSearchParams(searchParams);
      next.delete("os");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, ordens, loading]);

  // Derive unique andar/sala values for filter dropdowns
  const uniqueAndares = useMemo(() => [...new Set(ordens.map(o => o.andar).filter(Boolean) as string[])].sort(), [ordens]);
  const uniqueSalas = useMemo(() => [...new Set(ordens.map(o => o.sala).filter(Boolean) as string[])].sort(), [ordens]);
  const uniqueTiposServico = useMemo(() => [...new Set(ordens.map(o => (o as any).tipo_servico).filter(Boolean) as string[])].sort(), [ordens]);

  const filteredOrdens = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return ordens.filter((os) => {
      const finished = isFinishedStatus(os.status);
      if (filterBlocoId !== "__all__" && os.bloco_id !== filterBlocoId) return false;
      if (filterStatus === "__todas__") {
        // Show everything
      } else if (filterStatus === "__encerradas__") {
        if (!finished) return false;
      } else if (filterStatus === "__all__") {
        // By default, hide finished OS from the main listing
        if (finished) return false;
      } else if (os.status !== filterStatus) {
        return false;
      }
      if (filterPrioridade !== "__all__" && os.prioridade !== filterPrioridade) return false;
      if (filterAtrasada) {
        if (finished) return false;
        if (!os.prazo || os.prazo >= todayStr) return false;
      }
      if (filterAndar !== "__all__" && os.andar !== filterAndar) return false;
      if (filterSala !== "__all__" && os.sala !== filterSala) return false;
      if (filterTipoServico !== "__all__" && (os as any).tipo_servico !== filterTipoServico) return false;
      if (filterCodigo.trim() && !(os.codigo_os || "").toLowerCase().includes(filterCodigo.trim().toLowerCase())) return false;

      if (filterDateFrom) {
        const created = os.created_at ? new Date(os.created_at) : null;
        if (!created || created < filterDateFrom) return false;
      }
      if (filterDateTo) {
        const created = os.created_at ? new Date(os.created_at) : null;
        const endOfDay = new Date(filterDateTo); endOfDay.setHours(23, 59, 59, 999);
        if (!created || created > endOfDay) return false;
      }
      return true;
    });
  }, [ordens, filterBlocoId, filterStatus, filterPrioridade, filterAtrasada, filterCodigo, filterAndar, filterSala, filterTipoServico, filterDateFrom, filterDateTo]);

  const hasActiveFilters = filterBlocoId !== "__all__" || filterStatus !== "__all__" || filterPrioridade !== "__all__" || filterAtrasada || filterCodigo.trim() !== "" || filterAndar !== "__all__" || filterSala !== "__all__" || filterTipoServico !== "__all__" || !!filterDateFrom || !!filterDateTo;

  const atrasadasCount = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return ordens.filter((os) => !isFinishedStatus(os.status) && os.prazo && os.prazo < todayStr).length;
  }, [ordens]);

  const sortedOrdens = useMemo(() => {
    const dir = sortAsc ? 1 : -1;
    const prioridadeRank = (p: string | null) => {
      const idx = PRIORIDADE_OPTIONS.indexOf(p || "Média");
      return idx === -1 ? PRIORIDADE_OPTIONS.indexOf("Média") : idx;
    };
    return [...filteredOrdens].sort((a, b) => {
      let cmp = 0;
      if (sortColumn === "prazo") {
        const av = a.prazo || "9999-12-31";
        const bv = b.prazo || "9999-12-31";
        cmp = av < bv ? -1 : av > bv ? 1 : 0;
      } else if (sortColumn === "custo") {
        cmp = (a.custo_total || 0) - (b.custo_total || 0);
      } else if (sortColumn === "prioridade") {
        cmp = prioridadeRank(a.prioridade) - prioridadeRank(b.prioridade);
      } else {
        const av = a.created_at || "";
        const bv = b.created_at || "";
        cmp = av < bv ? -1 : av > bv ? 1 : 0;
      }
      return cmp * dir;
    });
  }, [filteredOrdens, sortColumn, sortAsc]);

  const toggleSort = (col: "data" | "prazo" | "custo" | "prioridade") => {
    if (sortColumn === col) {
      setSortAsc((prev) => !prev);
    } else {
      setSortColumn(col);
      setSortAsc(col === "prazo"); // Prazo começa ascendente (mais urgente primeiro); as demais, descendente
    }
  };
  const activeFilterCount = [filterBlocoId !== "__all__", filterStatus !== "__all__", filterPrioridade !== "__all__", filterAtrasada, filterCodigo.trim() !== "", filterAndar !== "__all__", filterSala !== "__all__", filterTipoServico !== "__all__", !!filterDateFrom, !!filterDateTo].filter(Boolean).length;

  const clearFilters = () => {
    setFilterBlocoId("__all__"); setFilterStatus("__all__"); setFilterPrioridade("__all__");
    setFilterAtrasada(false);
    setFilterCodigo(""); setFilterAndar("__all__"); setFilterSala("__all__");
    setFilterTipoServico("__all__"); setFilterDateFrom(undefined); setFilterDateTo(undefined);
    setSearchParams({});
  };

  const parseDate = (d: string | null) => {
    if (!d) return undefined;
    try {
      const date = new Date(d + "T00:00:00");
      return isNaN(date.getTime()) ? undefined : date;
    } catch {
      return undefined;
    }
  };
  const formatDateStr = (d: Date | undefined) => d ? format(d, "yyyy-MM-dd") : null;

  const [codigoOs, setCodigoOs] = useState("");
  const [status, setStatus] = useState("Não Iniciada");
  const [prioridade, setPrioridade] = useState("");

  const handlePrioridadeChange = useCallback(async (novaPrioridade: string) => {
    setPrioridade(novaPrioridade);
    console.log("prioridade mudou:", novaPrioridade, "companyId:", companyId);
    if (!companyId) return;
    try {
      const { data } = await (supabase as any)
        .from("prioridade_regras")
        .select("prazo_horas")
        .eq("company_id", companyId)
        .eq("prioridade", novaPrioridade)
        .maybeSingle();
      if (data?.prazo_horas) {
        const novoPrazo = new Date();
        novoPrazo.setHours(novoPrazo.getHours() + data.prazo_horas);
        setPrazo(novoPrazo);
        toast({ title: `Prazo definido automaticamente: ${format(novoPrazo, "dd/MM/yyyy")}` });
      }
    } catch { /* silencioso */ }
  }, [companyId]);
  const [blocoId, setBlocoId] = useState("");
  const [prazo, setPrazo] = useState<Date | undefined>();
  const [dataInicio, setDataInicio] = useState<Date | undefined>();
  const [dataTermino, setDataTermino] = useState<Date | undefined>();
  const [observacoes, setObservacoes] = useState("");
  const [equipamentos, setEquipamentos] = useState("");
  const [andar, setAndar] = useState("");
  const [sala, setSala] = useState("");
  const [cronogramaId, setCronogramaId] = useState("");
  const [ativoId, setAtivoId] = useState("");
  const [ativoModalOpen, setAtivoModalOpen] = useState(false);
  const [tipoServico, setTipoServico] = useState("");
  const [naturezaServico, setNaturezaServico] = useState("");
  const [slaDefinicoes, setSlaDefinicoes] = useState<any[]>([]);
  const [camposObrigatorios, setCamposObrigatorios] = useState<string[]>([]);
  const [formResponsaveis, setFormResponsaveis] = useState<string[]>([]);
  const [formColaboradores, setFormColaboradores] = useState<string[]>([]);
  const [formFiscais, setFormFiscais] = useState<string[]>([]);
  const materiaisRef = useRef<MateriaisSectionHandle>(null);
  const anexosRef = useRef<AnexosSectionHandle>(null);
  const fotosRef = useRef<FotosOSSectionHandle>(null);
  const atividadesNovaRef = useRef<AtividadesNovaOSSectionHandle>(null);
  const [chamadoOrigemId, setChamadoOrigemId] = useState<string | null>(null);
  const [chamadoExternoId, setChamadoExternoId] = useState<string | null>(null);
  const [numeroOsExterno, setNumeroOsExterno] = useState("");
  const [osTab, setOsTab] = useState("materiais");
  const [memorialTotal, setMemorialTotal] = useState(0);

  const isObrigatorio = (campo: string) => camposObrigatorios.includes(campo);
  const labelCampo = (label: string, campo: string) => (
    <>{label}{isObrigatorio(campo) && <span className="text-destructive ml-0.5">*</span>}</>
  );

  const resetForm = () => {
    setCodigoOs(""); setStatus("Não Iniciada"); setPrioridade(""); setBlocoId("");
    setAndar(""); setSala(""); setCronogramaId(""); setAtivoId(""); setTipoServico(""); setNaturezaServico("");
    setPrazo(undefined); setDataInicio(undefined); setDataTermino(undefined);
    setObservacoes(""); setEquipamentos(""); setFormResponsaveis([]); setFormColaboradores([]); setFormFiscais([]); setEditing(null);
    setChamadoOrigemId(null);
    setChamadoExternoId(null);
    setNumeroOsExterno("");
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (os: OrdemServico) => {
    setEditing(os);
    setCodigoOs(os.codigo_os || ""); setStatus(os.status || "Não Iniciada");
    setPrioridade(os.prioridade || "Média");
    setBlocoId(os.bloco_id || ""); setAndar(os.andar || ""); setSala(os.sala || "");
    setPrazo(parseDate(os.prazo)); setDataInicio(parseDate(os.data_inicio)); setDataTermino(parseDate(os.data_termino));
    setObservacoes(os.observacoes || ""); setEquipamentos(os.equipamentos || "");
    setCronogramaId((os as any).cronograma_id || "");
    setAtivoId((os as any).ativo_id || "");
    setTipoServico((os as any).tipo_servico || "");
    setNaturezaServico((os as any).natureza_servico || "");
    // Load responsáveis and colaboradores for this OS
    setNumeroOsExterno((os as any).numero_os_externo || "");
    Promise.all([
      supabase.from("os_responsaveis").select("profile_id").eq("os_id", os.id),
      supabase.from("os_colaboradores").select("profile_id").eq("os_id", os.id),
      (supabase as any).from("os_fiscais").select("profile_id").eq("os_id", os.id),
    ]).then(([respRes, colabRes, fiscaisRes]) => {
      const respIds = (respRes.data || []).map((d: any) => d.profile_id);
      setFormResponsaveis(respIds.length > 0 ? respIds : (os as any).responsible_user_id ? [(os as any).responsible_user_id] : []);
      setFormColaboradores((colabRes.data || []).map((d: any) => d.profile_id));
      setFormFiscais((fiscaisRes.data || []).map((d: any) => d.profile_id));
    });
    setDialogOpen(true);
  };

  const openMemorial = (os: OrdemServico) => {
    openEdit(os);
    setOsTab("memorial");
  };

  useEffect(() => {
    if (!pendingEdit || viewing) return;

    const timer = window.setTimeout(() => {
      openEdit(pendingEdit);
      setPendingEdit(null);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pendingEdit, viewing]);

  const getCurrentProfileId = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    const { data } = await supabase.from("profiles" as any).select("id, nome").eq("user_id", session.user.id).maybeSingle();
    return (data as any)?.id || null;
  };

  const getCurrentProfileName = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    const { data } = await supabase.from("profiles" as any).select("nome").eq("user_id", session.user.id).maybeSingle();
    return (data as any)?.nome || session.user.email || null;
  };

  const logHistoricoOS = async (
    osId: string,
    acao: string,
    detalhes: string,
    oldValue?: Record<string, unknown> | null,
    newValue?: Record<string, unknown> | null,
  ) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const profileId = await getCurrentProfileId();
      const profileName = await getCurrentProfileName();
      await (supabase as any).from("historico_os").insert({
        ordem_servico_id: osId,
        company_id: companyId,
        acao,
        detalhes,
        usuario_id: profileId,
        usuario_nome: profileName,
        old_value: oldValue ?? null,
        new_value: newValue ?? null,
      });
    } catch {
      // Never block UI
    }
  };

  const handleSave = async () => {
    if (!editing && !can("painel_os.criar")) { toast({ title: "Sem permissão para criar O.S.", variant: "destructive" }); return; }
    if (editing && !can("painel_os.editar") && !isTecnicoAssigned(editing)) { toast({ title: "Sem permissão para editar O.S.", variant: "destructive" }); return; }
    // codigo_os gerado automaticamente
    if (!prioridade) { toast({ title: "Selecione a prioridade", variant: "destructive" }); return; }

    // Valida campos obrigatórios configurados
    if (companyId) {
      const { data: camposConfig } = await (supabase as any)
        .from("os_campos_config")
        .select("campo, obrigatorio")
        .eq("company_id", companyId)
        .eq("obrigatorio", true);

      const obrigatorios = (camposConfig || []).map((c: any) => c.campo);
      const validacoes: Record<string, { valor: any; label: string }> = {
        bloco_id: { valor: blocoId, label: "Bloco" },
        andar: { valor: andar.trim(), label: "Andar" },
        sala: { valor: sala.trim(), label: "Sala" },
        prioridade: { valor: prioridade, label: "Prioridade" },
        tipo_servico: { valor: tipoServico, label: "Tipo de Serviço" },
        responsavel: { valor: formResponsaveis.length > 0, label: "Responsável" },
        prazo: { valor: prazo, label: "Prazo" },
        data_inicio: { valor: dataInicio, label: "Data Início" },
        data_termino: { valor: dataTermino, label: "Data Término" },
        equipamentos: { valor: equipamentos.trim(), label: "Equipamentos" },
        observacoes: { valor: observacoes.trim(), label: "Observações" },
        ativo_id: { valor: ativoId && ativoId !== "__none__", label: "Ativo Vinculado" },
      };

      for (const campo of obrigatorios) {
        const v = validacoes[campo];
        if (v && !v.valor) {
          toast({ title: `${v.label} é obrigatório`, variant: "destructive" });
          return;
        }
      }
    }

    const profileId = await getCurrentProfileId();

    // Technicians can only update status
    if (isTecnico && editing) {
      const tecPayload: any = {
        status,
        editado_por: profileId,
        editado_em: new Date().toISOString(),
      };
      if (isFinishedStatus(status) && !isFinishedStatus(editing.status)) {
        tecPayload.finalizado_por = profileId;
        tecPayload.finalizado_em = new Date().toISOString();
      }

      const { error } = await (supabase as any)
        .from("ordens_servico")
        .update(tecPayload)
        .eq("id", editing.id)
        .eq("company_id", companyId);
      if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
      logHistoricoOS(editing.id, "Edição (Técnico)", `Técnico alterou status para ${status}`, { status: editing.status }, { status });
      toast({ title: "Status atualizado" });
      setDialogOpen(false); resetForm(); fetchData();
      return;
    }

    const payload: any = {
      codigo_os: editing ? codigoOs.trim() : await (async () => { const { data } = await (supabase as any).rpc("next_os_numero"); return data || codigoOs.trim(); })(),
      status: status || null,
       prioridade: prioridade || null, 
      bloco_id: blocoId || null, andar: andar.trim() || null, sala: sala.trim() || null,
      prazo: formatDateStr(prazo),
      data_inicio: formatDateStr(dataInicio), data_termino: formatDateStr(dataTermino),
      observacoes: observacoes.trim() || null,
      equipamentos: equipamentos.trim() || null,
      cronograma_id: (cronogramaId && cronogramaId !== "__none__") ? cronogramaId : null,
      ativo_id: (ativoId && ativoId !== "__none__") ? ativoId : null,
      tipo_servico: tipoServico || null,
      natureza_servico: naturezaServico || null,
      responsible_user_id: formResponsaveis.length > 0 ? formResponsaveis[0] : null,
      numero_os_externo: numeroOsExterno.trim() || null,
    };

    // Auto-calculate SLA deadline
    if (tipoServico && prioridade) {
      const slaDef = slaDefinicoes.find((s: any) => s.tipo_servico === tipoServico && s.prioridade === prioridade);
      if (slaDef) {
        const baseDate = editing?.created_at ? new Date(editing.created_at) : new Date();
        const { addHours } = await import("date-fns");
        payload.sla_prazo_limite = addHours(baseDate, slaDef.prazo_horas).toISOString();
      }
    }

    if (editing) {
      payload.editado_por = profileId;
      payload.editado_em = new Date().toISOString();
      if (isFinishedStatus(status) && !isFinishedStatus(editing.status)) {
        payload.finalizado_por = profileId;
        payload.finalizado_em = new Date().toISOString();
      }
      const { error } = await (supabase as any)
        .from("ordens_servico")
        .update(payload)
        .eq("id", editing.id)
        .eq("company_id", companyId);
      if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
      const diff = computeDiff(editing as any, payload);
      logActivity({
        actionType: "edicao",
        module: "Ordens de Serviço",
        description: `Editou O.S. ${codigoOs.trim()}`,
        oldValue: diff?.old_value,
        newValue: diff?.new_value,
      });
      logHistoricoOS(editing.id, "Edição", `Editou O.S. ${codigoOs.trim()}`, diff?.old_value, diff?.new_value);
      // Create notifications for new responsáveis
      for (const rid of formResponsaveis) {
        if (!(editing.responsible_user_ids || []).includes(rid)) {
          await supabase.from("os_notifications").insert({ os_id: editing.id, user_id: rid } as any);
        }
      }

      // Registra clima quando OS vai para Em execução
      if (status === "Em execução" && editing?.status !== "Em execução") {
        import("@/lib/registrarClima").then(({ registrarClimaOS }) => {
          if (editing?.id) registrarClimaOS(editing.id);
        });
      }

      toast({ title: "O.S. atualizada" });
    } else {
      payload.criado_por = profileId;
      const { data: inserted, error } = await (supabase as any)
        .from("ordens_servico")
        .insert({
          ...payload,
          company_id: companyId
        }).select("id").single();
      if (error || !inserted) { toast({ title: "Erro ao criar", description: error?.message, variant: "destructive" }); return; }

      // Save local materials collected before the OS existed
      const localMats = materiaisRef.current?.getLocalMateriais() || [];
      if (localMats.length > 0) {
        const rows = localMats.map((m) => ({
          os_id: inserted.id,
          nome_material: m.nome_material,
          quantidade: m.quantidade,
          unidade: m.unidade,
          custo_unitario: m.custo_unitario,
        }));
        await supabase.from("materiais_os").insert(rows);
      }
      materiaisRef.current?.clearLocal();

      // Flush local anexos, fotos and atividades collected before the OS existed
      try { await anexosRef.current?.flushTo(inserted.id); } catch (e) { console.error("flush anexos", e); }
      try { await fotosRef.current?.flushTo(inserted.id); } catch (e) { console.error("flush fotos", e); }
      try { await atividadesNovaRef.current?.flushTo(inserted.id); } catch (e) { console.error("flush atividades", e); }

      logActivity({ actionType: "criacao", module: "Ordens de Serviço", description: `Criou O.S. ${codigoOs.trim()}`, newValue: payload });
      logHistoricoOS(inserted.id, "Criação", `Criou O.S. ${codigoOs.trim()}`, null, payload);
      // Create notifications for assigned responsáveis
      for (const rid of formResponsaveis) {
        await supabase.from("os_notifications").insert({ os_id: inserted.id, user_id: rid } as any);
      }
      toast({ title: "O.S. criada" });

      // Link back to the originating chamado if applicable
      if (chamadoOrigemId) {

        const osVinculadaMarker = `[OS_VINCULADA: ${codigoOs.trim()}]`;

        const { data: chamadoData } = await (supabase as any)
          .from("ordens_servico")
          .select("observacoes")
          .eq("id", chamadoOrigemId)
          .eq("company_id", companyId)
          .single();

        const obsAtual = (chamadoData?.observacoes || "").trim();

        const novaObs = obsAtual
          ? `${obsAtual}\n\n${osVinculadaMarker}`
          : osVinculadaMarker;

        await (supabase as any)
          .from("ordens_servico")
          .update({
            status: "Encerrado",
            observacoes: novaObs,
          })
          .eq("id", chamadoOrigemId)
          .eq("company_id", companyId);
      }

      // Link back to the originating Chamado Externo (chamados table) if applicable
      // Após aprovação + criação da O.S., o chamado é Encerrado com vínculo à O.S.
      if (chamadoExternoId) {
        await supabase.from("chamados").update({
          status: "Encerrado",
          os_id: inserted.id,
          analisado_em: new Date().toISOString(),
          analisado_por: profileId,
          analisado_por_nome: profilesMap[profileId || ""] || null,
        } as any).eq("id", chamadoExternoId);
        // Marca origem da OS como Portal do Cliente
        await (supabase as any).from("ordens_servico").update({
          origem: "Portal do Cliente",
        }).eq("id", inserted.id).eq("company_id", companyId);
      }

      // Save responsáveis for new OS
      if (formResponsaveis.length > 0) {
        await supabase.from("os_responsaveis").insert(
          formResponsaveis.map((pid) => ({ os_id: inserted.id, profile_id: pid }))
        );
      }
      // Save auxiliares for new OS
      if (formColaboradores.length > 0) {
        await supabase.from("os_colaboradores").insert(
          formColaboradores.map((pid) => ({ os_id: inserted.id, profile_id: pid }))
        );
      }
      // Save fiscais for new OS
      if (formFiscais.length > 0) {
        await (supabase as any).from("os_fiscais").insert(
          formFiscais.map((pid) => ({ os_id: inserted.id, profile_id: pid }))
        );
      }
    }

    // Sync responsáveis for edited OS
    if (editing) {
      await supabase.from("os_responsaveis").delete().eq("os_id", editing.id);
      if (formResponsaveis.length > 0) {
        await supabase.from("os_responsaveis").insert(
          formResponsaveis.map((pid) => ({ os_id: editing.id, profile_id: pid }))
        );
      }
      await supabase.from("os_colaboradores").delete().eq("os_id", editing.id);
      if (formColaboradores.length > 0) {
        await supabase.from("os_colaboradores").insert(
          formColaboradores.map((pid) => ({ os_id: editing.id, profile_id: pid }))
        );
      }
      await (supabase as any).from("os_fiscais").delete().eq("os_id", editing.id);
      if (formFiscais.length > 0) {
        await (supabase as any).from("os_fiscais").insert(
          formFiscais.map((pid) => ({ os_id: editing.id, profile_id: pid }))
        );
      }
    }

    setDialogOpen(false); resetForm(); fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    if (!can("painel_os.excluir")) { toast({ title: "Sem permissão para excluir", variant: "destructive" }); setDeleteId(null); return; }
    const osToDelete = ordens.find(o => o.id === deleteId);
    const { error } = await (supabase as any)
      .from("ordens_servico")
      .delete()
      .eq("id", deleteId)
      .eq("company_id", companyId);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); }
    else {
      logActivity({ actionType: "exclusao", module: "Ordens de Serviço", description: `Excluiu O.S. ${osToDelete?.codigo_os || deleteId}` });
      toast({ title: "O.S. excluída" }); fetchData();
    }
    setDeleteId(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids: string[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!can("painel_os.excluir")) {
      toast({ title: "Sem permissão para excluir", variant: "destructive" });
      setBulkDeleteOpen(false);
      return;
    }
    const ids = Array.from(selectedIds);
    const { error } = await (supabase as any)
      .from("ordens_servico")
      .delete()
      .in("id", ids)
      .eq("company_id", companyId);
    if (error) {
      toast({ title: "Erro ao excluir selecionadas", description: error.message, variant: "destructive" });
    } else {
      logActivity({ actionType: "exclusao", module: "Ordens de Serviço", description: `Excluiu ${ids.length} O.S. em lote` });
      toast({ title: `${ids.length} O.S. excluída(s)` });
      setSelectedIds(new Set());
      fetchData();
    }
    setBulkDeleteOpen(false);
  };

  const handleBulkStatusChange = async () => {
    if (selectedIds.size === 0 || !bulkStatusValue) return;
    if (!can("painel_os.editar")) {
      toast({ title: "Sem permissão para editar O.S.", variant: "destructive" });
      setBulkStatusOpen(false);
      return;
    }
    setBulkStatusSaving(true);
    const ids = Array.from(selectedIds);
    const { error } = await (supabase as any)
      .from("ordens_servico")
      .update({ status: bulkStatusValue })
      .in("id", ids)
      .eq("company_id", companyId);
    setBulkStatusSaving(false);
    if (error) {
      toast({ title: "Erro ao mudar status", description: error.message, variant: "destructive" });
      return;
    }
    logActivity({
      actionType: "edicao",
      module: "Ordens de Serviço",
      description: `Mudou status de ${ids.length} O.S. em lote para "${bulkStatusValue}"`,
    });
    toast({ title: `${ids.length} O.S. atualizada(s) para "${bulkStatusValue}"` });
    setSelectedIds(new Set());
    setBulkStatusOpen(false);
    setBulkStatusValue("");
    fetchData();
  };

  const handleBulkExportExcel = () => {
    const selected = ordens.filter((os) => selectedIds.has(os.id));
    if (selected.length === 0) return;
    const rows = selected.map((os) => ({
      "Código": os.codigo_os || "—",
      "Título": os.equipamentos || "—",
      "Status": os.status || "—",
      "Prioridade": os.prioridade || "—",
      "Bloco": blocosMap[os.bloco_id || ""] || "—",
      "Técnico": os.responsible_user_id ? (profilesMap[os.responsible_user_id] || "—") : "—",
      "Data Abertura": fmtDate(os.created_at),
      "Prazo": fmtDate(os.prazo),
      "Data Conclusão": fmtDate(os.finalizado_em || os.data_termino),
      "Custo Total (R$)": os.custo_total || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] || {}).map((k) => ({ wch: Math.min(Math.max(k.length + 4, 12), 40) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "O.S. Selecionadas");
    XLSX.writeFile(wb, `os-selecionadas-${format(new Date(), "yyyyMMdd")}.xlsx`);
    toast({ title: `${selected.length} O.S. exportada(s) para Excel` });
  };
  const handleSalvarAssinatura = async () => {
    if (!viewing || !sigCanvasRef.current) return;
    if (sigCanvasRef.current.isEmpty()) {
      toast({ title: "Desenhe a assinatura antes de salvar", variant: "destructive" });
      return;
    }
    setSalvandoAssinatura(true);
    try {
      const dataUrl = sigCanvasRef.current.getTrimmedCanvas().toDataURL("image/png");
      await (supabase as any).from("ordens_servico").update({
        assinatura_tecnico: dataUrl,
        assinatura_em: new Date().toISOString(),
      }).eq("id", viewing.id);
      toast({ title: "Assinatura salva com sucesso!" });
      setAssinaturaOpen(false);
      fetchData();
    } finally {
      setSalvandoAssinatura(false);
    }
  };
  const handleReopen = async (os: OrdemServico) => {
    if (!can("painel_os.editar")) {
      toast({ title: "Sem permissão para reabrir O.S.", variant: "destructive" });
      return;
    }
    const profileId = await getCurrentProfileId();
    const { error } = await (supabase as any)
      .from("ordens_servico")
      .update({
        status: "Em execução",
        finalizado_por: null,
        finalizado_em: null,
        editado_por: profileId,
        editado_em: new Date().toISOString(),
      })
      .eq("id", os.id)
      .eq("company_id", companyId);
    if (error) {
      toast({ title: "Erro ao reabrir", description: error.message, variant: "destructive" });
      return;
    }
    await logHistoricoOS(os.id, "Reabertura", `Reabriu O.S. ${os.codigo_os || os.id}`, { status: os.status }, { status: "Em execução" });
    toast({ title: `O.S. ${os.codigo_os || ""} reaberta!` });
    fetchData();
  };
  const handleFinalize = async (os: OrdemServico) => {
    if (!can("painel_os.editar")) {
      toast({ title: "Sem permissão para finalizar O.S.", variant: "destructive" });
      return;
    }

    // Valida estoque dos materiais (serviços não entram nessa checagem — não têm estoque físico)
    const { data: materiaisOs } = await (supabase as any)
      .from("materiais_os")
      .select("nome_material, materiais(id, categoria)")
      .eq("os_id", os.id);

    if (materiaisOs && materiaisOs.length > 0) {
      const semEstoque: string[] = [];
      for (const m of materiaisOs) {
        if (!m.materiais?.id || m.materiais?.categoria === "Serviço") continue;
        const { data: est } = await (supabase as any)
          .from("estoque")
          .select("quantidade_disponivel")
          .eq("material_id", m.materiais.id)
          .maybeSingle();
        if (est && Number(est.quantidade_disponivel) === 0) {
          semEstoque.push(m.nome_material);
        }
      }
      if (semEstoque.length > 0) {
        toast({
          title: "Não é possível concluir esta O.S.",
          description: `O material '${semEstoque[0]}' está com estoque zerado. Regularize o estoque antes de prosseguir.`,
          variant: "destructive",
        });
        return;
      }
    }

    // Bloqueia se houver orçamento pendente, reprovado ou não enviado
    const orcamentoStatus = (os as any).orcamento_status;
    const temMateriais = (materiaisMap[os.id] || []).length > 0;

    if (temMateriais && !orcamentoStatus) {
      toast({
        title: "Orçamento não enviado",
        description: "Esta O.S. possui materiais mas o orçamento ainda não foi enviado para aprovação.",
        variant: "destructive",
      });
      return;
    }

    if (orcamentoStatus === "pendente") {
      toast({
        title: "Orçamento aguardando aprovação",
        description: "Aguarde a aprovação do orçamento antes de finalizar.",
        variant: "destructive",
      });
      return;
    }

    if (orcamentoStatus === "reprovado") {
      toast({
        title: "Orçamento reprovado",
        description: "O orçamento foi reprovado. Revise os materiais e reenvie para aprovação.",
        variant: "destructive",
      });
      return;
    }

    const today = format(
      new Date(),
      "yyyy-MM-dd"
    );

    const profileId =
      await getCurrentProfileId();

    const { error } =
      await (supabase as any)
        .from("ordens_servico")
        .update({
          status: "Concluída",
          data_termino: today,
          finalizado_por: profileId,
          finalizado_em: new Date().toISOString(),
        })
        .eq("id", os.id)
        .eq("company_id", companyId);

    if (error) {

      toast({
        title: "Erro ao finalizar",
        description: error.message,
        variant: "destructive",
      });

    } else {

      logActivity({
        actionType: "finalizacao",
        module: "Ordens de Serviço",
        description:
          `Finalizou O.S. ${os.codigo_os || os.id}`
      });

      logHistoricoOS(
        os.id,
        "Finalização",
        `Finalizou O.S. ${os.codigo_os || os.id}`,
        {
          status: os.status,
          data_termino: os.data_termino
        },
        {
          status: "Concluída",
          data_termino: today
        },
      );

      toast({
        title:
          `O.S. ${os.codigo_os || ""} finalizada!`
      });

      fetchData();
    }
  };

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d + "T00:00:00"), "dd/MM/yyyy"); } catch { return "—"; }
  };

  const downloadPdf = async (os: OrdemServico) => {
    toast({ title: "Gerando PDF...", description: "Carregando anexos, fotos e memorial." });
    try {
      const { generateOSResumidaPDF } = await import("@/lib/generateOSResumidaPDF");
      await generateOSResumidaPDF({
        osList: [os as any],
        materiaisByOs: { [os.id]: (materiaisMap[os.id] || []) as any },
        blocosMap,
        profilesMap,
        companyId: companyId || "",
        companyName: "Atlas Control",
      });
      toast({ title: "PDF gerado!" });
    } catch (err: any) {
      toast({ title: "Erro ao gerar PDF", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Ordens de Serviço</h1>
          {atrasadasCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterAtrasada((prev) => !prev)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold border transition-colors",
                filterAtrasada
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
              )}
              title={filterAtrasada ? "Clique para remover o filtro de atrasadas" : "Clique para ver só as atrasadas"}
            >
              ⚠️ {atrasadasCount} atrasada{atrasadasCount !== 1 ? "s" : ""}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchData} title="Atualizar">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="outline" onClick={handleBulkExportExcel} title="Exportar selecionadas para Excel">
              <FileText className="mr-2 h-4 w-4" /> Exportar ({selectedIds.size})
            </Button>
          )}
          {selectedIds.size > 0 && can("painel_os.editar") && !isTecnico && (
            <Button variant="outline" onClick={() => setBulkStatusOpen(true)}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Mudar status ({selectedIds.size})
            </Button>
          )}
          {selectedIds.size > 0 && can("painel_os.excluir") && !isTecnico && (
            <Button variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" /> Excluir selecionadas ({selectedIds.size})
            </Button>
          )}
          {can("painel_os.criar") && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Nova O.S.
            </Button>
          )}
        </div>
      </div>


      {/* Filters */}
      <div className="mb-4 rounded-lg border bg-card p-4 space-y-3">
        {/* Primary row */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Buscar código</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={filterCodigo} onChange={(e) => setFilterCodigo(e.target.value)} placeholder="Ex: OS-001" className="pl-9" />
            </div>
          </div>
          <div className="min-w-[140px]">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Bloco</label>
            <Select value={filterBlocoId} onValueChange={setFilterBlocoId}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {blocos.map((b) => (<SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[140px]">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Ativas (padrão)</SelectItem>
                {STATUS_OPTIONS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                <SelectItem value="__encerradas__">Encerradas (Concluída + Cancelada)</SelectItem>
                <SelectItem value="__todas__">Todas (incluindo encerradas)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[140px]">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Prioridade</label>
            <Select value={filterPrioridade} onValueChange={setFilterPrioridade}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {PRIORIDADE_OPTIONS.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleSort("data")}
            className={cn("gap-1.5", sortColumn === "data" && "border-primary text-primary")}
            title="Ordenar por data"
          >
            {sortColumn === "data" && sortAsc ? <span>↑ Mais antigas</span> : <span>↓ Mais recentes</span>}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAdvancedOpen(!advancedOpen)} className="gap-1.5">
            <SlidersHorizontal className="h-4 w-4" />
            Avançados
            {activeFilterCount > 4 && <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">{activeFilterCount - 4}</Badge>}
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
              <X className="mr-1 h-3 w-3" /> Limpar
            </Button>
          )}
        </div>

        {/* Advanced filters row */}
        {advancedOpen && (
          <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-border">
            <div className="min-w-[130px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Andar</label>
              <Select value={filterAndar} onValueChange={setFilterAndar}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {uniqueAndares.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[130px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Sala / Ambiente</label>
              <Select value={filterSala} onValueChange={setFilterSala}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {uniqueSalas.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo Serviço</label>
              <Select value={filterTipoServico} onValueChange={setFilterTipoServico}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {uniqueTiposServico.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Período de</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm", !filterDateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {filterDateFrom ? format(filterDateFrom, "dd/MM/yyyy") : "Início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={filterDateFrom} onSelect={setFilterDateFrom} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Período até</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm", !filterDateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {filterDateTo ? format(filterDateTo, "dd/MM/yyyy") : "Fim"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={filterDateTo} onSelect={setFilterDateTo} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}

        {/* Saved filters */}
        {advancedOpen && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
            <span className="text-xs font-medium text-muted-foreground">Favoritos:</span>
            {savedFilters.map((f) => (
              <div key={f.name} className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => applySavedFilter(f)}>
                  <Star className="h-3 w-3 text-amber-600 fill-amber-400" />
                  {f.name}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeSavedFilter(f.name)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {hasActiveFilters && (
              <div className="flex items-center gap-1 ml-auto">
                <Input
                  value={filterName}
                  onChange={(e) => setFilterName(e.target.value)}
                  placeholder="Nome do filtro"
                  className="h-7 w-[140px] text-xs"
                  onKeyDown={(e) => e.key === "Enter" && saveCurrentFilter()}
                />
                <Button variant="secondary" size="sm" className="h-7 text-xs" onClick={saveCurrentFilter} disabled={!filterName.trim()}>
                  Salvar
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Active filter count */}
        {hasActiveFilters && (
          <div className="text-xs text-muted-foreground">
            {activeFilterCount} filtro{activeFilterCount > 1 ? "s" : ""} ativo{activeFilterCount > 1 ? "s" : ""} · {filteredOrdens.length} resultado{filteredOrdens.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : filteredOrdens.length === 0 ? (
        <p className="text-muted-foreground">
          {hasActiveFilters ? "Nenhuma O.S. encontrada com os filtros aplicados." : "Nenhuma ordem de serviço cadastrada."}
        </p>
      ) : (
        <div className="rounded-lg overflow-auto">
          <Table className="border-separate border-spacing-y-2">
            <TableHeader>
              <TableRow className="bg-muted/70 hover:bg-muted/70 border-b-0 [&>th]:border-y [&>th]:border-border [&>th:first-child]:border-l [&>th:first-child]:rounded-l-lg [&>th:last-child]:border-r [&>th:last-child]:rounded-r-lg">
                {can("painel_os.excluir") && !isTecnico && (
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={filteredOrdens.length > 0 && filteredOrdens.every((o) => selectedIds.has(o.id))}
                      onCheckedChange={(checked) =>
                        toggleSelectAll(filteredOrdens.map((o) => o.id), !!checked)
                      }
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                )}
                <TableHead className="w-[110px] font-semibold text-slate-700">Código</TableHead>
                <TableHead className="w-[100px] font-semibold text-slate-700">OS Externa</TableHead>
                <TableHead className="w-[120px] font-semibold text-slate-700">Local</TableHead>
                <TableHead className="w-[220px] font-semibold text-slate-700">Equipamentos</TableHead>
                <TableHead
                  className="w-[110px] font-semibold text-slate-700 cursor-pointer select-none hover:text-primary"
                  onClick={() => toggleSort("prioridade")}
                >
                  Prioridade {sortColumn === "prioridade" && (sortAsc ? "↑" : "↓")}
                </TableHead>
                <TableHead className="w-[130px] font-semibold text-slate-700">Status</TableHead>
                <TableHead className="w-[90px] font-semibold text-slate-700">SLA</TableHead>
                <TableHead
                  className="w-[150px] font-semibold text-slate-700 cursor-pointer select-none hover:text-primary"
                  onClick={() => toggleSort("prazo")}
                >
                  Prazo {sortColumn === "prazo" && (sortAsc ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="w-[100px] font-semibold text-slate-700 cursor-pointer select-none hover:text-primary"
                  onClick={() => toggleSort("custo")}
                >
                  Custo {sortColumn === "custo" && (sortAsc ? "↑" : "↓")}
                </TableHead>
                <TableHead className="w-[120px] font-semibold text-slate-700">Auxiliares</TableHead>
                <TableHead className="w-[180px] text-center font-semibold text-slate-700">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedOrdens.map((os) => {
                const locParts = [
                  os.bloco_id ? blocosMap[os.bloco_id] : null,
                  os.andar ? `${os.andar}º andar` : null,
                  os.sala ? `Sala ${os.sala}` : null,
                ].filter(Boolean);

                const equipLines = os.equipamentos
                  ? os.equipamentos.split("\n").filter((l: string) => l.trim())
                  : [];

                const mats = materiaisMap[os.id] || [];
                const anexos = anexosMap[os.id] || [];
                const sla = computeSlaStatus((os as any).sla_prazo_limite, os.status, os.created_at);
                const responsaveis = responsaveisMap[os.id] || [];
                const responsavel = responsaveis.length > 0 ? responsaveis.join(", ") : null;

                return (
                  <TableRow key={os.id} className="group even:bg-muted/20 odd:bg-card hover:bg-muted/40 transition-colors cursor-pointer shadow-sm rounded-lg [&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg [&>td]:border-y [&>td:first-child]:border-l [&>td:last-child]:border-r [&>td]:border-border [&>td]:py-4" onClick={() => setViewing(os)}>
                    {can("painel_os.excluir") && !isTecnico && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(os.id)}
                          onCheckedChange={() => toggleSelect(os.id)}
                          aria-label={`Selecionar O.S. ${os.codigo_os || ""}`}
                        />
                      </TableCell>
                    )}
                    {/* Código + Tipo */}
                    <TableCell>
                      <span className="font-mono text-sm font-bold">{os.codigo_os ? os.codigo_os.replace("OS-0*", "OS-").replace(/^OS-0+/, "OS-") : "—"}</span>
                      {(os as any).tipo_servico && (
                        <p className="text-xs text-muted-foreground mt-0.5">{(os as any).tipo_servico}</p>
                      )}
                    </TableCell>
                    {/* OS Externa */}
                    <TableCell>
                      <span className="text-xs font-semibold text-foreground">{(os as any).numero_os_externo || "—"}</span>
                    </TableCell>

                    {/* Local agrupado */}
                    <TableCell>
                      <span className="text-sm font-medium block">
                        {os.bloco_id ? blocosMap[os.bloco_id] : "—"}
                      </span>
                      {responsavel && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Resp: {responsavel}
                        </p>
                      )}
                    </TableCell>

                    {/* Equipamentos resumidos */}
                    <TableCell>
                      {equipLines.length > 0 ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm cursor-default inline-flex items-center gap-1.5">
                                <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                {equipLines.length === 1
                                  ? <span className="truncate max-w-[180px]">{equipLines[0].trim()}</span>
                                  : <span>{equipLines.length} equipamentos</span>
                                }
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                              <ul className="list-disc list-inside space-y-0.5 text-sm">
                                {equipLines.map((line: string, i: number) => (
                                  <li key={i}>{line.trim()}</li>
                                ))}
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                      <div className="flex items-center gap-2 mt-1 empty:hidden">
                        {mats.length > 0 && (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs text-muted-foreground cursor-default inline-flex items-center gap-0.5">
                                  <Package className="h-3 w-3" /> {mats.length} mat.
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-sm">
                                <ul className="list-disc list-inside space-y-0.5 text-sm">
                                  {mats.map((m) => (
                                    <li key={m.id}>{m.nome_material} — {m.quantidade} {m.unidade || "un"}</li>
                                  ))}
                                </ul>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {anexos.length > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setAnexosModalOsId(os.id); }}
                            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-0.5"
                          >
                            <Paperclip className="h-3 w-3" /> {anexos.length}
                          </button>
                        )}
                        {os.observacoes && (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs text-muted-foreground cursor-default inline-flex items-center gap-0.5">
                                  <FileText className="h-3 w-3" /> Obs
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-sm whitespace-pre-line text-sm">
                                {os.observacoes}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>

                    {/* Prioridade */}
                    <TableCell>
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border gap-1",
                        PRIORIDADE_COLORS[os.prioridade || "Média"] || "",
                      )}>
                        {PRIORIDADE_ICONS[os.prioridade || "Média"]} {os.prioridade || "Média"}
                      </span>
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border",
                          getStatusColor(os.status),
                        )}>
                          {os.status || "—"}
                        </span>
                        {(os as any).orcamento_status && (
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                            (os as any).orcamento_status === "aprovado" && "bg-success/10 text-success border-success/20",
                            (os as any).orcamento_status === "reprovado" && "bg-destructive/10 text-destructive border-destructive/20",
                            (os as any).orcamento_status === "pendente" && "bg-warning/10 text-warning border-warning/20",
                          )}>
                            {(os as any).orcamento_status === "aprovado" && "✅ Orç. Aprovado"}
                            {(os as any).orcamento_status === "reprovado" && "❌ Orç. Reprovado"}
                            {(os as any).orcamento_status === "pendente" && "🟡 Orç. Pendente"}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* SLA */}
                    <TableCell>
                      {sla.status === "sem_sla" ? (
                        <span className="text-sm text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border", sla.colorClass)}
                          title={sla.prazoLimite ? `Limite: ${formatSlaDeadline(sla.prazoLimite)}` : undefined}
                        >
                          {sla.label}
                        </span>
                      )}
                    </TableCell>

                    {/* Prazo + Datas */}
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{fmtDate(os.prazo) || "—"}</span>
                        {(() => {
                          const prazoInfo = computePrazoStatus(os.prazo, os.status);
                          return prazoInfo.label ? (
                            <span
                              className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold border whitespace-nowrap", prazoInfo.colorClass)}
                              title={prazoInfo.label}
                            >
                              {prazoInfo.status === "atrasado" ? "⚠️" : "⏰"} {prazoInfo.label}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      {(os.data_inicio || os.data_termino) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {os.data_inicio && `Início: ${fmtDate(os.data_inicio)}`}
                          {os.data_inicio && os.data_termino && " · "}
                          {os.data_termino && `Fim: ${fmtDate(os.data_termino)}`}
                        </p>
                      )}
                    </TableCell>

                    {/* Custo */}
                    <TableCell>
                      <span className="text-sm font-semibold text-primary whitespace-nowrap">
                        {os.custo_total ? `R$ ${Number(os.custo_total).toFixed(2)}` : "—"}
                      </span>
                    </TableCell>

                    {/* Auxiliares */}
                    <TableCell>
                      {(colaboradoresMap[os.id] || []).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {colaboradoresMap[os.id].map((nome, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                              {nome}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Ações */}
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-0.5">
                        {can("painel_os.editar") && isFinishedStatus(os.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleReopen(os)}
                            title="Reabrir O.S."
                            className="text-amber-600 hover:text-amber-400"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        {can("painel_os.editar") && !isFinishedStatus(os.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleFinalize(os)}
                            title="Finalizar O.S."
                            className="text-emerald-600 hover:text-emerald-300"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" title="Mais ações">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setViewing(os)}>
                              <Eye className="mr-2 h-4 w-4" /> Ver detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openMemorial(os)}>
                              <FileText className="mr-2 h-4 w-4" /> Memorial de Cálculo
                            </DropdownMenuItem>
                            {can("painel_os.baixar") && (
                              <DropdownMenuItem onClick={() => downloadPdf(os)}>
                                <DownloadIcon className="mr-2 h-4 w-4" /> Baixar PDF
                              </DropdownMenuItem>
                            )}
                            {(can("painel_os.editar") || isTecnicoAssigned(os)) && !isFinishedStatus(os.status) && (
                              <DropdownMenuItem onClick={() => openEdit(os)}>
                                <Pencil className="mr-2 h-4 w-4" /> Editar
                              </DropdownMenuItem>
                            )}
                            {can("painel_os.excluir") && !isTecnico && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setDeleteId(os.id)} className="text-destructive focus:text-destructive">
                                  <Trash2 className="mr-2 h-4 w-4" /> Excluir
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}



      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-[95vw] lg:max-w-[1100px] max-h-[95vh] overflow-y-auto p-0">
          {/* Header */}
          <div className="flex items-start justify-between px-8 pt-7 pb-4 border-b">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Início &rsaquo; Ordens de Serviço &rsaquo; <span className="text-primary font-medium">{editing ? `Editar ${editing.codigo_os || ""}` : "Nova Ordem de Serviço"}</span></div>
              <h2 className="text-2xl font-bold">{editing ? "Editar Ordem de Serviço" : "Nova Ordem de Serviço"}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{editing ? "Atualize as informações desta O.S." : "Preencha as informações para criar uma nova O.S."}</p>
            </div>
            <Button variant="ghost" size="sm" className="gap-1.5 mt-1" onClick={() => { setDialogOpen(false); resetForm(); }}>

            </Button>
          </div>

          {/* Body: form + sidebar */}
          <div className="flex gap-0 min-h-0">
            {/* Main form */}
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">

              {isTecnico && editing && (
                <p className="text-xs text-warning bg-warning/10 border border-warning/20 rounded-md p-2">
                  Técnico: você pode alterar apenas o status e adicionar fotos.
                </p>
              )}

              {/* Bloco OS Interna / Externa */}
              <div className="rounded-xl border bg-card p-5 flex flex-col sm:flex-row gap-6">
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">OS Interna (automática)</div>
                    <div className="text-2xl font-bold text-primary">{codigoOs || <span className="text-muted-foreground text-base font-normal">Será gerada ao salvar</span>}</div>
                    {!editing && <div className="text-xs text-muted-foreground mt-0.5">Gerada automaticamente pelo sistema</div>}



                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium mb-1 block">Número da O.S. Externa <span className="text-muted-foreground font-normal">(opcional)</span></label>
                  <Input
                    value={numeroOsExterno}
                    placeholder="Ex.: OS-MGI-2026-015, ENG-2458, CONTRATO-001"
                    disabled={isTecnico && !!editing && !can("painel_os.editar")}
                    onChange={(e) => setNumeroOsExterno(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Número/Referência utilizada na documentação ou contrato.</p>
                </div>
              </div>

              {/* Seção 2: Localização */}
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b bg-muted/30">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">2</span>
                  <span className="font-semibold text-sm">Localização</span>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1 block">{labelCampo("Bloco", "bloco_id")}</label>
                      <Select value={blocoId} onValueChange={setBlocoId} disabled={isTecnico && !!editing}>
                        <SelectTrigger><SelectValue placeholder="Selecione o bloco" /></SelectTrigger>
                        <SelectContent>
                          {blocos.map((b) => (<SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">{labelCampo("Andar", "andar")}</label>
                      <Input value={andar} onChange={(e) => setAndar(e.target.value)} placeholder="Ex: 3º" disabled={isTecnico && !!editing} />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">{labelCampo("Sala", "sala")}</label>
                      <Input value={sala} onChange={(e) => setSala(e.target.value)} placeholder="Ex: 301" disabled={isTecnico && !!editing} />
                    </div>
                  </div>




                </div>
              </div>

              {/* Seção 3: Classificação */}
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b bg-muted/30">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">3</span>
                  <span className="font-semibold text-sm">Classificação</span>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1 block">{labelCampo("Tipo de Serviço", "tipo_servico")}</label>
                      <Select value={tipoServico || "__none__"} onValueChange={(v) => setTipoServico(v === "__none__" ? "" : v)} disabled={isTecnico && !!editing}>
                        <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhum</SelectItem>
                          {TIPO_SERVICO_OPTIONS.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      {tipoServico && prioridade && (() => {
                        const slaDef = slaDefinicoes.find((s: any) => s.tipo_servico === tipoServico && s.prioridade === prioridade);
                        return slaDef ? (
                          <p className="text-xs text-muted-foreground mt-1">⏱ SLA automático: {slaDef.prazo_horas}h</p>
                        ) : null;
                      })()}
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Natureza do Serviço</label>
                      <Select value={naturezaServico || "__none__"} onValueChange={(v) => setNaturezaServico(v === "__none__" ? "" : v)} disabled={isTecnico && !!editing}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhuma</SelectItem>
                          {NATUREZA_SERVICO_OPTIONS.map((n) => (<SelectItem key={n} value={n}>{n}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">{labelCampo("Prioridade", "prioridade")}</label>
                      {!(isTecnico && editing) ? (
                        <Select value={prioridade} onValueChange={handlePrioridadeChange}>
                          <SelectTrigger><SelectValue placeholder="Selecione a prioridade" /></SelectTrigger>
                          <SelectContent>
                            {PRIORIDADE_OPTIONS.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={prioridade} disabled />
                      )}
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Status</label>
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
              {/* Seção 4: Equipe Responsável */}
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b bg-muted/30">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">4</span>
                  <span className="font-semibold text-sm">Equipe Responsável</span>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <MultiUserSelect
                      label="Responsavel (Tecnico)"
                      options={tecnicosOptions}
                      selected={formResponsaveis}
                      onChange={setFormResponsaveis}
                      placeholder="Selecione um responsável"
                      disabled={isTecnico && !!editing}
                      excludeIds={formColaboradores}
                    />
                    {!(isTecnico && editing) && (
                      <MultiUserSelect
                        label="Auxiliares"
                        options={tecnicosOptions}
                        selected={formColaboradores}
                        onChange={setFormColaboradores}
                        placeholder="Selecione os auxiliares"
                        excludeIds={[...formResponsaveis, ...formFiscais]}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Seção 5: Planejamento */}
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b bg-muted/30">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">5</span>
                  <span className="font-semibold text-sm">Planejamento</span>
                </div>
                <div className="p-5 space-y-4">
                  <div className="p-5 space-y-4">










                    <div>
                      <label className="text-sm font-medium mb-1 block">Ativo vinculado <span className="text-muted-foreground font-normal">(opcional)</span></label>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" className="flex-1 justify-start font-normal" onClick={() => setAtivoModalOpen(true)} disabled={isTecnico && !!editing}>
                          {ativoId && ativoId !== "__none__"
                            ? ativosOptions.find(a => a.id === ativoId)?.nome || "Ativo selecionado"
                            : <span className="text-muted-foreground">Selecione um ativo</span>
                          }
                        </Button>
                        {ativoId && ativoId !== "__none__" && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => setAtivoId("")}><X className="h-4 w-4" /></Button>
                        )}
                      </div>
                    </div>
                  </div>
                  {isTecnico && editing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div><label className="text-sm font-medium mb-1 block">Prazo</label><Input value={prazo ? format(prazo, "dd/MM/yyyy") : "—"} disabled /></div>
                      <div><label className="text-sm font-medium mb-1 block">Data Início</label><Input value={dataInicio ? format(dataInicio, "dd/MM/yyyy") : "—"} disabled /></div>
                      <div><label className="text-sm font-medium mb-1 block">Data Término</label><Input value={dataTermino ? format(dataTermino, "dd/MM/yyyy") : "—"} disabled /></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-1 block">{labelCampo("Prazo", "prazo")}</label>
                        <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted text-sm text-muted-foreground cursor-not-allowed">
                          {prazo ? format(prazo, "dd/MM/yyyy") : "Definido automaticamente pela prioridade"}
                        </div>
                      </div>
                      <DatePickerField label={labelCampo("Data Início", "data_inicio")} value={dataInicio} onChange={setDataInicio} />
                      <DatePickerField label={labelCampo("Data Término", "data_termino")} value={dataTermino} onChange={setDataTermino} />
                    </div>
                  )}
                </div>
              </div>

              {/* Seção 6: Execução */}
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b bg-muted/30">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">6</span>
                  <span className="font-semibold text-sm">Execução</span>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1 block">{labelCampo("Equipamentos", "equipamentos")}</label>
                      <Textarea value={equipamentos} onChange={(e) => setEquipamentos(e.target.value)} placeholder={"Ex.:\n1 aparelho split 12.000 BTU/h\n2 aparelhos cassete 24.000 BTU/h"} rows={5} disabled={isTecnico && !!editing} />
                      <div className="text-xs text-muted-foreground text-right mt-0.5">{equipamentos.length}/500</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">{labelCampo("Observações", "observacoes")}</label>
                      <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Observações gerais sobre a O.S." rows={5} disabled={isTecnico && !!editing} />
                      <div className="text-xs text-muted-foreground text-right mt-0.5">{observacoes.length}/500</div>
                    </div>
                  </div>

                  {editing?.id && ativoId && ativoId !== "__none__" && (
                    <div className="border-t pt-4">
                      <AtivoDisponibilidadeSection
                        osId={editing.id}
                        ativoId={ativoId}
                        ativoNome={ativosOptions.find(a => a.id === ativoId)?.nome || "Ativo"}
                        readOnly={!can("painel_os.editar") && !isTecnicoAssigned(editing)}
                      />
                    </div>
                  )}

                  {/* Tabs: Materiais / Evidencias / Atividades */}
                  <div className="border-t pt-4">
                    <div>
                      <div className="flex border-b mb-4">
                        <button onClick={() => setOsTab("materiais")} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${osTab === "materiais" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                          <Package className="h-4 w-4" /> Materiais
                        </button>
                        <button onClick={() => setOsTab("evidencias")} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${osTab === "evidencias" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                          <Paperclip className="h-4 w-4" /> Evidencias (Anexos e Fotos)
                        </button>
                        {(!editing || can("painel_os.criar")) && (
                          <button onClick={() => setOsTab("atividades")} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${osTab === "atividades" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                            <CheckCircle2 className="h-4 w-4" /> Atividades
                          </button>
                        )}
                        <button onClick={() => setOsTab("memorial")} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${osTab === "memorial" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                          <FileText className="h-4 w-4" /> Memorial de Cálculo
                          {memorialTotal > 0 && (
                            <Badge variant="secondary" className="ml-0.5 text-[10px] px-1.5 py-0 font-semibold text-primary bg-primary/10">
                              R$ {memorialTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Badge>
                          )}
                        </button>
                      </div>
                      {osTab === "materiais" && !(isTecnico && editing) && (
                        <MateriaisSection
                          ref={materiaisRef}
                          osId={editing?.id || null}
                          readOnly={!can("painel_os.editar") && !can("painel_os.criar")}
                          preSelectedFiscais={!editing ? formFiscais : undefined}
                          fiscaisOptions={!editing ? tecnicosOptions : undefined}
                          onFiscaisChange={!editing ? setFormFiscais : undefined}
                        />
                      )}
                      {osTab === "evidencias" && (
                        <div className="space-y-4">
                          <AnexosSection ref={anexosRef} osId={editing?.id || null} readOnly={(isTecnico && !!editing) || !can("painel_os.anexar")} canAttach={can("painel_os.anexar")} canDownload={can("painel_os.baixar")} />
                          <FotosOSSection ref={fotosRef} osId={editing?.id || null} readOnly={!can("painel_os.editar") && !isTecnicoAssigned(editing)} />
                        </div>
                      )}
                      {osTab === "atividades" && !editing && can("painel_os.criar") && (
                        <AtividadesNovaOSSection ref={atividadesNovaRef} responsaveisOptions={tecnicosOptions} />
                      )}
                      {osTab === "memorial" && (
                        <MemorialMateriaisSection
                          osId={editing?.id || null}
                          readOnly={isTecnico && !!editing && !can("painel_os.editar")}
                          onTotalChange={setMemorialTotal}
                        />
                      )}
                    </div>
                  </div>

                  {editing?.id && (
                    <div className="border-t pt-4">
                      <TimerOSSection osId={editing.id} />
                    </div>
                  )}
                  {editing?.id && can("painel_os.visualizar_atividades") && (
                    <div className="border-t pt-4">
                      <CronogramaSection osId={editing.id} readOnly={isTecnico || !can("painel_os.editar_atividades")} currentProfileId={currentProfileId} responsibleUserId={editing.responsible_user_ids?.[0] || editing.responsible_user_id} />
                    </div>
                  )}
                  {editing?.id && (
                    <div className="border-t pt-4">
                      <ComentariosOSSection osId={editing.id} readOnly={!can("painel_os.editar") && !isTecnicoAssigned(editing)} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar: Resumo da O.S. */}
            <div className="hidden lg:block w-64 shrink-0 border-l bg-muted/20 px-5 py-6">
              <div className="font-semibold text-sm mb-4">Resumo da O.S.</div>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div><div className="text-xs text-muted-foreground">OS Interna</div><div className="font-medium text-primary">{codigoOs || "—"}</div></div>
                </div>
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div><div className="text-xs text-muted-foreground">Nº O.S. Externa</div><div className="font-medium">—</div></div>
                </div>
                <div className="flex items-start gap-2">
                  <RefreshCw className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div><div className="text-xs text-muted-foreground">Status</div><div className="font-medium">{status || "Não iniciada"}</div></div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-sm">{PRIORIDADE_ICONS[prioridade] || "🟡"}</span>
                  <div><div className="text-xs text-muted-foreground">Prioridade</div><div className="font-medium">{prioridade || "Média"}</div></div>
                </div>
                <div className="flex items-start gap-2">
                  <Wrench className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div><div className="text-xs text-muted-foreground">Tipo de Serviço</div><div className="font-medium">{tipoServico || "—"}</div></div>
                  <div className="flex items-start gap-2">
                    <Wrench className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div><div className="text-xs text-muted-foreground">Natureza do Serviço</div><div className="font-medium">{naturezaServico || "—"}</div></div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Package className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">Localização</div>
                    <div className="font-medium text-xs leading-relaxed">
                      {[blocoId ? blocosMap[blocoId] : null, andar, sala].filter(Boolean).join(" › ") || "—"}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Star className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">Responsável (Técnico)</div>
                    <div className="font-medium text-xs leading-relaxed">
                      {formResponsaveis.length > 0
                        ? formResponsaveis.map(id => tecnicosOptions.find(t => t.id === id)?.nome || id).join(", ")
                        : "—"}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Search className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div><div className="text-xs text-muted-foreground">Ativo vinculado</div><div className="font-medium text-xs">{ativoId && ativoId !== "__none__" ? ativosOptions.find(a => a.id === ativoId)?.nome || "—" : "—"}</div></div>
                </div>
                <div className="flex items-start gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div><div className="text-xs text-muted-foreground">Prazo</div><div className="font-medium text-xs">{prazo ? format(prazo, "dd/MM/yyyy") : "Definido automaticamente"}</div></div>
                </div>
                <div className="flex items-start gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div><div className="text-xs text-muted-foreground">Início</div><div className="font-medium text-xs">{dataInicio ? format(dataInicio, "dd/MM/yyyy") : "—"}</div></div>
                </div>
                <div className="flex items-start gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div><div className="text-xs text-muted-foreground">Término</div><div className="font-medium text-xs">{dataTermino ? format(dataTermino, "dd/MM/yyyy") : "—"}</div></div>
                </div>
                <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 mt-2">
                  <p className="text-xs text-muted-foreground">ℹ️ As informações do resumo são atualizadas automaticamente conforme o preenchimento.</p>
                </div>
              </div>
            </div>
          </div>

          <AtivoQuickModal
            open={ativoModalOpen}
            onClose={() => setAtivoModalOpen(false)}
            onSelect={(id, nome) => {
              setAtivoId(id);
              setAtivosOptions(prev => prev.find(a => a.id === id) ? prev : [...prev, { id, nome, codigo_identificacao: null }]);
            }}
            companyId={companyId}
          />

          {/* Footer */}
          <div className="flex items-center justify-end px-8 py-4 border-t bg-card">
            {(can("painel_os.criar") || can("painel_os.editar") || (isTecnico && editing)) && (
              <Button onClick={handleSave} className="px-6">Salvar</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* View Detail Dialog */}
      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-[95vw] lg:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da O.S. {viewing?.codigo_os ? `— ${viewing.codigo_os}` : ""}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 py-2 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                <div><span className="text-muted-foreground">Código:</span> <span className="font-medium">{viewing.codigo_os || "—"}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{viewing.status || "—"}</span></div>
                <div>
                  <span className="text-muted-foreground">Prioridade:</span>{" "}
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border", PRIORIDADE_COLORS[viewing.prioridade || "Média"] || "")}>
                    {PRIORIDADE_ICONS[viewing.prioridade || "Média"]} {viewing.prioridade || "Média"}
                  </span>
                </div>
                <div><span className="text-muted-foreground">Bloco:</span> <span className="font-medium">{viewing.bloco_id ? blocosMap[viewing.bloco_id] || "—" : "—"}</span></div>
                <div><span className="text-muted-foreground">Andar:</span> <span className="font-medium">{viewing.andar || "—"}</span></div>
                <div><span className="text-muted-foreground">Sala:</span> <span className="font-medium">{viewing.sala || "—"}</span></div>
                <div><span className="text-muted-foreground">Tipo Serviço:</span> <span className="font-medium">{(viewing as any).tipo_servico || "—"}</span></div>
                <div><span className="text-muted-foreground">Natureza:</span> <span className="font-medium">{(viewing as any).natureza_servico || "—"}</span></div>
                <div>
                  <span className="text-muted-foreground">SLA:</span>{" "}
                  {(() => {
                    const sla = computeSlaStatus((viewing as any).sla_prazo_limite, viewing.status, viewing.created_at);
                    return (
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border", sla.colorClass)}>
                        {sla.label}
                      </span>
                    );
                  })()}
                </div>
                {(viewing as any).sla_prazo_limite && (
                  <div><span className="text-muted-foreground">Prazo SLA:</span> <span className="font-medium">{formatSlaDeadline((viewing as any).sla_prazo_limite)}</span></div>
                )}
                <div><span className="text-muted-foreground">Prazo:</span> <span className="font-medium">{fmtDate(viewing.prazo)}</span></div>
                <div><span className="text-muted-foreground">Início:</span> <span className="font-medium">{fmtDate(viewing.data_inicio)}</span></div>
                <div><span className="text-muted-foreground">Término:</span> <span className="font-medium">{fmtDate(viewing.data_termino)}</span></div>
                <div><span className="text-muted-foreground">Custo Total:</span> <span className="font-semibold text-primary">{viewing.custo_total ? `R$ ${Number(viewing.custo_total).toFixed(2)}` : "—"}</span></div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Ativo:</span>
                  {(viewing as any).ativo_id ? (
                    <AtivoStatusBadge ativoId={(viewing as any).ativo_id} nome={ativosOptions.find(a => a.id === (viewing as any).ativo_id)?.nome || "—"} />
                  ) : (
                    <span className="font-medium">—</span>
                  )}
                </div>
                {(viewing as any).clima_temperatura && (
                  <div>
                    <span className="text-muted-foreground">Clima na execução:</span>{" "}
                    <span className="font-medium">
                      {(viewing as any).clima_condicao} · {(viewing as any).clima_temperatura}°C
                    </span>
                  </div>
                )}
                <div><span className="text-muted-foreground">Responsável:</span> <span className="font-medium">{
                  (responsaveisMap[viewing.id] || []).length > 0 ? responsaveisMap[viewing.id].join(", ") : "—"
                }</span></div>
              </div>
              {/* Auxiliares */}
              <div className="border-t pt-3">
                <ColaboradoresOSSection
                  osId={viewing.id}
                  readOnly={true}
                  responsibleUserIds={viewing.responsible_user_ids || []}
                />
              </div>
              {/* Minhas Atividades */}
              {can("painel_os.visualizar_atividades") && (
                <div className="border-t pt-3">
                  <AtividadesUsuarioSection osId={viewing.id} />
                </div>
              )}
              {viewing.equipamentos && (
                <div>
                  <span className="text-muted-foreground block mb-1">Equipamentos:</span>
                  <ul className="list-disc list-inside space-y-1 rounded-md bg-muted/50 p-3">
                    {viewing.equipamentos.split("\n").filter(l => l.trim()).map((line, i) => (
                      <li key={i} className="text-sm">{line.trim()}</li>
                    ))}
                  </ul>
                </div>
              )}
              {viewing.observacoes && (
                <div>
                  <span className="text-muted-foreground block mb-1">Observações:</span>
                  <p className="whitespace-pre-line rounded-md bg-muted/50 p-3">{viewing.observacoes}</p>
                </div>
              )}
              {/* Audit info */}
              <div className="border-t pt-3">
                <span className="text-muted-foreground block mb-2 text-xs font-semibold uppercase tracking-wider">Rastreabilidade</span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Criado por:</span> <span className="font-medium">{viewing.criado_por ? profilesMap[viewing.criado_por] || "—" : "—"}</span></div>
                  <div><span className="text-muted-foreground">Criado em:</span> <span className="font-medium">{viewing.created_at ? format(new Date(viewing.created_at), "dd/MM/yyyy HH:mm") : "—"}</span></div>
                  {viewing.editado_por && (
                    <>
                      <div><span className="text-muted-foreground">Editado por:</span> <span className="font-medium">{profilesMap[viewing.editado_por] || "—"}</span></div>
                      <div><span className="text-muted-foreground">Editado em:</span> <span className="font-medium">{viewing.editado_em ? format(new Date(viewing.editado_em), "dd/MM/yyyy HH:mm") : "—"}</span></div>
                    </>
                  )}
                  {viewing.finalizado_por && (
                    <>
                      <div><span className="text-muted-foreground">Finalizado por:</span> <span className="font-medium">{profilesMap[viewing.finalizado_por] || "—"}</span></div>
                      <div><span className="text-muted-foreground">Finalizado em:</span> <span className="font-medium">{viewing.finalizado_em ? format(new Date(viewing.finalizado_em), "dd/MM/yyyy HH:mm") : "—"}</span></div>
                    </>
                  )}
                </div>
              </div>
              <div className="border-t pt-3">
                <MateriaisSection osId={viewing.id} readOnly />
              </div>
              <div className="border-t pt-3">
                <MemorialMateriaisSection osId={viewing.id} readOnly />
              </div>
              <div className="border-t pt-3">
                <AnexosSection osId={viewing.id} readOnly canDownload={can("painel_os.baixar")} />
              </div>
              <div className="border-t pt-3">
                <FotosOSSection osId={viewing.id} readOnly={true} />
              </div>
              <div className="border-t pt-3">
                <TimerOSSection osId={viewing.id} />
              </div>
              {can("painel_os.visualizar_atividades") && (
                <div className="border-t pt-3">
                  <CronogramaSection osId={viewing.id} readOnly={true} currentProfileId={currentProfileId} responsibleUserId={viewing.responsible_user_ids?.[0] || viewing.responsible_user_id} />
                </div>
              )}
              <div className="border-t pt-3">
                <ComentariosOSSection osId={viewing.id} readOnly={!can("painel_os.editar") && !isTecnicoAssigned(viewing)} />
              </div>
              <div className="border-t pt-3">
                <AvaliacaoResumoSection osId={viewing.id} />
              </div>
              {can("painel_os.visualizar_historico") && (
                <div className="border-t pt-3">
                  <HistoricoOSSection osId={viewing.id} />
                </div>
              )}
            </div>
          )}
          {/* Assinatura */}
          {viewing && (viewing as any).assinatura_tecnico && (
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">ASSINATURA DO TÉCNICO</p>
              <img src={(viewing as any).assinatura_tecnico} alt="Assinatura" className="border rounded-md max-h-20 bg-white" />
              {(viewing as any).assinatura_em && (
                <p className="text-xs text-muted-foreground mt-1">
                  Assinado em {format(new Date((viewing as any).assinatura_em), "dd/MM/yyyy HH:mm")}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="flex gap-2">
            {viewing && can("painel_os.baixar") && (
              <Button variant="outline" onClick={() => downloadPdf(viewing)}>
                <DownloadIcon className="mr-2 h-4 w-4" /> Baixar PDF
              </Button>
            )}
            <Button variant="outline" onClick={() => setAssinaturaOpen(true)}>
              ✍️ Assinar
            </Button>
            <Button variant="outline" onClick={() => setViewing(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir ordem de serviço?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} O.S. selecionada(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todas as ordens selecionadas serão removidas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk status change */}
      <Dialog open={bulkStatusOpen} onOpenChange={(open) => { setBulkStatusOpen(open); if (!open) setBulkStatusValue(""); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Mudar status de {selectedIds.size} O.S.</DialogTitle>
            <DialogDescription>
              O novo status será aplicado a todas as O.S. selecionadas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Select value={bulkStatusValue} onValueChange={setBulkStatusValue}>
              <SelectTrigger><SelectValue placeholder="Selecione o novo status" /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.filter((s) => s !== "Concluída").map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              "Concluída" não está na lista aqui de propósito — finalizar uma O.S. envolve checagens
              de estoque e orçamento que precisam ser feitas uma a uma, pelo botão "Finalizar" de cada O.S.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkStatusOpen(false)} disabled={bulkStatusSaving}>Cancelar</Button>
            <Button onClick={handleBulkStatusChange} disabled={!bulkStatusValue || bulkStatusSaving}>
              {bulkStatusSaving ? "Aplicando..." : "Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!anexosModalOsId} onOpenChange={(open) => !open && setAnexosModalOsId(null)}>
        <DialogContent className="sm:max-w-[440px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Anexos da O.S.</DialogTitle>
          </DialogHeader>
          {anexosModalOsId && anexosMap[anexosModalOsId]?.length ? (
            <div className="space-y-2 py-2">
              {anexosMap[anexosModalOsId].map((a) => (
                <AttachmentFileRow key={a.id} attachment={a} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">Nenhum anexo encontrado.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnexosModalOsId(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Dialog Assinatura */}
      <Dialog open={assinaturaOpen} onOpenChange={o => { if (!o) setAssinaturaOpen(false); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Assinatura do Técnico</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Assine abaixo com o dedo ou mouse:</p>
            <div className="border-2 border-dashed rounded-lg overflow-hidden bg-white">
              <SignatureCanvas
                ref={sigCanvasRef}
                canvasProps={{ width: 460, height: 200, className: "signature-canvas" }}
                backgroundColor="white"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => sigCanvasRef.current?.clear()}>
              Limpar
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssinaturaOpen(false)}>Cancelar</Button>
            <Button onClick={handleSalvarAssinatura} disabled={salvandoAssinatura}>
              {salvandoAssinatura ? "Salvando..." : "Salvar Assinatura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}