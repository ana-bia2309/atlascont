import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, ClipboardList, RefreshCw } from "@/lib/icons";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Aprovacao = {
  id: string;
  os_id: string;
  titulo: string | null;
  mensagem: string | null;
  created_at: string;
  read: boolean;
  os: {
    codigo_os: string;
    status: string;
    bloco_nome: string | null;
    equipamentos: string | null;
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

export default function Aprovacoes() {
  const [aprovacoes, setAprovacoes] = useState<Aprovacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Aprovacao | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [action, setAction] = useState<"aprovar" | "reprovar" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const getProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile }: any = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
      if (profile?.id) setProfileId(profile.id);
    };
    getProfile();
  }, []);

  const fetchData = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);

    const { data: notifs, error } = await (supabase as any)
      .from("os_notifications")
      .select("id, os_id, titulo, mensagem, created_at, read")
      .eq("user_id", profileId)
      .eq("tipo", "orcamento")
      .eq("read", false)
      .order("created_at", { ascending: false });

    if (error) { toast({ title: "Erro ao carregar aprovações", variant: "destructive" }); setLoading(false); return; }

    // Busca detalhes das OS e materiais
    const enriched = await Promise.all((notifs || []).map(async (n: any) => {
      const [osRes, matRes] = await Promise.all([
        (supabase as any).from("ordens_servico").select("codigo_os, status, bloco_nome, equipamentos").eq("id", n.os_id).single(),
        (supabase as any).from("materiais_os").select("*").eq("os_id", n.os_id),
      ]);
      return { ...n, os: osRes.data || null, materiais: matRes.data || [] };
    }));

    setAprovacoes(enriched);
    setLoading(false);
  }, [profileId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAction = async () => {
    if (!selected) return;
    if (!justificativa.trim()) {
      toast({ title: "Justificativa obrigatória", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const novoStatus = action === "aprovar" ? "Orçamento Aprovado" : "Orçamento Reprovado";

      // Atualiza status da OS e orcamento_status
await (supabase as any)
  .from("ordens_servico")
  .update({
    status: novoStatus,
    observacoes_fiscais: justificativa.trim(),
    orcamento_status: action === "aprovar" ? "aprovado" : "reprovado",
  })
  .eq("id", selected.os_id);

      // Marca notificação como lida
      await (supabase as any)
        .from("os_notifications")
        .update({ read: true })
        .eq("id", selected.id);

      toast({
        title: action === "aprovar" ? "Orçamento aprovado!" : "Orçamento reprovado!",
        description: `O.S. ${selected.os?.codigo_os} atualizada.`,
      });

      setSelected(null);
      setJustificativa("");
      setAction(null);
      fetchData();
    } catch (e: any) {
      toast({ title: "Erro ao processar", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Aprovações de Orçamento</h1>
            <p className="text-sm text-muted-foreground">Orçamentos aguardando sua aprovação</p>
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : aprovacoes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>Nenhum orçamento pendente de aprovação.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {aprovacoes.map(a => (
            <Card key={a.id} className="border-amber-200">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-amber-600" />
                    O.S. {a.os?.codigo_os || "—"}
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                      Aguardando aprovação
                    </Badge>
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(a.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {a.os?.bloco_nome && <p className="text-sm text-muted-foreground">Local: {a.os.bloco_nome}</p>}
                {a.mensagem && <p className="text-sm">{a.mensagem}</p>}

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

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-300 text-red-700 hover:bg-red-50"
                    onClick={() => { setSelected(a); setAction("reprovar"); setJustificativa(""); }}
                  >
                    <XCircle className="h-4 w-4 mr-1" /> Reprovar
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => { setSelected(a); setAction("aprovar"); setJustificativa(""); }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setJustificativa(""); setAction(null); } }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {action === "aprovar" ? "Aprovar Orçamento" : "Reprovar Orçamento"} — O.S. {selected?.os?.codigo_os}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">
                Justificativa <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={justificativa}
                onChange={e => setJustificativa(e.target.value)}
                placeholder={action === "aprovar" ? "Descreva o motivo da aprovação..." : "Descreva o motivo da reprovação..."}
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setSelected(null); setJustificativa(""); setAction(null); }}>
                Cancelar
              </Button>
              <Button
                onClick={handleAction}
                disabled={submitting || !justificativa.trim()}
                className={action === "aprovar" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}
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