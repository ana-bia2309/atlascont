import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Download, BarChart3, Clock, AlertTriangle, CheckCircle2, XCircle } from "@/lib/icons";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";

const SISTEMA_OPTIONS = [
  "Ar-condicionado", "Bombeamento hidráulico", "Bebedouro", "Elétrico",
  "Hidrossanitário", "Incêndio", "Elevador", "Gerador", "CFTV",
  "Controle de acesso", "Outro",
];

type Registro = {
  id: string;
  os_id: string;
  ativo_id: string;
  ativo_nome: string;
  ativo_codigo: string | null;
  ativo_sistema: string | null;
  os_codigo: string | null;
  disponibilidade: string;
  indisponivel_desde: string | null;
  disponivel_em: string | null;
  tempo_total_indisponivel: number;
};

function formatSegundos(seg: number) {
  if (!seg || seg === 0) return "—";
  if (seg < 60) return `${seg}s`;
  if (seg < 3600) return `${Math.floor(seg / 60)}min`;
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export default function RelatorioAtivos() {
  const { companyId } = useCompany();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterAtivo, setFilterAtivo] = useState("");
  const [filterSistema, setFilterSistema] = useState("__all__");
  const [filterStatus, setFilterStatus] = useState("__all__");

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("os_ativos_vinculados")
        .select(`
          id, os_id, ativo_id, disponibilidade,
          indisponivel_desde, disponivel_em, tempo_total_indisponivel,
          ativos(nome, codigo_identificacao, sistema),
          ordens_servico(codigo_os)
        `)
        .eq("company_id", companyId)
        .order("indisponivel_desde", { ascending: false });

      if (error) throw error;

      let enriched: Registro[] = (data || []).map((r: any) => ({
        id: r.id,
        os_id: r.os_id,
        ativo_id: r.ativo_id,
        ativo_nome: r.ativos?.nome || "—",
        ativo_codigo: r.ativos?.codigo_identificacao || null,
        ativo_sistema: r.ativos?.sistema || null,
        os_codigo: r.ordens_servico?.codigo_os || null,
        disponibilidade: r.disponibilidade || "disponivel",
        indisponivel_desde: r.indisponivel_desde,
        disponivel_em: r.disponivel_em,
        tempo_total_indisponivel: r.tempo_total_indisponivel || 0,
      }));

      // Filtros
      if (filterAtivo.trim()) {
        const q = filterAtivo.toLowerCase();
        enriched = enriched.filter(r =>
          r.ativo_nome.toLowerCase().includes(q) ||
          (r.ativo_codigo || "").toLowerCase().includes(q)
        );
      }
      if (filterSistema !== "__all__") {
        enriched = enriched.filter(r => r.ativo_sistema === filterSistema);
      }
      if (filterStatus !== "__all__") {
        enriched = enriched.filter(r => r.disponibilidade === filterStatus);
      }

      setRegistros(enriched);
    } catch (e: any) {
      toast({ title: "Erro ao carregar relatório", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, filterAtivo, filterSistema, filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const indisponiveis = registros.filter(r => r.disponibilidade === "indisponivel");
  const totalTempo = registros.reduce((s, r) => s + r.tempo_total_indisponivel, 0);
  const maisProblematico = registros.reduce((prev, curr) =>
    curr.tempo_total_indisponivel > (prev?.tempo_total_indisponivel || 0) ? curr : prev
  , registros[0]);

  const exportarExcel = () => {
    const rows = registros.map(r => ({
      "Ativo": r.ativo_nome,
      "Código": r.ativo_codigo || "—",
      "Sistema": r.ativo_sistema || "—",
      "OS Vinculada": r.os_codigo || "—",
      "Status": r.disponibilidade === "indisponivel" ? "Indisponível" : "Disponível",
      "Início Indisponibilidade": r.indisponivel_desde
        ? format(new Date(r.indisponivel_desde), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—",
      "Fim Indisponibilidade": r.disponivel_em
        ? format(new Date(r.disponivel_em), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "Em andamento",
      "Tempo Total Parado": formatSegundos(r.tempo_total_indisponivel),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Indisponibilidade");
    XLSX.writeFile(wb, `relatorio_indisponibilidade_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Relatório de Indisponibilidade</h1>
            <p className="text-sm text-muted-foreground">Controle de tempo parado dos ativos por O.S.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportarExcel} disabled={registros.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Exportar Excel
          </Button>
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <CardTitle className="text-sm text-muted-foreground">Ativos Indisponíveis</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-red-600">{indisponiveis.length}</span>
            <p className="text-xs text-muted-foreground mt-1">de {registros.length} registros</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-sm text-muted-foreground">Tempo Total Parado</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-amber-600">{formatSegundos(totalTempo)}</span>
            <p className="text-xs text-muted-foreground mt-1">acumulado no período</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            <CardTitle className="text-sm text-muted-foreground">Mais Problemático</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-sm font-bold text-orange-600 truncate block">
              {maisProblematico?.ativo_nome || "—"}
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              {maisProblematico ? formatSegundos(maisProblematico.tempo_total_indisponivel) : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Ativo</label>
          <Input value={filterAtivo} onChange={e => setFilterAtivo(e.target.value)} placeholder="Nome ou código..." />
        </div>
        <div className="min-w-[160px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Sistema</label>
          <Select value={filterSistema} onValueChange={setFilterSistema}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {SISTEMA_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              <SelectItem value="indisponivel">Indisponível</SelectItem>
              <SelectItem value="disponivel">Disponível</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ativo</TableHead>
              <TableHead>Sistema</TableHead>
              <TableHead>O.S. Vinculada</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Início Parada</TableHead>
              <TableHead>Fim Parada</TableHead>
              <TableHead>Tempo Parado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : registros.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhum registro encontrado. Marque ativos como indisponíveis dentro das O.S.
                </TableCell>
              </TableRow>
            ) : registros.map(r => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium">{r.ativo_nome}</div>
                  {r.ativo_codigo && <div className="text-xs text-muted-foreground font-mono">{r.ativo_codigo}</div>}
                </TableCell>
                <TableCell className="text-sm">{r.ativo_sistema || "—"}</TableCell>
                <TableCell>
                  {r.os_codigo
                    ? <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{r.os_codigo}</span>
                    : <span className="text-muted-foreground">—</span>
                  }
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={
                    r.disponibilidade === "indisponivel"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }>
                    {r.disponibilidade === "indisponivel" ? "🔴 Indisponível" : "🟢 Disponível"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {r.indisponivel_desde
                    ? format(new Date(r.indisponivel_desde), "dd/MM/yyyy HH:mm", { locale: ptBR })
                    : "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {r.disponivel_em
                    ? format(new Date(r.disponivel_em), "dd/MM/yyyy HH:mm", { locale: ptBR })
                    : r.disponibilidade === "indisponivel"
                      ? <span className="text-red-600 font-medium">Em andamento</span>
                      : "—"}
                </TableCell>
                <TableCell>
                  <span className={`font-semibold ${r.tempo_total_indisponivel > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                    {formatSegundos(r.tempo_total_indisponivel)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}