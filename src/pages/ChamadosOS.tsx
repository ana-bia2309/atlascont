import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  MessagesSquare,
  QrCode,
  Keyboard,
  CheckCircle2,
  X,
  Loader2,
  ChevronDown,
  Inbox,
  Clock,
  XCircle,
  FileText,
} from "@/lib/icons";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import QrCodeScanner from "@/components/op/QrCodeScanner";

type Ativo = {
  id: string;
  nome: string;
  codigo_identificacao: string | null;
  patrimonio: string | null;
  numero_serie: string | null;
  bloco_id: string | null;
  andar: string | null;
  sala: string | null;
  area_pavimento: string | null;
  identificacao_ambiente: string | null;
};

type MeuChamado = {
  id: string;
  codigo: string;
  status: string;
  descricao_problema: string;
  ativo_nome: string | null;
  ativo_codigo: string | null;
  bloco_nome: string | null;
  andar: string | null;
  sala: string | null;
  created_at: string;
  analisado_em: string | null;
  analisado_por_nome: string | null;
  justificativa_recusa: string | null;
  os_id: string | null;
  os_codigo?: string | null;
};

function extractCode(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/\/ativo\/([^/?#]+)/i);
  if (match) return match[1];
  return trimmed;
}

async function findAtivo(code: string): Promise<Ativo | null> {
  const value = code.trim();
  if (!value) return null;

  const fields =
    "id, nome, codigo_identificacao, patrimonio, numero_serie, bloco_id, andar, sala, area_pavimento, identificacao_ambiente";

  const { data: byId } = await supabase
    .from("ativos")
    .select(fields)
    .eq("id", value)
    .maybeSingle();
  if (byId) return byId as Ativo;

  const { data: byCode } = await supabase
    .from("ativos")
    .select(fields)
    .or(
      `codigo_identificacao.eq.${value},patrimonio.eq.${value},numero_serie.eq.${value}`
    )
    .limit(1)
    .maybeSingle();

  return (byCode as Ativo) ?? null;
}

async function fetchBlocoNome(blocoId: string | null): Promise<string | null> {
  if (!blocoId) return null;
  const { data } = await supabase.from("blocos").select("nome").eq("id", blocoId).maybeSingle();
  return data?.nome ?? null;
}

function statusInfo(c: MeuChamado) {
  if (c.status === "Em análise") {
    return {
      label: "Em análise",
      className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
      icon: Clock,
    };
  }
  if (c.status === "Encerrado" && c.os_id) {
    return {
      label: "Aprovado",
      className: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
      icon: CheckCircle2,
    };
  }
  if (c.status === "Encerrado" && c.justificativa_recusa) {
    return {
      label: "Recusado",
      className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
      icon: XCircle,
    };
  }
  return {
    label: c.status,
    className: "bg-muted text-muted-foreground border-border",
    icon: FileText,
  };
}

export default function ChamadosOS() {
  const { session } = useAuth();
  const { can } = usePermissions();
  const podeVer = can("chamados_os.visualizar");
  const podeCriar = can("chamados_os.criar");

  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [ativo, setAtivo] = useState<Ativo | null>(null);
  const [blocoNome, setBlocoNome] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const [descricao, setDescricao] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [profileId, setProfileId] = useState<string | null>(null);
  const [meusChamados, setMeusChamados] = useState<MeuChamado[]>([]);
  const [loadingLista, setLoadingLista] = useState(true);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "analise" | "aprovado" | "recusado">("todos");

  // Resolve profile id do usuário logado
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setProfileId(null);
      return;
    }
    supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setProfileId(data?.id ?? null));
  }, [session?.user?.id]);

  const carregarMeusChamados = useCallback(async () => {
    if (!profileId) {
      setMeusChamados([]);
      setLoadingLista(false);
      return;
    }
    setLoadingLista(true);
    const { data, error } = await supabase
      .from("chamados")
      .select(
        "id, codigo, status, descricao_problema, ativo_nome, ativo_codigo, bloco_nome, andar, sala, created_at, analisado_em, analisado_por_nome, justificativa_recusa, os_id"
      )
      .eq("solicitante_id", profileId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[Chamados] erro ao carregar lista:", error);
      setLoadingLista(false);
      return;
    }

    const lista = (data ?? []) as MeuChamado[];
    // Buscar códigos das O.S. vinculadas
    const osIds = lista.map((c) => c.os_id).filter(Boolean) as string[];
    if (osIds.length > 0) {
      const { data: oss } = await supabase
        .from("ordens_servico")
        .select("id, codigo_os")
        .in("id", osIds);
      const map = new Map((oss ?? []).map((o: any) => [o.id, o.codigo_os]));
      lista.forEach((c) => {
        if (c.os_id) c.os_codigo = map.get(c.os_id) ?? null;
      });
    }
    setMeusChamados(lista);
    setLoadingLista(false);
  }, [profileId]);

  useEffect(() => {
    carregarMeusChamados();
  }, [carregarMeusChamados]);

  // Realtime: ouvir mudanças nos meus chamados
  useEffect(() => {
    if (!profileId) return;
    const channel = supabase
      .channel(`chamados-meus-${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chamados",
          filter: `solicitante_id=eq.${profileId}`,
        },
        () => carregarMeusChamados()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileId, carregarMeusChamados]);

  if (!podeVer) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTitle>Sem permissão</AlertTitle>
          <AlertDescription>
            Você não tem permissão para acessar Chamados.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const setAtivoComBloco = async (a: Ativo) => {
    setAtivo(a);
    setBlocoNome(await fetchBlocoNome(a.bloco_id));
  };

  const handleManualSearch = async () => {
    const code = manualCode.trim();
    if (!code) {
      toast({ title: "Informe o código do equipamento", variant: "destructive" });
      return;
    }
    setSearching(true);
    try {
      const found = await findAtivo(extractCode(code));
      if (!found) {
        toast({
          title: "Equipamento não encontrado",
          description: "Verifique o código informado e tente novamente.",
          variant: "destructive",
        });
        setAtivo(null);
        setBlocoNome(null);
        return;
      }
      await setAtivoComBloco(found);
      toast({ title: "Equipamento identificado", description: found.nome });
    } finally {
      setSearching(false);
    }
  };

  const handleQrValidate = async (raw: string): Promise<boolean> => {
    const found = await findAtivo(extractCode(raw));
    if (!found) {
      toast({
        title: "QR Code inválido",
        description: "Não foi encontrado nenhum equipamento com esse código.",
        variant: "destructive",
      });
      return false;
    }
    await setAtivoComBloco(found);
    setManualCode(found.codigo_identificacao ?? found.id);
    toast({ title: "Equipamento identificado", description: found.nome });
    return true;
  };

  const limpar = () => {
    setAtivo(null);
    setBlocoNome(null);
    setManualCode("");
    setDescricao("");
  };

  const handleAbrirChamado = async () => {
    if (!ativo) return;
    const desc = descricao.trim();
    if (!desc) {
      toast({ title: "Descrição obrigatória", description: "Descreva o problema antes de abrir o chamado.", variant: "destructive" });
      return;
    }
    if (!podeCriar) {
      toast({ title: "Sem permissão", description: "Você não pode abrir chamados.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const userId = session?.user?.id;
      let solicitanteProfileId: string | null = profileId;
      let solicitanteNome = session?.user?.email ?? "Usuário";

      if (userId && !solicitanteProfileId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, nome")
          .eq("user_id", userId)
          .maybeSingle();
        if (profile) {
          solicitanteProfileId = profile.id;
          solicitanteNome = profile.nome ?? solicitanteNome;
        }
      } else if (solicitanteProfileId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("nome")
          .eq("id", solicitanteProfileId)
          .maybeSingle();
        if (profile?.nome) solicitanteNome = profile.nome;
      }

      const { data, error } = await supabase
        .from("chamados")
        .insert({
          ativo_id: ativo.id,
          ativo_nome: ativo.nome,
          ativo_codigo: ativo.codigo_identificacao,
          bloco_id: ativo.bloco_id,
          bloco_nome: blocoNome,
          andar: ativo.andar,
          sala: ativo.sala,
          area: ativo.area_pavimento,
          ambiente: ativo.identificacao_ambiente,
          descricao_problema: desc,
          solicitante_id: solicitanteProfileId,
          solicitante_nome: solicitanteNome,
        })
        .select("id, codigo")
        .single();

      if (error) throw error;

      toast({
        title: "Chamado aberto com sucesso",
        description: `Código: ${data.codigo}`,
      });
      setHighlightId(data.id);
      setTimeout(() => setHighlightId(null), 4000);
      limpar();
      carregarMeusChamados();
    } catch (err: any) {
      console.error("[Chamados] erro ao abrir chamado:", err);
      toast({
        title: "Erro ao abrir chamado",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const chamadosFiltrados = meusChamados.filter((c) => {
    if (filtroStatus === "todos") return true;
    if (filtroStatus === "analise") return c.status === "Em análise";
    if (filtroStatus === "aprovado") return c.status === "Encerrado" && !!c.os_id;
    if (filtroStatus === "recusado") return c.status === "Encerrado" && !!c.justificativa_recusa;
    return true;
  });

  const contadores = {
    total: meusChamados.length,
    analise: meusChamados.filter((c) => c.status === "Em análise").length,
    aprovado: meusChamados.filter((c) => c.status === "Encerrado" && c.os_id).length,
    recusado: meusChamados.filter((c) => c.status === "Encerrado" && c.justificativa_recusa).length,
  };

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <MessagesSquare className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">Chamados</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identificar equipamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Opção 1 — Leitura via QR Code</Label>
            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full sm:w-auto"
              onClick={() => setScannerOpen(true)}
            >
              <QrCode className="h-4 w-4 mr-2" />
              Ler QR Code do equipamento
            </Button>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border" />
            <span>OU</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div>
            <Label htmlFor="codigo-equipamento" className="text-sm font-medium">
              Opção 2 — Digitar código do equipamento
            </Label>
            <div className="mt-2 flex gap-2">
              <Input
                id="codigo-equipamento"
                placeholder="Código, patrimônio ou número de série"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleManualSearch(); }}
              />
              <Button onClick={handleManualSearch} disabled={searching}>
                <Keyboard className="h-4 w-4 mr-2" />
                {searching ? "Buscando..." : "Buscar"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {ativo && (
        <Card className="border-primary/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Equipamento identificado
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={limpar}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              <div><span className="font-semibold">Equipamento:</span> {ativo.nome}</div>
              <div><span className="font-semibold">Código:</span> {ativo.codigo_identificacao ?? "—"}</div>
              <div>
                <span className="font-semibold">Localização:</span>{" "}
                {[ativo.andar, ativo.sala].filter(Boolean).join(" / ") || "—"}
              </div>
              <div><span className="font-semibold">Unidade:</span> {blocoNome ?? "—"}</div>
              <div><span className="font-semibold">Área:</span> {ativo.area_pavimento ?? "—"}</div>
              <div><span className="font-semibold">Ambiente:</span> {ativo.identificacao_ambiente ?? "—"}</div>
            </div>

            <div className="pt-2">
              <Label htmlFor="descricao-problema" className="text-sm font-medium">
                Descrição do problema <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="descricao-problema"
                className="mt-2"
                rows={4}
                placeholder="Descreva o problema observado no equipamento..."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                maxLength={2000}
              />
              <div className="text-[11px] text-muted-foreground mt-1 text-right">
                {descricao.length}/2000
              </div>
            </div>

            <div className="pt-1">
              <Button
                onClick={handleAbrirChamado}
                disabled={submitting || !descricao.trim() || !podeCriar}
                className="w-full sm:w-auto"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Abrindo...</>
                ) : (
                  <>Abrir Chamado</>
                )}
              </Button>
              {!podeCriar && (
                <p className="text-xs text-muted-foreground mt-2">
                  Você não tem permissão para abrir chamados.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Meus Chamados ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Inbox className="h-5 w-5 text-primary" />
              Meus Chamados
              <span className="text-xs text-muted-foreground font-normal">
                ({contadores.total})
              </span>
            </CardTitle>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              size="sm"
              variant={filtroStatus === "todos" ? "default" : "outline"}
              onClick={() => setFiltroStatus("todos")}
            >
              Todos ({contadores.total})
            </Button>
            <Button
              size="sm"
              variant={filtroStatus === "analise" ? "default" : "outline"}
              onClick={() => setFiltroStatus("analise")}
              className={filtroStatus === "analise" ? "" : "text-yellow-700 dark:text-yellow-400"}
            >
              <Clock className="h-3.5 w-3.5 mr-1" />
              Em análise ({contadores.analise})
            </Button>
            <Button
              size="sm"
              variant={filtroStatus === "aprovado" ? "default" : "outline"}
              onClick={() => setFiltroStatus("aprovado")}
              className={filtroStatus === "aprovado" ? "" : "text-green-700 dark:text-green-400"}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Aprovados ({contadores.aprovado})
            </Button>
            <Button
              size="sm"
              variant={filtroStatus === "recusado" ? "default" : "outline"}
              onClick={() => setFiltroStatus("recusado")}
              className={filtroStatus === "recusado" ? "" : "text-red-700 dark:text-red-400"}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />
              Recusados ({contadores.recusado})
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingLista ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Carregando...
            </div>
          ) : chamadosFiltrados.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Inbox className="h-10 w-10 mx-auto mb-2 opacity-40" />
              {meusChamados.length === 0
                ? "Você ainda não abriu nenhum chamado."
                : "Nenhum chamado neste filtro."}
            </div>
          ) : (
            <div className="space-y-2">
              {chamadosFiltrados.map((c) => {
                const info = statusInfo(c);
                const Icon = info.icon;
                const isHighlighted = highlightId === c.id;
                return (
                  <Collapsible key={c.id}>
                    <div
                      className={`border rounded-lg transition-all ${
                        isHighlighted
                          ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                          : "border-border"
                      }`}
                    >
                      <CollapsibleTrigger className="w-full p-3 text-left hover:bg-muted/40 rounded-lg group">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-semibold text-sm">{c.codigo}</span>
                              <Badge variant="outline" className={info.className}>
                                <Icon className="h-3 w-3 mr-1" />
                                {info.label}
                              </Badge>
                              {c.os_codigo && (
                                <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30">
                                  O.S. {c.os_codigo}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm mt-1 truncate">
                              <span className="font-medium">{c.ativo_nome ?? "—"}</span>
                              {c.ativo_codigo && (
                                <span className="text-muted-foreground"> · {c.ativo_codigo}</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {format(new Date(c.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </div>
                          </div>
                          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 mt-1 shrink-0" />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-3 pb-3 pt-1 space-y-3 text-sm border-t border-border/50">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pt-2">
                            <div>
                              <span className="font-semibold">Local:</span>{" "}
                              {[c.bloco_nome, c.andar, c.sala].filter(Boolean).join(" / ") || "—"}
                            </div>
                          </div>

                          <div>
                            <div className="font-semibold mb-1">Descrição do problema:</div>
                            <div className="whitespace-pre-wrap text-muted-foreground bg-muted/30 rounded p-2 text-xs">
                              {c.descricao_problema}
                            </div>
                          </div>

                          {/* Timeline */}
                          <div>
                            <div className="font-semibold mb-2">Acompanhamento:</div>
                            <ol className="relative border-l border-border ml-2 space-y-3">
                              <li className="ml-4">
                                <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-primary" />
                                <div className="text-xs font-medium">Chamado aberto</div>
                                <div className="text-xs text-muted-foreground">
                                  {format(new Date(c.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                </div>
                              </li>
                              {c.analisado_em ? (
                                <li className="ml-4">
                                  <div
                                    className={`absolute -left-1.5 w-3 h-3 rounded-full ${
                                      c.os_id ? "bg-green-600" : "bg-red-600"
                                    }`}
                                  />
                                  <div className="text-xs font-medium">
                                    {c.os_id ? "Aprovado" : "Recusado"}
                                    {c.analisado_por_nome && (
                                      <span className="font-normal text-muted-foreground">
                                        {" "}por {c.analisado_por_nome}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {format(new Date(c.analisado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                  </div>
                                  {c.os_codigo && (
                                    <div className="text-xs mt-1">
                                      <span className="font-semibold">O.S. gerada:</span>{" "}
                                      <span className="font-mono">{c.os_codigo}</span>
                                    </div>
                                  )}
                                  {c.justificativa_recusa && (
                                    <div className="text-xs mt-1">
                                      <span className="font-semibold">Justificativa:</span>{" "}
                                      <span className="text-muted-foreground">{c.justificativa_recusa}</span>
                                    </div>
                                  )}
                                </li>
                              ) : (
                                <li className="ml-4">
                                  <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />
                                  <div className="text-xs font-medium text-yellow-700 dark:text-yellow-400">
                                    Aguardando análise do responsável
                                  </div>
                                </li>
                              )}
                            </ol>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <QrCodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onValidate={handleQrValidate}
        expectedHint="Aponte para o QR Code do equipamento"
      />
    </div>
  );
}
