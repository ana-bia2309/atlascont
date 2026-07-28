import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/use-user-role";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Star, ArrowLeft, ClipboardCheck, Building2, MapPin, Layers, User,
  Calendar, Save, Send, X, Lock, RotateCcw,
} from "@/lib/icons";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const QUALIDADE_OPTIONS = ["Excelente", "Bom", "Regular", "Ruim", "Péssimo"];
const SIM_OPTIONS = ["Sim", "Parcialmente", "Não"];

type OSInfo = {
  id: string;
  codigo_os: string | null;
  titulo: string | null;
  andar: string | null;
  sala: string | null;
  bloco_nome: string | null;
  empresa_nome: string | null;
  responsavel_nome: string | null;
  finalizado_em: string | null;
  company_id: string | null;
};

function StarPicker({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className={cn("transition-transform", !disabled && "hover:scale-110")}
        >
          <Star className={cn("h-9 w-9", (hover || value) >= n ? "fill-amber-400 text-amber-400" : "text-slate-200")} />
        </button>
      ))}
    </div>
  );
}

function QuestionRadio({
  label, options, value, onChange, disabled,
}: { label: string; options: string[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-slate-700">{label}</Label>
      <RadioGroup value={value} onValueChange={onChange} disabled={disabled} className="flex flex-wrap gap-4">
        {options.map((opt) => (
          <div key={opt} className="flex items-center gap-2">
            <RadioGroupItem value={opt} id={`${label}-${opt}`} />
            <Label htmlFor={`${label}-${opt}`} className="font-normal text-sm text-slate-600 cursor-pointer">{opt}</Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}

export default function AvaliacaoDetalhe() {
  const { osId } = useParams<{ osId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { role, isAdmin } = useUserRole();
  const { can } = usePermissions();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [os, setOs] = useState<OSInfo | null>(null);
  const [avaliacaoId, setAvaliacaoId] = useState<string | null>(null);
  const [status, setStatus] = useState<"pendente" | "avaliada">("pendente");
  const [profileId, setProfileId] = useState<string | null>(null);

  const [notaGeral, setNotaGeral] = useState(0);
  const [respConforme, setRespConforme] = useState("");
  const [respQualidade, setRespQualidade] = useState("");
  const [respAcabamento, setRespAcabamento] = useState("");
  const [respLimpeza, setRespLimpeza] = useState("");
  const [respPrazo, setRespPrazo] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [sugestoes, setSugestoes] = useState("");
  const [decisao, setDecisao] = useState("");
  const [justificativa, setJustificativa] = useState("");

  const readOnly = status === "avaliada";

  const fetchData = useCallback(async () => {
    if (!osId) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile }: any = await (supabase as any).from("profiles").select("id").eq("user_id", user.id).single();
        setProfileId(profile?.id || null);
      }

      const { data: osData, error: osError } = await (supabase as any)
        .from("ordens_servico")
        .select("id, codigo_os, titulo, andar, sala, bloco_id, company_id, responsible_user_id, finalizado_em")
        .eq("id", osId)
        .single();
      if (osError) throw osError;

      const [blocoRes, companyRes, respRes, avalRes] = await Promise.all([
        osData.bloco_id ? (supabase as any).from("blocos").select("nome").eq("id", osData.bloco_id).single() : Promise.resolve({ data: null }),
        osData.company_id ? (supabase as any).from("companies").select("name").eq("id", osData.company_id).single() : Promise.resolve({ data: null }),
        osData.responsible_user_id ? (supabase as any).from("profiles").select("nome").eq("id", osData.responsible_user_id).single() : Promise.resolve({ data: null }),
        (supabase as any).from("avaliacoes_os").select("*").eq("os_id", osId).maybeSingle(),
      ]);

      setOs({
        id: osData.id,
        codigo_os: osData.codigo_os,
        titulo: osData.titulo,
        andar: osData.andar,
        sala: osData.sala,
        bloco_nome: blocoRes.data?.nome || null,
        empresa_nome: companyRes.data?.name || null,
        responsavel_nome: respRes.data?.nome || null,
        finalizado_em: osData.finalizado_em,
        company_id: osData.company_id || null,
      });

      if (avalRes.data) {
        const a = avalRes.data;
        setAvaliacaoId(a.id);
        setStatus(a.status === "avaliada" ? "avaliada" : "pendente");
        setNotaGeral(a.nota_geral || 0);
        setRespConforme(a.resp_conforme_solicitado || "");
        setRespQualidade(a.resp_qualidade_execucao || "");
        setRespAcabamento(a.resp_acabamento || "");
        setRespLimpeza(a.resp_limpeza_organizacao || "");
        setRespPrazo(a.resp_prazo_atendido || "");
        setComentarios(a.comentarios_fiscal || "");
        setSugestoes(a.sugestoes_melhoria || "");
        setDecisao(a.decisao || "");
        setJustificativa(a.justificativa_reprovacao || "");
      }
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao carregar OS", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [osId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const buildPayload = (rascunho: boolean) => ({
    os_id: osId,
    company_id: os?.company_id ?? null,
    status: rascunho ? "pendente" : "avaliada",
    rascunho,
    nota_geral: notaGeral || null,
    resp_conforme_solicitado: respConforme || null,
    resp_qualidade_execucao: respQualidade || null,
    resp_acabamento: respAcabamento || null,
    resp_limpeza_organizacao: respLimpeza || null,
    resp_prazo_atendido: respPrazo || null,
    comentarios_fiscal: comentarios || null,
    sugestoes_melhoria: sugestoes || null,
    decisao: decisao || null,
    justificativa_reprovacao: decisao === "reprovado" ? justificativa : null,
  });

  const handleSave = async (rascunho: boolean) => {
    if (!rascunho) {
      if (!notaGeral) return toast({ title: "Selecione a nota geral (estrelas)", variant: "destructive" });
      if (!decisao) return toast({ title: "Selecione a decisão de aprovação do serviço", variant: "destructive" });
      if (decisao === "reprovado" && !justificativa.trim()) {
        return toast({ title: "Justificativa obrigatória para reprovação", variant: "destructive" });
      }
    }

    setSubmitting(true);
    try {
      const payload: any = buildPayload(rascunho);
      if (!rascunho) {
        payload.avaliado_por = profileId;
        payload.avaliado_em = new Date().toISOString();
      }

      let error;
      if (avaliacaoId) {
        ({ error } = await (supabase as any).from("avaliacoes_os").update(payload).eq("id", avaliacaoId));
      } else {
        ({ error } = await (supabase as any).from("avaliacoes_os").insert(payload));
      }
      if (error) throw error;

      toast({ title: rascunho ? "Rascunho salvo" : "Avaliação finalizada com sucesso" });
      if (!rascunho) navigate("/avaliacoes");
      else fetchData();
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao salvar avaliação", description: err?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReabrir = async () => {
    if (!avaliacaoId) return;
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).from("avaliacoes_os").update({
        status: "pendente",
        reaberto_por: profileId,
        reaberto_em: new Date().toISOString(),
      }).eq("id", avaliacaoId);
      if (error) throw error;
      toast({ title: "Avaliação reaberta" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Erro ao reabrir avaliação", description: err?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-slate-400">Carregando...</div>;
  if (!os) return <div className="p-6 text-center text-slate-400">Ordem de Serviço não encontrada.</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <button
        onClick={() => navigate("/avaliacoes")}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para Avaliações
      </button>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-indigo-600" /> {os.codigo_os} — {os.titulo}
            </h1>
          </div>
          {readOnly && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Lock className="h-3.5 w-3.5" /> Avaliação finalizada
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
          <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-slate-400" /><span>{os.bloco_nome || "—"}</span></div>
          <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" /><span>{[os.andar, os.sala].filter(Boolean).join(" / ") || "—"}</span></div>
          <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-400" /><span>{os.empresa_nome || "—"}</span></div>
          <div className="flex items-center gap-2"><User className="h-4 w-4 text-slate-400" /><span>{os.responsavel_nome || "—"}</span></div>
          <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-slate-400" />
            <span>{os.finalizado_em ? format(new Date(os.finalizado_em), "dd/MM/yyyy", { locale: ptBR }) : "—"}</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6">
        <div>
          <Label className="text-sm font-semibold text-slate-700 mb-2 block">Nota Geral</Label>
          <StarPicker value={notaGeral} onChange={setNotaGeral} disabled={readOnly} />
        </div>

        <div className="border-t border-slate-100 pt-6 space-y-5">
          <QuestionRadio label="1. O serviço foi executado conforme solicitado?" options={SIM_OPTIONS} value={respConforme} onChange={setRespConforme} disabled={readOnly} />
          <QuestionRadio label="2. A qualidade da execução foi satisfatória?" options={QUALIDADE_OPTIONS} value={respQualidade} onChange={setRespQualidade} disabled={readOnly} />
          <QuestionRadio label="3. O acabamento ficou adequado?" options={QUALIDADE_OPTIONS} value={respAcabamento} onChange={setRespAcabamento} disabled={readOnly} />
          <QuestionRadio label="4. O local foi entregue limpo e organizado?" options={SIM_OPTIONS} value={respLimpeza} onChange={setRespLimpeza} disabled={readOnly} />
          <QuestionRadio label="5. O prazo foi atendido?" options={SIM_OPTIONS} value={respPrazo} onChange={setRespPrazo} disabled={readOnly} />
        </div>

        <div className="border-t border-slate-100 pt-6 space-y-4">
          <div>
            <Label className="text-sm font-semibold text-slate-700">Comentários do Fiscal</Label>
            <p className="text-xs text-slate-400 mb-1.5">Informe observações, elogios, problemas encontrados ou detalhes relevantes sobre a execução do serviço.</p>
            <Textarea value={comentarios} onChange={(e) => setComentarios(e.target.value)} disabled={readOnly} rows={4} className="rounded-xl" />
          </div>
          <div>
            <Label className="text-sm font-semibold text-slate-700">Sugestões de melhoria</Label>
            <p className="text-xs text-slate-400 mb-1.5">Oriente futuras execuções do mesmo tipo de serviço.</p>
            <Textarea value={sugestoes} onChange={(e) => setSugestoes(e.target.value)} disabled={readOnly} rows={3} className="rounded-xl" />
          </div>
        </div>

        <div className="border-t border-slate-100 pt-6">
          <Label className="text-sm font-semibold text-slate-700 mb-2 block">Aprovação do Serviço</Label>
          <RadioGroup value={decisao} onValueChange={setDecisao} disabled={readOnly} className="space-y-2">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="aprovado" id="dec-aprovado" />
              <Label htmlFor="dec-aprovado" className="font-normal text-sm cursor-pointer">Serviço aprovado</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="aprovado_com_ressalvas" id="dec-ressalvas" />
              <Label htmlFor="dec-ressalvas" className="font-normal text-sm cursor-pointer">Serviço aprovado com ressalvas</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="reprovado" id="dec-reprovado" />
              <Label htmlFor="dec-reprovado" className="font-normal text-sm cursor-pointer">Serviço reprovado</Label>
            </div>
          </RadioGroup>
          {decisao === "reprovado" && (
            <div className="mt-3">
              <Label className="text-sm font-semibold text-slate-700">Justificativa <span className="text-destructive">*</span></Label>
              <Textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} disabled={readOnly} rows={3} className="rounded-xl mt-1" />
            </div>
          )}
        </div>

        {!readOnly ? (
          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
            <Button variant="outline" className="rounded-xl" onClick={() => navigate("/avaliacoes")}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button variant="outline" className="rounded-xl" disabled={submitting} onClick={() => handleSave(true)}>
              <Save className="h-4 w-4 mr-1" /> Salvar rascunho
            </Button>
            <Button className="rounded-xl bg-indigo-600 hover:bg-indigo-700" disabled={submitting} onClick={() => handleSave(false)}>
              <Send className="h-4 w-4 mr-1" /> Finalizar avaliação
            </Button>
          </div>
        ) : (isAdmin || can("avaliacoes.reabrir")) ? (
          <div className="flex justify-end border-t border-slate-100 pt-5">
            <Button variant="outline" className="rounded-xl" disabled={submitting} onClick={handleReabrir}>
              <RotateCcw className="h-4 w-4 mr-1" /> Reabrir avaliação
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
