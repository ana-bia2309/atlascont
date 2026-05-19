import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, RefreshCw, Clock } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";

type SlaDefinicao = {
  id: string;
  tipo_servico: string;
  prioridade: string;
  prazo_horas: number;
  descricao: string | null;
};

const PRIORIDADE_OPTIONS = ["Baixa", "Média", "Alta", "Crítica"];
const TIPO_OPTIONS = ["Elétrica", "Hidráulica", "Civil", "Climatização", "Outros"];

export default function SlaDefinicoes() {
  const { can } = usePermissions();
  const [items, setItems] = useState<SlaDefinicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SlaDefinicao | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [tipoServico, setTipoServico] = useState("Elétrica");
  const [prioridade, setPrioridade] = useState("Média");
  const [prazoMeses, setPrazoMeses] = useState("0");
  const [prazoDias, setPrazoDias] = useState("0");
  const [prazoHoras, setPrazoHoras] = useState("0");
  const [descricao, setDescricao] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase.from("sla_definicoes" as any).select("*").order("tipo_servico") as any);
    if (error) {
      toast({ title: "Erro ao carregar SLAs", description: error.message, variant: "destructive" });
    } else {
      setItems(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => {
    setTipoServico("Elétrica"); setPrioridade("Média"); setPrazoMeses("0"); setPrazoDias("0"); setPrazoHoras("0"); setDescricao(""); setEditing(null);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (item: SlaDefinicao) => {
    setEditing(item);
    setTipoServico(item.tipo_servico);
    setPrioridade(item.prioridade);
    // Decompose prazo_horas into months, days, hours
    const totalHoras = item.prazo_horas;
    const meses = Math.floor(totalHoras / 720);
    const remainAfterMonths = totalHoras % 720;
    const dias = Math.floor(remainAfterMonths / 24);
    const horas = remainAfterMonths % 24;
    setPrazoMeses(String(meses));
    setPrazoDias(String(dias));
    setPrazoHoras(String(horas));
    setDescricao(item.descricao || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editing && !can("sla.criar")) { toast({ title: "Sem permissão para criar", variant: "destructive" }); return; }
    if (editing && !can("sla.editar")) { toast({ title: "Sem permissão para editar", variant: "destructive" }); return; }
    const m = parseInt(prazoMeses) || 0;
    const d = parseInt(prazoDias) || 0;
    const h = parseInt(prazoHoras) || 0;
    const totalHoras = m * 720 + d * 24 + h;
    if (!tipoServico.trim() || totalHoras <= 0) {
      toast({ title: "Preencha todos os campos e defina um prazo maior que zero", variant: "destructive" });
      return;
    }

    const payload = {
      tipo_servico: tipoServico.trim(),
      prioridade,
      prazo_horas: totalHoras,
      descricao: descricao.trim() || null,
    };

    if (editing) {
      const { error } = await (supabase.from("sla_definicoes" as any).update(payload).eq("id", editing.id) as any);
      if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "SLA atualizado" });
    } else {
      const { error } = await (supabase.from("sla_definicoes" as any).insert(payload) as any);
      if (error) { toast({ title: "Erro ao criar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "SLA criado" });
    }

    setDialogOpen(false); resetForm(); fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    if (!can("sla.excluir")) { toast({ title: "Sem permissão para excluir", variant: "destructive" }); setDeleteId(null); return; }
    const { error } = await (supabase.from("sla_definicoes" as any).delete().eq("id", deleteId) as any);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); }
    else { toast({ title: "SLA excluído" }); fetchData(); }
    setDeleteId(null);
  };

  const formatHoras = (h: number) => {
    const meses = Math.floor(h / 720);
    const remainAfterMonths = h % 720;
    const dias = Math.floor(remainAfterMonths / 24);
    const horas = remainAfterMonths % 24;
    const parts: string[] = [];
    if (meses > 0) parts.push(`${meses} ${meses === 1 ? "mês" : "meses"}`);
    if (dias > 0) parts.push(`${dias}d`);
    if (horas > 0 || parts.length === 0) parts.push(`${horas}h`);
    return parts.join(" ");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Definições de SLA</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchData} title="Atualizar">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          {can("sla.criar") && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Novo SLA
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma definição de SLA cadastrada.</p>
      ) : (
        <div className="rounded-lg border bg-card overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo de Serviço</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-[100px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.tipo_servico}</TableCell>
                  <TableCell>
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border",
                      item.prioridade === "Baixa" && "bg-zinc-100 text-zinc-600 border-zinc-200",
                      item.prioridade === "Média" && "bg-blue-50 text-blue-700 border-blue-200",
                      item.prioridade === "Alta" && "bg-amber-50 text-amber-700 border-amber-200",
                      item.prioridade === "Crítica" && "bg-red-50 text-red-700 border-red-200",
                    )}>
                      {item.prioridade}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-sm">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatHoras(item.prazo_horas)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{item.descricao || "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      {can("sla.editar") && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(item)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {can("sla.excluir") && (
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(item.id)} title="Excluir">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar SLA" : "Nova Definição de SLA"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Tipo de Serviço</label>
              <Select value={tipoServico} onValueChange={setTipoServico}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Prioridade</label>
              <Select value={prioridade} onValueChange={setPrioridade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORIDADE_OPTIONS.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Prazo</label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-0.5 block">Meses</label>
                  <Input type="number" value={prazoMeses} onChange={(e) => setPrazoMeses(e.target.value)} placeholder="0" min="0" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-0.5 block">Dias</label>
                  <Input type="number" value={prazoDias} onChange={(e) => setPrazoDias(e.target.value)} placeholder="0" min="0" max="29" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-0.5 block">Horas</label>
                  <Input type="number" value={prazoHoras} onChange={(e) => setPrazoHoras(e.target.value)} placeholder="0" min="0" max="23" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Total: {formatHoras((parseInt(prazoMeses) || 0) * 720 + (parseInt(prazoDias) || 0) * 24 + (parseInt(prazoHoras) || 0))}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição (opcional)</label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Elétrica crítica - 4 horas" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir definição de SLA?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
