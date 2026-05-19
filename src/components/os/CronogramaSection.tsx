import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/use-company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MultiUserSelect from "@/components/os/MultiUserSelect";
import type { UserOption } from "@/components/os/MultiUserSelect";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, CalendarClock } from "@/lib/icons";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import HorasAtividadeSection from "./HorasAtividadeSection";
import ActivityTimerControls from "./ActivityTimerControls";

const STATUS_ATIVIDADE = ["Não iniciado", "Em andamento", "Concluído"];

const UNIDADE_MEDICAO_OPTIONS = ["Amperes (A)", "Volts (V)", "Watts (W)", "Quilogramas (kg)", "Joules (J)", "Celsius (°C)", "Pascal (Pa)", "Ohms (Ω)", "Hertz (Hz)", "Libra-força por polegada quadrada (PSI)", "Farad (F)", "Kilopascal (kPa)", "Microfarad (µF)", "Kilo ohms (kΩ)", "Mega ohms (MΩ)", "Kilowatts (kW)", "Kilovolts (kV)", "Kilovolts reativo (kVAr)", "Outros"];

type TipoAtividadeRow = { id: string; nome: string; ativo: boolean };

type Atividade = {
  id: string;
  os_id: string;
  nome: string;
  data_inicio: string;
  data_termino: string;
  status: string;
  responsavel: string | null;
  tipo_atividade: string | null;
  tipo_medicao: string | null;
  unidade_medicao: string | null;
  timer_status: string;
  timer_total_seconds: number;
  timer_started_at: string | null;
  timer_paused_at: string | null;
  timer_user_id: string | null;
};

type Props = {
  osId: string | null;
  readOnly?: boolean;
  currentProfileId?: string | null;
  responsibleUserId?: string | null;
};

/**
 * Auto-sync: ensures all profile IDs from cronograma activities
 * are also present in os_responsaveis for the given OS.
 */
async function syncResponsaveisToOs(osId: string, profileIds: string[]) {
  if (profileIds.length === 0) return;

  // Get existing os_responsaveis for this OS
  const { data: existing } = await supabase
    .from("os_responsaveis")
    .select("profile_id")
    .eq("os_id", osId);

  const existingIds = new Set((existing || []).map((r: any) => r.profile_id));
  const toInsert = profileIds.filter((id) => !existingIds.has(id));

  if (toInsert.length > 0) {
    await supabase.from("os_responsaveis").upsert(
      toInsert.map((pid) => ({ os_id: osId, profile_id: pid })),
      { onConflict: "os_id,profile_id", ignoreDuplicates: true }
    );
  }
}

export default function CronogramaSection({ osId, readOnly = false, currentProfileId, responsibleUserId }: Props) {
  const { companyId } = useCompany();
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentProfileName, setCurrentProfileName] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<UserOption[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataTermino, setDataTermino] = useState("");
  const [status, setStatus] = useState("Não iniciado");
  const [selectedResponsaveis, setSelectedResponsaveis] = useState<string[]>([]);
  const [tipoAtividade, setTipoAtividade] = useState<string>("");
  const [tipoMedicao, setTipoMedicao] = useState<string>("");
  const [unidadeMedicao, setUnidadeMedicao] = useState<string>("");
  const [tiposAtividade, setTiposAtividade] = useState<TipoAtividadeRow[]>([]);
  const [showForm, setShowForm] = useState(false);

  const isBlockedByGeral = false;

  const fetchAtividades = useCallback(async () => {
    if (!osId) { setAtividades([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("atividades_os")
      .select("*")
      .eq("os_id", osId)
      .eq("company_id", companyId)
      .order("data_inicio", { ascending: true });
    if (!error && data) setAtividades(data as Atividade[]);
    setLoading(false);
  }, [osId]);

  useEffect(() => { fetchAtividades(); }, [fetchAtividades]);

  // Fetch all active profiles for the multi-select
  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, nome, job_title")
      .eq("status", "ativo")
      .order("nome")
      .then(({ data }) => {
        if (data) setProfiles(data.map((p: any) => ({ id: p.id, nome: p.nome, job_title: p.job_title })));
      });
  }, []);

  // Fetch tipos de atividade
  useEffect(() => {
    supabase
      .from("tipos_atividade")
      .select("id, nome, ativo")
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => {
        if (data) setTiposAtividade(data as TipoAtividadeRow[]);
      });
  }, []);

  useEffect(() => {
    if (!currentProfileId) {
      setCurrentProfileName(null);
      return;
    }

    supabase
      .from("profiles")
      .select("nome")
      .eq("id", currentProfileId)
      .maybeSingle()
      .then(({ data }) => setCurrentProfileName((data as { nome?: string } | null)?.nome ?? null));
  }, [currentProfileId]);

  useEffect(() => {
    if (!osId) return;
    const channel = supabase
      .channel(`atividades_os_${osId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "atividades_os", filter: `os_id=eq.${osId}` }, () => {
        fetchAtividades();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [osId, fetchAtividades]);

  const resetForm = () => {
    setEditingId(null); setNome(""); setDataInicio(""); setDataTermino("");
    setStatus("Não iniciado"); setSelectedResponsaveis([]);
    setTipoAtividade(""); setTipoMedicao(""); setUnidadeMedicao("");
    setShowForm(false);
  };

  const openEdit = (a: Atividade) => {
    setEditingId(a.id); setNome(a.nome); setDataInicio(a.data_inicio);
    setDataTermino(a.data_termino); setStatus(a.status);
    // Parse comma-separated names back to profile IDs
    const names = (a.responsavel || "").split(",").map(n => n.trim()).filter(Boolean);
    const ids = names.map(name => profiles.find(p => p.nome === name)?.id).filter(Boolean) as string[];
    setSelectedResponsaveis(ids);
    setTipoAtividade(a.tipo_atividade || "");
    setTipoMedicao(a.tipo_medicao || "");
    setUnidadeMedicao(a.unidade_medicao || "");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!osId) return;
    if (!nome.trim() || !dataInicio || !dataTermino) {
      toast({ title: "Preencha nome, data de início e data de término.", variant: "destructive" });
      return;
    }
    const responsavelText = selectedResponsaveis
      .map(id => profiles.find(p => p.id === id)?.nome)
      .filter(Boolean)
      .join(", ") || null;

    const payload: any = {
      nome: nome.trim(),
      data_inicio: dataInicio,
      data_termino: dataTermino,
      status,
      responsavel: responsavelText,
      tipo_atividade: tipoAtividade || null,
      tipo_medicao: tipoAtividade === "Medição" ? (tipoMedicao || null) : null,
      unidade_medicao: tipoAtividade === "Medição" ? (unidadeMedicao || null) : null,
    };

   if (editingId) {

  const { error } = await (supabase as any)
    .from("atividades_os")
    .update(payload)
    .eq("id", editingId)
    .eq("company_id", companyId);

  if (error) {

    toast({
      title: "Erro ao atualizar atividade",
      variant: "destructive"
    });

    return;
  }

  toast({
    title: "Atividade atualizada"
  });

} else {

  const { error } = await (supabase as any)
    .from("atividades_os")
    .insert({
      os_id: osId,
      company_id: companyId,
      ...payload
    });

  if (error) {

    toast({
      title: "Erro ao adicionar atividade",
      variant: "destructive"
    });

    return;
  }

  toast({
    title: "Atividade adicionada"
  });
}

// Auto-sync: add activity responsáveis to os_responsaveis
if (selectedResponsaveis.length > 0) {
  await syncResponsaveisToOs(
    osId,
    selectedResponsaveis
  );
}

resetForm();
fetchAtividades();
};

const handleDelete = async (id: string) => {
    const { error } = await (supabase as any)
  .from("atividades_os")
  .delete()
  .eq("id", id)
  .eq("company_id", companyId);
    if (error) { toast({ title: "Erro ao excluir atividade", variant: "destructive" }); return; }
    toast({ title: "Atividade excluída" });
    fetchAtividades();
  };

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d + "T00:00:00"), "dd/MM/yyyy"); } catch { return d; }
  };

  const statusColor = (s: string) => {
    if (s === "Concluído") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "Em andamento") return "bg-sky-50 text-sky-700 border-sky-200";
    return "bg-zinc-100 text-zinc-600 border-zinc-200";
  };

  // Calculate total time from activities
  const totalActivitySeconds = atividades.reduce((sum, a) => {
    let secs = a.timer_total_seconds || 0;
    if (a.timer_status === "running" && a.timer_started_at) {
      secs += Math.max(0, Math.floor((Date.now() - new Date(a.timer_started_at).getTime()) / 1000));
    }
    return sum + secs;
  }, 0);

  const hasAnyActivityTimer = atividades.some((a) => a.timer_status && a.timer_status !== "none");

  const normalizeName = (value: string | null | undefined) =>
    (value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();

  const canControlActivityTimer = (atividade: Atividade) => {
    // Check if user is listed in comma-separated responsavel names
    const currentUserName = normalizeName(currentProfileName);
    if (currentUserName && atividade.responsavel) {
      const names = atividade.responsavel.split(",").map(n => normalizeName(n));
      if (names.some(n => n === currentUserName)) return true;
    }

    return !!currentProfileId && currentProfileId === responsibleUserId;
  };

  if (!osId) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" /> Cronograma de Atividades
          </h4>
        </div>
        {!readOnly && !showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-3 w-3 mr-1" /> Adicionar
          </Button>
        )}
      </div>

      {showForm && !readOnly && (
        <div className="space-y-3 rounded-md border p-3 mb-3 bg-muted/30">
          <div>
            <label className="text-xs font-medium mb-1 block">Nome da atividade *</label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Instalação de split" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Data início *</label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Data término *</label>
              <Input type="date" value={dataTermino} onChange={(e) => setDataTermino(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_ATIVIDADE.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Tipo de Atividade</label>
            <Select value={tipoAtividade || "__none__"} onValueChange={(v) => setTipoAtividade(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhum</SelectItem>
                {tiposAtividade.map((t) => <SelectItem key={t.id} value={t.nome}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {tipoAtividade === "Medição" && (
            <div className="p-2 rounded-lg border bg-muted/30 space-y-2">
              <p className="text-xs font-semibold">Campos de Medição</p>
              <div>
                <label className="text-xs font-medium mb-0.5 block">Unidade *</label>
                <Select value={unidadeMedicao || "__none__"} onValueChange={(v) => setUnidadeMedicao(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {UNIDADE_MEDICAO_OPTIONS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div>
            <MultiUserSelect
              label="Responsáveis"
              options={profiles}
              selected={selectedResponsaveis}
              onChange={setSelectedResponsaveis}
              placeholder="Selecionar responsáveis..."
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={resetForm}>Cancelar</Button>
            <Button size="sm" onClick={handleSave}>{editingId ? "Atualizar" : "Salvar"}</Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : atividades.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma atividade cadastrada.</p>
      ) : (
        <div className="space-y-2">
          {atividades.map((a) => (
            <div key={a.id} className="rounded-md border px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{a.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(a.data_inicio)} → {fmtDate(a.data_termino)}
                    {a.responsavel && <span className="ml-2">• {a.responsavel}</span>}
                    {a.tipo_atividade && <span className="ml-2">• {a.tipo_atividade}</span>}
                  </div>
                  {a.tipo_atividade === "Medição" && (a.tipo_medicao || a.unidade_medicao) && (
                    <div className="mt-1 inline-flex flex-wrap gap-1">
                      {a.tipo_medicao && (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          Valor medido: {a.tipo_medicao}
                        </Badge>
                      )}
                      {a.unidade_medicao && (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          Unidade: {a.unidade_medicao}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border ${statusColor(a.status)}`}>
                    {a.status}
                  </span>
                  {!readOnly && (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(a.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {/* Per-activity timer */}
              {osId && (
                <ActivityTimerControls
                  atividadeId={a.id}
                  osId={osId}
                  timerState={{
                    status: a.timer_status || "none",
                    total_seconds: a.timer_total_seconds || 0,
                    started_at: a.timer_started_at,
                    paused_at: a.timer_paused_at,
                    user_id: a.timer_user_id,
                  }}
                  currentProfileId={currentProfileId || null}
                  isResponsible={canControlActivityTimer(a)}
                  disabled={isBlockedByGeral}
                  onUpdate={() => {
                    fetchAtividades();
                  }}
                />
              )}
              {osId && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <button className="text-[10px] text-muted-foreground hover:underline mt-1">
                      Lançamento manual de horas
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <HorasAtividadeSection atividadeId={a.id} osId={osId} readOnly={readOnly} />
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          ))}

          {hasAnyActivityTimer && (
            <div className="text-xs text-muted-foreground text-right pt-1">
              Tempo total das atividades: {formatTotalTime(totalActivitySeconds)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatTotalTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
