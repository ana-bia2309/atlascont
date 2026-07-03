// src/pages/GestaoEmprestimos.tsx
// Tela EXCLUSIVA do gestor/admin/almoxarife — criar e gerenciar empréstimos.
// Colaboradores comuns não devem ter acesso a esta rota (ver instruções de rota).

import React, { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Package, Plus, Search, CheckCircle, AlertTriangle, Clock, Wrench, RefreshCw, ArrowRight } from "lucide-react";
import {
    useMeuContexto, useEmprestimos, useColaboradores, useMateriaisDisponiveis,
    registrarHistorico, computeStatus, EmprestimoCard, ConferenciaDialog, HistoricoDialog,
    ESTADOS_CONSERVACAO, STATUS_CONFIG, Emprestimo, excluirEmprestimo,
} from "@/lib/emprestimosShared";

export default function GestaoEmprestimos() {
    const { toast } = useToast();
    const { myProfileId, myNome, companyId, isGestor, loading } = useMeuContexto();
    const { emprestimos, fetchEmprestimos } = useEmprestimos(companyId);
    const colaboradores = useColaboradores(companyId);
    const { materiais, fetchMateriais } = useMateriaisDisponiveis(companyId);

    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [filtroStatus, setFiltroStatus] = useState("Todos");
    const [filtroTexto, setFiltroTexto] = useState("");
    const [novoOpen, setNovoOpen] = useState(false);
    const [conferenciaOpen, setConferenciaOpen] = useState(false);
    const [historicId, setHistoricId] = useState<string | null>(null);
    const [targetEmp, setTargetEmp] = useState<Emprestimo | null>(null);

    const lista = useMemo(() => emprestimos
        .map(e => ({ ...e, status: computeStatus(e) }))
        .filter(e => {
            const matchStatus = filtroStatus === "Todos" || e.status === filtroStatus;
            const q = filtroTexto.toLowerCase();
            const matchTexto = !q || (e.colaborador_nome || "").toLowerCase().includes(q)
                || (e.os_codigo || "").toLowerCase().includes(q)
                || (e.itens || []).some(i => i.material_nome.toLowerCase().includes(q));
            return matchStatus && matchTexto;
        }), [emprestimos, filtroStatus, filtroTexto]);

    const stats = useMemo(() => {
        const m = emprestimos.map(e => ({ ...e, status: computeStatus(e) }));
        return {
            total: m.length,
            emUso: m.filter(e => e.status === "Em uso").length,
            atrasados: m.filter(e => e.status === "Em atraso").length,
            pendencias: m.filter(e => ["Aguardando recebimento", "Aguardando conferência", "Solicitação de devolução"].includes(e.status)).length,
        };
    }, [emprestimos]);

    if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground"><RefreshCw className="animate-spin h-5 w-5 mr-2" /> Carregando...</div>;

    if (!isGestor) return (
        <div className="p-10 text-center text-muted-foreground">
            <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>Você não tem permissão para acessar a Gestão de Empréstimos.</p>
        </div>
    );

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="h-6 w-6 text-primary" /> Gestão de Empréstimos</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Designe ferramentas e materiais aos colaboradores.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={fetchEmprestimos} title="Atualizar"><RefreshCw className="h-4 w-4" /></Button>
                    <Button onClick={() => setNovoOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Novo Empréstimo</Button>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                    { label: "Total", value: stats.total, color: "text-foreground", icon: <Package className="h-4 w-4" /> },
                    { label: "Em Uso", value: stats.emUso, color: "text-green-600", icon: <Wrench className="h-4 w-4" /> },
                    { label: "Em Atraso", value: stats.atrasados, color: "text-red-600", icon: <AlertTriangle className="h-4 w-4" /> },
                    { label: "Pendências", value: stats.pendencias, color: "text-amber-600", icon: <Clock className="h-4 w-4" /> },
                ].map(s => (
                    <Card key={s.label} className="p-4">
                        <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">{s.label}</span><span className={s.color}>{s.icon}</span></div>
                        <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    </Card>
                ))}
            </div>

            <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-48">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Colaborador, OS, material..." className="pl-8" value={filtroTexto} onChange={e => setFiltroTexto(e.target.value)} />
                </div>
                <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Todos">Todos os status</SelectItem>
                        {Object.keys(STATUS_CONFIG).map(s => <SelectItem key={s} value={s}>{STATUS_CONFIG[s as keyof typeof STATUS_CONFIG].label}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            {lista.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground"><Package className="h-10 w-10 mx-auto mb-3 opacity-30" /><p>Nenhum empréstimo encontrado.</p></div>
            ) : (
                <div className="space-y-3">
                    {lista.map(emp => (
                        <EmprestimoCard key={emp.id} emp={emp} expanded={expandedId === emp.id}
                            onToggle={() => setExpandedId(expandedId === emp.id ? null : emp.id)}
                            onConferencia={() => { setTargetEmp(emp); setConferenciaOpen(true); }}
                            onVerHistorico={() => setHistoricId(emp.id)}
                            onExcluir={async () => {
                                if (!confirm(`Excluir o empréstimo de ${emp.colaborador_nome}? Esta ação não pode ser desfeita.`)) return;
                                const { error } = await excluirEmprestimo(emp.id);
                                if (error) { toast({ title: "Erro ao excluir", variant: "destructive" }); return; }
                                toast({ title: "Empréstimo excluído." });
                                fetchEmprestimos();
                            }} />
                    ))}
                </div>
            )}

            <NovoEmprestimoDialog
                open={novoOpen} onClose={() => setNovoOpen(false)}
                onSaved={() => { fetchEmprestimos(); fetchMateriais(); }}
                materiais={materiais} colaboradores={colaboradores}
                companyId={companyId || ""} myProfileId={myProfileId || ""} myNome={myNome} toast={toast}
            />

            <ConferenciaDialog
                open={conferenciaOpen} emp={targetEmp}
                onClose={() => { setConferenciaOpen(false); setTargetEmp(null); }}
                onSaved={() => { fetchEmprestimos(); fetchMateriais(); }}
                myProfileId={myProfileId || ""} myNome={myNome} toast={toast}
            />

            {historicId && <HistoricoDialog emp={emprestimos.find(e => e.id === historicId)} onClose={() => setHistoricId(null)} />}
        </div>
    );
}

// ─── Dialog: Novo Empréstimo (2 passos) ──────────────────────────────────────

function NovoEmprestimoDialog({
    open, onClose, onSaved, materiais, colaboradores, companyId, myProfileId, myNome, toast,
}: any) {
    const [step, setStep] = useState(1);
    const [colaboradorId, setColaboradorId] = useState("");
    const [prazo, setPrazo] = useState("");
    const [observacoes, setObservacoes] = useState("");
    const [buscaMat, setBuscaMat] = useState("");
    const [categoriaFiltro, setCategoriaFiltro] = useState("Todas");
    const [selecionados, setSelecionados] = useState<{ material: any; quantidade: number; estado: string }[]>([]);
    const [saving, setSaving] = useState(false);

    const categorias = useMemo(() => ["Todas", ...Array.from(new Set(materiais.map((m: any) => m.categoria).filter(Boolean)))], [materiais]);

    function reset() {
        setStep(1); setColaboradorId(""); setPrazo(""); setObservacoes("");
        setBuscaMat(""); setCategoriaFiltro("Todas"); setSelecionados([]);
    }

    const materiaisFiltrados = useMemo(() => {
        const q = buscaMat.toLowerCase();
        return materiais.filter((m: any) => {
            const matchCat = categoriaFiltro === "Todas" || m.categoria === categoriaFiltro;
            const matchQ = !q || m.nome.toLowerCase().includes(q) || (m.codigo_material || "").toLowerCase().includes(q);
            return matchCat && matchQ && (m.quantidade_disponivel || 0) > 0;
        });
    }, [materiais, buscaMat, categoriaFiltro]);

    function toggleItem(mat: any) {
        setSelecionados(prev => {
            const idx = prev.findIndex(s => s.material.id === mat.id);
            if (idx >= 0) return prev.filter((_, i) => i !== idx);
            return [...prev, { material: mat, quantidade: 1, estado: "Bom" }];
        });
    }
    function setQtd(matId: string, qtd: number) {
        setSelecionados(prev => prev.map(s => s.material.id === matId ? { ...s, quantidade: Math.max(1, qtd) } : s));
    }
    function setEstado(matId: string, estado: string) {
        setSelecionados(prev => prev.map(s => s.material.id === matId ? { ...s, estado } : s));
    }

    async function handleSalvar() {
        if (!colaboradorId || selecionados.length === 0) return;
        setSaving(true);
        try {
            const colab = colaboradores.find((c: any) => c.id === colaboradorId);
            const { data: emp, error } = await (supabase as any).from("emprestimos").insert({
                company_id: companyId, colaborador_id: colaboradorId, colaborador_nome: colab?.nome || "",
                status: "Aguardando recebimento", prazo_devolucao: prazo || null, observacoes: observacoes || null,
                criado_por_id: myProfileId, criado_por_nome: myNome,
            }).select("id").single();
            if (error || !emp) throw error;

            await (supabase as any).from("emprestimo_itens").insert(selecionados.map(s => ({
                emprestimo_id: emp.id, material_id: s.material.id, material_nome: s.material.nome,
                material_codigo: s.material.codigo_material || null, material_unidade: s.material.unidade || null,
                material_categoria: s.material.categoria || null, quantidade: s.quantidade, estado_conservacao: s.estado,
            })));

            await registrarHistorico(emp.id, null, "Aguardando recebimento", myProfileId, myNome, "Empréstimo criado.");
            toast({ title: "Empréstimo criado com sucesso!", description: `Notificação enviada para ${colab?.nome}.` });
            reset(); onClose(); onSaved();
        } catch { toast({ title: "Erro ao criar empréstimo", variant: "destructive" }); }
        finally { setSaving(false); }
    }

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader><DialogTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" /> Novo Empréstimo — Passo {step} de 2</DialogTitle></DialogHeader>
                <div className="overflow-y-auto flex-1 pr-1">
                    {step === 1 && (
                        <div className="space-y-4 py-2">
                            <div>
                                <label className="text-sm font-medium mb-1.5 block">Colaborador *</label>
                                <Select value={colaboradorId} onValueChange={setColaboradorId}>
                                    <SelectTrigger><SelectValue placeholder={colaboradores.length ? "Selecione o colaborador" : "Nenhum colaborador encontrado"} /></SelectTrigger>
                                    <SelectContent>{colaboradores.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                                </Select>
                                {colaboradores.length === 0 && <p className="text-xs text-amber-600 mt-1">Nenhum colaborador carregado — veja a nota técnica sobre RLS de "profiles".</p>}
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1.5 block">Prazo de devolução</label>
                                <Input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} min={format(new Date(), "yyyy-MM-dd")} />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1.5 block">Observações</label>
                                <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Finalidade do empréstimo, OS relacionada..." rows={3} />
                            </div>
                        </div>
                    )}
                    {step === 2 && (
                        <div className="space-y-3 py-2">
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Nome, código..." className="pl-8" value={buscaMat} onChange={e => setBuscaMat(e.target.value)} />
                                </div>
                                <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
                                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                                    <SelectContent>{categorias.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="rounded-lg border divide-y max-h-56 overflow-y-auto">
                                {materiaisFiltrados.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">Nenhum item disponível.</div>}
                                {materiaisFiltrados.map((m: any) => {
                                    const sel = selecionados.find(s => s.material.id === m.id);
                                    return (
                                        <div key={m.id} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40 ${sel ? "bg-primary/5" : ""}`} onClick={() => toggleItem(m)}>
                                            <Checkbox checked={!!sel} onCheckedChange={() => toggleItem(m)} />
                                            <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{m.nome}</p><p className="text-xs text-muted-foreground">{m.codigo_material && `${m.codigo_material} · `}{m.categoria || "—"}</p></div>
                                            <span className="text-xs text-green-700 font-medium shrink-0">{m.quantidade_disponivel} {m.unidade || ""} disp.</span>
                                        </div>
                                    );
                                })}
                            </div>
                            {selecionados.length > 0 && (
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-2">ITENS SELECIONADOS ({selecionados.length})</p>
                                    <div className="space-y-2">
                                        {selecionados.map(s => (
                                            <div key={s.material.id} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
                                                <span className="text-sm flex-1 truncate">{s.material.nome}</span>
                                                <Input type="number" min={1} max={s.material.quantidade_disponivel} value={s.quantidade}
                                                    onChange={e => setQtd(s.material.id, Number(e.target.value))} className="w-16 h-7 text-sm text-center" />
                                                <span className="text-xs text-muted-foreground">{s.material.unidade || ""}</span>
                                                <Select value={s.estado} onValueChange={v => setEstado(s.material.id, v)}>
                                                    <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                                                    <SelectContent>{ESTADOS_CONSERVACAO.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                                                </Select>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <DialogFooter className="border-t pt-3">
                    {step === 1 ? (
                        <>
                            <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
                            <Button onClick={() => setStep(2)} disabled={!colaboradorId} className="gap-2">Próximo: Selecionar Itens <ArrowRight className="h-4 w-4" /></Button>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
                            <Button onClick={handleSalvar} disabled={saving || selecionados.length === 0} className="gap-2">
                                <CheckCircle className="h-4 w-4" /> {saving ? "Salvando..." : `Confirmar Empréstimo (${selecionados.length})`}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}