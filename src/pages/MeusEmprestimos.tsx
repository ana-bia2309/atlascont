// src/pages/MeusEmprestimos.tsx
// Tela do COLABORADOR — vê só os próprios empréstimos, confirma recebimento
// e solicita devolução. Não tem acesso a criar/gerenciar empréstimos de outros.

import React, { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { RefreshCw, Wrench } from "lucide-react";
import {
  useMeuContexto, useEmprestimos, registrarHistorico, computeStatus,
  MeuEmprestimoCard, RecebimentoDialog, HistoricoDialog, Emprestimo,
} from "@/lib/emprestimosShared";

export default function MeusEmprestimos() {
  const { toast } = useToast();
  const { myProfileId, myNome, companyId, loading } = useMeuContexto();
  const { emprestimos, fetchEmprestimos } = useEmprestimos(companyId);

  const [recebimentoOpen, setRecebimentoOpen] = useState(false);
  const [historicId, setHistoricId] = useState<string | null>(null);
  const [targetEmp, setTargetEmp] = useState<Emprestimo | null>(null);
  const [saving, setSaving] = useState(false);

  const meus = useMemo(() => emprestimos
    .map(e => ({ ...e, status: computeStatus(e) }))
    .filter(e => e.colaborador_id === myProfileId),
    [emprestimos, myProfileId]);

  const ativos = meus.filter(e => !["Devolvido", "Cancelado"].includes(e.status));
  const historico = meus.filter(e => ["Devolvido", "Cancelado"].includes(e.status));

  async function handleConfirmarRecebimento() {
    if (!targetEmp) return;
    setSaving(true);
    try {
      await (supabase as any).from("emprestimos").update({
        status: "Em uso", data_confirmacao_recebimento: new Date().toISOString(),
        confirmado_por_id: myProfileId, confirmado_por_nome: myNome, updated_at: new Date().toISOString(),
      }).eq("id", targetEmp.id);
      await registrarHistorico(targetEmp.id, "Aguardando recebimento", "Em uso", myProfileId || "", myNome, "Recebimento confirmado pelo colaborador.");
      toast({ title: "Recebimento confirmado!" });
      setRecebimentoOpen(false); setTargetEmp(null);
      fetchEmprestimos();
    } catch { toast({ title: "Erro ao confirmar recebimento", variant: "destructive" }); }
    finally { setSaving(false); }
  }

  async function handleSolicitarDevolucao(emp: Emprestimo) {
    await (supabase as any).from("emprestimos").update({
      status: "Aguardando conferência", data_solicitacao_devolucao: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", emp.id);
    await registrarHistorico(emp.id, emp.status, "Aguardando conferência", myProfileId || "", myNome, "Devolução solicitada pelo colaborador.");
    toast({ title: "Solicitação de devolução enviada." });
    fetchEmprestimos();
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground"><RefreshCw className="animate-spin h-5 w-5 mr-2" /> Carregando...</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="h-6 w-6 text-primary" /> Meus Empréstimos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Ferramentas e materiais sob sua responsabilidade.</p>
        </div>
        <Button variant="outline" size="icon" onClick={fetchEmprestimos} title="Atualizar"><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {ativos.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Wrench className="h-10 w-10 mx-auto mb-3 opacity-30" /><p>Você não possui empréstimos ativos no momento.</p></div>
      ) : (
        <div className="space-y-3">
          {ativos.map(emp => (
            <MeuEmprestimoCard key={emp.id} emp={emp}
              onConfirmarRecebimento={() => { setTargetEmp(emp); setRecebimentoOpen(true); }}
              onSolicitarDevolucao={() => handleSolicitarDevolucao(emp)}
              onVerHistorico={() => setHistoricId(emp.id)} />
          ))}
        </div>
      )}

      {historico.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2 mt-6">Histórico</h2>
          <div className="space-y-3 opacity-80">
            {historico.map(emp => (
              <MeuEmprestimoCard key={emp.id} emp={emp}
                onConfirmarRecebimento={() => {}} onSolicitarDevolucao={() => {}}
                onVerHistorico={() => setHistoricId(emp.id)} />
            ))}
          </div>
        </div>
      )}

      <RecebimentoDialog
        open={recebimentoOpen} emp={targetEmp}
        onClose={() => { setRecebimentoOpen(false); setTargetEmp(null); }}
        onConfirmar={handleConfirmarRecebimento} saving={saving}
      />

      {historicId && <HistoricoDialog emp={emprestimos.find(e => e.id === historicId)} onClose={() => setHistoricId(null)} />}
    </div>
  );
}