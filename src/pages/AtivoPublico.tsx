import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/hooks/use-company";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowRight,
  Building2,
  Calendar,
  ClipboardList,
  Cpu,
  MapPin,
  Tag,
  User,
} from "@/lib/icons";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type AtivoPublicoData = {
  id: string;
  nome: string;
  codigo_identificacao: string | null;
  sistema: string | null;
  tipo: string | null;
  grupo_equipamentos: string | null;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  patrimonio: string | null;
  responsavel_tecnico: string | null;
  data_instalacao: string | null;
  observacoes: string | null;
  bloco_id: string | null;
  andar: string | null;
  sala: string | null;
  grupo_areas: string | null;
  area_pavimento: string | null;
  identificacao_ambiente: string | null;
  status: string;
};

type OSResumo = {
  id: string;
  codigo_os: string | null;
  status: string | null;
  prazo: string | null;
};

type OPResumo = {
  id: string;
  codigo_op: string;
  status: string;
  prazo: string | null;
  data_inicio: string | null;
  finalizado_em: string | null;
};

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  ativo: { label: "Ativo", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  inativo: { label: "Inativo", className: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  "manutenção": { label: "Manutenção", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
};

const OS_STATUS_MAP: Record<string, string> = {
  "Concluída": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Em execução": "bg-sky-50 text-sky-700 border-sky-200",
  "Em andamento": "bg-sky-50 text-sky-700 border-sky-200",
  "Não Iniciada": "bg-zinc-100 text-zinc-600 border-zinc-200",
  "Não iniciado": "bg-zinc-100 text-zinc-600 border-zinc-200",
  "Pendente": "bg-zinc-100 text-zinc-600 border-zinc-200",
  "Pausada": "bg-amber-50 text-amber-700 border-amber-200",
  "Em triagem": "bg-violet-50 text-violet-700 border-violet-200",
  "Aguardando material": "bg-orange-50 text-orange-700 border-orange-200",
  "Aguardando acesso": "bg-yellow-50 text-yellow-700 border-yellow-200",
  "Cancelada": "bg-red-50 text-red-700 border-red-200",
};

const formatDate = (value: string | null) => {
  if (!value) return "—";
  try {
    return format(new Date(`${value}T12:00:00`), "dd/MM/yyyy");
  } catch {
    return "—";
  }
};

const displayValue = (value: string | null | undefined) => {
  if (!value) return "—";
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : "—";
};

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-words">{value}</p>
    </div>
  );
}

export default function AtivoPublico() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { companyId } = useCompany();
  const [ativo, setAtivo] = useState<AtivoPublicoData | null>(null);
  const [blocoNome, setBlocoNome] = useState("—");
  const [osList, setOsList] = useState<OSResumo[]>([]);
  const [opList, setOpList] = useState<OPResumo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!id) {
      setAtivo(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: ativoData } =
  await ((supabase as any)
    .from("ativos")
    .select(
      "id,nome,codigo_identificacao,sistema,tipo,grupo_equipamentos,marca,modelo,numero_serie,patrimonio,responsavel_tecnico,data_instalacao,observacoes,bloco_id,andar,sala,grupo_areas,area_pavimento,identificacao_ambiente,status"
    ))
    .eq("id", id)
    .maybeSingle();
    console.log("[AtivoPublico] ativoData:", ativoData, "id:", id);

    if (!ativoData) {
      setAtivo(null);
      setBlocoNome("—");
      setOsList([]);
      setOpList([]);
      setLoading(false);
      return;
    }

    setAtivo(ativoData as AtivoPublicoData);

    let blocoData: { nome?: string | null } | null = null;

   if (ativoData.bloco_id) {
  const { data } = await (supabase as any)
    .from("blocos")
    .select("nome")
    .eq("id", ativoData.bloco_id)
    .eq("company_id", companyId)
    .maybeSingle();
  blocoData = data;
}

  const [{ data: osData }, { data: opData }] =
  await Promise.all([
    ((supabase as any)
      .from("ordens_servico")
      .select(
        "id,codigo_os,status,prazo"
      ))
      .eq("ativo_id", id)
      .eq("company_id", companyId)
      .not(
        "status",
        "eq",
        "Cancelada"
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(10),

    ((supabase as any)
      .from("ordens_preventivas")
      .select(
        "id,codigo_op,status,prazo,data_inicio,finalizado_em"
      ))
      .eq("ativo_id", id)
      .eq("company_id", companyId)
      .not(
        "status",
        "eq",
        "Cancelada"
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(10),
  ]);

    setBlocoNome(blocoData?.nome || "—");
    setOsList((osData as OSResumo[]) || []);
    setOpList((opData as OPResumo[]) || []);
    setLoading(false);
}, [id, companyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <p className="text-sm text-muted-foreground">Carregando ativo...</p>
      </div>
    );
  }

  if (!ativo) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6">
        <Building2 className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-center text-muted-foreground">Ativo não encontrado.</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/")}>
          Voltar ao início
        </Button>
      </div>
    );
  }

  const statusInfo = STATUS_MAP[ativo.status] || {
    label: ativo.status,
    className: "bg-muted text-muted-foreground border-border",
  };

  const locationSummary = [
    blocoNome !== "—" ? blocoNome : null,
    ativo.grupo_areas,
    ativo.area_pavimento || ativo.andar,
    ativo.identificacao_ambiente || ativo.sala,
  ]
    .filter(Boolean)
    .join(" › ");

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Atlas Control</span>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate(`/ativos/${ativo.id}`)}>
            Ver completo <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-xl space-y-4 p-4">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight">{ativo.nome}</h1>
                <p className="mt-1 text-sm font-mono text-muted-foreground">
                  {ativo.codigo_identificacao || "Sem identificação"}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                  statusInfo.className,
                )}
              >
                {statusInfo.label}
              </span>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Localização</p>
                  <p className="text-sm">{locationSummary || "—"}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sistema</p>
                    <p className="text-sm font-medium">{displayValue(ativo.sistema)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <Tag className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipo</p>
                    <p className="text-sm font-medium">{displayValue(ativo.tipo)}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-5 pt-5">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identificação do ativo</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DetailItem label="Nome do ativo" value={ativo.nome} />
                <DetailItem label="Código / identificação" value={displayValue(ativo.codigo_identificacao)} />
                <DetailItem label="Sistema" value={displayValue(ativo.sistema)} />
                <DetailItem label="Tipo" value={displayValue(ativo.tipo)} />
                <DetailItem label="Grupo de equipamentos" value={displayValue(ativo.grupo_equipamentos)} />
                <DetailItem label="Status" value={statusInfo.label} />
                <DetailItem label="Marca" value={displayValue(ativo.marca)} />
                <DetailItem label="Modelo" value={displayValue(ativo.modelo)} />
                <DetailItem label="Número de série" value={displayValue(ativo.numero_serie)} />
                <DetailItem label="Patrimônio" value={displayValue(ativo.patrimonio)} />
              </div>
            </div>

            <Separator />

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Localização</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DetailItem label="Localização" value={locationSummary || "—"} />
                <DetailItem label="Unidade de manutenção" value={blocoNome !== "—" ? blocoNome : "—"} />
                <DetailItem label="Grupo de áreas" value={displayValue(ativo.grupo_areas)} />
                <DetailItem label="Área" value={displayValue(ativo.area_pavimento || ativo.andar)} />
                <DetailItem label="Identificação do ambiente" value={displayValue(ativo.identificacao_ambiente || ativo.sala)} />
              </div>
            </div>

            <Separator />

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Responsabilidade e instalação</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Responsável técnico</p>
                  </div>
                  <p className="text-sm font-medium break-words">{displayValue(ativo.responsavel_tecnico)}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Data de instalação</p>
                  </div>
                  <p className="text-sm font-medium">{formatDate(ativo.data_instalacao)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Ordens de Serviço vinculadas</span>
              </div>
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {osList.length}
              </span>
            </div>

            {osList.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center">
                <p className="text-sm text-muted-foreground">Nenhuma O.S. vinculada a este ativo.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {osList.map((os) => {
                  const prazoDate = os.prazo ? new Date(`${os.prazo}T12:00:00`) : null;
                  const isOverdue = prazoDate && prazoDate < new Date() && os.status !== "Concluída";

                  return (
                    <div key={os.id} className="rounded-lg border border-border/70 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold font-mono">{os.codigo_os || "Sem código"}</p>
                          <p className={cn("mt-1 text-xs", isOverdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                            {prazoDate ? `Prazo: ${format(prazoDate, "dd/MM/yyyy")}` : "Sem prazo definido"}
                            {isOverdue ? " • Atrasada" : ""}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                            OS_STATUS_MAP[os.status || ""] || "bg-muted text-muted-foreground border-border",
                          )}
                        >
                          {os.status || "—"}
                        </span>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full justify-between"
                        onClick={() => navigate(`/os/${os.id}`)}
                      >
                        Abrir O.S.
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Ordens Preventivas vinculadas</span>
              </div>
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {opList.length}
              </span>
            </div>

            {opList.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center">
                <p className="text-sm text-muted-foreground">Nenhuma Ordem Preventiva vinculada a este ativo</p>
              </div>
            ) : (
              <div className="space-y-3">
                {opList.map((op) => {
                  const isFinalizada = op.status === "Concluída" || op.status === "Cancelada";
                  const prazoDate = op.prazo ? new Date(`${op.prazo}T12:00:00`) : null;
                  const isOverdue = !isFinalizada && prazoDate && prazoDate < new Date();

                  // Data de execução (se finalizada) ou próxima execução (prazo)
                  let dataLabel = "Sem data definida";
                  if (op.finalizado_em) {
                    try {
                      dataLabel = `Executada em ${format(new Date(op.finalizado_em), "dd/MM/yyyy")}`;
                    } catch { /* noop */ }
                  } else if (prazoDate) {
                    dataLabel = `Próxima execução: ${format(prazoDate, "dd/MM/yyyy")}`;
                  } else if (op.data_inicio) {
                    dataLabel = `Início previsto: ${formatDate(op.data_inicio)}`;
                  }

                  return (
                    <div key={op.id} className="rounded-lg border border-border/70 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold font-mono">{op.codigo_op}</p>
                          <p className={cn("mt-1 text-xs", isOverdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                            {dataLabel}
                            {isOverdue ? " • Atrasada" : ""}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                            OS_STATUS_MAP[op.status] || "bg-muted text-muted-foreground border-border",
                          )}
                        >
                          {op.status}
                        </span>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full justify-between"
                        onClick={() => navigate(`/ordens-preventivas?op=${op.id}`)}
                      >
                        Abrir Ordem Preventiva
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {ativo.observacoes && (
          <Card>
            <CardContent className="space-y-2 pt-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Informações adicionais</h2>
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="whitespace-pre-line text-sm">{ativo.observacoes}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
