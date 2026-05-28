import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Pencil, MapPin, Cpu, Info, ClipboardList, FileText, History, QrCode, Download, Zap, Users, Thermometer, MessagesSquare } from "@/lib/icons";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { QRCodeSVG } from "qrcode.react";

type Ativo = {
  id: string;
  nome: string;
  codigo_identificacao: string | null;
  categoria: string | null;
  bloco_id: string | null;
  andar: string | null;
  sala: string | null;
  sistema: string | null;
  marca: string | null;
  modelo: string | null;
  status: string;
  data_instalacao: string | null;
  observacoes: string | null;
  criado_em: string;
  tipo: string | null;
  numero_serie: string | null;
  patrimonio: string | null;
  grupo_equipamentos: string | null;
  corrente: number | null;
  capacidade_btu: number | null;
  tensao: number | null;
  potencia: number | null;
  responsavel_tecnico: string | null;
  grupo_areas: string | null;
  area_pavimento: string | null;
  identificacao_ambiente: string | null;
  tipo_atividade: string | null;
  area_climatizada: number | null;
  ocupantes_fixos: number | null;
  ocupantes_flutuantes: number | null;
  carga_termica: number | null;
  disponibilidade: string | null;
  data_ultima_manutencao: string | null;
};

type OSVinculada = {
  id: string;
  codigo_os: string | null;
  status: string | null;
  custo_total: number | null;
  equipamentos: string | null;
  created_at: string | null;
};

type Chamado = {
  id: string;
  codigo_os: string | null;
  status: string | null;
  descricao: string | null;
  observacoes: string | null;
  responsible_user_id: string | null;
  created_at: string | null;
};

type HistoricoAtivo = {
  id: string;
  acao: string;
  detalhes: string | null;
  created_at: string | null;
};

const STATUS_OPTIONS: Record<string, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  "manutenção": "Manutenção",
};

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d + "T12:00:00"), "dd/MM/yyyy"); } catch { return "—"; }
};

const PUBLISHED_URL = "https://atlascont.lovable.app";

export default function AtivoDetalhes() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ativo, setAtivo] = useState<Ativo | null>(null);
  const [blocoNome, setBlocoNome] = useState("—");
  const [loading, setLoading] = useState(true);
  const [osVinculadas, setOsVinculadas] = useState<OSVinculada[]>([]);
  const [loadingOs, setLoadingOs] = useState(true);
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loadingChamados, setLoadingChamados] = useState(true);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [historico, setHistorico] = useState<HistoricoAtivo[]>([]);
  const [loadingHist, setLoadingHist] = useState(true);
  const [qrOpen, setQrOpen] = useState(false);
const [disponibilidadeOpen, setDisponibilidadeOpen] = useState(false);
const [novaDisponibilidade, setNovaDisponibilidade] = useState<"disponivel" | "indisponivel">("disponivel");
const [obsDisponibilidade, setObsDisponibilidade] = useState("");
const [savingDisp, setSavingDisp] = useState(false);
const [manutencoes, setManutencoes] = useState<any[]>([]);

  const ativoUrl = `${PUBLISHED_URL}/ativo/${id}`;
  const handleSalvarDisponibilidade = async () => {
  if (!ativo || !id) return;
  setSavingDisp(true);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile }: any = await supabase.from("profiles").select("company_id").eq("user_id", user!.id).single();

    if (novaDisponibilidade === "indisponivel") {
      // Registra início de manutenção
      await (supabase as any).from("ativo_manutencoes").insert({
        ativo_id: id,
        company_id: profile.company_id,
        status: "indisponivel",
        data_inicio: new Date().toISOString(),
        observacao: obsDisponibilidade.trim() || null,
      });
    } else {
      // Fecha manutenção aberta
      const { data: manutAberta } = await (supabase as any)
        .from("ativo_manutencoes")
        .select("id, data_inicio")
        .eq("ativo_id", id)
        .is("data_fim", null)
        .order("data_inicio", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (manutAberta) {
        const inicio = new Date(manutAberta.data_inicio);
        const fim = new Date();
        const minutos = Math.round((fim.getTime() - inicio.getTime()) / 60000);
        await (supabase as any).from("ativo_manutencoes").update({
          data_fim: fim.toISOString(),
          tempo_parado_minutos: minutos,
          observacao: obsDisponibilidade.trim() || null,
        }).eq("id", manutAberta.id);
      }
    }

    // Atualiza disponibilidade do ativo
    await (supabase as any).from("ativos").update({
      disponibilidade: novaDisponibilidade,
      status: novaDisponibilidade === "indisponivel" ? "manutenção" : "ativo",
      data_ultima_manutencao: novaDisponibilidade === "indisponivel" ? new Date().toISOString() : ativo.data_ultima_manutencao,
    }).eq("id", id);

    toast({ title: novaDisponibilidade === "indisponivel" ? "Ativo marcado como indisponível" : "Ativo marcado como disponível" });
    setDisponibilidadeOpen(false);
    fetchAtivo();
  } catch (e: any) {
    toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
  } finally {
    setSavingDisp(false);
  }
};

  const handleDownloadQR = () => {
    const svg = document.getElementById("qr-ativo-svg");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx?.drawImage(img, 0, 0, 512, 512);
      const link = document.createElement("a");
      link.download = `qrcode-${ativo?.codigo_identificacao || id}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const fetchAtivo = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await (supabase.from("ativos" as any).select("*") as any).eq("id", id).single();
    if (error || !data) {
      toast({ title: "Ativo não encontrado", variant: "destructive" });
      navigate("/ativos");
      return;
    }
    setAtivo(data as Ativo);
    if (data.bloco_id) {
      const { data: bloco } = await supabase.from("blocos").select("nome").eq("id", data.bloco_id).single();
      setBlocoNome(bloco?.nome || "—");
    }
    setLoading(false);
  }, [id, navigate]);

  const fetchOS = useCallback(async () => {
    if (!id) return;
    setLoadingOs(true);
    const { data } = await (supabase
      .from("ordens_servico")
      .select("id, codigo_os, status, custo_total, equipamentos, created_at") as any)
      .eq("ativo_id", id)
      .neq("origem", "Chamado")
      .order("created_at", { ascending: false });
    setOsVinculadas((data as any[]) || []);
    setLoadingOs(false);
  }, [id]);

  const fetchChamados = useCallback(async () => {
    if (!id) return;
    setLoadingChamados(true);
    const { data } = await (supabase
      .from("ordens_servico")
      .select("id, codigo_os, status, descricao, observacoes, responsible_user_id, created_at") as any)
      .eq("ativo_id", id)
      .eq("origem", "Chamado")
      .order("created_at", { ascending: false });
    const list = (data as Chamado[]) || [];
    setChamados(list);
    const responsavelIds = Array.from(new Set(list.map(c => c.responsible_user_id).filter(Boolean))) as string[];
    if (responsavelIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", responsavelIds);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => { map[p.id] = p.nome; });
      setProfilesMap(map);
    } else {
      setProfilesMap({});
    }
    setLoadingChamados(false);
  }, [id]);

  const fetchHistorico = useCallback(async () => {
    if (!id) return;
    setLoadingHist(true);
    const { data } = await (supabase.from("historico_ativos" as any).select("*") as any)
      .eq("ativo_id", id)
      .order("created_at", { ascending: false });
    setHistorico((data as HistoricoAtivo[]) || []);
    setLoadingHist(false);
  }, [id]);

  useEffect(() => { fetchAtivo(); }, [fetchAtivo]);
  useEffect(() => { fetchOS(); fetchChamados(); fetchHistorico(); }, [fetchOS, fetchChamados, fetchHistorico]);

  if (loading) return <p className="text-muted-foreground p-6">Carregando...</p>;
  if (!ativo) return null;

  const Detail = ({ label, value }: { label: string; value: string }) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );

  const SectionHeader = ({ icon: Icon, title }: { icon: any; title: string }) => (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" /> {title}
    </h3>
  );
const DialogDisponibilidade = (
  <Dialog open={disponibilidadeOpen} onOpenChange={setDisponibilidadeOpen}>
    <DialogContent className="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>
          {novaDisponibilidade === "indisponivel" ? "Marcar como Indisponível" : "Marcar como Disponível"}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <p className="text-sm text-muted-foreground">
          {novaDisponibilidade === "indisponivel"
            ? "O ativo será marcado como indisponível e o tempo de parada começará a ser contabilizado."
            : "O ativo voltará a ficar disponível e o tempo de parada será registrado."}
        </p>
        <div>
          <label className="text-sm font-medium mb-1 block">Observação (opcional)</label>
          <Textarea
            value={obsDisponibilidade}
            onChange={e => setObsDisponibilidade(e.target.value)}
            placeholder="Ex: Aguardando peça, Em manutenção preventiva..."
            rows={3}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDisponibilidadeOpen(false)}>Cancelar</Button>
          <Button
            onClick={handleSalvarDisponibilidade}
            disabled={savingDisp}
            className={novaDisponibilidade === "indisponivel" ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}
          >
            {savingDisp ? "Salvando..." : "Confirmar"}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header — mobile-first */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/ativos")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl md:text-2xl font-bold truncate flex-1">{ativo.nome}</h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap pl-1">
          {ativo.codigo_identificacao && (
            <span className="text-sm font-mono text-muted-foreground">{ativo.codigo_identificacao}</span>
          )}
          {ativo.patrimonio && (
            <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">PAT: {ativo.patrimonio}</span>
          )}
          <span className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border",
            ativo.status === "ativo" && "bg-emerald-50 text-emerald-700 border-emerald-200",
            ativo.status === "manutenção" && "bg-yellow-50 text-yellow-700 border-yellow-200",
            ativo.status === "inativo" && "bg-zinc-100 text-zinc-600 border-zinc-200",
          )}>
            {STATUS_OPTIONS[ativo.status] || ativo.status}
          </span>
        </div>

        <div className="flex items-center gap-2 pl-1 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setQrOpen(true)}>
            <QrCode className="mr-1.5 h-3.5 w-3.5" /> QR Code
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/ativos?edit=${ativo.id}`)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full overflow-x-auto justify-start md:justify-center">
          <TabsTrigger value="overview" className="gap-1.5 text-xs md:text-sm"><Info className="h-3.5 w-3.5" /> Visão Geral</TabsTrigger>
          <TabsTrigger value="os" className="gap-1.5 text-xs md:text-sm"><ClipboardList className="h-3.5 w-3.5" /> O.S.</TabsTrigger>
          <TabsTrigger value="chamados" className="gap-1.5 text-xs md:text-sm"><MessagesSquare className="h-3.5 w-3.5" /> Chamados</TabsTrigger>
          <TabsTrigger value="docs" className="gap-1.5 text-xs md:text-sm"><FileText className="h-3.5 w-3.5" /> Docs</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-xs md:text-sm"><History className="h-3.5 w-3.5" /> Histórico</TabsTrigger>
        </TabsList>

        {/* ─── Visão Geral ─── */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Identificação */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <SectionHeader icon={Cpu} title="Identificação" />
                <Detail label="Nome" value={ativo.nome} />
                <Detail label="Tipo" value={ativo.tipo || "—"} />
                <Detail label="Código" value={ativo.codigo_identificacao || "—"} />
                <Detail label="Nº Série" value={ativo.numero_serie || "—"} />
                <Detail label="Patrimônio" value={ativo.patrimonio || "—"} />
                <Detail label="Sistema" value={ativo.sistema || "—"} />
                <Detail label="Grupo" value={ativo.grupo_equipamentos || "—"} />
                <Detail label="Marca" value={ativo.marca || "—"} />
                <Detail label="Modelo" value={ativo.modelo || "—"} />
              </CardContent>
            </Card>

            {/* Localização */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <SectionHeader icon={MapPin} title="Localização" />
                <Detail label="Unidade (Bloco)" value={blocoNome} />
                <Detail label="Grupo de Áreas" value={ativo.grupo_areas || "—"} />
                <Detail label="Área / Pavimento" value={ativo.area_pavimento || ativo.andar || "—"} />
                <Detail label="Ambiente" value={ativo.identificacao_ambiente || ativo.sala || "—"} />
                <Detail label="Tipo de Atividade" value={ativo.tipo_atividade || "—"} />
              </CardContent>
            </Card>

            {/* Dados Técnicos */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <SectionHeader icon={Zap} title="Dados Técnicos" />
                <Detail label="Corrente" value={ativo.corrente ? `${ativo.corrente} A` : "—"} />
                <Detail label="Capacidade" value={ativo.capacidade_btu ? `${ativo.capacidade_btu.toLocaleString()} BTU/h` : "—"} />
                <Detail label="Tensão" value={ativo.tensao ? `${ativo.tensao} V` : "—"} />
                <Detail label="Potência" value={ativo.potencia ? `${ativo.potencia} W` : "—"} />
              </CardContent>
            </Card>
          </div>

          {/* Dados Operacionais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-5 space-y-3">
                <SectionHeader icon={Thermometer} title="Dados Operacionais" />
                <div className="grid grid-cols-2 gap-4">
                  <Detail label="Área Climatizada" value={ativo.area_climatizada ? `${ativo.area_climatizada} m²` : "—"} />
                  <Detail label="Carga Térmica" value={ativo.carga_termica ? `${ativo.carga_termica.toLocaleString()} BTU/h` : "—"} />
                  <Detail label="Ocupantes Fixos" value={ativo.ocupantes_fixos?.toString() || "—"} />
                  <Detail label="Ocupantes Flutuantes" value={ativo.ocupantes_flutuantes?.toString() || "—"} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 space-y-3">
                <SectionHeader icon={Users} title="Responsabilidade e Datas" />
                <Detail label="Responsável Técnico" value={ativo.responsavel_tecnico || "—"} />
                <Detail label="Status" value={STATUS_OPTIONS[ativo.status] || ativo.status} />
                <Detail label="Categoria" value={ativo.categoria || "—"} />
                <Detail label="Data de Instalação" value={fmtDate(ativo.data_instalacao)} />
                <Detail label="Cadastrado em" value={fmtDate(ativo.criado_em?.substring(0, 10) || null)} />
              </CardContent>
            </Card>
          </div>

          {/* Observações */}
          {ativo.observacoes && (
            <Card>
              <CardContent className="pt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Observações</h3>
                <p className="text-sm whitespace-pre-line rounded-md bg-muted/50 p-3">{ativo.observacoes}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── O.S. Vinculadas ─── */}
        <TabsContent value="os" className="mt-4">
          <Card>
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold mb-3">Ordens de Serviço relacionadas ({osVinculadas.length})</h3>
              {loadingOs ? (
                <p className="text-muted-foreground text-sm">Carregando...</p>
              ) : osVinculadas.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4">Nenhuma O.S. encontrada vinculada a este ativo.</p>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Equipamentos</TableHead>
                        <TableHead className="text-right">Custo</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {osVinculadas.map(os => (
                        <TableRow key={os.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate("/ordens-servico")}>
                          <TableCell className="font-mono text-sm">{os.codigo_os || "—"}</TableCell>
                          <TableCell>
                            <span className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border",
                              os.status === "Concluída" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                              os.status === "Em andamento" && "bg-sky-50 text-sky-700 border-sky-200",
                              os.status === "Não Iniciada" && "bg-zinc-100 text-zinc-600 border-zinc-200",
                              os.status === "Atrasada" && "bg-red-50 text-red-700 border-red-200",
                            )}>
                              {os.status || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{os.equipamentos || "—"}</TableCell>
                          <TableCell className="text-right font-semibold text-primary whitespace-nowrap">
                            {os.custo_total ? `R$ ${Number(os.custo_total).toFixed(2)}` : "—"}
                          </TableCell>
                          <TableCell className="text-sm">{os.created_at ? format(new Date(os.created_at), "dd/MM/yyyy") : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Histórico de Chamados ─── */}
        <TabsContent value="chamados" className="mt-4">
          <Card>
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold mb-3">Histórico de Chamados ({chamados.length})</h3>
              {loadingChamados ? (
                <p className="text-muted-foreground text-sm">Carregando...</p>
              ) : chamados.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">Nenhum chamado vinculado a este ativo.</p>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Código</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {chamados.map(c => (
                        <TableRow key={c.id} className="hover:bg-muted/40">
                          <TableCell className="font-mono text-xs font-semibold">{c.codigo_os || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy HH:mm") : "—"}
                          </TableCell>
                          <TableCell className="text-sm max-w-[280px] truncate">{c.descricao || c.observacoes || "—"}</TableCell>
                          <TableCell className="text-sm">{c.responsible_user_id ? profilesMap[c.responsible_user_id] || "—" : "—"}</TableCell>
                          <TableCell>
                            <span className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border",
                              c.status === "Concluído" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                              c.status === "Em andamento" && "bg-amber-50 text-amber-700 border-amber-200",
                              c.status === "Aberto" && "bg-sky-50 text-sky-700 border-sky-200",
                            )}>
                              {c.status || "—"}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Documentos ─── */}
        <TabsContent value="docs" className="mt-4">
          <Card>
            <CardContent className="pt-5">
              <p className="text-muted-foreground text-sm py-8 text-center">
                Nenhum documento vinculado a este ativo.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Histórico ─── */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold mb-3">Histórico do ativo ({historico.length})</h3>
              {loadingHist ? (
                <p className="text-muted-foreground text-sm">Carregando...</p>
              ) : historico.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">Nenhum registro de histórico.</p>
              ) : (
                <div className="space-y-3">
                  {historico.map(h => (
                    <div key={h.id} className="flex items-start gap-3 rounded-lg border p-3">
                      <div className="mt-0.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{h.acao}</p>
                        {h.detalhes && <p className="text-xs text-muted-foreground mt-0.5">{h.detalhes}</p>}
                        <p className="text-xs text-muted-foreground mt-1">
                          {h.created_at ? format(new Date(h.created_at), "dd/MM/yyyy HH:mm") : "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* QR Code Dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-md flex flex-col items-center gap-4">
          <DialogHeader>
            <DialogTitle>QR Code — {ativo.nome}</DialogTitle>
          </DialogHeader>
          <div className="bg-white p-4 rounded-lg">
            <QRCodeSVG id="qr-ativo-svg" value={ativoUrl} size={256} level="H" />
          </div>
          <p className="text-xs text-muted-foreground text-center break-all max-w-[280px]">{ativoUrl}</p>
          <Button onClick={handleDownloadQR} className="gap-2">
            <Download className="h-4 w-4" /> Baixar QR Code
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
