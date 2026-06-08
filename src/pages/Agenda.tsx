import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, ChevronLeft, ChevronRight, RefreshCw, Calendar, CheckCircle2, Clock, Trash2, Pencil, Wrench, ClipboardList } from "@/lib/icons";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday, parseISO, addWeeks, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type Evento = {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: string;
  prioridade: string;
  data_inicio: string;
  data_fim: string | null;
  dia_inteiro: boolean;
  concluido: boolean;
  cor: string;
  _source?: "evento" | "os" | "op";
  _os?: any;
  _op?: any;
};

const TIPO_ICONS: Record<string, string> = {
  "Evento": "📅",
  "Lembrete": "🔔",
  "Tarefa": "✅",
  "OS": "🔧",
  "Preventiva": "🛡️",
};

const TIPO_COLORS: Record<string, string> = {
  "Evento": "bg-blue-50 text-blue-700 border-blue-200",
  "Lembrete": "bg-amber-50 text-amber-700 border-amber-200",
  "Tarefa": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "OS": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Preventiva": "bg-teal-50 text-teal-700 border-teal-200",
};

const PRIORIDADE_COLORS: Record<string, string> = {
  "Baixa": "bg-zinc-100 text-zinc-600",
  "Média": "bg-blue-50 text-blue-700",
  "Alta": "bg-amber-50 text-amber-700",
  "Crítica": "bg-red-50 text-red-700",
};

const COR_OPTIONS = [
  { value: "#6366F1", label: "Roxo" },
  { value: "#3B82F6", label: "Azul" },
  { value: "#10B981", label: "Verde" },
  { value: "#F59E0B", label: "Amarelo" },
  { value: "#EF4444", label: "Vermelho" },
  { value: "#8B5CF6", label: "Violeta" },
  { value: "#EC4899", label: "Rosa" },
  { value: "#14B8A6", label: "Teal" },
];

export default function Agenda() {
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"mes" | "semana" | "dia">("mes");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [filterTipo, setFilterTipo] = useState<string>("todos");

  // OS Detail Dialog
  const [viewingOS, setViewingOS] = useState<any | null>(null);

  // Dialog
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Evento | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState("Evento");
  const [prioridade, setPrioridade] = useState("Média");
  const [dataInicio, setDataInicio] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [dataFim, setDataFim] = useState("");
  const [diaInteiro, setDiaInteiro] = useState(false);
  const [cor, setCor] = useState("#6366F1");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const fetchEventos = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [eventosRes, osRes, opRes, blocosRes, profilesRes] = await Promise.all([
        (supabase as any).from("agenda_eventos").select("*").eq("company_id", companyId).order("data_inicio", { ascending: true }),
        (supabase as any).from("ordens_servico").select("id, codigo_os, status, prioridade, prazo, data_inicio, bloco_id, observacoes, tipo_servico").eq("company_id", companyId).not("status", "in", "(Concluída,Cancelada,Encerrado)"),
        (supabase as any).from("ordens_preventivas").select("id, codigo_op, status, prioridade, data_inicio, ativo_id, bloco_id, tipo_servico").eq("company_id", companyId).not("status", "in", "(Concluída,Cancelada)"),
        (supabase as any).from("blocos").select("id, nome").eq("company_id", companyId),
        (supabase as any).from("profiles").select("id, nome").eq("company_id", companyId),
      ]);

      const blocosMap: Record<string, string> = {};
      (blocosRes.data || []).forEach((b: any) => { blocosMap[b.id] = b.nome; });

      const agendaEventos: Evento[] = (eventosRes.data || []).map((e: any) => ({ ...e, _source: "evento" }));

      const osEventos: Evento[] = (osRes.data || [])
        .filter((os: any) => os.prazo || os.data_inicio)
        .map((os: any) => ({
          id: `os_${os.id}`,
          titulo: `${os.codigo_os || "OS"} — ${blocosMap[os.bloco_id] || os.tipo_servico || "Sem local"}`,
          descricao: os.observacoes,
          tipo: "OS",
          prioridade: os.prioridade || "Média",
          data_inicio: os.prazo ? os.prazo + "T00:00:00" : os.data_inicio + "T00:00:00",
          data_fim: null,
          dia_inteiro: true,
          concluido: false,
          cor: "#6366F1",
          _source: "os" as const,
          _os: os,
        }));

      const opEventos: Evento[] = (opRes.data || [])
        .filter((op: any) => op.data_inicio)
        .map((op: any) => ({
          id: `op_${op.id}`,
          titulo: `${op.codigo_op} — Preventiva`,
          descricao: op.tipo_servico,
          tipo: "Preventiva",
          prioridade: op.prioridade || "Média",
          data_inicio: op.data_inicio + "T00:00:00",
          data_fim: null,
          dia_inteiro: true,
          concluido: false,
          cor: "#14B8A6",
          _source: "op" as const,
          _op: op,
        }));

      setEventos([...agendaEventos, ...osEventos, ...opEventos]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchEventos(); }, [fetchEventos]);

  const openDialog = (evento?: Evento, date?: Date) => {
    if (evento?._source === "os") { setViewingOS(evento._os); return; }
    if (evento?._source === "op") { navigate(`/ordens-preventivas?op=${evento._op.id}`); return; }
    setEditing(evento || null);
    setTitulo(evento?.titulo || "");
    setDescricao(evento?.descricao || "");
    setTipo(evento?.tipo || "Evento");
    setPrioridade(evento?.prioridade || "Média");
    setDataInicio(evento?.data_inicio
      ? format(parseISO(evento.data_inicio), "yyyy-MM-dd'T'HH:mm")
      : format(date || new Date(), "yyyy-MM-dd'T'HH:mm"));
    setDataFim(evento?.data_fim ? format(parseISO(evento.data_fim), "yyyy-MM-dd'T'HH:mm") : "");
    setDiaInteiro(evento?.dia_inteiro || false);
    setCor(evento?.cor || "#6366F1");
    setDialog(true);
  };

  const saveEvento = async () => {
    if (!titulo.trim()) { toast({ title: "Informe o título", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        titulo: titulo.trim(), descricao: descricao.trim() || null,
        tipo, prioridade,
        data_inicio: new Date(dataInicio).toISOString(),
        data_fim: dataFim ? new Date(dataFim).toISOString() : null,
        dia_inteiro: diaInteiro, cor,
        company_id: companyId, user_id: userId,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        await (supabase as any).from("agenda_eventos").update(payload).eq("id", editing.id);
        toast({ title: "Evento atualizado!" });
      } else {
        await (supabase as any).from("agenda_eventos").insert({ ...payload, concluido: false });
        toast({ title: "Evento criado!" });
      }
      setDialog(false);
      fetchEventos();
    } finally { setSaving(false); }
  };

  const toggleConcluido = async (evento: Evento) => {
    if (evento._source !== "evento") return;
    await (supabase as any).from("agenda_eventos").update({ concluido: !evento.concluido }).eq("id", evento.id);
    fetchEventos();
  };

  const deleteEvento = async (id: string) => {
    await (supabase as any).from("agenda_eventos").delete().eq("id", id);
    toast({ title: "Evento excluído" });
    fetchEventos();
  };

  const eventosNoDia = (date: Date) =>
    eventos.filter(e => {
      try { return isSameDay(parseISO(e.data_inicio), date); } catch { return false; }
    }).filter(e => filterTipo === "todos" || e.tipo === filterTipo);

  const proximosEventos = useMemo(() =>
    eventos.filter(e => {
      try {
        const d = parseISO(e.data_inicio);
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        return d >= hoje && !e.concluido;
      } catch { return false; }
    }).slice(0, 6), [eventos]);

  const renderMes = () => {
    const start = startOfWeek(startOfMonth(currentDate), { locale: ptBR });
    const end = endOfWeek(endOfMonth(currentDate), { locale: ptBR });
    const days = [];
    let day = start;
    while (day <= end) { days.push(day); day = addDays(day, 1); }

    return (
      <div>
        <div className="grid grid-cols-7 mb-1">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
          {days.map(day => {
            const evs = eventosNoDia(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isTodayDay = isToday(day);
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            return (
              <div key={day.toString()}
                onClick={() => { setSelectedDate(day); setView("dia"); }}
                className={cn(
                  "min-h-[90px] p-1.5 bg-card cursor-pointer hover:bg-accent/50 transition-colors",
                  !isCurrentMonth && "bg-muted/30",
                  isSelected && "bg-primary/5"
                )}>
                <div className={cn(
                  "w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium mb-1",
                  isTodayDay && "bg-primary text-white",
                  !isTodayDay && !isCurrentMonth && "text-muted-foreground/50",
                )}>
                  {format(day, "d")}
                </div>
                <div className="space-y-0.5">
                  {evs.slice(0, 3).map(e => (
                    <div key={e.id}
                      onClick={ev => { ev.stopPropagation(); openDialog(e); }}
                      className={cn("text-[10px] px-1.5 py-0.5 rounded truncate font-medium cursor-pointer hover:opacity-80", e.concluido && "line-through opacity-50")}
                      style={{ backgroundColor: e.cor + "20", color: e.cor }}>
                      {TIPO_ICONS[e.tipo]} {e.titulo}
                    </div>
                  ))}
                  {evs.length > 3 && (
                    <div className="text-[10px] text-muted-foreground px-1">+{evs.length - 3} mais</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSemana = () => {
    const start = startOfWeek(currentDate, { locale: ptBR });
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return (
      <div className="grid grid-cols-7 gap-2">
        {days.map(day => {
          const evs = eventosNoDia(day);
          const isTodayDay = isToday(day);
          return (
            <div key={day.toString()} className={cn(
              "rounded-lg border p-2 min-h-[200px]",
              isTodayDay && "border-primary/40 bg-primary/5"
            )}>
              <div className={cn(
                "text-center text-sm font-semibold mb-2 rounded-full w-8 h-8 flex items-center justify-center mx-auto",
                isTodayDay && "bg-primary text-white"
              )}>
                {format(day, "d")}
              </div>
              <div className="text-center text-xs text-muted-foreground mb-2">
                {format(day, "EEE", { locale: ptBR })}
              </div>
              <div className="space-y-1">
                {evs.map(e => (
                  <div key={e.id}
                    onClick={() => openDialog(e)}
                    className={cn("text-[10px] px-1.5 py-1 rounded cursor-pointer hover:opacity-80", e.concluido && "opacity-50 line-through")}
                    style={{ backgroundColor: e.cor + "20", color: e.cor }}>
                    {TIPO_ICONS[e.tipo]} {e.titulo}
                  </div>
                ))}
                <button onClick={() => { setSelectedDate(day); openDialog(undefined, day); }}
                  className="w-full text-[10px] text-muted-foreground hover:text-primary text-center py-1">
                  + Adicionar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderDia = () => {
    const date = selectedDate || currentDate;
    const evs = eventosNoDia(date);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {format(date, "EEEE, d 'de' MMMM", { locale: ptBR })}
            {isToday(date) && <Badge className="ml-2 text-xs">Hoje</Badge>}
          </h2>
          <Button size="sm" onClick={() => openDialog(undefined, date)}>
            <Plus className="h-4 w-4 mr-1" /> Novo evento
          </Button>
        </div>
        {evs.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground border rounded-lg">
            <Calendar className="h-10 w-10 mb-2 opacity-20" />
            <p className="text-sm">Nenhum evento neste dia.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {evs.map(e => (
              <div key={e.id}
                onClick={() => openDialog(e)}
                className={cn("flex items-start gap-3 p-4 rounded-lg border cursor-pointer hover:bg-accent/30 transition-colors", e.concluido && "opacity-60")}
                style={{ borderLeftColor: e.cor, borderLeftWidth: 4 }}>
                <span className="text-xl">{TIPO_ICONS[e.tipo]}</span>
                <div className="flex-1 min-w-0">
                  <p className={cn("font-semibold", e.concluido && "line-through")}>{e.titulo}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className={cn("text-xs", TIPO_COLORS[e.tipo])}>{e.tipo}</Badge>
                    <Badge variant="outline" className={cn("text-xs", PRIORIDADE_COLORS[e.prioridade])}>{e.prioridade}</Badge>
                    <span className="text-xs text-muted-foreground">
                      <Clock className="h-3 w-3 inline mr-1" />
                      {e.dia_inteiro ? "Dia inteiro" : format(parseISO(e.data_inicio), "HH:mm")}
                      {e.data_fim && !e.dia_inteiro && ` — ${format(parseISO(e.data_fim), "HH:mm")}`}
                    </span>
                  </div>
                  {e.descricao && <p className="text-sm text-muted-foreground mt-2">{e.descricao}</p>}
                  {e._source === "os" && <p className="text-xs text-indigo-600 mt-1 font-medium">Clique para ver detalhes da O.S.</p>}
                  {e._source === "op" && <p className="text-xs text-teal-600 mt-1 font-medium">Clique para abrir Ordem Preventiva.</p>}
                </div>
                {e._source === "evento" && (
                  <div className="flex gap-1 shrink-0" onClick={ev => ev.stopPropagation()}>
                    <button onClick={() => toggleConcluido(e)}
                      className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent"
                      title={e.concluido ? "Reabrir" : "Concluir"}>
                      <CheckCircle2 className={cn("h-4 w-4", e.concluido ? "text-emerald-500" : "text-muted-foreground")} />
                    </button>
                    <button onClick={() => openDialog(e)}
                      className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deleteEvento(e.id)}
                      className="h-7 w-7 flex items-center justify-center rounded hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const navPrev = () => {
    if (view === "mes") setCurrentDate(d => subMonths(d, 1));
    else if (view === "semana") setCurrentDate(d => subWeeks(d, 1));
    else setSelectedDate(d => d ? addDays(d, -1) : addDays(new Date(), -1));
  };

  const navNext = () => {
    if (view === "mes") setCurrentDate(d => addMonths(d, 1));
    else if (view === "semana") setCurrentDate(d => addWeeks(d, 1));
    else setSelectedDate(d => d ? addDays(d, 1) : addDays(new Date(), 1));
  };

  const navTitle = () => {
    if (view === "mes") return format(currentDate, "MMMM yyyy", { locale: ptBR });
    if (view === "semana") {
      const start = startOfWeek(currentDate, { locale: ptBR });
      const end = endOfWeek(currentDate, { locale: ptBR });
      return `${format(start, "d MMM", { locale: ptBR })} — ${format(end, "d MMM yyyy", { locale: ptBR })}`;
    }
    return format(selectedDate || currentDate, "d 'de' MMMM yyyy", { locale: ptBR });
  };

  const contadores = useMemo(() => ({
    os: eventos.filter(e => e._source === "os").length,
    op: eventos.filter(e => e._source === "op").length,
    evento: eventos.filter(e => e._source === "evento").length,
  }), [eventos]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Calendário Geral</h1>
            <p className="text-sm text-muted-foreground">OS, Preventivas e Eventos em uma única tela</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchEventos}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => openDialog(undefined, selectedDate || new Date())}>
            <Plus className="h-4 w-4 mr-2" /> Novo Evento
          </Button>
        </div>
      </div>

      {/* Legenda / filtro */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "todos", label: "Todos", icon: "📋", count: eventos.length, color: "border-border" },
          { key: "OS", label: "O.S. Corretivas", icon: "🔧", count: contadores.os, color: "border-indigo-400" },
          { key: "Preventiva", label: "Preventivas", icon: "🛡️", count: contadores.op, color: "border-teal-400" },
          { key: "Evento", label: "Eventos", icon: "📅", count: contadores.evento, color: "border-blue-400" },
        ].map(f => (
          <button key={f.key} onClick={() => setFilterTipo(f.key)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
              filterTipo === f.key ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent " + f.color
            )}>
            {f.icon} {f.label}
            <span className={cn("px-1.5 py-0.5 rounded-full text-[10px]", filterTipo === f.key ? "bg-white/20" : "bg-muted")}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Próximos */}
      {proximosEventos.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {proximosEventos.map(e => (
            <div key={e.id}
              onClick={() => openDialog(e)}
              className="flex-shrink-0 rounded-lg border p-3 cursor-pointer hover:shadow-sm transition-all min-w-[180px]"
              style={{ borderLeftColor: e.cor, borderLeftWidth: 3 }}>
              <p className="text-xs font-semibold truncate">{TIPO_ICONS[e.tipo]} {e.titulo}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {format(parseISO(e.data_inicio), "dd/MM HH:mm")}
              </p>
              <Badge variant="outline" className={cn("text-[10px] mt-1", TIPO_COLORS[e.tipo])}>{e.tipo}</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Navegação */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={navPrev}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={navNext}><ChevronRight className="h-4 w-4" /></Button>
          <h2 className="text-lg font-semibold capitalize ml-2">{navTitle()}</h2>
          <Button variant="outline" size="sm" onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }}>Hoje</Button>
        </div>
        <div className="flex gap-1 rounded-lg border p-1 bg-muted">
          {(["mes", "semana", "dia"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={cn("px-3 py-1 rounded text-xs font-medium transition-colors",
                view === v ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}>
              {v === "mes" ? "Mês" : v === "semana" ? "Semana" : "Dia"}
            </button>
          ))}
        </div>
      </div>

      {loading ? <p className="text-muted-foreground">Carregando...</p>
        : view === "mes" ? renderMes()
        : view === "semana" ? renderSemana()
        : renderDia()}

      {/* Dialog OS */}
      <Dialog open={!!viewingOS} onOpenChange={o => !o && setViewingOS(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-indigo-600" />
              {viewingOS?.codigo_os} — Detalhes da O.S.
            </DialogTitle>
          </DialogHeader>
          {viewingOS && (
            <div className="space-y-3 text-sm py-2">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{viewingOS.status}</span></div>
                <div><span className="text-muted-foreground">Prioridade:</span> <span className="font-medium">{viewingOS.prioridade}</span></div>
                <div><span className="text-muted-foreground">Tipo:</span> <span className="font-medium">{viewingOS.tipo_servico || "—"}</span></div>
                <div><span className="text-muted-foreground">Prazo:</span> <span className="font-medium">{viewingOS.prazo ? format(new Date(viewingOS.prazo + "T00:00:00"), "dd/MM/yyyy") : "—"}</span></div>
              </div>
              {viewingOS.observacoes && (
                <div><span className="text-muted-foreground block mb-1">Observações:</span>
                  <p className="bg-muted/50 rounded-md p-2 text-xs">{viewingOS.observacoes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingOS(null)}>Fechar</Button>
            <Button onClick={() => { navigate(`/ordens-servico?os=${viewingOS?.id}`); setViewingOS(null); }}>
              <ClipboardList className="h-4 w-4 mr-2" /> Abrir O.S.
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Evento */}
      <Dialog open={dialog} onOpenChange={o => { if (!o) setDialog(false); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              {editing ? "Editar Evento" : "Novo Evento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Título *</label>
              <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título do evento..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Tipo</label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Evento", "Lembrete", "Tarefa"].map(t => (
                      <SelectItem key={t} value={t}>{TIPO_ICONS[t]} {t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Prioridade</label>
                <Select value={prioridade} onValueChange={setPrioridade}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Baixa", "Média", "Alta", "Crítica"].map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Data/Hora Início *</label>
                <Input type="datetime-local" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Data/Hora Fim</label>
                <Input type="datetime-local" value={dataFim} onChange={e => setDataFim(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="diaInteiro" checked={diaInteiro} onChange={e => setDiaInteiro(e.target.checked)} className="h-4 w-4" />
              <label htmlFor="diaInteiro" className="text-sm">Dia inteiro</label>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Cor</label>
              <div className="flex gap-2 flex-wrap">
                {COR_OPTIONS.map(c => (
                  <button key={c.value} onClick={() => setCor(c.value)}
                    className={cn("w-7 h-7 rounded-full border-2 transition-all", cor === c.value ? "border-foreground scale-110" : "border-transparent")}
                    style={{ backgroundColor: c.value }} title={c.label} />
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição</label>
              <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Detalhes do evento..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancelar</Button>
            <Button onClick={saveEvento} disabled={saving}>{saving ? "Salvando..." : editing ? "Salvar" : "Criar Evento"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}