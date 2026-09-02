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
import { Plus, Trash2, RefreshCw, Search, DollarSign, CheckCircle2, X, Pencil, Download, Copy, Image, Bell, Settings2 } from "@/lib/icons";
import { format, differenceInDays, parseISO, addMonths } from "date-fns";
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
  codigo_barras: string | null;
  banco_emissor: string | null;
  categoria: string | null;
  recorrencia: string | null;
  foto_boleto_url: string | null;
  created_at: string;
};

const STATUS_OPTIONS = [
  { value: "pendente", label: "🟡 Pendente", color: "bg-warning/10 text-warning border-warning/20" },
  { value: "pago", label: "✅ Pago", color: "bg-success/10 text-success border-success/20" },
  { value: "vencido", label: "🔴 Vencido", color: "bg-destructive/10 text-destructive border-destructive/20" },
  { value: "cancelado", label: "⛔ Cancelado", color: "bg-zinc-100 text-zinc-600 border-zinc-200" },
];

const CATEGORIAS = [
  "Energia", "Água", "Gás", "Aluguel", "Fornecedor", "Impostos",
  "Telefone/Internet", "Seguro", "Manutenção", "Outros",
];

const BANCOS = [
  "Banco do Brasil", "Bradesco", "Caixa Econômica", "Itaú", "Santander",
  "Sicoob", "Sicredi", "BTG Pactual", "Nubank", "Outro",
];

const RECORRENCIAS = [
  { value: "nenhuma", label: "Sem recorrência" },
  { value: "mensal", label: "Mensal" },
  { value: "bimestral", label: "Bimestral" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];

const emptyForm = {
  descricao: "", favorecido: "", cpf_cnpj: "", valor: "",
  data_vencimento: "", observacoes: "", codigo_barras: "",
  banco_emissor: "", categoria: "", recorrencia: "nenhuma",
};

export default function Boletos() {
  const { companyId } = useCompany();

  // --- Dados ---
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Filtros ---
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("todas");

  // --- Dialog Novo/Editar ---
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Boleto | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [fotoBoletoFile, setFotoBoletoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);

  // --- Dialog Pagamento ---
  const [pagamentoDialog, setPagamentoDialog] = useState(false);
  const [pagamentoBoleto, setPagamentoBoleto] = useState<Boleto | null>(null);
  const [dataPagamento, setDataPagamento] = useState(format(new Date(), "yyyy-MM-dd"));
  const [valorPago, setValorPago] = useState("");
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [pagamentoSaving, setPagamentoSaving] = useState(false);

  // --- Dialog Próximo Boleto ---
  const [proximoDialog, setProximoDialog] = useState(false);
  const [proximoBoleto, setProximoBoleto] = useState<Partial<Boleto> | null>(null);
  const [proximoValor, setProximoValor] = useState("");
  const [proximoVencimento, setProximoVencimento] = useState("");
  const [proximoSaving, setProximoSaving] = useState(false);

  // --- Dialog Foto ---
  const [fotoDialog, setFotoDialog] = useState(false);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  // --- Alertas ---
  const [diasAlerta, setDiasAlerta] = useState<number>(() => {
    const saved = localStorage.getItem("boleto_dias_alerta");
    return saved ? Number(saved) : 7;
  });
  const [alertaConfigOpen, setAlertaConfigOpen] = useState(false);
  const [diasAlertaTemp, setDiasAlertaTemp] = useState(7);

  // --- Fetch ---
  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("boletos").select("*").eq("company_id", companyId)
      .order("data_vencimento", { ascending: true });
    if (error) toast({ title: "Erro ao carregar boletos", variant: "destructive" });
    else {
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

  // --- Alertas config ---
  const salvarDiasAlerta = () => {
    setDiasAlerta(diasAlertaTemp);
    localStorage.setItem("boleto_dias_alerta", String(diasAlertaTemp));
    setAlertaConfigOpen(false);
    toast({ title: `Alerta configurado para ${diasAlertaTemp} dias` });
  };

  // --- Computed ---
  const boletosVencidos = useMemo(() =>
    boletos.filter(b => b.status === "vencido"),
  [boletos]);

  const boletosAlerta = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    const limite = new Date();
    limite.setDate(limite.getDate() + diasAlerta);
    const limiteStr = limite.toISOString().slice(0, 10);
    return boletos.filter(b =>
      b.status === "pendente" &&
      b.data_vencimento >= hoje &&
      b.data_vencimento <= limiteStr
    ).sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
  }, [boletos, diasAlerta]);

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

  const categorias = useMemo(() => {
    const cats = boletos.map(b => b.categoria).filter(Boolean) as string[];
    return Array.from(new Set(cats));
  }, [boletos]);

  const filtered = useMemo(() => {
    return boletos.filter(b => {
      if (filterStatus !== "todos" && b.status !== filterStatus) return false;
      if (filterCategoria !== "todas" && b.categoria !== filterCategoria) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase();
        if (!(b.descricao || "").toLowerCase().includes(q) &&
            !(b.favorecido || "").toLowerCase().includes(q) &&
            !(b.cpf_cnpj || "").toLowerCase().includes(q) &&
            !(b.codigo_barras || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [boletos, filterStatus, filterSearch, filterCategoria]);

  // --- Handlers ---
  const handleFotoChange = (file: File | null) => {
    setFotoBoletoFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = e => setFotoPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setFotoPreview(null);
    }
  };

  const handleSave = async () => {
    if (!form.descricao.trim() || !form.valor || !form.data_vencimento) {
      toast({ title: "Preencha descrição, valor e vencimento", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let foto_boleto_url = editing?.foto_boleto_url || null;
      if (fotoBoletoFile) {
        const ext = fotoBoletoFile.name.split(".").pop();
        const path = `boletos/fotos/${companyId}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("attachments").upload(path, fotoBoletoFile, { upsert: true });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(path);
          foto_boleto_url = urlData.publicUrl;
        }
      }
      const payload = {
        company_id: companyId,
        descricao: form.descricao.trim(),
        favorecido: form.favorecido.trim() || null,
        cpf_cnpj: form.cpf_cnpj.trim() || null,
        valor: Number(form.valor),
        data_vencimento: form.data_vencimento,
        observacoes: form.observacoes.trim() || null,
        codigo_barras: form.codigo_barras.trim() || null,
        banco_emissor: form.banco_emissor || null,
        categoria: form.categoria || null,
        recorrencia: form.recorrencia || "nenhuma",
        foto_boleto_url,
        status: editing?.status || "pendente",
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
      setDialogOpen(false); setEditing(null); setForm(emptyForm);
      setFotoBoletoFile(null); setFotoPreview(null);
      fetchData();
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

  const calcularProximoVencimento = (dataAtual: string, recorrencia: string): string => {
    const d = parseISO(dataAtual);
    switch (recorrencia) {
      case "mensal":     return format(addMonths(d, 1), "yyyy-MM-dd");
      case "bimestral":  return format(addMonths(d, 2), "yyyy-MM-dd");
      case "trimestral": return format(addMonths(d, 3), "yyyy-MM-dd");
      case "semestral":  return format(addMonths(d, 6), "yyyy-MM-dd");
      case "anual":      return format(addMonths(d, 12), "yyyy-MM-dd");
      default:           return format(addMonths(d, 1), "yyyy-MM-dd");
    }
  };

  const handleMarcarPago = async () => {
    if (!pagamentoBoleto) return;
    if (!dataPagamento) { toast({ title: "Informe a data de pagamento", variant: "destructive" }); return; }
    setPagamentoSaving(true);
    try {
      let comprovante_url = null;
      if (comprovanteFile) {
        const ext = comprovanteFile.name.split(".").pop();
        const path = `boletos/${companyId}/${pagamentoBoleto.id}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("attachments").upload(path, comprovanteFile, { upsert: true });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(path);
          comprovante_url = urlData.publicUrl;
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
      setPagamentoDialog(false);
      setComprovanteFile(null);
      if (pagamentoBoleto.recorrencia && pagamentoBoleto.recorrencia !== "nenhuma") {
        const proximaData = calcularProximoVencimento(pagamentoBoleto.data_vencimento, pagamentoBoleto.recorrencia);
        setProximoBoleto({ ...pagamentoBoleto });
        setProximoVencimento(proximaData);
        setProximoValor("");
        setProximoDialog(true);
      } else {
        setPagamentoBoleto(null);
        setValorPago("");
      }
      fetchData();
    } catch (e: any) {
      toast({ title: "Erro ao registrar pagamento", description: e.message, variant: "destructive" });
    } finally {
      setPagamentoSaving(false);
    }
  };

  const handleCriarProximo = async () => {
    if (!proximoBoleto || !proximoVencimento) return;
    if (!proximoValor) { toast({ title: "Informe o valor do próximo boleto", variant: "destructive" }); return; }
    setProximoSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase as any).from("boletos").insert({
        company_id: companyId,
        descricao: proximoBoleto.descricao,
        favorecido: proximoBoleto.favorecido || null,
        cpf_cnpj: proximoBoleto.cpf_cnpj || null,
        valor: Number(proximoValor),
        data_vencimento: proximoVencimento,
        status: "pendente",
        observacoes: proximoBoleto.observacoes || null,
        codigo_barras: null,
        banco_emissor: proximoBoleto.banco_emissor || null,
        categoria: proximoBoleto.categoria || null,
        recorrencia: proximoBoleto.recorrencia || "nenhuma",
        foto_boleto_url: null,
        created_by: user?.id,
        updated_at: new Date().toISOString(),
      });
      toast({ title: "Próximo boleto criado!", description: `Vencimento: ${format(parseISO(proximoVencimento), "dd/MM/yyyy")}` });
      setProximoDialog(false); setProximoBoleto(null); setProximoValor(""); setProximoVencimento("");
      setPagamentoBoleto(null); setValorPago("");
      fetchData();
    } catch (e: any) {
      toast({ title: "Erro ao criar próximo boleto", description: e.message, variant: "destructive" });
    } finally {
      setProximoSaving(false);
    }
  };

  const openEdit = (b: Boleto) => {
    setEditing(b);
    setForm({
      descricao: b.descricao, favorecido: b.favorecido || "", cpf_cnpj: b.cpf_cnpj || "",
      valor: b.valor.toString(), data_vencimento: b.data_vencimento, observacoes: b.observacoes || "",
      codigo_barras: b.codigo_barras || "", banco_emissor: b.banco_emissor || "",
      categoria: b.categoria || "", recorrencia: b.recorrencia || "nenhuma",
    });
    setFotoPreview(b.foto_boleto_url || null);
    setDialogOpen(true);
  };

  const copiarCodigo = (codigo: string) => {
    navigator.clipboard.writeText(codigo);
    toast({ title: "Código copiado!" });
  };

  const getStatusBadge = (b: Boleto) => {
    const opt = STATUS_OPTIONS.find(o => o.value === b.status);
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
        {b.recorrencia && b.recorrencia !== "nenhuma" && (
          <span className="text-[10px] text-blue-600 font-medium">🔄 {b.recorrencia}</span>
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
          <Button variant="outline" size="icon" title={`Alertas: ${diasAlerta} dias`}
            onClick={() => { setDiasAlertaTemp(diasAlerta); setAlertaConfigOpen(true); }}>
            <Bell className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={() => { setEditing(null); setForm(emptyForm); setFotoPreview(null); setFotoBoletoFile(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Novo Boleto
          </Button>
        </div>
      </div>

      {/* Banners de Alerta */}
      {(boletosVencidos.length > 0 || boletosAlerta.length > 0) && (
        <div className="space-y-2">
          {boletosVencidos.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <Bell className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-700">{boletosVencidos.length} boleto(s) vencido(s)!</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {boletosVencidos.map(b => (
                    <span key={b.id} className="text-xs text-red-600 bg-red-100 rounded px-2 py-0.5">
                      {b.descricao} — R$ {Number(b.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      {" "}({Math.abs(differenceInDays(parseISO(b.data_vencimento), new Date()))}d atraso)
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
          {boletosAlerta.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <Bell className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-700">
                  {boletosAlerta.length} boleto(s) vencendo nos próximos {diasAlerta} dias
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {boletosAlerta.map(b => {
                    const dias = differenceInDays(parseISO(b.data_vencimento), new Date());
                    return (
                      <span key={b.id} className="text-xs text-amber-700 bg-amber-100 rounded px-2 py-0.5">
                        {b.descricao} — {dias === 0 ? "hoje" : `em ${dias}d`}
                        {" "}(R$ {Number(b.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })})
                      </span>
                    );
                  })}
                </div>
              </div>
              <button onClick={() => { setDiasAlertaTemp(diasAlerta); setAlertaConfigOpen(true); }}
                className="text-amber-500 hover:text-amber-700 shrink-0" title="Configurar alerta">
                <Settings2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-xs text-muted-foreground">Total</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4"><span className="text-3xl font-bold">{stats.total}</span></CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-xs text-amber-600">🟡 Pendentes</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4"><span className="text-3xl font-bold text-amber-700">{stats.pendentes}</span></CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/30">
          <CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-xs text-red-600">🔴 Vencidos</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4"><span className="text-3xl font-bold text-red-700">{stats.vencidos}</span></CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50/30">
          <CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-xs text-orange-600">⚠️ Vencendo em 7d</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <span className="text-3xl font-bold text-orange-700">{stats.vencendo}</span>
            <p className="text-xs text-muted-foreground mt-1">R$ {stats.totalPendente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em aberto</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Descrição, favorecido, código..." className="pl-9 h-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {categorias.length > 0 && (
          <Select value={filterCategoria} onValueChange={setFilterCategoria}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas categorias</SelectItem>
              {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {(filterStatus !== "todos" || filterSearch || filterCategoria !== "todas") && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterStatus("todos"); setFilterSearch(""); setFilterCategoria("todas"); }}>
            <X className="mr-1 h-3 w-3" /> Limpar
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground self-center">{filtered.length} boleto(s)</span>
      </div>

      {/* Tabela */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/70 hover:bg-muted/70">
              <TableHead>Descrição</TableHead>
              <TableHead>Favorecido</TableHead>
              <TableHead>Banco / Categoria</TableHead>
              <TableHead>Código de Barras</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum boleto encontrado</TableCell></TableRow>
            ) : filtered.map(b => (
              <TableRow key={b.id} className={cn(
                b.status === "vencido" && "bg-red-50/30",
                b.status === "pago" && "bg-emerald-50/20",
              )}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {b.foto_boleto_url && (
                      <button onClick={() => { setFotoUrl(b.foto_boleto_url); setFotoDialog(true); }}
                        className="text-blue-500 hover:text-blue-700" title="Ver foto do boleto">
                        <Image className="h-4 w-4" />
                      </button>
                    )}
                    <span className="font-medium">{b.descricao}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{b.favorecido || "—"}</div>
                  {b.cpf_cnpj && <div className="text-xs text-muted-foreground font-mono">{b.cpf_cnpj}</div>}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    {b.banco_emissor && <span className="text-xs font-medium">{b.banco_emissor}</span>}
                    {b.categoria && <Badge variant="outline" className="text-[10px] w-fit">{b.categoria}</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  {b.codigo_barras ? (
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs text-muted-foreground truncate max-w-[140px]" title={b.codigo_barras}>
                        {b.codigo_barras.slice(0, 20)}...
                      </span>
                      <button onClick={() => copiarCodigo(b.codigo_barras!)} className="text-muted-foreground hover:text-foreground" title="Copiar código">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  R$ {Number(b.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell>{format(parseISO(b.data_vencimento), "dd/MM/yyyy")}</TableCell>
                <TableCell>{getStatusBadge(b)}</TableCell>
                <TableCell>
                  {b.data_pagamento ? (
                    <div className="text-xs">
                      <p>{format(parseISO(b.data_pagamento), "dd/MM/yyyy")}</p>
                      {b.valor_pago && <p className="text-emerald-700 font-medium">R$ {Number(b.valor_pago).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>}
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
      <Dialog open={dialogOpen} onOpenChange={o => { if (!o) { setDialogOpen(false); setEditing(null); setForm(emptyForm); setFotoPreview(null); setFotoBoletoFile(null); } }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
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
                <Input value={form.cpf_cnpj} onChange={e => setForm(f => ({ ...f, cpf_cnpj: e.target.value }))} placeholder="00.000.000/0001-00" />
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Banco Emissor</label>
                <Select value={form.banco_emissor} onValueChange={v => setForm(f => ({ ...f, banco_emissor: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {BANCOS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Categoria</label>
                <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Recorrência</label>
              <Select value={form.recorrencia} onValueChange={v => setForm(f => ({ ...f, recorrencia: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECORRENCIAS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Código de Barras / Linha Digitável</label>
              <div className="flex gap-2">
                <Input value={form.codigo_barras} onChange={e => setForm(f => ({ ...f, codigo_barras: e.target.value }))}
                  placeholder="Cole o código de barras aqui..." className="font-mono text-sm" />
                {form.codigo_barras && (
                  <Button type="button" variant="outline" size="icon" onClick={() => copiarCodigo(form.codigo_barras)} title="Copiar">
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Foto do Boleto</label>
              {fotoPreview ? (
                <div className="relative">
                  <img src={fotoPreview} alt="Boleto" className="rounded-md border max-h-48 object-contain w-full bg-zinc-50" />
                  <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7 bg-white/80"
                    onClick={() => { setFotoPreview(null); setFotoBoletoFile(null); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Input type="file" accept=".jpg,.jpeg,.png,.pdf,.webp" onChange={e => handleFotoChange(e.target.files?.[0] || null)} />
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Observações</label>
              <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Informações adicionais..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditing(null); setForm(emptyForm); setFotoPreview(null); setFotoBoletoFile(null); }}>Cancelar</Button>
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
            <p className="text-sm">Valor original: <strong>R$ {Number(pagamentoBoleto?.valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></p>
            {pagamentoBoleto?.codigo_barras && (
              <div className="rounded-md bg-zinc-50 border p-3">
                <p className="text-xs text-muted-foreground mb-1">Código de barras:</p>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-xs break-all flex-1">{pagamentoBoleto.codigo_barras}</p>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copiarCodigo(pagamentoBoleto!.codigo_barras!)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
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

      {/* Dialog Foto */}
      <Dialog open={fotoDialog} onOpenChange={setFotoDialog}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader><DialogTitle>📄 Foto do Boleto</DialogTitle></DialogHeader>
          {fotoUrl && (
            fotoUrl.endsWith(".pdf") ? (
              <iframe src={fotoUrl} className="w-full h-[500px] rounded-md border" />
            ) : (
              <img src={fotoUrl} alt="Boleto" className="w-full rounded-md border object-contain max-h-[500px]" />
            )
          )}
          <DialogFooter>
            <a href={fotoUrl || ""} target="_blank" rel="noopener noreferrer">
              <Button variant="outline"><Download className="h-4 w-4 mr-2" /> Baixar</Button>
            </a>
            <Button onClick={() => setFotoDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Configurar Alerta */}
      <Dialog open={alertaConfigOpen} onOpenChange={setAlertaConfigOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader><DialogTitle>🔔 Configurar Alertas</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Alertar quando um boleto pendente vencer em quantos dias?</p>
            <div className="flex items-center gap-3">
              <Input type="number" min="1" max="60" value={diasAlertaTemp}
                onChange={e => setDiasAlertaTemp(Number(e.target.value))}
                className="w-24 text-center text-lg font-bold" />
              <span className="text-sm text-muted-foreground">dias de antecedência</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {[1, 3, 5, 7, 10, 15, 30].map(d => (
                <button key={d} onClick={() => setDiasAlertaTemp(d)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${diasAlertaTemp === d
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-accent"}`}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlertaConfigOpen(false)}>Cancelar</Button>
            <Button onClick={salvarDiasAlerta}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Próximo Boleto */}
      <Dialog open={proximoDialog} onOpenChange={o => {
        if (!o) { setProximoDialog(false); setProximoBoleto(null); setPagamentoBoleto(null); setValorPago(""); }
      }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>🔄 Criar Próximo Boleto</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
              <p><strong>{proximoBoleto?.descricao}</strong> é um boleto <strong>{proximoBoleto?.recorrencia}</strong>.</p>
              <p className="mt-1">Deseja criar o próximo automaticamente?</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Próximo Vencimento</label>
                <Input type="date" value={proximoVencimento} onChange={e => setProximoVencimento(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Valor *</label>
                <Input type="number" min="0.01" step="0.01" value={proximoValor}
                  onChange={e => setProximoValor(e.target.value)} placeholder="Novo valor..." autoFocus />
              </div>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>✅ Herda: favorecido, banco, categoria, recorrência</p>
              <p>🆕 Novo: valor (acima) e código de barras (em branco)</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => {
              setProximoDialog(false); setProximoBoleto(null); setPagamentoBoleto(null); setValorPago("");
              toast({ title: "Próximo boleto não criado" });
            }}>Não criar</Button>
            <Button onClick={handleCriarProximo} disabled={proximoSaving} className="bg-blue-600 hover:bg-blue-700">
              {proximoSaving ? "Criando..." : "Criar Próximo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}