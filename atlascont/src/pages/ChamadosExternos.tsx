import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/hooks/use-company";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/hooks/use-realtime";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessagesSquare, Search, RefreshCw, Eye, X, Check, Loader2, Filter } from "@/lib/icons";

type ChamadoExterno = {
  id: string;
  codigo: string;
  status: string;
  ativo_id: string | null;
  ativo_nome: string | null;
  ativo_codigo: string | null;
  bloco_id: string | null;
  bloco_nome: string | null;
  andar: string | null;
  sala: string | null;
  area: string | null;
  ambiente: string | null;
  descricao_problema: string;
  solicitante_id: string | null;
  solicitante_nome: string | null;
  responsavel_id: string | null;
  os_id: string | null;
  justificativa_recusa: string | null;
  analisado_em: string | null;
  analisado_por: string | null;
  analisado_por_nome: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  "Em análise": "Em análise",
  "Encerrado": "Encerrado",
};

const statusColor = (s: string) => {
  switch (s) {
    case "Em análise": return "bg-amber-500/15 text-amber-700 border-amber-500/30";
    case "Encerrado": return "bg-zinc-200 text-zinc-700 border-zinc-300";
    default: return "bg-muted text-muted-foreground border-border";
  }
};

// Resultado dentro do status "Encerrado": Aprovado (gerou O.S.) ou Recusado (com justificativa)
const getResultado = (c: { status: string; os_id: string | null; justificativa_recusa: string | null }) => {
  if (c.status !== "Encerrado") return null;
  if (c.os_id) return "Aprovado";
  if (c.justificativa_recusa) return "Recusado";
  return null;
};

const resultadoColor = (r: string) => {
  switch (r) {
    case "Aprovado": return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
    case "Recusado": return "bg-red-500/15 text-red-700 border-red-500/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
};

export default function ChamadosExternos() {
  const navigate = useNavigate();
  const { companyId } = useCompany();
  const { session } = useAuth();
  const { can } = usePermissions();
  const podeVer = can("chamados_externos.visualizar");
  const podeAnalisar = can("chamados_externos.analisar");

  const [chamados, setChamados] = useState<ChamadoExterno[]>([]);
  const [osCodes, setOsCodes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileNome, setProfileNome] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState("Em análise");
  const [filterCodigo, setFilterCodigo] = useState("");
  const [filterEquipamento, setFilterEquipamento] = useState("");
  const [filterDataInicio, setFilterDataInicio] = useState("");
  const [filterDataFim, setFilterDataFim] = useState("");
  const [filterResultado, setFilterResultado] = useState("__all__");

  const [analyzing, setAnalyzing] = useState<ChamadoExterno | null>(null);
  const [refusing, setRefusing] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("profiles").select("id, nome").eq("user_id", uid).maybeSingle();
      if (!cancelled && data) {
        setProfileId(data.id);
        setProfileNome(data.nome);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

const fetchData = useCallback(async () => {
  if (!companyId) {
    setLoading(false);
    return;
  }
  setLoading(true);

  const { data, error } = await (supabase as any)
    .from("chamados")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[ChamadosExternos] erro:", error);
    toast({ title: "Erro ao carregar chamados", description: error.message, variant: "destructive" });
  } else {
    console.log("[ChamadosExternos] dados:", data, "companyId:", companyId);
    const list = (data || []) as ChamadoExterno[];
    setChamados(list);
      // Load codigo_os for chamados that have os_id
      const osIds = Array.from(new Set(list.map((c) => c.os_id).filter(Boolean) as string[]));
      if (osIds.length > 0) {
        const { data: osList } =
  await (supabase as any)
          .from("ordens_servico")
          .select("id, codigo_os")
          .eq("company_id", companyId)
          .in("id", osIds);
        const map: Record<string, string> = {};
        (osList || []).forEach((o: any) => { if (o.codigo_os) map[o.id] = o.codigo_os; });
        setOsCodes(map);
      } else {
        setOsCodes({});
      }
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useRealtime(
  ["chamados" as any],
  fetchData,
  companyId
);

  const filtered = useMemo(() => {
    return chamados.filter((c) => {
      if (filterStatus !== "__all__" && c.status !== filterStatus) return false;
      if (filterCodigo.trim() && !c.codigo.toLowerCase().includes(filterCodigo.trim().toLowerCase())) return false;
      if (filterEquipamento.trim()) {
        const term = filterEquipamento.trim().toLowerCase();
        const hay = `${c.ativo_nome || ""} ${c.ativo_codigo || ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (filterDataInicio) {
        if (new Date(c.created_at) < new Date(filterDataInicio + "T00:00:00")) return false;
      }
      if (filterDataFim) {
        if (new Date(c.created_at) > new Date(filterDataFim + "T23:59:59")) return false;
      }
      if (filterResultado !== "__all__") {
        const r = getResultado(c);
        if (filterResultado === "__none__") {
          if (r !== null) return false;
        } else if (r !== filterResultado) {
          return false;
        }
      }
      return true;
    });
  }, [chamados, filterStatus, filterCodigo, filterEquipamento, filterDataInicio, filterDataFim, filterResultado]);

  const handleAprovar = (c: ChamadoExterno) => {
    if (!podeAnalisar) {
      toast({ title: "Sem permissão", description: "Você não pode analisar chamados.", variant: "destructive" });
      return;
    }
    // Pre-fill OS form via sessionStorage and navigate to OS create
    const prefill = {
      chamado_externo_id: c.id,
      chamado_externo_codigo: c.codigo,
      ativo_id: c.ativo_id || "",
      bloco_id: c.bloco_id || "",
      andar: c.andar || "",
      sala: c.sala || "",
      descricao: c.descricao_problema || "",
      titulo: `Chamado ${c.codigo} — ${c.ativo_nome || ""}`.trim(),
      prioridade: "Média",
    };
    sessionStorage.setItem("chamado_externo_prefill", JSON.stringify(prefill));
    setAnalyzing(null);
    navigate("/ordens-servico?criar=true&origem=chamado_externo");
  };

  const handleRecusar = async () => {
    if (!analyzing) return;
    if (!justificativa.trim()) {
      toast({ title: "Justificativa obrigatória", description: "Preencha o motivo da recusa.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await (supabase as any)
  .from("chamados")
  .update({
    status: "Encerrado",
    justificativa_recusa: justificativa.trim(),
    analisado_em: new Date().toISOString(),
    analisado_por: profileId,
    analisado_por_nome: profileNome,
  })
  .eq("id", analyzing.id)
  .eq("company_id", companyId);
    setSubmitting(false);
    if (error) {
      toast({ title: "Erro ao recusar chamado", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Chamado recusado", description: `${analyzing.codigo} foi encerrado.` });
    setRefusing(false);
    setJustificativa("");
    setAnalyzing(null);
    fetchData();
  };

  if (!podeVer) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTitle>Sem permissão</AlertTitle>
          <AlertDescription>Você não tem permissão para acessar Chamados Externos.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-primary" />
            Chamados Externos
          </h1>
          <p className="text-xs text-muted-foreground">
            Chamados abertos por solicitantes — analise, aprove ou recuse antes de gerar uma O.S.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>

      {/* Filters */}
      <div className="rounded-lg border bg-card p-3 flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filterCodigo}
            onChange={(e) => setFilterCodigo(e.target.value)}
            placeholder="Buscar código (C-0001…)"
            className="pl-7 h-9 w-44"
          />
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filterEquipamento}
            onChange={(e) => setFilterEquipamento(e.target.value)}
            placeholder="Equipamento / código"
            className="pl-7 h-9 w-52"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os status</SelectItem>
            <SelectItem value="Em análise">Em análise</SelectItem>
            <SelectItem value="Encerrado">Encerrado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterResultado} onValueChange={setFilterResultado}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Resultado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os resultados</SelectItem>
            <SelectItem value="Aprovado">Aprovado</SelectItem>
            <SelectItem value="Recusado">Recusado</SelectItem>
            <SelectItem value="__none__">Sem análise</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">De</span>
          <Input type="date" value={filterDataInicio} onChange={(e) => setFilterDataInicio(e.target.value)} className="h-9 w-36" />
          <span className="text-xs text-muted-foreground">até</span>
          <Input type="date" value={filterDataFim} onChange={(e) => setFilterDataFim(e.target.value)} className="h-9 w-36" />
        </div>
        {(filterCodigo || filterEquipamento || filterDataInicio || filterDataFim || filterResultado !== "__all__" || filterStatus !== "Em análise") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterCodigo(""); setFilterEquipamento("");
              setFilterDataInicio(""); setFilterDataFim("");
              setFilterResultado("__all__"); setFilterStatus("Em análise");
            }}
            className="h-9 gap-1 text-xs"
          >
            <X className="h-3.5 w-3.5" /> Limpar
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} de {chamados.length}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Código</TableHead>
              <TableHead>Equipamento</TableHead>
              <TableHead className="hidden md:table-cell">Local</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead className="w-[140px]">Data</TableHead>
              <TableHead className="w-[180px]">Status</TableHead>
              <TableHead className="w-[130px]">O.S.</TableHead>
              <TableHead className="w-[120px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Nenhum chamado encontrado.</TableCell></TableRow>
            ) : filtered.map((c) => {
              const resultado = getResultado(c);
              const osCode = c.os_id ? osCodes[c.os_id] : null;
              return (
              <TableRow key={c.id}>
                <TableCell className="font-mono font-semibold">{c.codigo}</TableCell>
                <TableCell>
                  <div>{c.ativo_nome || "—"}</div>
                  {c.ativo_codigo && <div className="text-[11px] text-muted-foreground font-mono">{c.ativo_codigo}</div>}
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                  {[c.bloco_nome, c.andar, c.sala].filter(Boolean).join(" / ") || "—"}
                </TableCell>
                <TableCell className="text-xs">{c.solicitante_nome || "—"}</TableCell>
                <TableCell className="text-xs">
                  {format(new Date(c.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant="outline" className={statusColor(c.status)}>{STATUS_LABELS[c.status] || c.status}</Badge>
                    {resultado && (
                      <Badge variant="outline" className={resultadoColor(resultado)}>{resultado}</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {osCode ? osCode : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant={c.status === "Em análise" ? "default" : "outline"}
                    onClick={() => setAnalyzing(c)}
                    className="gap-1.5"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {c.status === "Em análise" ? "Analisar" : "Detalhes"}
                  </Button>
                </TableCell>
              </TableRow>
            );})}
          </TableBody>
        </Table>
      </div>

      {/* Analyze dialog */}
      <Dialog open={!!analyzing} onOpenChange={(o) => { if (!o) { setAnalyzing(null); setRefusing(false); setJustificativa(""); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessagesSquare className="h-5 w-5 text-primary" />
              Chamado {analyzing?.codigo}
            </DialogTitle>
            <DialogDescription>Análise do chamado externo</DialogDescription>
          </DialogHeader>

          {analyzing && (
            <div className="space-y-4 text-sm">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Dados do equipamento</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                  <div><span className="font-semibold">Equipamento:</span> {analyzing.ativo_nome || "—"}</div>
                  <div><span className="font-semibold">Código:</span> {analyzing.ativo_codigo || "—"}</div>
                  <div><span className="font-semibold">Unidade:</span> {analyzing.bloco_nome || "—"}</div>
                  <div><span className="font-semibold">Localização:</span> {[analyzing.andar, analyzing.sala].filter(Boolean).join(" / ") || "—"}</div>
                  <div><span className="font-semibold">Área:</span> {analyzing.area || "—"}</div>
                  <div><span className="font-semibold">Ambiente:</span> {analyzing.ambiente || "—"}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Dados do chamado</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <div><span className="font-semibold">Solicitante:</span> {analyzing.solicitante_nome || "—"}</div>
                  <div><span className="font-semibold">Aberto em:</span> {format(new Date(analyzing.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</div>
                  <div>
                    <div className="font-semibold mb-1">Descrição do problema:</div>
                    <div className="rounded-md border bg-muted/40 p-2 whitespace-pre-wrap">{analyzing.descricao_problema}</div>
                  </div>
                  {analyzing.status !== "Em análise" && (() => {
                    const resultado = getResultado(analyzing);
                    const osCode = analyzing.os_id ? osCodes[analyzing.os_id] : null;
                    return (
                      <>
                        <div className="pt-1 flex flex-wrap items-center gap-1">
                          <span className="font-semibold">Status:</span>{" "}
                          <Badge variant="outline" className={statusColor(analyzing.status)}>{analyzing.status}</Badge>
                          {resultado && (
                            <Badge variant="outline" className={resultadoColor(resultado)}>{resultado}</Badge>
                          )}
                        </div>
                        {analyzing.analisado_por_nome && (
                          <div className="text-xs text-muted-foreground">
                            Analisado por <strong>{analyzing.analisado_por_nome}</strong>{" "}
                            {analyzing.analisado_em && `em ${format(new Date(analyzing.analisado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}`}
                          </div>
                        )}
                        {resultado === "Aprovado" && (
                          <div className="rounded-md border bg-emerald-50 dark:bg-emerald-950/30 p-2 text-emerald-900 dark:text-emerald-200">
                            <div className="text-xs font-semibold">Ordem de Serviço gerada</div>
                            <div className="font-mono text-sm">{osCode || analyzing.os_id}</div>
                          </div>
                        )}
                        {analyzing.justificativa_recusa && (
                          <div>
                            <div className="font-semibold mb-1">Justificativa da recusa:</div>
                            <div className="rounded-md border bg-red-50 dark:bg-red-950/30 p-2 whitespace-pre-wrap text-red-900 dark:text-red-200">
                              {analyzing.justificativa_recusa}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </CardContent>
              </Card>

              {analyzing.status === "Em análise" && refusing && (
                <div>
                  <label className="text-sm font-medium block mb-1">
                    Justificativa da recusa <span className="text-destructive">*</span>
                  </label>
                  <Textarea
                    rows={3}
                    placeholder="Explique por que este chamado está sendo recusado..."
                    value={justificativa}
                    onChange={(e) => setJustificativa(e.target.value)}
                    maxLength={1000}
                  />
                  <div className="text-[11px] text-muted-foreground mt-1 text-right">{justificativa.length}/1000</div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            {analyzing?.status === "Em análise" && podeAnalisar ? (
              refusing ? (
                <>
                  <Button variant="outline" onClick={() => { setRefusing(false); setJustificativa(""); }} disabled={submitting}>
                    Voltar
                  </Button>
                  <Button variant="destructive" onClick={handleRecusar} disabled={submitting || !justificativa.trim()}>
                    {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Recusando…</> : <><X className="h-4 w-4 mr-2" /> Confirmar recusa</>}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setAnalyzing(null)}>Fechar</Button>
                  <Button variant="destructive" onClick={() => setRefusing(true)} className="gap-1.5">
                    <X className="h-4 w-4" /> Recusar
                  </Button>
                  <Button onClick={() => analyzing && handleAprovar(analyzing)} className="gap-1.5">
                    <Check className="h-4 w-4" /> Aprovar e abrir O.S.
                  </Button>
                </>
              )
            ) : (
              <Button variant="outline" onClick={() => setAnalyzing(null)}>Fechar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
