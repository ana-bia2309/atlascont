import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// ⚠️ Se algum destes ícones não existir em "@/lib/icons", importe-o diretamente de "lucide-react"
import {
  FileCheck2, RefreshCw, Search, Clock, CheckCircle2, XCircle,
  Layers, ExternalLink, Building2, MapPin, ShieldCheck,
  CalendarIcon, Info, FolderSearch, Filter, X,
} from "@/lib/icons";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type Aprovacao = {
  id: string;
  os_id: string;
  user_id: string;
  fiscal_nome?: string;
  titulo: string | null;
  mensagem: string | null;
  created_at: string;
  read: boolean;
  orcamento_status?: string;
  os: {
    codigo_os: string;
    status: string;
    bloco_nome: string | null;
    andar?: string | null;
    sala?: string | null;
    numero_os_externo?: string | null;
    equipamentos: string | null;
    responsible_user_id?: string | null;
    observacoes_fiscais?: string | null;
    aprovado_por_nome?: string | null;
    aprovado_em?: string | null;
  } | null;
  materiais: {
    id: string;
    nome_material: string;
    quantidade: number;
    unidade: string;
    custo_unitario: number;
    custo_total_item: number;
  }[];
};

const STATUS_FILTER_OPTIONS = [
  { value: "todos", label: "Todos os Status" },
  { value: "pendente", label: "Pendentes" },
  { value: "aprovado", label: "Aprovados" },
  { value: "reprovado", label: "Reprovados" },
];

export default function Aprovacoes() {
  const { companyId } = useCompany();
  const [aprovacoes, setAprovacoes] = useState<Aprovacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Aprovacao | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [action, setAction] = useState<"aprovar" | "reprovar" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Filtros
  const [filterStatus, setFilterStatus] = useState("pendente");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterBloco, setFilterBloco] = useState("__all__");
  const [blocos, setBlocos] = useState<{ id: string; nome: string }[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    const getProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile }: any = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
      if (profile?.id) setProfileId(profile.id);
    };
    getProfile();
  }, []);

  useEffect(() => {
    if (!companyId) return;
    (supabase as any).from("blocos").select("id, nome").eq("company_id", companyId).order("nome")
      .then(({ data }: any) => setBlocos(data || []));
  }, [companyId]);

  const fetchData = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);

    // Busca todas as notificações (lidas e não lidas) para mostrar histórico
    const { data: notifs, error } = await (supabase as any)
      .from("os_notifications")
      .select("id, os_id, titulo, mensagem, created_at, read, user_id, profiles(nome)")
      .eq("tipo", "orcamento")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar aprovações", variant: "destructive" });
      setLoading(false);
      return;
    }

    const enriched = await Promise.all((notifs || []).map(async (n: any) => {
      const [osRes, matRes] = await Promise.all([
        (supabase as any).from("ordens_servico")
          .select("codigo_os, status, bloco_id, andar, sala, numero_os_externo, equipamentos, responsible_user_id, observacoes_fiscais, orcamento_status, aprovado_por_nome, aprovado_em")
          .eq("id", n.os_id).single(),
        (supabase as any).from("materiais_os").select("*").eq("os_id", n.os_id),
      ]);
      const fiscal_nome = n.profiles?.nome || null;

      // Busca nome do bloco
      let bloco_nome = null;
      if (osRes.data?.bloco_id) {
        const { data: blocoData } = await (supabase as any).from("blocos").select("nome").eq("id", osRes.data.bloco_id).single();
        bloco_nome = blocoData?.nome || null;
      }

      return {
        ...n,
        fiscal_nome,
        orcamento_status: osRes.data?.orcamento_status || (n.read ? "aprovado" : "pendente"),
        os: osRes.data ? { ...osRes.data, bloco_nome } : null,
        materiais: matRes.data || [],
      };
    }));

    setAprovacoes(enriched);
    setLoading(false);
  }, [profileId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Estatísticas
  const stats = useMemo(() => ({
    total: aprovacoes.length,
    pendentes: aprovacoes.filter(a => a.orcamento_status === "pendente" || (!a.read && !a.orcamento_status)).length,
    aprovados: aprovacoes.filter(a => a.orcamento_status === "aprovado").length,
    reprovados: aprovacoes.filter(a => a.orcamento_status === "reprovado").length,
  }), [aprovacoes]);

  // Filtros aplicados
  const filtered = useMemo(() => {
    return aprovacoes.filter(a => {
      if (filterStatus !== "todos" && (a.orcamento_status || "pendente") !== filterStatus) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase();
        if (!(a.os?.codigo_os || "").toLowerCase().includes(q) &&
          !(a.os?.bloco_nome || "").toLowerCase().includes(q) &&
          !(a.fiscal_nome || "").toLowerCase().includes(q) &&
          !(a.mensagem || "").toLowerCase().includes(q)) return false;
      }
      if (filterBloco !== "__all__") {
        const blocoNome = blocos.find(b => b.id === filterBloco)?.nome;
        if (a.os?.bloco_nome !== blocoNome) return false;
      }
      if (filterDateFrom) {
        if (a.created_at < filterDateFrom + "T00:00:00") return false;
      }
      if (filterDateTo) {
        if (a.created_at > filterDateTo + "T23:59:59") return false;
      }
      return true;
    });
  }, [aprovacoes, filterStatus, filterSearch, filterBloco, filterDateFrom, filterDateTo, blocos]);

  const hasActiveFilters = filterStatus !== "todos" || !!filterSearch || filterBloco !== "__all__" || !!filterDateFrom || !!filterDateTo;

  const clearFilters = () => {
    setFilterStatus("todos"); setFilterSearch(""); setFilterBloco("__all__");
    setFilterDateFrom(""); setFilterDateTo("");
  };

  const handleAction = async () => {
    if (!selected) return;
    if (!justificativa.trim()) {
      toast({ title: "Justificativa obrigatória", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const novoStatus = action === "aprovar" ? "Orçamento Aprovado" : "Orçamento Reprovado";
      await (supabase as any).from("ordens_servico").update({
        status: novoStatus,
        observacoes_fiscais: justificativa.trim(),
        orcamento_status: action === "aprovar" ? "aprovado" : "reprovado",
        aprovado_por_nome: selected.fiscal_nome || null,
        aprovado_em: new Date().toISOString(),
      }).eq("id", selected.os_id);

      await (supabase as any).from("os_notifications").update({ read: true }).eq("id", selected.id);

      toast({
        title: action === "aprovar" ? "Orçamento aprovado!" : "Orçamento reprovado!",
        description: `O.S. ${selected.os?.codigo_os} atualizada.`,
      });

      setSelected(null); setJustificativa(""); setAction(null);
      fetchData();
    } catch (e: any) {
      toast({ title: "Erro ao processar", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 shadow-sm">
            <FileCheck2 className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Aprovações de Orçamento</h1>
            <p className="text-sm text-slate-500">Gerencie e acompanhe os orçamentos das Ordens de Serviço.</p>
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={fetchData} className="self-start md:self-auto rounded-xl">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </header>

      {/* Cards de estatísticas */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <button
          type="button"
          onClick={() => setFilterStatus("todos")}
          className="text-left bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Total de O.S.</p>
              <h3 className="text-3xl font-extrabold text-slate-900">{stats.total}</h3>
            </div>
            <div className="p-2.5 bg-slate-50 text-slate-500 rounded-xl">
              <Layers className="h-5 w-5" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus("pendente")}
          className="text-left bg-white p-5 rounded-2xl border-l-4 border-l-amber-500 border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-500 mb-1">Pendentes</p>
              <h3 className="text-3xl font-extrabold text-slate-900">{stats.pendentes}</h3>
            </div>
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="h-5 w-5" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus("aprovado")}
          className="text-left bg-white p-5 rounded-2xl border-l-4 border-l-emerald-500 border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500 mb-1">Aprovados</p>
              <h3 className="text-3xl font-extrabold text-slate-900">{stats.aprovados}</h3>
            </div>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus("reprovado")}
          className="text-left bg-white p-5 rounded-2xl border-l-4 border-l-rose-500 border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-500 mb-1">Reprovados</p>
              <h3 className="text-3xl font-extrabold text-slate-900">{stats.reprovados}</h3>
            </div>
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
              <XCircle className="h-5 w-5" />
            </div>
          </div>
        </button>
      </section>

      {/* Filtros */}
      <section className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm mb-6 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-3 h-5 w-5 text-slate-400" />
              <Input
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Código OS, bloco, fiscal, mensagem..."
                className="pl-11 h-11 text-sm bg-slate-50 border-slate-200 rounded-xl focus-visible:ring-indigo-500"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-48 h-11 text-sm bg-slate-50 border-slate-200 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 self-end lg:self-auto">
            <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap">
              {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setAdvancedOpen((o) => !o)} className="gap-1.5 text-slate-500">
              <Filter className="h-3.5 w-3.5" /> Avançados
            </Button>
          </div>
        </div>

        {advancedOpen && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
            <Select value={filterBloco} onValueChange={setFilterBloco}>
              <SelectTrigger className="w-[180px] h-10 text-sm bg-slate-50 border-slate-200 rounded-xl">
                <SelectValue placeholder="Bloco" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os blocos</SelectItem>
                {blocos.map((b) => (<SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
                className="h-10 w-36 text-xs bg-slate-50 border-slate-200 rounded-xl" />
              <span className="text-xs text-slate-400">até</span>
              <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
                className="h-10 w-36 text-xs bg-slate-50 border-slate-200 rounded-xl" />
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500">
                <X className="mr-1 h-3 w-3" /> Limpar filtros
              </Button>
            )}
          </div>
        )}
      </section>

      {/* Lista */}
      {loading ? (
        <p className="text-slate-500 text-sm">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-slate-100 shadow-sm">
          <FolderSearch className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Nenhum orçamento encontrado com os filtros aplicados.</p>
        </div>
      ) : (
        <main className="space-y-6">
          {filtered.map((a) => {
            const totalCalc = a.materiais.reduce((s, m) => s + Number(m.custo_total_item), 0);
            const statusKey = a.orcamento_status || "pendente";
            const statusLabel = statusKey === "aprovado" ? "Aprovado" : statusKey === "reprovado" ? "Reprovado" : "Pendente";
            const statusBadgeClass =
              statusKey === "aprovado" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
              statusKey === "reprovado" ? "bg-rose-50 text-rose-700 border-rose-200" :
              "bg-amber-50 text-amber-700 border-amber-200";
            const cardBorderClass =
              statusKey === "aprovado" ? "border-emerald-100 hover:border-emerald-200" :
              statusKey === "reprovado" ? "border-rose-100 hover:border-rose-200" :
              "border-amber-100 hover:border-amber-200";

            return (
              <div key={a.id} className={cn("bg-white rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-all duration-200", cardBorderClass)}>
                {/* Cabeçalho do card */}
                <div className="p-5 bg-slate-50/50 border-b border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 bg-indigo-50 text-indigo-900 font-bold px-3 py-1.5 rounded-xl border border-indigo-100">
                        <span className="text-base sm:text-lg">O.S. {a.os?.codigo_os || "—"}</span>
                      </div>

                      {a.os?.numero_os_externo ? (
                        <div className="flex items-center gap-1.5 bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200">
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>O.S. Externa: {a.os.numero_os_externo}</span>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 italic px-2.5 py-1.5 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                          Sem O.S. Externa
                        </div>
                      )}

                      <span className={cn("px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider", statusBadgeClass)}>
                        {statusLabel}
                      </span>
                    </div>

                    <div className="flex flex-col items-start sm:items-end text-sm text-slate-500">
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        <span>{format(new Date(a.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                      </div>
                      <div className="text-slate-700 font-medium">
                        Valor Total: <strong className="text-slate-950 font-bold text-lg">
                          R$ {totalCalc.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Grid de metadados */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm text-sm">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 bg-slate-100 text-slate-500 rounded-lg"><Building2 className="h-4 w-4" /></div>
                      <div className="truncate">
                        <p className="text-[10px] uppercase font-bold text-slate-400 leading-none mb-0.5">Unidade</p>
                        <p className="font-semibold text-slate-700 truncate" title={a.os?.bloco_nome || ""}>{a.os?.bloco_nome || "—"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 bg-slate-100 text-slate-500 rounded-lg"><Layers className="h-4 w-4" /></div>
                      <div className="truncate">
                        <p className="text-[10px] uppercase font-bold text-slate-400 leading-none mb-0.5">Pavimento / Andar</p>
                        <p className="font-semibold text-slate-700 truncate">{a.os?.andar || "—"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 bg-slate-100 text-slate-500 rounded-lg"><MapPin className="h-4 w-4" /></div>
                      <div className="truncate">
                        <p className="text-[10px] uppercase font-bold text-slate-400 leading-none mb-0.5">Ambiente / Sala</p>
                        <p className="font-semibold text-slate-700 truncate" title={a.os?.sala || ""}>{a.os?.sala || "—"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 bg-indigo-50 text-indigo-500 rounded-lg"><ShieldCheck className="h-4 w-4" /></div>
                      <div className="truncate">
                        <p className="text-[10px] uppercase font-bold text-indigo-400 leading-none mb-0.5">Fiscal de Aprovação</p>
                        <p className="font-semibold text-indigo-950 truncate" title={a.fiscal_nome || ""}>{a.fiscal_nome || "—"}</p>
                      </div>
                    </div>
                  </div>

                  {a.mensagem && (
                    <div className="mt-3 flex items-center gap-2.5 text-xs text-slate-600 bg-slate-100/50 p-2.5 rounded-lg border border-slate-100">
                      <Info className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span>{a.mensagem}</span>
                    </div>
                  )}
                </div>

                {/* Tabela de materiais + ações */}
                {a.materiais.length > 0 && (
                  <div className="p-5">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm text-slate-600">
                        <thead>
                          <tr className="border-b-2 border-slate-200 text-slate-700 text-xs font-extrabold uppercase tracking-wider">
                            <th className="pb-3">Material</th>
                            <th className="pb-3 text-right w-24">Qtd</th>
                            <th className="pb-3 text-right w-32">Valor Unit.</th>
                            <th className="pb-3 text-right w-36">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {a.materiais.map((m) => (
                            <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3 font-medium text-slate-900">{m.nome_material}</td>
                              <td className="py-3 text-right font-semibold text-slate-700">{m.quantidade} {m.unidade}</td>
                              <td className="py-3 text-right text-slate-500">
                                R$ {Number(m.custo_unitario).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-3 text-right font-bold text-slate-900">
                                R$ {Number(m.custo_total_item).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Justificativa + quem aprovou/reprovou */}
                    {a.os?.observacoes_fiscais && (
                      <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-xs space-y-1">
                        {a.os.aprovado_por_nome && a.os.aprovado_em && (
                          <p className="font-semibold text-slate-500">
                            {statusKey === "aprovado" ? "✅ Aprovado" : "❌ Reprovado"} por{" "}
                            <span className="text-slate-800">{a.os.aprovado_por_nome}</span>
                            {" · "}
                            {format(new Date(a.os.aprovado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                        )}
                        <p><span className="font-semibold text-slate-500">Justificativa: </span>{a.os.observacoes_fiscais}</p>
                      </div>
                    )}

                    {/* Botões só para pendentes e só para o fiscal designado */}
                    {statusKey === "pendente" ? (
                      profileId === a.user_id ? (
                        <div className="mt-6 flex flex-wrap gap-3 justify-end border-t border-slate-100 pt-4">
                          <Button
                            variant="outline"
                            className="h-auto px-5 py-2.5 border-rose-200 text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-semibold gap-2"
                            onClick={() => { setSelected(a); setAction("reprovar"); setJustificativa(""); }}
                          >
                            <XCircle className="h-4 w-4" /> Reprovar Orçamento
                          </Button>
                          <Button
                            className="h-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold gap-2 shadow-sm"
                            onClick={() => { setSelected(a); setAction("aprovar"); setJustificativa(""); }}
                          >
                            <CheckCircle2 className="h-4 w-4" /> Aprovar Orçamento
                          </Button>
                        </div>
                      ) : (
                        <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
                          <p className="text-xs text-slate-400">🔒 Apenas o fiscal designado pode aprovar este orçamento.</p>
                        </div>
                      )
                    ) : (
                      <div className="mt-6 flex justify-between items-center border-t border-slate-100 pt-4 text-xs text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" /> O.S. processada pelo sistema.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </main>
      )}

      {/* Dialog de confirmação */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setJustificativa(""); setAction(null); } }}>
        <DialogContent className="sm:max-w-[500px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {action === "aprovar" ? "✅ Aprovar Orçamento" : "❌ Reprovar Orçamento"} — O.S. {selected?.os?.codigo_os}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">
                Justificativa <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder={action === "aprovar" ? "Descreva o motivo da aprovação..." : "Descreva o motivo da reprovação..."}
                rows={4}
                className="rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => { setSelected(null); setJustificativa(""); setAction(null); }}>
                Cancelar
              </Button>
              <Button
                onClick={handleAction}
                disabled={submitting || !justificativa.trim()}
                className={cn(
                  "rounded-xl",
                  action === "aprovar" ? "bg-indigo-600 hover:bg-indigo-700" : "bg-rose-600 hover:bg-rose-700"
                )}
              >
                {submitting ? "Processando..." : action === "aprovar" ? "Confirmar Aprovação" : "Confirmar Reprovação"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}