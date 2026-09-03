import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/use-company";
import { useRealtime } from "@/hooks/use-realtime";

import { supabase } from "@/integrations/supabase/client";

import { toast } from "@/hooks/use-toast";

import OPTimer from "@/components/op/OPTimer";
import AtividadeMedicaoInput from "@/components/op/AtividadeMedicaoInput";
import QrCodeScanner from "@/components/op/QrCodeScanner";
import AbrirChamadoDialog from "@/components/op/AbrirChamadoDialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

import {
  RefreshCw,
  Search,
  Eye,
  Wrench,
  X,
  CheckCircle2,
  Circle,
  Trash2,
  AlertTriangle,
  Lock,
  QrCode,
  ShieldCheck,
  MessagesSquare,
  Gauge,
  Sparkles,
  Activity,
  Settings,
  FileText,
} from "@/lib/icons";

import { cn } from "@/lib/utils";

import { format } from "date-fns";

import { migrateLegacyPreventiveOrdersIfNeeded } from "@/lib/migrateLegacyPreventiveOrders";
import { autoGeneratePreventivas } from "@/lib/autoGeneratePreventivas";
import * as XLSX from "xlsx";

type Bloco = {
  id: string;
  nome: string | null;
};

type Profile = {
  id: string;
  nome: string;
};

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

type OrdemPreventiva = {
  id: string;
  codigo_op: string;
  status: string;
  prioridade: string;
  bloco_id: string | null;
  ativo_id: string | null;
  preventiva_id: string | null;
  tipo_servico: string | null;
  equipamentos: string | null;
  observacoes: string | null;
  titulo: string | null;
  data_inicio: string | null;
  data_termino: string | null;
  prazo: string | null;
  created_at: string;
  finalizado_em: string | null;
  responsible_user_id: string | null;
  timer_status: string;
  timer_started_at: string | null;
  timer_paused_at: string | null;
  timer_total_seconds: number;
  timer_user_id: string | null;
  qr_code_obrigatorio: boolean;
  andar: string | null;
  sala: string | null;
};

type AtividadeOP = {
  id: string;
  ordem_preventiva_id: string;
  nome: string;
  descricao: string | null;
  status: string;
  ordem: number;
  data_inicio: string | null;
  data_termino: string | null;
  concluido: boolean;
  concluido_em: string | null;
  timer_status: string;
  timer_started_at: string | null;
  timer_paused_at: string | null;
  timer_total_seconds: number;
  timer_user_id: string | null;
  tipo_atividade: string | null;
  tipo_medicao: string | null;
  unidade_medicao: string | null;
  valor_medido: string | null;
};

const STATUS_OP = [
  "Não Iniciada",
  "Em Execução",
  "Pausada",
  "Concluída",
  "Cancelada",
];

const PRIORIDADE_OPTIONS = [
  "Baixa",
  "Média",
  "Alta",
  "Urgente",
];

const statusColor = (s: string) => {
  switch (s) {
    case "Concluída":
      return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";

    case "Em Execução":
      return "bg-amber-500/15 text-amber-600 border-amber-500/30";

    case "Pausada":
      return "bg-sky-500/15 text-sky-600 border-sky-500/30";

    default:
      return "bg-muted text-muted-foreground border-border";
  }
};

export default function OrdensPreventivas() {

  const { companyId } = useCompany();

  const { can } = usePermissions();

  const { session } = useAuth();

  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);

  const [ordens, setOrdens] =
    useState<OrdemPreventiva[]>([]);

  const [blocos, setBlocos] =
    useState<Bloco[]>([]);

  const [profiles, setProfiles] =
    useState<Profile[]>([]);
    const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);

  const [ativos, setAtivos] =
    useState<Ativo[]>([]);

  const [atividades, setAtividades] =
    useState<AtividadeOP[]>([]);

  const [viewing, setViewing] =
    useState<OrdemPreventiva | null>(null);

  const [loadingAtv, setLoadingAtv] =
    useState(false);

  const [scannerOpen, setScannerOpen] =
    useState(false);

  const [selectedIds, setSelectedIds] =
    useState<Set<string>>(new Set());

  const [bulkDeleteOpen, setBulkDeleteOpen] =
    useState(false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
const [qrResolveRef] = useState<{ resolve: ((ok: boolean) => void) | null }>({ resolve: null });

  const [filterStatus, setFilterStatus] =
    useState("__all__");

  const [filterPrioridade, setFilterPrioridade] =
    useState("__all__");

  const [filterBlocoId, setFilterBlocoId] =
    useState("__all__");

  const [filterCodigo, setFilterCodigo] =
    useState("");

  const [chamadoAtividade, setChamadoAtividade] =
    useState<AtividadeOP | null>(null);
    type PlanoInfo = {
    id: string;
    nome: string;
    total: number;
    pendentes: number;
    emExecucao: number;
    atrasadas: number;
    concluidas: number;
  };

  const [planos, setPlanos] = useState<PlanoInfo[]>([]);
  const [planoSelecionado, setPlanoSelecionado] = useState<PlanoInfo | null>(null);
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false);
  const [planosMap, setPlanosMap] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {

    if (!companyId) return;

    setLoading(true);

    await migrateLegacyPreventiveOrdersIfNeeded();
    await autoGeneratePreventivas();

    const [
      opRes,
      blocosRes,
      profilesRes,
      ativosRes,
    ] = await Promise.all([

      (
        supabase
          .from("ordens_preventivas" as any)
          .select("*")
          .eq("company_id", companyId) as any
      ).order("created_at", {
        ascending: false,
      }),

      (supabase as any)
        .from("blocos")
        .select("id, nome")
        .eq("company_id", companyId)
        .order("nome"),

      (supabase as any)
        .from("profiles")
        .select("id, nome")
        .eq("company_id", companyId)
        .eq("status", "ativo")
        .order("nome"),

      (
        supabase
          .from("ativos" as any)
          .select(`
            id,
            nome,
            codigo_identificacao,
            bloco_id,
            andar,
            sala,
            identificacao_ambiente,
            area_pavimento,
            grupo_areas
          `)
          .eq("company_id", companyId) as any
      ).order("nome"),

    ]);

    if (opRes.error) {
      toast({
        title: "Erro ao carregar OPs",
        description: opRes.error.message,
        variant: "destructive",
      });
    }

    setOrdens(
      (opRes.data as OrdemPreventiva[]) || []
    );

    setBlocos(
      blocosRes.data || []
    );

    setProfiles(
      (profilesRes.data as Profile[]) || []
    );
setAtivos(
      (ativosRes.data as Ativo[]) || []
    );

    if (session?.user?.id) {
      const { data: prof } = await (supabase as any)
        .from("profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .single();
      if (prof) setCurrentProfileId(prof.id);
    }
// Buscar planos
    const { data: planosData } = await (supabase as any)
      .from("planos_manutencao")
      .select("id, nome");
    
    const pMap: Record<string, string> = {};
    (planosData || []).forEach((p: any) => { pMap[p.id] = p.nome; });
    setPlanosMap(pMap);

    // Buscar preventiva_mestre para mapear op → plano
    const { data: prevData } = await (supabase as any)
      .from("manutencao_preventiva")
      .select("id, plano_id");
    
    const prevToPlano: Record<string, string> = {};
    (prevData || []).forEach((p: any) => { if (p.plano_id) prevToPlano[p.id] = p.plano_id; });

    // Agrupar OPs por plano
    const hoje = new Date().toISOString().slice(0, 10);
    const porPlano: Record<string, any[]> = {};
    ((opRes.data as OrdemPreventiva[]) || []).forEach(op => {
      const planoId = op.preventiva_id ? prevToPlano[op.preventiva_id] : null;
      const key = planoId || "__sem_plano__";
      if (!porPlano[key]) porPlano[key] = [];
      porPlano[key].push(op);
    });

    const planosInfo: PlanoInfo[] = Object.entries(porPlano).map(([planoId, ops]) => ({
      id: planoId,
      nome: planoId === "__sem_plano__" ? "Sem Plano" : (pMap[planoId] || "Plano Desconhecido"),
      total: ops.length,
      pendentes: ops.filter(op => op.status === "Não Iniciada").length,
      emExecucao: ops.filter(op => op.status === "Em Execução").length,
      atrasadas: ops.filter(op => op.prazo && op.prazo < hoje && op.status !== "Concluída").length,
      concluidas: ops.filter(op => op.status === "Concluída").length,
    }));

    setPlanos(planosInfo.sort((a, b) => b.total - a.total));
    setLoading(false);

  }, [companyId, session]);

  useEffect(() => {

    fetchData();

  }, [fetchData]);

  // Carrega atividades da OP selecionada
useEffect(() => {
  if (!viewing) {
    setAtividades([]);
    return;
  }
  
  setLoadingAtv(true);
  (supabase as any)
    .from("atividades_ordem_preventiva")
    .select("*")
    .eq("ordem_preventiva_id", viewing.id)
    .order("ordem")
    .then(({ data }: any) => {
      setAtividades(data || []);
      setLoadingAtv(false);
      
    });
}, [viewing]);

  useRealtime(
    [
      "ordens_preventivas" as any,
      "atividades_ordem_preventiva" as any,
    ],
    fetchData,
    companyId
  );

  const blocosMap = useMemo(() => {

    return Object.fromEntries(
      blocos.map((b) => [b.id, b.nome || "—"])
    );

  }, [blocos]);

  const profilesMap = useMemo(() => {

    return Object.fromEntries(
      profiles.map((p) => [p.id, p.nome])
    );

  }, [profiles]);

  const ativosMap = useMemo(() => {

    return Object.fromEntries(
      ativos.map((a) => [a.id, a.nome])
    );

  }, [ativos]);

  const filtered = useMemo(() => {

   return ordens.filter((op) => {
      // Ocultar concluídas quando plano selecionado e mostrarConcluidas = false
      if (planoSelecionado && !mostrarConcluidas && op.status === "Concluída") return false;

      if (
        filterStatus !== "__all__" &&
        op.status !== filterStatus
      ) {
        return false;
      }

      if (
        filterPrioridade !== "__all__" &&
        op.prioridade !== filterPrioridade
      ) {
        return false;
      }

      if (
        filterBlocoId !== "__all__" &&
        op.bloco_id !== filterBlocoId
      ) {
        return false;
      }

      if (
        filterCodigo.trim() &&
        !op.codigo_op
          .toLowerCase()
          .includes(filterCodigo.toLowerCase())
      ) {
        return false;
      }

      return true;

    });

  }, [
    ordens,
    filterStatus,
    filterPrioridade,
    filterBlocoId,
    filterCodigo,
  ]);

  const total = filtered.length;

  const concluidas =
    filtered.filter(
      (o) => o.status === "Concluída"
    ).length;

  const emExecucao =
    filtered.filter(
      (o) => o.status === "Em Execução"
    ).length;

  const naoIniciadas =
    filtered.filter(
      (o) => o.status === "Não Iniciada"
    ).length;

  const atrasadas =
    filtered.filter((o) => {

      if (!o.prazo) return false;

      return (
        new Date(o.prazo) < new Date() &&
        o.status !== "Concluída"
      );

    }).length;

  const clearFilters = () => {

    setFilterStatus("__all__");
    setFilterPrioridade("__all__");
    setFilterBlocoId("__all__");
    setFilterCodigo("");

  };
const ComentariosOP = ({ opId }: { opId: string }) => {
    const [comentarios, setComentarios] = useState<any[]>([]);
    const [texto, setTexto] = useState("");
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
      (supabase as any).from("comentarios_op").select("*").eq("op_id", opId).order("created_at").then(({ data }: any) => setComentarios(data || []));
    }, [opId]);

    const salvar = async () => {
      if (!texto.trim()) return;
      setSalvando(true);
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof }: any = await supabase.from("profiles").select("nome").eq("user_id", user!.id).maybeSingle();
      await (supabase as any).from("comentarios_op").insert({ op_id: opId, texto: texto.trim(), autor_nome: prof?.nome || user?.email, autor_id: currentProfileId });
      setTexto("");
      const { data } = await (supabase as any).from("comentarios_op").select("*").eq("op_id", opId).order("created_at");
      setComentarios(data || []);
      setSalvando(false);
    };

    return (
      <div className="border-t pt-3 space-y-3">
        <p className="text-sm font-semibold">Comentários ({comentarios.length})</p>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {comentarios.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>
            : comentarios.map((c: any) => (
              <div key={c.id} className="rounded-md bg-muted/50 p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold">{c.autor_nome || "—"}</span>
                  <span className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), "dd/MM/yyyy HH:mm")}</span>
                </div>
                <p className="text-sm">{c.texto}</p>
              </div>
            ))}
        </div>
        <div className="flex gap-2">
          <Input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Adicionar comentário..." className="h-8 text-sm"
            onKeyDown={e => e.key === "Enter" && salvar()} />
          <Button size="sm" onClick={salvar} disabled={salvando || !texto.trim()} className="h-8">Enviar</Button>
        </div>
      </div>
    );
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {planoSelecionado && (
              <button onClick={() => setPlanoSelecionado(null)} className="text-muted-foreground hover:text-foreground mr-1">
                ←
              </button>
            )}
            {planoSelecionado ? planoSelecionado.nome : "Manutenção Preventiva"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {planoSelecionado ? "Ordens do plano" : "Selecione um plano de manutenção"}
          </p>
        </div>
        <div className="flex gap-2">
          {planoSelecionado && (
            <Button variant="outline" size="sm" className="gap-2"
              onClick={() => setMostrarConcluidas(!mostrarConcluidas)}>
              <Eye className="h-4 w-4" />
              {mostrarConcluidas ? "Ocultar concluídas" : "Ver concluídas"}
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={() => {
            const rows = filtered.map(op => ({
              "Código": op.codigo_op,
              "Status": op.status,
              "Prioridade": op.prioridade,
              "Bloco": op.bloco_id ? blocosMap[op.bloco_id] : "",
              "Responsável": op.responsible_user_id ? profilesMap[op.responsible_user_id] : "",
              "Ativo": op.ativo_id ? ativosMap[op.ativo_id] : "",
              "Data Início": op.data_inicio || "",
              "Prazo": op.prazo || "",
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Preventivas");
            XLSX.writeFile(wb, `preventivas_${new Date().toISOString().slice(0,10)}.xlsx`);
            toast({ title: "Excel exportado!" });
          }}>
            <FileText className="h-4 w-4" /> Exportar Excel
          </Button>
          <Button variant="outline" size="icon" onClick={fetchData}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>
       {/* CARDS DE PLANOS — tela inicial */}
      {!planoSelecionado && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? <p className="text-muted-foreground col-span-3">Carregando...</p>
            : planos.length === 0 ? (
              <div className="col-span-3 text-center py-12 text-muted-foreground border rounded-lg">
                <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>Nenhum plano de manutenção encontrado.</p>
              </div>
            ) : planos.map(plano => (
              <div key={plano.id}
                onClick={() => setPlanoSelecionado(plano)}
                className="rounded-xl border-2 bg-card hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer p-5 space-y-4"
                style={{ borderTopColor: plano.atrasadas > 0 ? "#ef4444" : plano.emExecucao > 0 ? "#f59e0b" : "#10b981", borderTopWidth: 4 }}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-base">{plano.nome}</h3>
                    <p className="text-xs text-muted-foreground">{plano.total} ordem(ns)</p>
                  </div>
                  <ShieldCheck className={cn("h-6 w-6",
                    plano.atrasadas > 0 ? "text-red-500" :
                    plano.emExecucao > 0 ? "text-amber-500" : "text-emerald-500"
                  )} />
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-lg font-bold">{plano.pendentes}</p>
                    <p className="text-[10px] text-muted-foreground">Pendentes</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-2">
                    <p className="text-lg font-bold text-amber-600">{plano.emExecucao}</p>
                    <p className="text-[10px] text-muted-foreground">Em exec.</p>
                  </div>
                  <div className="rounded-lg bg-red-50 p-2">
                    <p className="text-lg font-bold text-red-600">{plano.atrasadas}</p>
                    <p className="text-[10px] text-muted-foreground">Atrasadas</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-2">
                    <p className="text-lg font-bold text-emerald-600">{plano.concluidas}</p>
                    <p className="text-[10px] text-muted-foreground">Concluídas</p>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${plano.total > 0 ? (plano.concluidas / plano.total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
        </div>
      )}

      {/* LISTA DE OPs — após selecionar plano */}
      {planoSelecionado && <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">

        <div className="rounded-lg border p-3">
          <p className="text-2xl font-bold">
            {total}
          </p>
          <p className="text-xs text-muted-foreground">
            Total
          </p>
        </div>

        <div className="rounded-lg border p-3">
          <p className="text-2xl font-bold">
            {naoIniciadas}
          </p>
          <p className="text-xs text-muted-foreground">
            Não iniciadas
          </p>
        </div>

        <div className="rounded-lg border p-3">
          <p className="text-2xl font-bold text-amber-500">
            {emExecucao}
          </p>
          <p className="text-xs text-muted-foreground">
            Em execução
          </p>
        </div>

        <div className="rounded-lg border p-3">
          <p className="text-2xl font-bold text-destructive">
            {atrasadas}
          </p>
          <p className="text-xs text-muted-foreground">
            Atrasadas
          </p>
        </div>

        <div className="rounded-lg border p-3">
          <p className="text-2xl font-bold text-emerald-500">
            {concluidas}
          </p>
          <p className="text-xs text-muted-foreground">
            Concluídas
          </p>
        </div>

      </div>

      <div className="flex flex-wrap gap-2">

        <Input
          placeholder="Buscar código..."
          value={filterCodigo}
          onChange={(e) =>
            setFilterCodigo(e.target.value)
          }
          className="w-[180px]"
        />

        <Select
          value={filterStatus}
          onValueChange={setFilterStatus}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>

          <SelectContent>

            <SelectItem value="__all__">
              Todos
            </SelectItem>

            {STATUS_OP.map((s) => (
              <SelectItem
                key={s}
                value={s}
              >
                {s}
              </SelectItem>
            ))}

          </SelectContent>
        </Select>

      </div>

 <div className="rounded-lg border overflow-auto">
  {selectedIds.size > 0 && (
    <div className="flex items-center justify-between p-3 bg-muted/50 border-b">
      <span className="text-sm">
        {selectedIds.size} selecionada(s)
      </span>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setBulkDeleteOpen(true)}
      >
        <Trash2 className="h-4 w-4 mr-1" />
        Excluir selecionadas
      </Button>
    </div>
  )}

  <Table>
    <TableHeader>
      <TableRow>
        <TableHead className="w-[40px]">
          <Checkbox
            checked={
              filtered.length > 0 &&
              filtered.every((op) => selectedIds.has(op.id))
            }
            onCheckedChange={(checked) => {
              if (checked) {
                setSelectedIds(new Set(filtered.map((op) => op.id)));
              } else {
                setSelectedIds(new Set());
              }
            }}
          />
        </TableHead>
        <TableHead>Código</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Prioridade</TableHead>
        <TableHead>Bloco</TableHead>
        <TableHead>Responsável</TableHead>
        <TableHead className="w-[80px]">Ações</TableHead>
      </TableRow>
    </TableHeader>

    <TableBody>
      {filtered.map((op) => (
        <TableRow key={op.id}>
          <TableCell>
            <Checkbox
              checked={selectedIds.has(op.id)}
              onCheckedChange={(checked) => {
                const next = new Set(selectedIds);
                if (checked) next.add(op.id);
                else next.delete(op.id);
                setSelectedIds(next);
              }}
            />
          </TableCell>
          <TableCell className="font-medium">{op.codigo_op}</TableCell>
          <TableCell>
            <Badge className={cn("border", statusColor(op.status))}>
              {op.status}
            </Badge>
          </TableCell>
          <TableCell>{op.prioridade}</TableCell>
          <TableCell>
            {op.bloco_id ? blocosMap[op.bloco_id] : "—"}
          </TableCell>
          <TableCell>
            {op.responsible_user_id ? profilesMap[op.responsible_user_id] : "—"}
          </TableCell>
          <TableCell>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewing(op)}
              title="Ver detalhes"
            >
              <Eye className="h-4 w-4" />
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</div>

{/* Bulk Delete Confirmation */}
<AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>
        Excluir {selectedIds.size} ordens preventivas?
      </AlertDialogTitle>
      <AlertDialogDescription>
        Esta ação não pode ser desfeita.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction
        onClick={async () => {
          const ids = Array.from(selectedIds);
          const { error } = await (supabase as any)
            .from("ordens_preventivas")
            .delete()
            .in("id", ids);
          if (error) {
            toast({
              title: "Erro ao excluir",
              description: error.message,
              variant: "destructive",
            });
          } else {
            toast({ title: `${ids.length} ordens excluídas` });
            setSelectedIds(new Set());
            fetchData();
          }
          setBulkDeleteOpen(false);
        }}
      >
        Excluir
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>

{/* View Detail Dialog */}
<Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
  <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
   <DialogHeader>
  <div className="flex items-center justify-between pr-6">
    <DialogTitle>
      Ordem Preventiva — {viewing?.codigo_op}
    </DialogTitle>
  </div>
</DialogHeader>
    {viewing && (
      <div className="space-y-3 py-2 text-sm">
        {/* Cronômetro */}
<OPTimer
  opId={viewing.id}
  timerState={{
    status: viewing.timer_status,
    total_seconds: viewing.timer_total_seconds,
    started_at: viewing.timer_started_at,
    paused_at: viewing.timer_paused_at,
  }}
  currentProfileId={currentProfileId}
  finalizeBlocked={atividades.some(
    (a) => a.tipo_atividade === "Medição" && !a.valor_medido
  )}
  finalizeBlockedReason="Preencha os valores de medição antes de finalizar."
  onBeforeStart={async () => {
    if (!viewing.qr_code_obrigatorio) return true;
    return new Promise<boolean>((resolve) => {
      qrResolveRef.resolve = resolve;
      setQrScannerOpen(true);
    });
  }}
  onUpdate={() => {
    fetchData();
    const updated = ordens.find((o) => o.id === viewing.id);
    if (updated) setViewing(updated);
  }}
/>

<QrCodeScanner
  open={qrScannerOpen}
  onClose={() => {
    setQrScannerOpen(false);
    qrResolveRef.resolve?.(false);
    qrResolveRef.resolve = null;
  }}
  expectedHint={viewing.ativo_id ? ativosMap[viewing.ativo_id] : undefined}
  onValidate={(raw) => {
    const ativo = ativos.find((a) => a.id === viewing.ativo_id);
    const ok =
      !viewing.ativo_id ||
      raw === viewing.ativo_id ||
      raw === ativo?.codigo_identificacao;
    if (ok) {
      setQrScannerOpen(false);
      qrResolveRef.resolve?.(true);
      qrResolveRef.resolve = null;
    }
    return ok;
  }}
/>
        <div className="grid grid-cols-2 gap-3">

          <div><span className="text-muted-foreground">Título:</span> <span className="font-medium">{viewing.titulo || "—"}</span></div>
          <div><span className="text-muted-foreground">Status:</span> <Badge className={cn("border", statusColor(viewing.status))}>{viewing.status}</Badge></div>
          <div><span className="text-muted-foreground">Prioridade:</span> <span className="font-medium">{viewing.prioridade}</span></div>
          <div><span className="text-muted-foreground">Tipo:</span> <span className="font-medium">{viewing.tipo_servico || "—"}</span></div>
          <div><span className="text-muted-foreground">Bloco:</span> <span className="font-medium">{viewing.bloco_id ? blocosMap[viewing.bloco_id] : "—"}</span></div>
          <div><span className="text-muted-foreground">Ativo:</span> <span className="font-medium">{viewing.ativo_id ? ativosMap[viewing.ativo_id] : "—"}</span></div>
          <div><span className="text-muted-foreground">Data início:</span> <span className="font-medium">{viewing.data_inicio || "—"}</span></div>
          <div><span className="text-muted-foreground">Prazo:</span> <span className="font-medium">{viewing.prazo || "—"}</span></div>
        </div>
        {/* Lista de atividades */}
<div className="border-t pt-3">
  <p className="text-sm font-semibold mb-2">
    Atividades ({atividades.length})
  </p>
  {loadingAtv ? (
    <p className="text-xs text-muted-foreground">Carregando...</p>
  ) : atividades.length === 0 ? (
    <p className="text-xs text-muted-foreground">Nenhuma atividade.</p>
  ) : (
    <div className="space-y-2">
    {atividades.map((atv) => (
  <div key={atv.id} className="rounded-md border p-2 space-y-2">
   <div className="flex items-start gap-2">
      <div className="mt-0.5 shrink-0">
        {(() => {
          const tipo = atv.tipo_atividade?.toLowerCase() || "";
          if (tipo === "medição" || tipo === "medicao") return <Gauge className="h-4 w-4 text-blue-600" />;
          if (tipo === "inspeção" || tipo === "inspecao") return <Eye className="h-4 w-4 text-violet-600" />;
          if (tipo === "limpeza") return <Sparkles className="h-4 w-4 text-emerald-600" />;
          if (tipo === "lubrificação" || tipo === "lubrificacao") return <Activity className="h-4 w-4 text-amber-600" />;
          if (tipo === "substituição" || tipo === "substituicao") return <RefreshCw className="h-4 w-4 text-rose-600" />;
          if (tipo === "ajuste") return <Settings className="h-4 w-4 text-orange-600" />;
          if (tipo === "teste") return <CheckCircle2 className="h-4 w-4 text-fuchsia-600" />;
          return <Circle className="h-4 w-4 text-muted-foreground" />;
        })()}
      </div>
      <Checkbox
        checked={atv.concluido}
        disabled={
          atv.tipo_atividade === "Medição" &&
          !atv.valor_medido
        }
        onCheckedChange={async (checked) => {
          const { error } = await (supabase as any)
            .from("atividades_ordem_preventiva")
            .update({
              concluido: !!checked,
              concluido_em: checked ? new Date().toISOString() : null,
              status: checked ? "Concluído" : "Não iniciado",
            })
            .eq("id", atv.id);
          if (error) {
            toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
          } else {
            setAtividades((prev) =>
              prev.map((a) =>
                a.id === atv.id
                  ? { ...a, concluido: !!checked, status: checked ? "Concluído" : "Não iniciado" }
                  : a
              )
            );
          }
        }}
      />
   <div className="flex-1">
        <p className={cn("text-sm font-medium", atv.concluido && "line-through text-muted-foreground")}>
          {atv.nome}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {atv.tipo_atividade && (
            <Badge variant="outline" className="text-xs">
              {atv.tipo_atividade}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground"
            onClick={() => setChamadoAtividade(atv)}
          >
            <MessagesSquare className="h-3 w-3 mr-1" />
            Abrir chamado
          </Button>
        </div>
      </div>
    </div>

    {atv.tipo_atividade === "Medição" && (
      <div className="flex items-center gap-2 pl-6">
        <Input
          type="number"
          placeholder={`Valor (${atv.unidade_medicao || "—"})`}
          value={atv.valor_medido || ""}
          disabled={atv.concluido}
          className="h-7 text-xs w-[160px]"
          onChange={async (e) => {
            const valor = e.target.value;
            await (supabase as any)
              .from("atividades_ordem_preventiva")
              .update({ valor_medido: valor })
              .eq("id", atv.id);
            setAtividades((prev) =>
              prev.map((a) =>
                a.id === atv.id ? { ...a, valor_medido: valor } : a
              )
            );
          }}
        />
        <span className="text-xs text-muted-foreground">
          {atv.unidade_medicao || ""}
        </span>
      </div>
    )}
  </div>
))}
    </div>
  )}
</div>
{viewing.observacoes && (
          <div className="border-t pt-3">
            <p className="text-muted-foreground text-xs">Observações:</p>
            <p>{viewing.observacoes}</p>
          </div>
        )}

        {/* Comentários */}
        <ComentariosOP opId={viewing.id} />
      </div>
    )}
  </DialogContent>
</Dialog>

<AbrirChamadoDialog
  open={!!chamadoAtividade}
  onClose={() => setChamadoAtividade(null)}
  atividadeNome={chamadoAtividade?.nome || ""}
  ativo={viewing?.ativo_id ? (ativos.find(a => a.id === viewing.ativo_id) || null) : null}
  blocoNome={viewing?.bloco_id ? blocosMap[viewing.bloco_id] : null}
  contextoTitulo={viewing?.titulo}
  onCreated={(_, codigo) => {
    toast({ title: "Chamado criado", description: codigo });
    setChamadoAtividade(null);
  }}
/>

    </>}
    </div>
  );
}
