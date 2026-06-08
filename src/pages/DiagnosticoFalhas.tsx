import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, ChevronRight, CheckCircle2, AlertTriangle, Wrench, Trash2, Pencil, RefreshCw } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";

type Causa = { causa: string; solucao: string };
type Diagnostico = {
  id: string;
  sistema: string;
  problema: string;
  causas: Causa[];
};

const SISTEMAS = ["Ar-condicionado", "Elétrica", "Hidráulica", "Civil", "Elevador", "Gerador", "CFTV", "Outro"];

export default function DiagnosticoFalhas() {
  const { companyId } = useCompany();
  const { can } = usePermissions();
  const [diagnosticos, setDiagnosticos] = useState<Diagnostico[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSistema, setFilterSistema] = useState("__all__");
  const [selected, setSelected] = useState<Diagnostico | null>(null);
  const [causaAtiva, setCausaAtiva] = useState<number | null>(null);

  // Dialog novo/editar
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Diagnostico | null>(null);
  const [formSistema, setFormSistema] = useState("");
  const [formProblema, setFormProblema] = useState("");
  const [formCausas, setFormCausas] = useState<Causa[]>([{ causa: "", solucao: "" }]);

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("diagnostico_falhas")
      .select("*")
      .eq("company_id", companyId)
      .order("sistema")
      .order("problema");

    // Se não tem dados da empresa, busca os globais (sem company_id)
    if (!data?.length) {
      const { data: globais } = await (supabase as any)
        .from("diagnostico_falhas")
        .select("*")
        .is("company_id", null)
        .order("sistema")
        .order("problema");
      setDiagnosticos(globais || []);
    } else {
      setDiagnosticos(data || []);
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = diagnosticos.filter(d => {
    if (filterSistema !== "__all__" && d.sistema !== filterSistema) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return d.problema.toLowerCase().includes(q) || d.sistema.toLowerCase().includes(q);
    }
    return true;
  });

  const sistemasSistemas = Array.from(new Set(diagnosticos.map(d => d.sistema)));

  const openNew = () => {
    setEditing(null);
    setFormSistema(""); setFormProblema("");
    setFormCausas([{ causa: "", solucao: "" }]);
    setDialogOpen(true);
  };

  const openEdit = (d: Diagnostico) => {
    setEditing(d);
    setFormSistema(d.sistema); setFormProblema(d.problema);
    setFormCausas(d.causas.length > 0 ? d.causas : [{ causa: "", solucao: "" }]);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formSistema || !formProblema.trim()) {
      toast({ title: "Preencha sistema e problema", variant: "destructive" }); return;
    }
    const causasValidas = formCausas.filter(c => c.causa.trim() && c.solucao.trim());
    if (causasValidas.length === 0) {
      toast({ title: "Adicione pelo menos uma causa e solução", variant: "destructive" }); return;
    }
    const payload = { sistema: formSistema, problema: formProblema.trim(), causas: causasValidas, company_id: companyId };
    if (editing) {
      await (supabase as any).from("diagnostico_falhas").update(payload).eq("id", editing.id);
      toast({ title: "Diagnóstico atualizado!" });
    } else {
      await (supabase as any).from("diagnostico_falhas").insert(payload);
      toast({ title: "Diagnóstico criado!" });
    }
    setDialogOpen(false); fetchData();
    if (selected?.id === editing?.id) setSelected(null);
  };

  const handleDelete = async (d: Diagnostico) => {
    await (supabase as any).from("diagnostico_falhas").delete().eq("id", d.id);
    toast({ title: "Diagnóstico excluído" });
    if (selected?.id === d.id) setSelected(null);
    fetchData();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Wrench className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Diagnóstico de Falhas</h1>
            <p className="text-sm text-muted-foreground">Árvore de decisão para resolução de problemas</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
          {can("painel_os.criar") && (
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo Diagnóstico</Button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar problema..." className="pl-9 h-9" />
        </div>
        <Select value={filterSistema} onValueChange={setFilterSistema}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os sistemas</SelectItem>
            {sistemasSistemas.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lista de problemas */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{filtered.length} problema(s) cadastrado(s)</p>
          {loading ? <p className="text-muted-foreground text-sm">Carregando...</p>
            : filtered.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhum diagnóstico encontrado.</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {/* Agrupa por sistema */}
                {Array.from(new Set(filtered.map(d => d.sistema))).map(sistema => (
                  <div key={sistema}>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 mt-3">{sistema}</p>
                    {filtered.filter(d => d.sistema === sistema).map(d => (
                      <div key={d.id}
                        onClick={() => { setSelected(d); setCausaAtiva(null); }}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all hover:border-primary/40 hover:bg-accent/30",
                          selected?.id === d.id && "border-primary bg-primary/5"
                        )}>
                        <div className="flex items-center gap-2 min-w-0">
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                          <span className="text-sm font-medium truncate">{d.problema}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{d.causas.length} causa(s)</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {can("painel_os.criar") && (
                            <>
                              <button onClick={e => { e.stopPropagation(); openEdit(d); }}
                                className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent">
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button onClick={e => { e.stopPropagation(); handleDelete(d); }}
                                className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10">
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </button>
                            </>
                          )}
                          <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", selected?.id === d.id && "rotate-90 text-primary")} />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Painel de diagnóstico */}
        <div>
          {!selected ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Wrench className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">Selecione um problema para ver as possíveis causas e soluções.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-primary/20">
              <CardContent className="pt-5 space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{selected.sistema}</p>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    {selected.problema}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">Clique em cada causa para ver a solução recomendada</p>
                </div>

                <div className="space-y-2">
                  {selected.causas.map((c, idx) => (
                    <div key={idx}
                      onClick={() => setCausaAtiva(causaAtiva === idx ? null : idx)}
                      className={cn(
                        "rounded-lg border cursor-pointer transition-all",
                        causaAtiva === idx ? "border-primary bg-primary/5" : "hover:border-primary/30 hover:bg-accent/20"
                      )}>
                      <div className="flex items-center gap-2 p-3">
                        <span className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                          causaAtiva === idx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}>{idx + 1}</span>
                        <span className="text-sm font-medium flex-1">{c.causa}</span>
                        <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", causaAtiva === idx && "rotate-90")} />
                      </div>
                      {causaAtiva === idx && (
                        <div className="px-4 pb-3 border-t bg-emerald-50/50 dark:bg-emerald-950/20">
                          <div className="flex items-start gap-2 pt-3">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-semibold text-emerald-700 mb-1">Solução recomendada:</p>
                              <p className="text-sm text-emerald-800 dark:text-emerald-300">{c.solucao}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Dialog novo/editar */}
      <Dialog open={dialogOpen} onOpenChange={o => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Diagnóstico" : "Novo Diagnóstico"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Sistema *</label>
                <Select value={formSistema || "__none__"} onValueChange={v => setFormSistema(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione</SelectItem>
                    {SISTEMAS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Problema *</label>
                <Input value={formProblema} onChange={e => setFormProblema(e.target.value)} placeholder="Ex: Não gela" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Causas e Soluções *</label>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => setFormCausas(prev => [...prev, { causa: "", solucao: "" }])}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar
                </Button>
              </div>
              <div className="space-y-3">
                {formCausas.map((c, idx) => (
                  <div key={idx} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Causa {idx + 1}</span>
                      {formCausas.length > 1 && (
                        <button onClick={() => setFormCausas(prev => prev.filter((_, i) => i !== idx))}
                          className="text-destructive hover:bg-destructive/10 h-5 w-5 flex items-center justify-center rounded">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <Input value={c.causa} onChange={e => setFormCausas(prev => prev.map((p, i) => i === idx ? { ...p, causa: e.target.value } : p))}
                      placeholder="Descreva a causa..." className="h-8 text-sm" />
                    <Textarea value={c.solucao} onChange={e => setFormCausas(prev => prev.map((p, i) => i === idx ? { ...p, solucao: e.target.value } : p))}
                      placeholder="Descreva a solução..." rows={2} className="text-sm" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editing ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}