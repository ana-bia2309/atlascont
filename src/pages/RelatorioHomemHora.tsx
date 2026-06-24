import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Clock, Download, FileSpreadsheet, RefreshCw, Wrench, ShieldCheck } from "@/lib/icons";
import { format, parseISO } from "date-fns";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "@/hooks/use-toast";

type Tipo = "Preventiva" | "Corretiva";

type HoraRecord = {
  id: string;
  atividade_id: string | null;
  os_id: string | null;
  ordem_preventiva_id: string | null;
  atividade_op_id: string | null;
  user_id: string;
  data_registro: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  total_minutos: number;
  origem: string;
  tipo: Tipo;
  descricao: string | null;
};

type OSInfo = { id: string; codigo_os: string | null; titulo: string | null };
type OPInfo = { id: string; codigo_op: string; titulo: string | null };
type AtividadeOSInfo = { id: string; nome: string };
type AtividadeOPInfo = { id: string; nome: string };
type ProfileInfo = { id: string; nome: string };

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatHours(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}

export default function RelatorioHomemHora() {
  const { can } = usePermissions();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState(String(currentMonth));
  const [selectedUser, setSelectedUser] = useState("Todos");
  const [tab, setTab] = useState<"todas" | "preventiva" | "corretiva">("todas");

  const [horas, setHoras] = useState<HoraRecord[]>([]);
  const [osList, setOsList] = useState<OSInfo[]>([]);
  const [opList, setOpList] = useState<OPInfo[]>([]);
  const [atividadesOs, setAtividadesOs] = useState<AtividadeOSInfo[]>([]);
  const [atividadesOp, setAtividadesOp] = useState<AtividadeOPInfo[]>([]);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [loading, setLoading] = useState(true);

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

  const [horasRes, osRes, opRes, ativOsRes, ativOpRes, profilesRes] =
    await Promise.all([
      (supabase as any)
        .from("horas_atividade")
        .select(
          "id, atividade_id, os_id, ordem_preventiva_id, atividade_op_id, user_id, data_registro, hora_inicio, hora_fim, total_minutos, origem, tipo, descricao"
        ),

      (supabase as any)
        .from("ordens_servico")
        .select("id, codigo_os, titulo")
        .eq("company_id", companyId),

      (supabase.from("ordens_preventivas" as any) as any)
        .select("id, codigo_op, titulo")
        .eq("company_id", companyId),

      (supabase as any)
        .from("atividades_os")
        .select("id, nome, ordens_servico(company_id)")
        .eq("ordens_servico.company_id", companyId),

      (supabase.from("atividades_ordem_preventiva" as any) as any)
        .select("id, nome"),

      (supabase as any)
        .from("profiles")
        .select("id, nome")
        .eq("status", "ativo")
        .eq("company_id", companyId),
    ]);

  if (horasRes.data) setHoras(horasRes.data as any);
  if (osRes.data) setOsList(osRes.data);
  if (opRes.data) setOpList(opRes.data as any);
  if (ativOsRes.data) setAtividadesOs(ativOsRes.data);
  if (ativOpRes.data) setAtividadesOp(ativOpRes.data as any);
  if (profilesRes.data) setProfiles(profilesRes.data);

  setLoading(false);
}, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const osMap = useMemo(() => new Map(osList.map((o) => [o.id, o])), [osList]);
  const opMap = useMemo(() => new Map(opList.map((o) => [o.id, o])), [opList]);
  const ativOsMap = useMemo(() => new Map(atividadesOs.map((a) => [a.id, a])), [atividadesOs]);
  const ativOpMap = useMemo(() => new Map(atividadesOp.map((a) => [a.id, a])), [atividadesOp]);
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const filtered = useMemo(() => {
    const year = parseInt(selectedYear);
    const month = parseInt(selectedMonth);
    return horas.filter((h) => {
      const d = parseISO(h.data_registro);
      if (d.getFullYear() !== year || d.getMonth() !== month) return false;
      if (selectedUser !== "Todos" && h.user_id !== selectedUser) return false;
      if (tab === "preventiva" && h.tipo !== "Preventiva") return false;
      if (tab === "corretiva" && h.tipo !== "Corretiva") return false;
      return true;
    });
  }, [horas, selectedYear, selectedMonth, selectedUser, tab]);

  const rows = useMemo(() => {
    return filtered
      .map((h) => {
        const profile = profileMap.get(h.user_id);
        let ordemCodigo = "—";
        let atividadeNome = "—";
        if (h.tipo === "Preventiva" && h.ordem_preventiva_id) {
          const op = opMap.get(h.ordem_preventiva_id);
          ordemCodigo = op?.codigo_op || op?.titulo || h.ordem_preventiva_id.slice(0, 8);
          if (h.atividade_op_id) {
            atividadeNome = ativOpMap.get(h.atividade_op_id)?.nome || "—";
          } else {
            atividadeNome = "Execução geral da OP";
          }
 } else if (h.tipo === "Corretiva" && h.os_id) {
  const os = osMap.get(h.os_id);
  ordemCodigo = os?.codigo_os || os?.titulo || h.os_id.slice(0, 8);
  if (h.atividade_id) {
    atividadeNome = ativOsMap.get(h.atividade_id)?.nome || "Execução geral da O.S.";
  } else {
    atividadeNome = "Execução geral da O.S.";
  }
}
        return {
          id: h.id,
          tipo: h.tipo,
          ordemCodigo,
          atividadeNome,
          user_name: profile?.nome || "—",
          user_id: h.user_id,
          data_registro: h.data_registro,
          hora_inicio: h.hora_inicio,
          hora_fim: h.hora_fim,
          total_minutos: h.total_minutos,
        };
      })
      .sort((a, b) => (a.data_registro < b.data_registro ? 1 : -1));
  }, [filtered, profileMap, opMap, osMap, ativOpMap, ativOsMap]);

  const totalGeral = useMemo(() => rows.reduce((s, r) => s + r.total_minutos, 0), [rows]);
  const totalPreventiva = useMemo(
    () => filtered.filter((h) => h.tipo === "Preventiva").reduce((s, h) => s + h.total_minutos, 0),
    [filtered],
  );
  const totalCorretiva = useMemo(
    () => filtered.filter((h) => h.tipo === "Corretiva").reduce((s, h) => s + h.total_minutos, 0),
    [filtered],
  );

  const years = useMemo(() => {
    const y = new Set<number>();
    for (let i = currentYear - 3; i <= currentYear + 1; i++) y.add(i);
    horas.forEach((h) => y.add(parseISO(h.data_registro).getFullYear()));
    return Array.from(y).sort();
  }, [horas, currentYear]);

  const exportPDF = () => {
    if (rows.length === 0) {
      toast({ title: "Nenhum dado para exportar", variant: "destructive" });
      return;
    }
    const month = parseInt(selectedMonth);
    const year = parseInt(selectedYear);
    let html = `<html><head><meta charset="utf-8"><title>Relatório Homem-Hora</title>
    <style>
      body{font-family:Arial,sans-serif;padding:20px;font-size:12px}
      .brand{display:flex;align-items:center;gap:10px;margin-bottom:4px}
      .brand img{height:32px}
      h1{font-size:18px;margin:0;color:#3A355C}
      h2{font-size:13px;color:#666;margin-bottom:16px}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#3A355C;color:#fff;font-size:11px}
      tr:nth-child(even){background:#f4f3f7}
      .total{font-weight:bold;background:#E4E1ED}
      .prev{color:#3A355C;font-weight:bold}
      .cor{color:#6C6498;font-weight:bold}
    </style></head><body>
    <div class="brand"><img src="${window.location.origin}/icons/icon-256.png" /><h1>Atlas Control — Relatório Homem-Hora</h1></div>
    <h2>${MONTHS[month]}/${year} — Aba: ${tab.toUpperCase()}</h2>
    <table><thead><tr>
      <th>Tipo</th><th>Ordem</th><th>Atividade</th><th>Responsável</th>
      <th>Data</th><th>Início</th><th>Fim</th><th>Tempo</th>
    </tr></thead><tbody>`;
    rows.forEach((r) => {
      html += `<tr>
        <td class="${r.tipo === "Preventiva" ? "prev" : "cor"}">${r.tipo}</td>
        <td>${r.ordemCodigo}</td>
        <td>${r.atividadeNome}</td>
        <td>${r.user_name}</td>
        <td>${format(parseISO(r.data_registro), "dd/MM/yyyy")}</td>
        <td>${r.hora_inicio || "—"}</td>
        <td>${r.hora_fim || "—"}</td>
        <td>${formatHours(r.total_minutos)}</td>
      </tr>`;
    });
    html += `<tr class="total"><td colspan="7">TOTAL</td><td>${formatHours(totalGeral)}</td></tr>`;
    html += `</tbody></table></body></html>`;

    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => { w.print(); }, 500);
    }
  };

  const exportExcel = () => {
    if (rows.length === 0) {
      toast({ title: "Nenhum dado para exportar", variant: "destructive" });
      return;
    }
    const BOM = "\uFEFF";
    let csv = BOM + "Tipo;Ordem;Atividade;Responsável;Data;Início;Fim;Tempo\n";
    rows.forEach((r) => {
      csv += `${r.tipo};${r.ordemCodigo};${r.atividadeNome};${r.user_name};${format(parseISO(r.data_registro), "dd/MM/yyyy")};${r.hora_inicio || ""};${r.hora_fim || ""};${formatHours(r.total_minutos)}\n`;
    });
    csv += `TOTAL;;;;;;;${formatHours(totalGeral)}\n`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-homem-hora-${selectedYear}-${(parseInt(selectedMonth) + 1).toString().padStart(2, "0")}-${tab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" />
          Relatório Homem-Hora
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
          {can("relatorio_hh.exportar") && (
            <>
              <Button variant="outline" size="sm" onClick={exportPDF}>
                <Download className="h-4 w-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportExcel}>
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
              </Button>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Fonte: tabela horas_atividade — registros gerados pelos cronômetros das O.S. (Corretivas) e das Ordens Preventivas (Preventivas).
      </p>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Mês" /></SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="Ano" /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={selectedUser} onValueChange={setSelectedUser}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Usuário" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Todos os usuários</SelectItem>
            {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold">{rows.length}</p>
          <p className="text-xs text-muted-foreground">Lançamentos</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-primary">{formatHours(totalGeral)}</p>
          <p className="text-xs text-muted-foreground">Total (visível)</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-sky-600 flex items-center justify-center gap-1">
            <ShieldCheck className="h-5 w-5" /> {formatHours(totalPreventiva)}
          </p>
          <p className="text-xs text-muted-foreground">Preventiva</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-amber-600 flex items-center justify-center gap-1">
            <Wrench className="h-5 w-5" /> {formatHours(totalCorretiva)}
          </p>
          <p className="text-xs text-muted-foreground">Corretiva</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
        <TabsList>
          <TabsTrigger value="todas">Todas</TabsTrigger>
          <TabsTrigger value="preventiva">Preventiva</TabsTrigger>
          <TabsTrigger value="corretiva">Corretiva</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground">Nenhum registro encontrado para o período selecionado.</p>
          ) : (
            <div className="rounded-lg border bg-card overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Ordem</TableHead>
                    <TableHead>Atividade</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Fim</TableHead>
                    <TableHead className="text-right">Tempo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={r.id} className={i % 2 === 0 ? "bg-muted/30" : ""}>
                      <TableCell>
                        {r.tipo === "Preventiva" ? (
                          <Badge className="bg-sky-600 hover:bg-sky-600/90 text-white">Preventiva</Badge>
                        ) : (
                          <Badge className="bg-amber-600 hover:bg-amber-600/90 text-white">Corretiva</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{r.ordemCodigo}</TableCell>
                      <TableCell>{r.atividadeNome}</TableCell>
                      <TableCell>{r.user_name}</TableCell>
                      <TableCell>{format(parseISO(r.data_registro), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{r.hora_inicio || "—"}</TableCell>
                      <TableCell>{r.hora_fim || "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{formatHours(r.total_minutos)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted font-bold">
                    <TableCell colSpan={7}>TOTAL</TableCell>
                    <TableCell className="text-right">{formatHours(totalGeral)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
