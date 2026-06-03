import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, ClipboardList, RefreshCw, Search, Clock, Filter } from "@/lib/icons";
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
    equipamentos: string | null;
    responsible_user_id?: string | null;
    observacoes_fiscais?: string | null;
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
  { value: "todos", label: "Todos" },
  { value: "pendente", label: "🟡 Pendentes" },
  { value: "aprovado", label: "🟢 Aprovados" },
  { value: "reprovado", label: "🔴 Reprovados" },
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
          .select("codigo_os, status, bloco_id, equipamentos, responsible_user_id, observacoes_fiscais, orcamento_status")
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
      if (filterStatus !== "todos" && a.orcamento_status !== filterStatus) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase();
        if (!(a.os?.codigo_os || "").toLowerCase().includes(q) &&
            !(a.os?.bloco_nome || "").toLowerCase().includes(q) &&
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

  const getStatusBadge = (status: string) => {
    if (status === "aprovado") return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 border">🟢 Aprovado</Badge>;
    if (status === "reprovado") return <Badge className="bg-red-50 text-red-700 border-red-200 border">🔴 Reprovado</Badge>;
    return <Badge className="bg-amber-50 text-amber-700 border-amber-200 border">🟡 Pendente</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Aprovações de Orçamento</h1>
            <p className="text-sm text-muted-foreground">Gerencie e acompanhe os orçamentos das O.S.</p>
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={fetchData}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:border-zinc-400 transition-colors" onClick={() => setFilterStatus("todos")}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">Total</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <span className="text-3xl font-bold">{stats.total}</span>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-amber-400 transition-colors border-amber-200 bg-amber-50/30" onClick={() => setFilterStatus("pendente")}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-amber-600 font-medium">🟡 Pendentes</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <span className="text-3xl font-bold text-amber-700">{stats.pendentes}</span>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-emerald-400 transition-colors border-emerald-200 bg-emerald-50/30" onClick={() => setFilterStatus("aprovado")}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-emerald-600 font-medium">🟢 Aprovados</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <span className="text-3xl font-bold text-emerald-700">{stats.aprovados}</span>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-red-400 transition-colors border-red-200 bg-red-50/30" onClick={() => setFilterStatus("reprovado")}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-red-600 font-medium">🔴 Reprovados</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <span className="text-3xl font-bold text-red-700">{stats.reprovados}</span>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filtros:
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
            placeholder="Código OS, bloco, mensagem..." className="pl-9 h-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterBloco} onValueChange={setFilterBloco}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Bloco" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os blocos</SelectItem>
            {blocos.map(b => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
            className="h-9 w-36 text-xs" placeholder="De" />
          <span className="text-muted-foreground text-xs">até</span>
          <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
            className="h-9 w-36 text-xs" placeholder="Até" />
        </div>
        {(filterStatus !== "todos" || filterSearch || filterBloco !== "__all__" || filterDateFrom || filterDateTo) && (
          <Button variant="ghost" size="sm" onClick={() => {
            setFilterStatus("todos"); setFilterSearch(""); setFilterBloco("__all__");
            setFilterDateFrom(""); setFilterDateTo("");
          }}>
            Limpar filtros
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground self-center">
          {filtered.length} resultado(s)
        </span>
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>Nenhum orçamento encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => (
            <Card key={a.id} className={cn(
              "border transition-colors",
              a.orcamento_status === "aprovado" && "border-emerald-200 bg-emerald-50/20",
              a.orcamento_status === "reprovado" && "border-red-200 bg-red-50/20",
              (!a.orcamento_status || a.orcamento_status === "pendente") && "border-amber-200",
            )}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    O.S. {a.os?.codigo_os || "—"}
                    {getStatusBadge(a.orcamento_status || "pendente")}
                    {a.os?.bloco_nome && (
                      <span className="text-xs text-muted-foreground font-normal">· {a.os.bloco_nome}</span>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {format(new Date(a.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {a.mensagem && <p className="text-sm text-muted-foreground">{a.mensagem}</p>}

                {a.materiais.length > 0 && (
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium">Material</th>
                          <th className="text-center px-3 py-1.5 font-medium">Qtd</th>
                          <th className="text-right px-3 py-1.5 font-medium">Valor Unit.</th>
                          <th className="text-right px-3 py-1.5 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.materiais.map(m => (
                          <tr key={m.id} className="border-t">
                            <td className="px-3 py-1.5">{m.nome_material}</td>
                            <td className="px-3 py-1.5 text-center">{m.quantidade} {m.unidade}</td>
                            <td className="px-3 py-1.5 text-right">R$ {Number(m.custo_unitario).toFixed(2)}</td>
                            <td className="px-3 py-1.5 text-right font-semibold">R$ {Number(m.custo_total_item).toFixed(2)}</td>
                          </tr>
                        ))}
                        <tr className="border-t bg-muted/50">
                          <td colSpan={3} className="px-3 py-1.5 text-right font-semibold">Total Geral:</td>
                          <td className="px-3 py-1.5 text-right font-bold text-primary">
                            R$ {a.materiais.reduce((s, m) => s + Number(m.custo_total_item), 0).toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Justificativa já registrada */}
                {a.os?.observacoes_fiscais && (
                  <div className="rounded-md bg-muted/30 px-3 py-2 text-xs">
                    <span className="font-semibold text-muted-foreground">Justificativa: </span>
                    {a.os.observacoes_fiscais}
                  </div>
                )}

                {/* Botões só para pendentes e só para o fiscal designado */}
                {(a.orcamento_status === "pendente" || !a.orcamento_status) && (
                  profileId === a.user_id ? (
                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="outline" size="sm"
                        className="border-red-300 text-red-700 hover:bg-red-50"
                        onClick={() => { setSelected(a); setAction("reprovar"); setJustificativa(""); }}>
                        <XCircle className="h-4 w-4 mr-1" /> Reprovar
                      </Button>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => { setSelected(a); setAction("aprovar"); setJustificativa(""); }}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-right pt-1">
                      🔒 Apenas o fiscal designado pode aprovar este orçamento.
                    </p>
                  )
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de confirmação */}
      <Dialog open={!!selected} onOpenChange={o => { if (!o) { setSelected(null); setJustificativa(""); setAction(null); } }}>
        <DialogContent className="sm:max-w-[500px]">
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
              <Textarea value={justificativa} onChange={e => setJustificativa(e.target.value)}
                placeholder={action === "aprovar" ? "Descreva o motivo da aprovação..." : "Descreva o motivo da reprovação..."}
                rows={4} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setSelected(null); setJustificativa(""); setAction(null); }}>
                Cancelar
              </Button>
              <Button onClick={handleAction} disabled={submitting || !justificativa.trim()}
                className={action === "aprovar" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}>
                {submitting ? "Processando..." : action === "aprovar" ? "Confirmar Aprovação" : "Confirmar Reprovação"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}