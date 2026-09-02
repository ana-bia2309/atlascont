import { useState, useEffect, useCallback } from "react";
import { usePermissions } from "@/hooks/use-permissions";
import { useRealtime } from "@/hooks/use-realtime";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Pencil, Trash2, DollarSign, CalendarIcon, RefreshCw, Filter } from "@/lib/icons";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

type TipoGasto = {
  id: string;
  nome: string;
  ativo: boolean;
};

type Gasto = {
  id: string;
  descricao: string;
  valor: number;
  data_gasto: string | null;
  tipo_gasto: string | null;
  tipo_gasto_id: string | null;
  os_id: string | null;
  created_at: string | null;
};

type OsOption = {
  id: string;
  codigo_os: string | null;
  equipamentos: string | null;
};

export default function Gastos() {
  const { can } = usePermissions();
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Gasto | null>(null);

  // Dynamic expense types
  const [tiposGasto, setTiposGasto] = useState<TipoGasto[]>([]);
  const [tiposMap, setTiposMap] = useState<Record<string, string>>({});

  // Inline new type creation
  const [newTypeDialogOpen, setNewTypeDialogOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");

  // OS options
  const [osOptions, setOsOptions] = useState<OsOption[]>([]);
  const [osMap, setOsMap] = useState<Record<string, string>>({});

  // Filters
  const [filterOsId, setFilterOsId] = useState<string>("__all__");
  const [filterTipo, setFilterTipo] = useState<string>("__all__");

  // Form fields
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [dataGasto, setDataGasto] = useState<Date | undefined>(new Date());
  const [tipoGastoId, setTipoGastoId] = useState("");
  const [formOsId, setFormOsId] = useState<string>("__none__");

  const fetchData = useCallback(async () => {
  setLoading(true);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setLoading(false);
    return;
  }

  const { data: profile }: any = await (supabase as any)
    .from("profiles")
    .select("company_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.company_id) {
    setLoading(false);
    return;
  }

  const companyId = profile.company_id;

  const [gastosRes, osRes, tiposRes] =
    await Promise.all([
      (supabase as any)
        .from("gastos")
        .select("*")
        .eq("company_id", companyId)
        .order("data_gasto", {
          ascending: false,
        }),

      (supabase as any)
        .from("ordens_servico")
        .select(
          "id, codigo_os, equipamentos"
        )
        .eq("company_id", companyId)
        .order("codigo_os"),

      (supabase as any)
        .from("tipos_gasto")
        .select("*")
        .eq("company_id", companyId)
        .order("nome"),
    ]);

  if (gastosRes.error) {
    toast({
      title: "Erro ao carregar gastos",
      description:
        gastosRes.error.message,
      variant: "destructive",
    });
  } else {
    setGastos(
      (gastosRes.data as Gasto[]) || []
    );
  }

  const osList =
    (osRes.data as OsOption[]) || [];

  setOsOptions(osList);

  const map: Record<string, string> =
    {};

  osList.forEach((os) => {
    const desc = os.equipamentos
      ? os.equipamentos
          .split("\n")[0]
          .substring(0, 40)
      : "";

    map[os.id] = os.codigo_os
      ? `${os.codigo_os}${
          desc ? ` - ${desc}` : ""
        }`
      : `(sem código)${
          desc ? ` - ${desc}` : ""
        }`;
  });

  setOsMap(map);

  const tiposList =
    (tiposRes.data as TipoGasto[]) ||
    [];

  setTiposGasto(tiposList);

  const tMap: Record<string, string> =
    {};

  tiposList.forEach((t) => {
    tMap[t.id] = t.nome;
  });

  setTiposMap(tMap);

  setLoading(false);
}, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useRealtime(["gastos", "ordens_servico", "tipos_gasto"], fetchData);

  const resetForm = () => {
    setDescricao("");
    setValor("");
    setDataGasto(new Date());
    setTipoGastoId("");
    setFormOsId("__none__");
    setEditing(null);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (g: Gasto) => {
    setEditing(g);
    setDescricao(g.descricao);
    setValor(String(g.valor));
    setDataGasto(g.data_gasto ? new Date(g.data_gasto + "T00:00:00") : undefined);
    setTipoGastoId(g.tipo_gasto_id || "");
    setFormOsId(g.os_id || "__none__");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editing && !can("gastos.criar")) { toast({ title: "Sem permissão para criar", variant: "destructive" }); return; }
    if (editing && !can("gastos.editar")) { toast({ title: "Sem permissão para editar", variant: "destructive" }); return; }
    if (!descricao.trim()) { toast({ title: "Descrição é obrigatória", variant: "destructive" }); return; }
    if (!tipoGastoId) { toast({ title: "Selecione o tipo de gasto", variant: "destructive" }); return; }
    const numVal = parseFloat(valor);
    if (isNaN(numVal) || numVal < 0) { toast({ title: "Valor inválido", variant: "destructive" }); return; }

    const {
  data: { user },
} = await supabase.auth.getUser();

if (!user) return;

const { data: profile }: any =
  await (supabase as any)
    .from("profiles")
    .select("company_id")
    .eq("user_id", user.id)
    .single();

if (!profile?.company_id) return;

const payload = {
  company_id: profile.company_id,
  user_id: user.id,
      descricao: descricao.trim(),
      valor: numVal,
      data_gasto: dataGasto ? format(dataGasto, "yyyy-MM-dd") : null,
      tipo_gasto: tiposMap[tipoGastoId] || null,
      tipo_gasto_id: tipoGastoId,
      os_id: formOsId === "__none__" ? null : formOsId,
    };

if (editing) {
  const { error } = await (supabase as any)
    .from("gastos")
    .update(payload)
    .eq("id", editing.id);

  if (error) {
    toast({
      title: "Erro ao atualizar",
      description: error.message,
      variant: "destructive"
    });

    return;
  }

  toast({
    title: "Gasto atualizado"
  });

} else {

  const { error } = await (supabase as any)
    .from("gastos")
    .insert(payload);

  if (error) {
    toast({
      title: "Erro ao criar",
      description: error.message,
      variant: "destructive"
    });

    return;
  }

  toast({
    title: "Gasto registrado"
  });
}

    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    if (!can("gastos.excluir")) { toast({ title: "Sem permissão para excluir", variant: "destructive" }); setDeleteId(null); return; }
    const { error } = await supabase.from("gastos").delete().eq("id", deleteId);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Gasto excluído" }); fetchData(); }
    setDeleteId(null);
  };

  const handleCreateNewType = async () => {
  if (!newTypeName.trim()) {
    toast({
      title: "Nome é obrigatório",
      variant: "destructive",
    });

    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { data: profile }: any =
    await (supabase as any)
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();

  if (!profile?.company_id) return;

  const { data, error } =
    await (supabase as any)
      .from("tipos_gasto")
      .insert({
        nome: newTypeName.trim(),
        company_id:
          profile.company_id,
      })
      .select()
      .single();

  if (error) {
    toast({
      title: "Erro ao criar tipo",
      description: error.message,
      variant: "destructive",
    });

    return;
  }

  toast({
    title: "Tipo criado",
  });

  setNewTypeDialogOpen(false);

  setNewTypeName("");

  if (data) {
    setTipoGastoId(data.id);
  }

  fetchData();
};

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d + "T00:00:00"), "dd/MM/yyyy"); } catch { return "—"; }
  };

  const fmtValor = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const getTypeName = (g: Gasto) => tiposMap[g.tipo_gasto_id || ""] || g.tipo_gasto || "—";

  // Apply filters
  const filtered = gastos.filter((g) => {
    if (filterOsId !== "__all__") {
      if (filterOsId === "__sem_os__") {
        if (g.os_id) return false;
      } else {
        if (g.os_id !== filterOsId) return false;
      }
    }
    if (filterTipo !== "__all__") {
      if (g.tipo_gasto_id !== filterTipo && g.tipo_gasto !== tiposMap[filterTipo]) return false;
    }
    return true;
  });

  const totalGastos = filtered.reduce((sum, g) => sum + g.valor, 0);

  // Pie – gastos por tipo
  const tipoMapChart: Record<string, number> = {};
  filtered.forEach((g) => {
    const t = getTypeName(g);
    tipoMapChart[t] = (tipoMapChart[t] || 0) + g.valor;
  });
  const pieData = Object.entries(tipoMapChart).map(([name, value]) => ({ name, value }));
  const PIE_COLORS = ["hsl(210, 70%, 55%)", "hsl(150, 65%, 45%)", "hsl(45, 80%, 55%)", "hsl(0, 70%, 55%)", "hsl(280, 60%, 55%)", "hsl(30, 80%, 55%)"];

  // Bar – gastos por mês
  const monthMap: Record<string, number> = {};
  filtered.forEach((g) => {
    if (g.data_gasto) {
      try {
        const key = g.data_gasto.substring(0, 7);
        monthMap[key] = (monthMap[key] || 0) + g.valor;
      } catch { /* skip */ }
    }
  });
  const barData = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => {
      const [y, m] = month.split("-");
      return { name: `${m}/${y}`, total };
    });

  const hasActiveFilter = filterOsId !== "__all__" || filterTipo !== "__all__";
  const activeTipos = tiposGasto.filter((t) => t.ativo);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Gastos</h1>
            <p className="text-sm text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? "registro" : "registros"} · Total: {fmtValor(totalGastos)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchData} title="Atualizar">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          {can("gastos.criar") && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Novo Gasto
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4 rounded-lg border bg-card p-3">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-[240px]">
          <Select value={filterOsId} onValueChange={setFilterOsId}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Filtrar por O.S." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as O.S.</SelectItem>
              <SelectItem value="__sem_os__">Sem O.S. vinculada</SelectItem>
              {osOptions.map((os) => (
                <SelectItem key={os.id} value={os.id}>
                  {osMap[os.id] || os.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px]">
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Tipo de gasto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os tipos</SelectItem>
              {tiposGasto.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasActiveFilter && (
          <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setFilterOsId("__all__"); setFilterTipo("__all__"); }}>
            Limpar filtros
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-[260px] w-full rounded-full max-w-[260px] mx-auto" />
            </div>
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-[260px] w-full" />
            </div>
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 && !hasActiveFilter ? (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <DollarSign className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">Nenhum gasto registrado.</p>
          <Button variant="outline" className="mt-4" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Registrar primeiro gasto
          </Button>
        </div>
      ) : filtered.length === 0 && hasActiveFilter ? (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <Filter className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">Nenhum gasto encontrado com os filtros selecionados.</p>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-lg font-semibold mb-4">Gastos por Tipo</h2>
            {pieData.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sem dados.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${fmtValor(value)}`}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtValor(v)} contentStyle={{ background: "#fff", border: "1px solid hsl(220, 13%, 91%)" }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-lg font-semibold mb-4">Gastos por Mês</h2>
            {barData.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sem dados.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData}>
                  <XAxis dataKey="name" tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} />
                  <YAxis tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip formatter={(v: number) => fmtValor(v)} contentStyle={{ background: "#fff", border: "1px solid hsl(220, 13%, 91%)" }} labelStyle={{ color: "#111827" }} />
                  <Bar dataKey="total" fill="hsl(210, 70%, 55%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>O.S.</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-[120px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.descricao}</TableCell>
                  <TableCell>
                    {g.os_id ? (
                      <span className="text-xs text-primary font-medium">{osMap[g.os_id] || "—"}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border bg-muted text-muted-foreground">
                      {getTypeName(g)}
                    </span>
                  </TableCell>
                  <TableCell>{fmtDate(g.data_gasto)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtValor(g.valor)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {can("gastos.editar") && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(g)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {can("gastos.excluir") && (
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(g.id)} title="Excluir">
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
        </>
      )}

      {/* Main gasto dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Gasto" : "Novo Gasto"}</DialogTitle>
            <DialogDescription>{editing ? "Altere os dados do gasto." : "Registre um novo gasto."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição</label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição do gasto" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Ordem de Serviço <span className="text-muted-foreground font-normal">(opcional)</span></label>
              <Select value={formOsId} onValueChange={setFormOsId}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma O.S." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma O.S.</SelectItem>
                  {osOptions.map((os) => (
                    <SelectItem key={os.id} value={os.id}>
                      {osMap[os.id] || os.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Tipo de gasto</label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Select value={tipoGastoId} onValueChange={setTipoGastoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeTipos.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                      ))}
                      {/* Show inactive type if editing a gasto with it */}
                      {editing?.tipo_gasto_id && !activeTipos.find(t => t.id === editing.tipo_gasto_id) && tiposMap[editing.tipo_gasto_id] && (
                        <SelectItem key={editing.tipo_gasto_id} value={editing.tipo_gasto_id}>
                          {tiposMap[editing.tipo_gasto_id]} (inativo)
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="outline" size="icon" onClick={() => setNewTypeDialogOpen(true)} title="Novo tipo">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Valor (R$)</label>
              <Input type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Data</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dataGasto && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataGasto ? format(dataGasto, "dd/MM/yyyy") : "Selecione uma data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dataGasto} onSelect={setDataGasto} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inline new type dialog */}
      <Dialog open={newTypeDialogOpen} onOpenChange={(open) => { if (!open) { setNewTypeDialogOpen(false); setNewTypeName(""); } }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Novo Tipo de Gasto</DialogTitle>
            <DialogDescription>Cadastre um novo tipo que ficará disponível imediatamente.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium mb-1 block">Nome</label>
            <Input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder="Ex: Combustível" onKeyDown={(e) => e.key === "Enter" && handleCreateNewType()} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewTypeDialogOpen(false); setNewTypeName(""); }}>Cancelar</Button>
            <Button onClick={handleCreateNewType}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir gasto?</AlertDialogTitle>
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
