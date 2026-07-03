// src/lib/emprestimosShared.tsx
// Núcleo compartilhado do módulo de Empréstimos — usado pelas duas páginas
// (GestaoEmprestimos.tsx e MeusEmprestimos.tsx), mantendo dados/regras num
// só lugar, com as TELAS separadas por perfil de acesso (segurança).

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/use-user-role";
import { format, isPast, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
    Package, CheckCircle, RotateCcw, AlertTriangle, Clock, History,
    Wrench, User, Calendar, ChevronDown, ChevronUp, XCircle, ClipboardCheck, Hammer, Trash2,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type StatusEmprestimo =
    | "Agendado" | "Aguardando recebimento" | "Em uso" | "Solicitação de devolução"
    | "Aguardando conferência" | "Devolvido" | "Em atraso" | "Em manutenção" | "Cancelado";

export type ItemEmprestimo = {
    id: string; material_id: string; material_nome: string;
    material_codigo?: string; material_unidade?: string; material_categoria?: string;
    quantidade: number; estado_conservacao?: string; observacoes_item?: string;
};

export type Historico = {
    id: string; status_anterior?: string; status_novo: string;
    usuario_nome?: string; observacoes?: string; created_at: string;
};

export type Emprestimo = {
    id: string; company_id: string; colaborador_id: string; colaborador_nome?: string;
    os_id?: string; os_codigo?: string; status: StatusEmprestimo;
    data_emprestimo: string; prazo_devolucao?: string;
    data_confirmacao_recebimento?: string; confirmado_por_nome?: string;
    data_solicitacao_devolucao?: string; data_devolucao?: string;
    observacoes?: string; observacoes_conferencia?: string;
    possui_avaria?: boolean; encaminhar_manutencao?: boolean;
    criado_por_nome?: string; created_at: string;
    itens?: ItemEmprestimo[]; historico?: Historico[];
};

export type MaterialDisponivel = {
    id: string; nome: string; codigo_material?: string;
    categoria?: string; unidade?: string; quantidade_disponivel: number;
};

export type ColaboradorOpt = { id: string; nome: string; role?: string };

// ─── Config visual de status ───────────────────────────────────────────────────

export const STATUS_CONFIG: Record<StatusEmprestimo, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    "Agendado": { label: "Agendado", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: <Calendar className="h-3 w-3" /> },
    "Aguardando recebimento": { label: "Ag. Recebimento", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: <Clock className="h-3 w-3" /> },
    "Em uso": { label: "Em Uso", color: "text-green-700", bg: "bg-green-50 border-green-200", icon: <Wrench className="h-3 w-3" /> },
    "Solicitação de devolução": { label: "Sol. Devolução", color: "text-purple-700", bg: "bg-purple-50 border-purple-200", icon: <RotateCcw className="h-3 w-3" /> },
    "Aguardando conferência": { label: "Ag. Conferência", color: "text-orange-700", bg: "bg-orange-50 border-orange-200", icon: <ClipboardCheck className="h-3 w-3" /> },
    "Devolvido": { label: "Devolvido", color: "text-gray-600", bg: "bg-gray-50 border-gray-200", icon: <CheckCircle className="h-3 w-3" /> },
    "Em atraso": { label: "Em Atraso", color: "text-red-700", bg: "bg-red-50 border-red-200", icon: <AlertTriangle className="h-3 w-3" /> },
    "Em manutenção": { label: "Em Manutenção", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200", icon: <Hammer className="h-3 w-3" /> },
    "Cancelado": { label: "Cancelado", color: "text-gray-500", bg: "bg-gray-50 border-gray-200", icon: <XCircle className="h-3 w-3" /> },
};

export const ESTADOS_CONSERVACAO = ["Excelente", "Bom", "Regular", "Desgastado", "Com avaria"];

export function StatusBadge({ status }: { status: StatusEmprestimo }) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["Cancelado"];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
            {cfg.icon}{cfg.label}
        </span>
    );
}

export function fmtData(d?: string | null) {
    if (!d) return "—";
    try { return format(new Date(d), "dd/MM/yyyy", { locale: ptBR }); } catch { return "—"; }
}
export function fmtDataHora(d?: string | null) {
    if (!d) return "—";
    try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return "—"; }
}
export function diasRestantes(prazo?: string | null): number | null {
    if (!prazo) return null;
    try { return differenceInDays(new Date(prazo), new Date()); } catch { return null; }
}
export function computeStatus(emp: Emprestimo): StatusEmprestimo {
    if (emp.status === "Em uso" && emp.prazo_devolucao && isPast(new Date(emp.prazo_devolucao))) return "Em atraso";
    return emp.status;
}

// ─── Hook: contexto do usuário logado ─────────────────────────────────────────

export function useMeuContexto() {
    const { session } = useAuth();
    const { role, loading: roleLoading } = useUserRole();
    const [myProfileId, setMyProfileId] = useState<string | null>(null);
    const [myNome, setMyNome] = useState("");
    const [companyId, setCompanyId] = useState<string | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);

    useEffect(() => {
        if (!session?.user) { setProfileLoading(false); return; }
        (async () => {
            const { data: prof } = await (supabase as any)
                .from("profiles")
                .select("id, company_id, nome")
                .eq("user_id", session.user.id)
                .maybeSingle();
            if (prof) {
                setMyProfileId(prof.id);
                setMyNome(prof.nome || "");
                setCompanyId(prof.company_id);
            }
            setProfileLoading(false);
        })();
    }, [session?.user?.id]);
    // Apenas Administrador acessa a Gestão de Empréstimos
    const isGestor = role === "administrador";


    return { myProfileId, myNome, companyId, isGestor, loading: roleLoading || profileLoading };
}

// ─── Hook: lista de empréstimos ────────────────────────────────────────────────

export function useEmprestimos(companyId: string | null) {
    const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);

    const fetchEmprestimos = useCallback(async () => {
        if (!companyId) return;
        const { data, error } = await (supabase as any)
            .from("emprestimos")
            .select(`*, itens:emprestimo_itens(*), historico:emprestimo_historico(*)`)
            .eq("company_id", companyId)
            .order("created_at", { ascending: false });
        if (error) { console.error("[Emprestimos] erro ao buscar:", error.message); return; }
        if (data) setEmprestimos(data);
    }, [companyId]);

    useEffect(() => { fetchEmprestimos(); }, [fetchEmprestimos]);

    return { emprestimos, fetchEmprestimos };
}

// ─── Hook: colaboradores (para o seletor do gestor) ───────────────────────────

export function useColaboradores(companyId: string | null) {
    const [colaboradores, setColaboradores] = useState<ColaboradorOpt[]>([]);
    useEffect(() => {
        if (!companyId) return;
        (async () => {
            const { data, error } = await (supabase as any)
                .from("profiles")
                .select("id, nome")
                .eq("company_id", companyId)
                .order("nome");
            if (error) { console.error("[Emprestimos] erro colaboradores:", error.message); return; }
            if (data) setColaboradores(data.map((p: any) => ({ id: p.id, nome: p.nome || "—" })));
        })();
    }, [companyId]);
    return colaboradores;
}

// ─── Hook: materiais disponíveis (Materiais + Estoque + empenhado em OS) ──────
// Mesma lógica de disponibilidade usada em Estoque.tsx: total do estoque menos
// o que já está empenhado em O.S. com orçamento aprovado.

export function useMateriaisDisponiveis(companyId: string | null) {
    const [materiais, setMateriais] = useState<MaterialDisponivel[]>([]);

    const fetchMateriais = useCallback(async () => {
        if (!companyId) return;
        const [matsRes, estoqueRes, osMatRes] = await Promise.all([
            (supabase as any).from("materiais")
                .select("id, codigo, descricao, unidade, valor_unitario, tipo_sistema")
                .eq("company_id", companyId).eq("status", "ativo").order("descricao"),
            (supabase as any).from("estoque")
                .select("material_id, quantidade_disponivel")
                .eq("company_id", companyId),
            (supabase as any).from("materiais_os")
                .select("material_id, quantidade, ordens_servico!inner(company_id, orcamento_status)")
                .eq("ordens_servico.company_id", companyId)
                .eq("ordens_servico.orcamento_status", "aprovado"),
        ]);

        if (matsRes.error) { console.error("[Emprestimos] erro materiais:", matsRes.error.message); return; }

        const estoqueMap: Record<string, number> = {};
        (estoqueRes.data || []).forEach((e: any) => { estoqueMap[e.material_id] = Number(e.quantidade_disponivel || 0); });

        const empenhado: Record<string, number> = {};
        (osMatRes.data || []).forEach((m: any) => {
            if (m.material_id) empenhado[m.material_id] = (empenhado[m.material_id] || 0) + Number(m.quantidade || 0);
        });

        const lista: MaterialDisponivel[] = (matsRes.data || []).map((m: any) => {
            const total = estoqueMap[m.id] || 0;
            const emp = empenhado[m.id] || 0;
            return {
                id: m.id,
                nome: m.descricao,
                codigo_material: m.codigo,
                categoria: m.tipo_sistema || "Geral",
                unidade: m.unidade,
                quantidade_disponivel: Math.max(total - emp, 0),
            };
        });
        setMateriais(lista);
    }, [companyId]);

    useEffect(() => { fetchMateriais(); }, [fetchMateriais]);

    return { materiais, fetchMateriais };
}

// ─── Registrar histórico ────────────────────────────────────────────────────
export async function excluirEmprestimo(empId: string): Promise<{ error: any }> {
    // O cascade delete no banco já remove itens e histórico junto (on delete cascade)
    const { error } = await (supabase as any).from("emprestimos").delete().eq("id", empId);
    return { error };
}
export async function registrarHistorico(
    empId: string, statusAnterior: string | null, statusNovo: string,
    usuarioId: string, usuarioNome: string, observacoes?: string,
) {
    await (supabase as any).from("emprestimo_historico").insert({
        emprestimo_id: empId, status_anterior: statusAnterior, status_novo: statusNovo,
        usuario_id: usuarioId, usuario_nome: usuarioNome, observacoes: observacoes || null,
    });
}

// ─── Card: visão do gestor ──────────────────────────────────────────────────

export function EmprestimoCard({
    emp, expanded, onToggle, onConferencia, onVerHistorico, onExcluir,
}: {
    emp: Emprestimo; expanded: boolean; onToggle: () => void;
    onConferencia: () => void; onVerHistorico: () => void; onExcluir: () => void;
}) {
    const dias = diasRestantes(emp.prazo_devolucao);
    const atrasado = emp.status === "Em atraso";
    return (
        <Card className={`border ${atrasado ? "border-red-200 bg-red-50/30" : ""}`}>
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            <StatusBadge status={emp.status} />
                            {emp.os_codigo && <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">OS {emp.os_codigo}</span>}
                        </div>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <User className="h-4 w-4 text-primary shrink-0" />{emp.colaborador_nome || "—"}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                            <span>Empréstimo: {fmtDataHora(emp.data_emprestimo)}</span>
                            {emp.prazo_devolucao && (
                                <span className={atrasado ? "text-red-600 font-medium" : ""}>
                                    Prazo: {fmtData(emp.prazo_devolucao)}
                                    {dias !== null && !atrasado && dias <= 3 && ` (${dias}d)`}
                                    {atrasado && ` (${Math.abs(dias || 0)}d em atraso)`}
                                </span>
                            )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                            {(emp.itens || []).slice(0, 3).map(it => (
                                <span key={it.id} className="text-xs bg-muted rounded px-1.5 py-0.5">{it.material_nome} ({it.quantidade} {it.material_unidade || ""})</span>
                            ))}
                            {(emp.itens || []).length > 3 && <span className="text-xs text-muted-foreground">+{(emp.itens || []).length - 3} itens</span>}
                        </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                        {emp.status === "Aguardando conferência" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-green-700 border-green-300 hover:bg-green-50" onClick={onConferencia}>
                                <ClipboardCheck className="h-3 w-3" /> Conferir
                            </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onVerHistorico}><History className="h-3 w-3" /> Histórico</Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onToggle}>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button>
                    </div>
                </div>
                {expanded && (
                    <div className="mt-4 pt-4 border-t space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                            {emp.data_confirmacao_recebimento && <div><span className="text-muted-foreground">Recebido em:</span> {fmtDataHora(emp.data_confirmacao_recebimento)}{emp.confirmado_por_nome && ` (${emp.confirmado_por_nome})`}</div>}
                            {emp.data_solicitacao_devolucao && <div><span className="text-muted-foreground">Sol. devolução:</span> {fmtDataHora(emp.data_solicitacao_devolucao)}</div>}
                            {emp.data_devolucao && <div><span className="text-muted-foreground">Devolvido em:</span> {fmtDataHora(emp.data_devolucao)}</div>}
                            {emp.observacoes && <div className="sm:col-span-2"><span className="text-muted-foreground">Obs:</span> {emp.observacoes}</div>}
                            {emp.observacoes_conferencia && <div className="sm:col-span-2"><span className="text-muted-foreground">Obs. conferência:</span> {emp.observacoes_conferencia}</div>}
                            {emp.possui_avaria && <div className="text-amber-700 font-medium">⚠ Avaria registrada</div>}
                            {emp.encaminhar_manutencao && <div className="text-orange-700 font-medium">🔧 Encaminhado para manutenção</div>}
                        </div>
                        <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">ITENS</p>
                            <div className="rounded-lg border overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50"><tr>
                                        <th className="text-left px-3 py-2 font-medium text-xs">Material</th>
                                        <th className="text-center px-3 py-2 font-medium text-xs">Qtd</th>
                                        <th className="text-center px-3 py-2 font-medium text-xs">Conservação</th>
                                        <th className="text-left px-3 py-2 font-medium text-xs">Categoria</th>
                                    </tr></thead>
                                    <tbody>
                                        {(emp.itens || []).map(it => (
                                            <tr key={it.id} className="border-t">
                                                <td className="px-3 py-1.5"><div>{it.material_nome}</div>{it.material_codigo && <div className="text-xs text-muted-foreground">{it.material_codigo}</div>}</td>
                                                <td className="px-3 py-1.5 text-center">{it.quantidade} {it.material_unidade || ""}</td>
                                                <td className="px-3 py-1.5 text-center">{it.estado_conservacao || "—"}</td>
                                                <td className="px-3 py-1.5 text-muted-foreground">{it.material_categoria || "—"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="flex justify-end pt-1">
                            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={onExcluir}>
                                <Trash2 className="h-3.5 w-3.5" /> Excluir empréstimo
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ─── Card: visão do colaborador ─────────────────────────────────────────────

export function MeuEmprestimoCard({
    emp, onConfirmarRecebimento, onSolicitarDevolucao, onVerHistorico,
}: {
    emp: Emprestimo; onConfirmarRecebimento: () => void; onSolicitarDevolucao: () => void; onVerHistorico: () => void;
}) {
    const dias = diasRestantes(emp.prazo_devolucao);
    const atrasado = emp.status === "Em atraso";
    return (
        <Card className={`border ${atrasado ? "border-red-200 bg-red-50/30" : ""}`}>
            <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <StatusBadge status={emp.status} />
                        <p className="text-xs text-muted-foreground">
                            Empréstimo em {fmtData(emp.data_emprestimo)}
                            {emp.prazo_devolucao && (
                                <span className={atrasado ? " text-red-600 font-medium" : ""}>
                                    {" · "}Prazo: {fmtData(emp.prazo_devolucao)}
                                    {dias !== null && !atrasado && dias >= 0 && ` (${dias}d restante${dias !== 1 ? "s" : ""})`}
                                    {atrasado && ` (${Math.abs(dias || 0)}d em atraso)`}
                                </span>
                            )}
                        </p>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 shrink-0" onClick={onVerHistorico}><History className="h-3 w-3" /> Histórico</Button>
                </div>
                <div className="rounded-lg border divide-y">
                    {(emp.itens || []).map(it => (
                        <div key={it.id} className="flex items-center gap-3 px-3 py-2">
                            <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{it.material_nome}</p>{it.material_codigo && <p className="text-xs text-muted-foreground">{it.material_codigo}</p>}</div>
                            <span className="text-sm text-muted-foreground shrink-0">{it.quantidade} {it.material_unidade || ""}</span>
                        </div>
                    ))}
                </div>
                {emp.observacoes && <p className="text-sm text-muted-foreground italic">{emp.observacoes}</p>}
                <div className="flex flex-wrap gap-2">
                    {emp.status === "Aguardando recebimento" && (
                        <Button size="sm" className="gap-1.5" onClick={onConfirmarRecebimento}><CheckCircle className="h-3.5 w-3.5" /> Confirmar Recebimento</Button>
                    )}
                    {(emp.status === "Em uso" || emp.status === "Em atraso") && (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={onSolicitarDevolucao}><RotateCcw className="h-3.5 w-3.5" /> Solicitar Devolução</Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

// ─── Dialog: confirmação de recebimento (colaborador) ──────────────────────

export function RecebimentoDialog({
    open, emp, onClose, onConfirmar, saving,
}: { open: boolean; emp: Emprestimo | null; onClose: () => void; onConfirmar: () => void; saving: boolean }) {
    return (
        <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Confirmar Recebimento</DialogTitle>
                    <DialogDescription>Ao confirmar, você declara ter recebido os itens abaixo em bom estado e assume a responsabilidade pela sua guarda e uso correto.</DialogDescription>
                </DialogHeader>
                {emp && (
                    <div className="space-y-3 py-2">
                        <div className="rounded-lg border p-3 space-y-1.5">
                            {(emp.itens || []).map(it => (
                                <div key={it.id} className="flex items-center gap-2 text-sm">
                                    <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="font-medium">{it.material_nome}</span>
                                    <span className="text-muted-foreground ml-auto">{it.quantidade} {it.material_unidade || ""}</span>
                                </div>
                            ))}
                        </div>
                        {emp.prazo_devolucao && <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Prazo de devolução: <strong>{fmtData(emp.prazo_devolucao)}</strong></p>}
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={onConfirmar} disabled={saving} className="gap-2"><CheckCircle className="h-4 w-4" /> Confirmar Recebimento</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Dialog: conferência de devolução (gestor) ──────────────────────────────

export function ConferenciaDialog({
    open, emp, onClose, onSaved, myProfileId, myNome, toast,
}: { open: boolean; emp: Emprestimo | null; onClose: () => void; onSaved: () => void; myProfileId: string; myNome: string; toast: any }) {
    const [avaria, setAvaria] = useState(false);
    const [manutencao, setManutencao] = useState(false);
    const [observacoes, setObservacoes] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => { if (open) { setAvaria(false); setManutencao(false); setObservacoes(""); } }, [open]);

    async function handleConfirmar() {
        if (!emp) return;
        setSaving(true);
        const novoStatus: StatusEmprestimo = manutencao ? "Em manutenção" : "Devolvido";
        try {
            await (supabase as any).from("emprestimos").update({
                status: novoStatus, data_devolucao: new Date().toISOString(),
                observacoes_conferencia: observacoes || null, possui_avaria: avaria, encaminhar_manutencao: manutencao,
                updated_at: new Date().toISOString(),
            }).eq("id", emp.id);
            await registrarHistorico(emp.id, emp.status, novoStatus, myProfileId, myNome,
                observacoes || (novoStatus === "Devolvido" ? "Devolução confirmada sem avarias." : "Encaminhado para manutenção."));
            toast({ title: novoStatus === "Devolvido" ? "Devolução confirmada!" : "Item encaminhado para manutenção." });
            onClose(); onSaved();
        } catch { toast({ title: "Erro ao registrar conferência", variant: "destructive" }); }
        finally { setSaving(false); }
    }

    if (!emp) return null;
    return (
        <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" /> Conferência de Devolução</DialogTitle>
                    <DialogDescription>Colaborador: <strong>{emp.colaborador_nome}</strong></DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="rounded-lg border p-3 space-y-1.5">
                        {(emp.itens || []).map(it => (
                            <div key={it.id} className="flex items-center gap-2 text-sm">
                                <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span>{it.material_nome}</span>
                                <span className="ml-auto text-muted-foreground">{it.quantidade} {it.material_unidade || ""}</span>
                            </div>
                        ))}
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2"><Checkbox id="avaria" checked={avaria} onCheckedChange={v => setAvaria(!!v)} /><label htmlFor="avaria" className="text-sm cursor-pointer">Avaria identificada</label></div>
                        <div className="flex items-center gap-2"><Checkbox id="manut" checked={manutencao} onCheckedChange={v => setManutencao(!!v)} /><label htmlFor="manut" className="text-sm cursor-pointer">Encaminhar para manutenção</label></div>
                    </div>
                    <div><label className="text-sm font-medium mb-1.5 block">Observações da conferência</label>
                        <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Estado dos itens, avarias encontradas..." rows={3} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleConfirmar} disabled={saving} className={manutencao ? "bg-orange-600 hover:bg-orange-700" : ""}>
                        {saving ? "Salvando..." : manutencao ? "Confirmar + Enviar para Manutenção" : "Confirmar Devolução"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Dialog: histórico (ambas as telas) ─────────────────────────────────────

export function HistoricoDialog({ emp, onClose }: { emp: Emprestimo | undefined; onClose: () => void }) {
    const historico = [...(emp?.historico || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return (
        <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Histórico do Empréstimo</DialogTitle>
                    {emp && <DialogDescription>{emp.colaborador_nome}</DialogDescription>}
                </DialogHeader>
                <div className="space-y-3 max-h-80 overflow-y-auto py-2">
                    {historico.length === 0 && <p className="text-center text-muted-foreground text-sm py-6">Sem histórico registrado.</p>}
                    {historico.map((h, i) => (
                        <div key={h.id} className="flex gap-3">
                            <div className="flex flex-col items-center">
                                <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                                {i < historico.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                            </div>
                            <div className="pb-3 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap"><StatusBadge status={h.status_novo as StatusEmprestimo} /><span className="text-xs text-muted-foreground">{fmtDataHora(h.created_at)}</span></div>
                                {h.usuario_nome && <p className="text-xs text-muted-foreground mt-0.5">por {h.usuario_nome}</p>}
                                {h.observacoes && <p className="text-sm mt-1">{h.observacoes}</p>}
                            </div>
                        </div>
                    ))}
                </div>
                <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}