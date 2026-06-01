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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Plus, Trash2, RefreshCw, Search, DollarSign, AlertTriangle, CheckCircle2, X, Pencil, Upload, Download } from "@/lib/icons";
import { format, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type Boleto = {
  id: string;
  descricao: string;
  favorecido: string | null;
  cpf_cnpj: string | null;
  valor: number;
  data_vencimento: string;
  status: string;
  observacoes: string | null;
  data_pagamento: string | null;
  valor_pago: number | null;
  comprovante_url: string | null;
  created_at: string;
};

const STATUS_OPTIONS = [
  { value: "pendente", label: "🟡 Pendente", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "pago", label: "✅ Pago", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "vencido", label: "🔴 Vencido", color: "bg-red-50 text-red-700 border-red-200" },
  { value: "cancelado", label: "⛔ Cancelado", color: "bg-zinc-100 text-zinc-600 border-zinc-200" },
];

const emptyForm = {
  descricao: "", favorecido: "", cpf_cnpj: "", valor: "",
  data_vencimento: "", observacoes: "",
};

export default function Boletos() {
  const { companyId } = useCompany();
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterSearch, setFilterSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Boleto | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Pagamento dialog
  const [pagamentoDialog, setPagamentoDialog] = useState(false);
  const [pagamentoBoleto, setPagamentoBoleto] = useState<Boleto | null>(null);
  const [dataPagamento, setDataPagamento] = useState(format(new Date(), "yyyy-MM-dd"));
  const [valorPago, setValorPago] = useState("");
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [pagamentoSaving, setPagamentoSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("boletos").select("*").eq("company_id", companyId)
      .order("data_vencimento", { ascending: true });
    if (error) toast({ title: "Erro ao carregar boletos", variant: "destructive" });
    else {
      // Auto-update vencidos
      const hoje = new Date().toISOString().slice(0, 10);
      const updated = (data || []).map((b: Boleto) => ({
        ...b,
        status: b.status === "pendente" && b.data_vencimento < hoje ? "vencido" : b.status,
      }));
      setBoletos(updated);
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const stats = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    const em7dias = new Date();
    em7dias.setDate(em7dias.getDate() + 7);
    const em7diasStr = em7dias.toISOString().slice(0, 10);
    return {
      total: boletos.length,
      pendentes: boletos.filter(b => b.status === "pendente").length,
      vencidos: boletos.filter(b => b.status === "vencido").length,
      vencendo: boletos.filter(b => b.status === "pendente" && b.data_vencimento <= em7diasStr && b.data_vencimento >= hoje).length,
      totalPendente: boletos.filter(b => ["pendente", "vencido"].includes(b.status)).reduce((s, b) => s + b.valor, 0),
    };
  }, [boletos]);

  const filtered = useMemo(() => {
    return boletos.filter(b => {
      if (filterStatus !== "todos" && b.status !== filterStatus) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase();
        if (!(b.descricao || "").toLowerCase().includes(q) &&
            !(b.favorecido || "").toLowerCase().includes(q) &&
            !(b.cpf_cnpj || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [boletos, filterStatus, filterSearch]);

  const handleSave = async () => {
    if (!form.descricao.trim() || !form.valor || !form.data_vencimento) {
      toast({ title: "Preencha descrição, valor e vencimento", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        company_id: companyId,
        descricao: form.descricao.trim(),
        favorecido: form.favorecido.trim() || null,
        cpf_cnpj: form.cpf_cnpj.trim() || null,
        valor: Number(form.valor),
        data_vencimento: form.data_vencimento,
        observacoes: form.observacoes.trim() || null,
        status: "pendente",
        created_by: user?.id,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        await (supabase as any).from("boletos").update(payload).eq("id", editing.id);
        toast({ title: "Boleto atualizado!" });
      } else {
        await (supabase as any).from("boletos").insert(payload);
        toast({ title: "Boleto cadastrado!" });
      }
      setDialogOpen(false); setEditing(null); setForm(emptyForm); fetchData();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja excluir este boleto?")) return;
    await (supabase as any).from("boletos").delete().eq("id", id);
    toast({ title: "Boleto excluído" }); fetchData();
  };

  const handleMarcarPago = async () => {
    if (!pagamentoBoleto) return;
    if (!dataPagamento) { toast({ title: "Informe a data de pagamento", variant: "destructive" }); return; }
    setPagamentoSaving(true);
    try {
      let comprovante_url = null;
      let comprovante_path = null;

      if (comprovanteFile) {
        const ext = comprovanteFile.name.split(".").pop();
        const path = `boletos/${companyId}/${pagamentoBoleto.id}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("attachments").upload(path, comprovanteFile, { upsert: true });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(path);
          comprovante_url = urlData.publicUrl;
          comprovante_path = path;
        }
      }

      await (supabase as any).from("boletos").update({
        status: "pago",
        data_pagamento: dataPagamento,
        valor_pago: valorPago ? Number(valorPago) : pagamentoBoleto.valor,
        comprovante_url,
        updated_at: new Date().toISOString(),
      }).eq("id", pagamentoBoleto.id);

      toast({ title: "Pagamento registrado!" });
      setPagamentoDialog(false); setPagamentoBoleto(null); setValorPago(""); setComprovanteFile(null);
      fetchData();
    } catch (e: any) {
      toast({ title: "Erro ao registrar pagamento", description: e.message, variant: "destructive" });
    } finally {
      setPagamentoSaving(false);
    }
  };

  const openEdit = (b: Boleto) => {
    setEditing(b);
    setForm({
      descricao: b.descricao, favorecido: b.favorecido || "", cpf_cnpj: b.cpf_cnpj || "",
      valor: b.valor.toString(), data_vencimento: b.data_vencimento, observacoes: b.observacoes || "",
    });
    setDialogOpen(true);
  };

  const getStatusBadge = (b: Boleto) => {
    const opt = STATUS_OPTIONS.find(o => o.value === b.status);
    const hoje = new Date().toISOString().slice(0, 10);
    const dias = differenceInDays(parseISO(b.data_vencimento), new Date());
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="outline" className={cn("text-xs", opt?.color)}>{opt?.label || b.status}</Badge>
        {b.status === "pendente" && dias <= 7 && dias >= 0 && (
          <span className="text-[10px] text-amber-600 font-medium">⚠️ Vence em {dias === 0 ? "hoje" : `${dias}d`}</span>
        )}
        {b.status === "vencido" && (
          <span className="text-[10px] text-red-600 font-medium">🔴 {Math.abs(dias)}d em atraso</span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <DollarSign className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Boletos</h1>
            <p className="text-sm text-muted-foreground">Controle de vencimentos e pagamentos</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={() => { setEditing(null); setForm(emptyForm); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Novo Boleto
          </Button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-xs text-muted-foreground">Total</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4"><span className="text-3xl font-bold">{stats.total}</span></CardContent></Card>
        <Card className="border-amber-200 bg-amber-50/30"><CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-xs text-amber-600">🟡 Pendentes</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4"><span className="text-3xl font-bold text-amber-700">{stats.pendentes}</span></CardContent></Card>
        <Card className="border-red-200 bg-red-50/30"><CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-xs text-red-600">🔴 Vencidos</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4"><span className="text-3xl font-bold text-red-700">{stats.vencidos}</span></CardContent></Card>
        <Card className="border-orange-200 bg-orange-50/30"><CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-xs text-orange-600">⚠️ Vencendo em 7d</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <span className="text-3xl font-bold text-orange-700">{stats.vencendo}</span>
            <p className="text-xs text-muted-foreground mt-1">Total: R$ {stats.totalPendente.toFixed(2)}</p>
          </CardContent></Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Descrição, favorecido..." className="pl-9 h-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filterStatus !== "todos" || filterSearch) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterStatus("todos"); setFilterSearch(""); }}>
            <X className="mr-1 h-3 w-3" /> Limpar
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground self-center">{filtered.length} boleto(s)</span>
      </div>

      {/* Tabela */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Favorecido</TableHead>
              <TableHead>CPF/CNPJ</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum boleto encontrado</TableCell></TableRow>
            ) : filtered.map(b => (
              <TableRow key={b.id} className={cn(
                b.status === "vencido" && "bg-red-50/30",
                b.status === "pago" && "bg-emerald-50/20",
              )}>
                <TableCell className="font-medium">{b.descricao}</TableCell>
                <TableCell>{b.favorecido || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{b.cpf_cnpj || "—"}</TableCell>
                <TableCell className="text-right font-semibold">R$ {Number(b.valor).toFixed(2)}</TableCell>
                <TableCell>{format(parseISO(b.data_vencimento), "dd/MM/yyyy")}</TableCell>
                <TableCell>{getStatusBadge(b)}</TableCell>
                <TableCell>
                  {b.data_pagamento ? (
                    <div className="text-xs">
                      <p>{format(parseISO(b.data_pagamento), "dd/MM/yyyy")}</p>
                      {b.valor_pago && <p className="text-emerald-700 font-medium">R$ {Number(b.valor_pago).toFixed(2)}</p>}
                      {b.comprovante_url && (
                        <a href={b.comprovante_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                          <Download className="h-3 w-3" /> Comprovante
                        </a>
                      )}
                    </div>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {["pendente", "vencido"].includes(b.status) && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-700 hover:bg-emerald-50"
                        onClick={() => { setPagamentoBoleto(b); setValorPago(b.valor.toString()); setDataPagamento(format(new Date(), "yyyy-MM-dd")); setPagamentoDialog(true); }}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Pagar
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(b)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(b.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dialog Novo/Editar */}
      <Dialog open={dialogOpen} onOpenChange={o => { if (!o) { setDialogOpen(false); setEditing(null); setForm(emptyForm); } }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader><DialogTitle>{editing ? "Editar Boleto" : "Novo Boleto"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição *</label>
              <Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Conta de energia março" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Favorecido</label>
                <Input value={form.favorecido} onChange={e => setForm(f => ({ ...f, favorecido: e.target.value }))} placeholder="Ex: Enel SP" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">CPF/CNPJ</label>
                <Input value={form.cpf_cnpj} onChange={e => setForm(f => ({ ...f, cpf_cnpj: e.target.value }))} placeholder="Ex: 00.000.000/0001-00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Valor *</label>
                <Input type="number" min="0.01" step="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Data de Vencimento *</label>
                <Input type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Observações</label>
              <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Informações adicionais..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditing(null); setForm(emptyForm); }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : editing ? "Salvar" : "Cadastrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Pagamento */}
      <Dialog open={pagamentoDialog} onOpenChange={o => { if (!o) { setPagamentoDialog(false); setPagamentoBoleto(null); } }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>✅ Registrar Pagamento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Boleto: <strong>{pagamentoBoleto?.descricao}</strong></p>
            <p className="text-sm">Valor original: <strong>R$ {Number(pagamentoBoleto?.valor || 0).toFixed(2)}</strong></p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Data do Pagamento *</label>
                <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Valor Pago</label>
                <Input type="number" min="0.01" step="0.01" value={valorPago} onChange={e => setValorPago(e.target.value)} placeholder="0,00" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Comprovante (PDF ou imagem)</label>
              <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setComprovanteFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPagamentoDialog(false); setPagamentoBoleto(null); }}>Cancelar</Button>
            <Button onClick={handleMarcarPago} disabled={pagamentoSaving} className="bg-emerald-600 hover:bg-emerald-700">
              {pagamentoSaving ? "Salvando..." : "Confirmar Pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}