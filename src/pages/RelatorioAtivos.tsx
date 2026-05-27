import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Download, BarChart3 } from "@/lib/icons";
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
  ativo_id: string;
  ativo_nome: string;
  ativo_codigo: string | null;
  ativo_sistema: string | null;
  status: string;
  data_inicio: string;
  data_fim: string | null;
  tempo_parado_minutos: number | null;
  observacao: string | null;
};

function formatMinutos(min: number | null) {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${m}min`;
}

export default function RelatorioAtivos() {
  const { companyId } = useCompany();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterAtivo, setFilterAtivo] = useState("");
  const [filterSistema, setFilterSistema] = useState("__all__");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [filterDataInicio, setFilterDataInicio] = useState("");
  const [filterDataFim, setFilterDataFim] = useState("");
  const [ativos, setAtivos] = useState<{ id: string; nome: string; codigo_identificacao: string | null; sistema: string | null }[]>([]);

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      // Busca ativos
      const { data: ativosData } = await (supabase as any)
        .from("ativos")
        .select("id, nome, codigo_identificacao, sistema")
        .eq("company_id", companyId)
        .order("nome");
      setAtivos(ativosData || []);

      // Busca manutenções
      let query = (supabase as any)
        .from("ativo_manutencoes")
        .select("id, ativo_id, status, data_inicio, data_fim, tempo_parado_minutos, observacao")
        .eq("company_id", companyId)
        .order("data_inicio", { ascending: false });

      if (filterDataInicio) query = query.gte("data_inicio", filterDataInicio + "T00:00:00");
      if (filterDataFim) query = query.lte("data_inicio", filterDataFim + "T23:59:59");

      const { data: manutData, error } = await query;
      if (error) throw error;

      // Enriquece com dados do ativo
      const ativosMap: Record<string, any> = {};
      (ativosData || []).forEach((a: any) => { ativosMap[a.id] = a; });

      let enriched = (manutData || []).map((m: any) => ({
        ...m,
        ativo_nome: ativosMap[m.ativo_id]?.nome || "—",
        ativo_codigo: ativosMap[m.ativo_id]?.codigo_identificacao || null,
        ativo_sistema: ativosMap[m.ativo_id]?.sistema || null,
      }));

      // Filtros cliente
      if (filterAtivo.trim()) {
        const q = filterAtivo.toLowerCase();
        enriched = enriched.filter((r: Registro) =>
          r.ativo_nome.toLowerCase().includes(q) ||
          (r.ativo_codigo || "").toLowerCase().includes(q)
        );
      }
      if (filterSistema !== "__all__") {
        enriched = enriched.filter((r: Registro) => r.ativo_sistema === filterSistema);
      }
      if (filterStatus !== "__all__") {
        enriched = enriched.filter((r: Registro) => r.status === filterStatus);
      }

      setRegistros(enriched);
    } catch (e: any) {
      toast({ title: "Erro ao carregar relatório", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, filterAtivo, filterSistema, filterStatus, filterDataInicio, filterDataFim]);

  const totalMinutos = registros.reduce((s, r) => s + (r.tempo_parado_minutos || 0), 0);
  const ocorrencias = registros.length;
  const emAndamento = registros.filter(r => !r.data_fim).length;

  const exportarExcel = () => {
    const rows = registros.map(r => ({
      "Ativo": r.ativo_nome,
      "Código": r.ativo_codigo || "—",
      "Sistema": r.ativo_sistema || "—",
      "Status": r.status === "indisponivel" ? "Indisponível" : "Disponível",
      "Data Início": format(new Date(r.data_inicio), "dd/MM/yyyy HH:mm", { locale: ptBR }),
      "Data Fim": r.data_fim ? format(new Date(r.data_fim), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "Em andamento",
      "Tempo Parado": formatMinutos(r.tempo_parado_minutos),
      "Observação": r.observacao || "—",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório");
    XLSX.writeFile(wb, `relatorio_paradas_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Relatório de Tempo de Parada</h1>
            <p className="text-sm text-muted-foreground">Consulte o histórico de indisponibilidade dos ativos</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportarExcel} disabled={registros.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Exportar Excel
          </Button>
          <Button onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Consultar
          </Button>
        </div>
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
        <div className="min-w-[140px]">
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
        <div className="min-w-[140px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Data início</label>
          <Input type="date" value={filterDataInicio} onChange={e => setFilterDataInicio(e.target.value)} />
        </div>
        <div className="min-w-[140px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Data fim</label>
          <Input type="date" value={filterDataFim} onChange={e => setFilterDataFim(e.target.value)} />
        </div>
      </div>

      {/* Cards resumo */}
      {registros.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total de Ocorrências</CardTitle></CardHeader>
            <CardContent><span className="text-2xl font-bold">{ocorrencias}</span></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Tempo Total Parado</CardTitle></CardHeader>
            <CardContent><span className="text-2xl font-bold text-red-600">{formatMinutos(totalMinutos)}</span></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Em Andamento</CardTitle></CardHeader>
            <CardContent><span className="text-2xl font-bold text-amber-600">{emAndamento}</span></CardContent>
          </Card>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ativo</TableHead>
              <TableHead>Sistema</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Data Início</TableHead>
              <TableHead>Data Fim</TableHead>
              <TableHead>Tempo Parado</TableHead>
              <TableHead>Observação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : registros.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Clique em Consultar para carregar os dados</TableCell></TableRow>
            ) : registros.map(r => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium">{r.ativo_nome}</div>
                  {r.ativo_codigo && <div className="text-xs text-muted-foreground font-mono">{r.ativo_codigo}</div>}
                </TableCell>
                <TableCell>{r.ativo_sistema || "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={r.data_fim ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}>
                    {r.data_fim ? "Concluído" : "Em andamento"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{format(new Date(r.data_inicio), "dd/MM/yyyy HH:mm", { locale: ptBR })}</TableCell>
                <TableCell className="text-sm">{r.data_fim ? format(new Date(r.data_fim), "dd/MM/yyyy HH:mm", { locale: ptBR }) : <span className="text-amber-600">Em andamento</span>}</TableCell>
                <TableCell className="font-semibold text-red-600">{formatMinutos(r.tempo_parado_minutos)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.observacao || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}