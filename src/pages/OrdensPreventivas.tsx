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
} from "@/lib/icons";

import { cn } from "@/lib/utils";

import { format } from "date-fns";

import { migrateLegacyPreventiveOrdersIfNeeded } from "@/lib/migrateLegacyPreventiveOrders";

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

  const fetchData = useCallback(async () => {

    if (!companyId) return;

    setLoading(true);

    await migrateLegacyPreventiveOrdersIfNeeded();

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

    setLoading(false);

  }, [companyId]);

  useEffect(() => {

    fetchData();

  }, [fetchData]);

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

  return (
    <div className="space-y-4">

      <div className="flex items-center justify-between">

        <div>
          <h1 className="text-2xl font-bold">
            Ordens Preventivas
          </h1>

          <p className="text-sm text-muted-foreground">
            Controle de ordens preventivas
          </p>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={fetchData}
        >
          <RefreshCw
            className={cn(
              "h-4 w-4",
              loading && "animate-spin"
            )}
          />
        </Button>
      </div>

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

        <Table>

          <TableHeader>

            <TableRow>

              <TableHead>
                Código
              </TableHead>

              <TableHead>
                Status
              </TableHead>

              <TableHead>
                Prioridade
              </TableHead>

              <TableHead>
                Bloco
              </TableHead>

              <TableHead>
                Responsável
              </TableHead>

            </TableRow>

          </TableHeader>

          <TableBody>

            {filtered.map((op) => (

              <TableRow key={op.id}>

                <TableCell className="font-medium">
                  {op.codigo_op}
                </TableCell>

                <TableCell>

                  <Badge
                    className={cn(
                      "border",
                      statusColor(op.status)
                    )}
                  >
                    {op.status}
                  </Badge>

                </TableCell>

                <TableCell>
                  {op.prioridade}
                </TableCell>

                <TableCell>
                  {op.bloco_id
                    ? blocosMap[op.bloco_id]
                    : "—"}
                </TableCell>

                <TableCell>
                  {op.responsible_user_id
                    ? profilesMap[
                        op.responsible_user_id
                      ]
                    : "—"}
                </TableCell>

              </TableRow>

            ))}

          </TableBody>

        </Table>

      </div>

    </div>
  );
}