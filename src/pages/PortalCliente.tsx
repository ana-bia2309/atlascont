import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Plus, RefreshCw, MessagesSquare, Clock, CheckCircle2, AlertTriangle, Play, LogOut, Wrench, MapPin, Calendar, ChevronRight } from "@/lib/icons";

type Chamado = {
  id: string;
  codigo: string;
  status: string;
  descricao_problema: string;
  created_at: string;
  ativo_id: string | null;
  ativo_nome: string | null;
  ativo_codigo: string | null;
  bloco_id: string | null;
  bloco_nome: string | null;
  andar: string | null;
  sala: string | null;
  os_id: string | null;
  justificativa_recusa: string | null;
};

type Ativo = { id: string; nome: string; codigo_identificacao?: string | null };
type Bloco = { id: string; nome: string | null };

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  "Em análise": { label: "Em análise", color: "bg-sky-50 text-sky-700 border-sky-200", icon: Clock },
  "Encerrado":  { label: "Encerrado",  color: "bg-zinc-100 text-zinc-600 border-zinc-300", icon: AlertTriangle },
};

const TIMELINE_STEPS = ["Em análise", "Aprovado", "Concluído"];

function StatusTimeline({ status, osId }: { status: string; osId: string | null }) {
  const currentIdx = osId ? 2 : status === "Em análise" ? 0 : 1;
  const labels = ["Em análise", "Aprovado", "Concluído"];
  return (
    <div className="flex items-center gap-1 mt-3">
      {labels.map((step, i) => {
        const done = i <= currentIdx;
        const current = i === currentIdx;
        return (
          <div key={step} className="flex flex-col items-center gap-1 flex-1">
            <div className={cn("h-1.5 w-full rounded-full transition-all", done ? "bg-primary" : "bg-muted")} />
            <span className={cn("text-[10px]", current ? "text-primary font-medium" : done ? "text-muted-foreground" : "text-muted-foreground/50")}>
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function PortalCliente() {
  const { session } = useAuth();
  const { companyId } = useCompany();
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [ativos, setAtivos] = useState<Ativo[]>([]);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [profileNome, setProfileNome] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<Chamado | null>(null);
  const [novoChamadoOpen, setNovoChamadoOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  const [formAtivoId, setFormAtivoId] = useState("");
  const [formBlocoId, setFormBlocoId] = useState("");
  const [formAndar, setFormAndar] = useState("");
  const [formSala, setFormSala] = useState("");
  const [formDescricao, setFormDescricao] = useState("");

  const fetchData = useCallback(async () => {
    if (!companyId || !session?.user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const [profileRes, chamadosRes, ativosRes, blocosRes] = await Promise.all([
        (supabase as any).from("profiles").select("id, nome").eq("user_id", session.user.id).maybeSingle(),
        (supabase as any).from("chamados")
          .select("id, codigo, status, descricao_problema, created_at, ativo_id, ativo_nome, ativo_codigo, bloco_id, bloco_nome, andar, sala, os_id, justificativa_recusa, solicitante_id")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        (supabase as any).from("ativos").select("id, nome, codigo_identificacao").eq("company_id", companyId).order("nome"),
        (supabase as any).from("blocos").select("id, nome").eq("company_id", companyId).order("nome"),
      ]);

      const profile = profileRes?.data;
      setProfileId(profile?.id || null);
      setProfileNome(profile?.nome || session.user.email || "");

      const allChamados: Chamado[] = chamadosRes?.data || [];
      const meusChamados = profile?.id
        ? allChamados.filter((c: any) => c.solicitante_id === profile.id)
        : allChamados;

      setChamados(meusChamados);
      setAtivos(ativosRes?.data || []);
      setBlocos(blocosRes?.data || []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar chamados", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, session?.user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => {
    setFormAtivoId(""); setFormBlocoId(""); setFormAndar("");
    setFormSala(""); setFormDescricao("");
  };

  const handleNovoChamado = async () => {
    if (!formAtivoId) {
      toast({ title: "Selecione o equipamento", variant: "destructive" });
      return;
    }
    if (!formDescricao.trim()) {
      toast({ title: "Descreva o problema", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const ativo = ativos.find(a => a.id === formAtivoId);
      const bloco = blocos.find(b => b.id === formBlocoId);
      const { error } = await (supabase as any).from("chamados").insert({
        company_id: companyId,
        status: "Em análise",
        ativo_id: formAtivoId || null,
        ativo_nome: ativo?.nome || null,
        ativo_codigo: ativo?.codigo_identificacao || null,
        bloco_id: formBlocoId || null,
        bloco_nome: bloco?.nome || null,
        andar: formAndar.trim() || null,
        sala: formSala.trim() || null,
        descricao_problema: formDescricao.trim(),
        solicitante_id: profileId,
        solicitante_nome: profileNome,
      });
      if (error) throw error;
      toast({ title: "Chamado aberto!", description: "Nossa equipe irá analisar em breve." });
      setNovoChamadoOpen(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      toast({ title: "Erro ao abrir chamado", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const emAnalise = chamados.filter(c => c.status === "Em análise").length;
  const aprovados = chamados.filter(c => c.status === "Encerrado" && c.os_id).length;
  const recusados = chamados.filter(c => c.status === "Encerrado" && c.justificativa_recusa && !c.os_id).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <MessagesSquare className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">Portal de Chamados</p>
              <p className="text-xs text-muted-foreground leading-tight">Olá, {profileNome.split(" ")[0]}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={fetchData} title="Atualizar">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair">
              <LogOut className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Em análise", value: emAnalise, color: "text-sky-600" },
            { label: "Aprovados", value: aprovados, color: "text-emerald-600" },
            { label: "Recusados", value: recusados, color: "text-red-600" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border bg-card p-4 text-center">
              <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <Button className="w-full h-12 text-base gap-2" onClick={() => setNovoChamadoOpen(true)}>
          <Plus className="h-5 w-5" />
          Abrir Novo Chamado
        </Button>

        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Meus Chamados</h2>
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-8">Carregando...</p>
          ) : chamados.length === 0 ? (
            <div className="text-center py-12 rounded-xl border border-dashed">
              <MessagesSquare className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Nenhum chamado aberto ainda.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {chamados.map(c => {
                const cfg = statusConfig[c.status] || statusConfig["Em análise"];
                const StatusIcon = cfg.icon;
                const resultado = c.status === "Encerrado" ? (c.os_id ? "Aprovado" : "Recusado") : null;
                return (
                  <button key={c.id} onClick={() => setViewing(c)} className="w-full text-left rounded-xl border bg-card p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-mono text-muted-foreground">{c.codigo}</span>
                          <Badge variant="outline" className={cn("text-[10px] border h-5 px-1.5", cfg.color)}>
                            <StatusIcon className="h-3 w-3 mr-1" />{cfg.label}
                          </Badge>
                          {resultado && (
                            <Badge variant="outline" className={cn("text-[10px] border h-5 px-1.5",
                              resultado === "Aprovado" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
                            )}>
                              {resultado}
                            </Badge>
                          )}
                        </div>
                        <p className="font-medium text-sm truncate">{c.ativo_nome || "Equipamento"}</p>
                        {c.descricao_problema && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.descricao_problema}</p>
                        )}
                        {(c.bloco_nome || c.andar || c.sala) && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {[c.bloco_nome, c.andar, c.sala].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {c.created_at && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(c.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                        )}
                        {c.status !== "Encerrado" && <StatusTimeline status={c.status} osId={c.os_id} />}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Dialog Ver chamado */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm">{viewing?.codigo}</span>
              {viewing && (
                <Badge variant="outline" className={cn("text-xs border", statusConfig[viewing.status]?.color)}>
                  {viewing.status}
                </Badge>
              )}
              {viewing?.status === "Encerrado" && (
                <Badge variant="outline" className={cn("text-xs border",
                  viewing.os_id ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
                )}>
                  {viewing.os_id ? "Aprovado" : "Recusado"}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>Detalhes do chamado</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 text-sm">
              {viewing.ativo_nome && (
                <div className="flex items-start gap-2">
                  <Wrench className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{viewing.ativo_nome}</p>
                    {viewing.ativo_codigo && <p className="text-xs text-muted-foreground font-mono">{viewing.ativo_codigo}</p>}
                  </div>
                </div>
              )}
              {(viewing.bloco_nome || viewing.andar || viewing.sala) && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p>{[viewing.bloco_nome, viewing.andar, viewing.sala].filter(Boolean).join(" · ")}</p>
                </div>
              )}
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Descrição</p>
                <p className="whitespace-pre-line">{viewing.descricao_problema}</p>
              </div>
              {viewing.justificativa_recusa && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                  <p className="text-xs font-medium text-red-700 mb-1">Motivo da recusa</p>
                  <p className="text-red-800 whitespace-pre-line">{viewing.justificativa_recusa}</p>
                </div>
              )}
              {viewing.created_at && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  Aberto em {format(new Date(viewing.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </div>
              )}
              {viewing.status !== "Encerrado" && (
                <div className="pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Progresso</p>
                  <StatusTimeline status={viewing.status} osId={viewing.os_id} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Novo Chamado */}
      <Dialog open={novoChamadoOpen} onOpenChange={(o) => { if (!o) { setNovoChamadoOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Abrir Novo Chamado</DialogTitle>
            <DialogDescription>Descreva o problema e nossa equipe irá atender em breve.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Equipamento *</label>
              <Select value={formAtivoId} onValueChange={setFormAtivoId}>
                <SelectTrigger><SelectValue placeholder="Selecione o equipamento" /></SelectTrigger>
                <SelectContent>
                  {ativos.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.nome}{a.codigo_identificacao ? ` (${a.codigo_identificacao})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Localização</label>
              <div className="grid grid-cols-2 gap-2">
                <Select value={formBlocoId} onValueChange={setFormBlocoId}>
                  <SelectTrigger><SelectValue placeholder="Bloco/Unidade" /></SelectTrigger>
                  <SelectContent>
                    {blocos.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.nome || b.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={formAndar} onChange={e => setFormAndar(e.target.value)} placeholder="Andar" />
              </div>
              <Input className="mt-2" value={formSala} onChange={e => setFormSala(e.target.value)} placeholder="Sala / Ambiente" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Descrição do problema *</label>
              <Textarea
                value={formDescricao}
                onChange={e => setFormDescricao(e.target.value)}
                placeholder="Descreva o que está acontecendo com o máximo de detalhes possível..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNovoChamadoOpen(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleNovoChamado} disabled={saving}>
              {saving ? "Abrindo..." : "Abrir Chamado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}