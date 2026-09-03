import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/hooks/use-company";
import { useRealtime } from "@/hooks/use-realtime";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ClipboardList, Clock, Play, AlertTriangle, CheckCircle2, RefreshCw, CalendarRange, CalendarClock, Flag, Timer, DollarSign, Wrench, ShieldCheck, TrendingUp, BarChart3, FileText } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend, PieChart, Pie } from "recharts";
import InsightsPanel from "@/components/dashboard/InsightsPanel";
import InvestigadorAutomatico from "@/components/dashboard/InvestigadorAutomatico";
import AlertsPanel from "@/components/dashboard/AlertsPanel";
import { format, isToday, isBefore, startOfDay, differenceInCalendarDays, isTomorrow } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { computeSlaStatus } from "@/lib/sla-utils";
import { isFinishedStatus } from "@/lib/os-status";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardHealthScore from "@/components/dashboard/DashboardHealthScore";
import DashboardSatisfactionScore from "@/components/dashboard/DashboardSatisfactionScore";
import DashboardRiskHeatmap from "@/components/dashboard/DashboardRiskHeatmap";
import DashboardFunilChamados from "@/components/dashboard/DashboardFunilChamados";
import DashboardWeather from "@/components/dashboard/DashboardWeather";
import { addPdfHeader, getAtlasCompanyInfo } from "@/lib/pdfHeader";
type AtividadeGlobal = {
  id: string;
  os_id: string;
  nome: string;
  data_inicio: string;
  data_termino: string;
  status: string;
  responsavel: string | null;
  codigo_os: string | null;
};

type Stats = {
  total: number;
  naoIniciadas: number;
  emTriagem: number;
  aguardandoMaterial: number;
  aguardandoAcesso: number;
  emExecucao: number;
  concluidas: number;
  canceladas: number;
};

type BlocoChartRow = {
  bloco: string;
  naoIniciadas: number;
  emExecucao: number;
  concluidas: number;
  aguardando: number;
};

/* ── Painel dinâmico de atividades ── */
function DashboardAtividades({ atividades, navigate }: { atividades: AtividadeGlobal[]; navigate: (path: string) => void }) {
  const today = startOfDay(new Date());

  const isOverdue = (a: AtividadeGlobal) => {
    const t = new Date(a.data_termino + "T00:00:00");
    return isBefore(t, today) && a.status !== "Concluído";
  };
  const isTodayAct = (a: AtividadeGlobal) => {
    return (isToday(new Date(a.data_inicio + "T00:00:00")) || isToday(new Date(a.data_termino + "T00:00:00"))) && !isOverdue(a);
  };
  const isFuture = (a: AtividadeGlobal) => !isOverdue(a) && !isTodayAct(a) && a.status !== "Concluído";

  const atrasadas = atividades.filter(isOverdue).sort((a, b) => a.data_termino.localeCompare(b.data_termino));
  const hojeList = atividades.filter(isTodayAct).sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
  const proximas = atividades.filter(isFuture).sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)).slice(0, 10);

  const fmtDate = (d: string) => { try { return format(new Date(d + "T00:00:00"), "dd/MM/yyyy"); } catch { return d; } };

  const Row = ({ a, indicator }: { a: AtividadeGlobal; indicator: string }) => (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
      <span className="text-base shrink-0">{indicator}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{a.nome}</div>
        <div className="text-xs text-muted-foreground">
          OS: {a.codigo_os || "—"} • {fmtDate(a.data_inicio)} → {fmtDate(a.data_termino)}
          {a.responsavel && ` • ${a.responsavel}`}
        </div>
      </div>
      <span className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border shrink-0",
        a.status === "Concluído" && "bg-emerald-50 text-emerald-700 border-emerald-200",
        a.status === "Em andamento" && "bg-sky-50 text-sky-700 border-sky-200",
        a.status === "Não iniciado" && "bg-zinc-100 text-zinc-600 border-zinc-200",
      )}>{a.status}</span>
    </div>
  );

  if (atividades.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-red-600">
          🔴 Atividades Atrasadas
          {atrasadas.length > 0 && <span className="text-xs bg-red-500/15 rounded-full px-2 py-0.5">{atrasadas.length}</span>}
        </h3>
        {atrasadas.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma atividade atrasada 🎉</p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">{atrasadas.map((a) => <Row key={a.id} a={a} indicator="🔴" />)}</div>
        )}
      </div>
      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-yellow-600">
          🟡 Hoje você precisa fazer
          {hojeList.length > 0 && <span className="text-xs bg-yellow-500/15 rounded-full px-2 py-0.5">{hojeList.length}</span>}
        </h3>
        {hojeList.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma atividade para hoje</p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">{hojeList.map((a) => <Row key={a.id} a={a} indicator="🟡" />)}</div>
        )}
      </div>
      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-sky-600">
          🔵 Próximas Atividades
        </h3>
        {proximas.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma atividade futura</p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">{proximas.map((a) => <Row key={a.id} a={a} indicator="🔵" />)}</div>
        )}
        {atividades.filter(isFuture).length > 10 && (
          <Button variant="link" size="sm" className="mt-2 text-xs" onClick={() => navigate("/cronogramas")}>
            Ver todas →
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ total: 0, naoIniciadas: 0, emTriagem: 0, aguardandoMaterial: 0, aguardandoAcesso: 0, emExecucao: 0, concluidas: 0, canceladas: 0 });
  const [cronoStats, setCronoStats] = useState({ total: 0, emAndamento: 0, concluidos: 0, atrasados: 0 });
  const [monthlyData, setMonthlyData] = useState<{ name: string; total: number }[]>([]);
  const [blocoData, setBlocoData] = useState<BlocoChartRow[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [blocoMap, setBlocoMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [prioStats, setPrioStats] = useState<Record<string, number>>({ Baixa: 0, Média: 0, Alta: 0, Crítica: 0 });
  const [atividades, setAtividades] = useState<AtividadeGlobal[]>([]);
  const [cronogramasList, setCronogramasList] = useState<any[]>([]);
  const [gastosPorOs, setGastosPorOs] = useState<{ osId: string; codigoOs: string; equipamentos: string; total: number }[]>([]);
  const [profilesMap, setProfilesMap] = useState<Map<string, string>>(new Map());
  const [ordensPreventivasCount, setOrdensPreventivasCount] = useState(0);

  // Filters
  const [filterOrigem, setFilterOrigem] = useState("__all__");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const { companyId } = useCompany();

  const fetchStats = useCallback(async () => {
    if (!companyId) return;

setLoading(true);

const [osRes, blocosRes, ativRes, gastosRes, profilesRes, opCountRes]: any =
  await Promise.all([
(supabase as any)
  .from("ordens_servico")
  .select(
    "id, status, created_at, bloco_id, data_inicio, data_termino, prazo, prioridade, codigo_os, sla_prazo_limite, tipo_servico"
  )
  .eq("company_id", companyId),

    (supabase as any)
  .from("blocos")
  .select("id, nome")
  .eq("company_id", companyId),

   (supabase as any)
  .from("atividades_os")
      .select(
        "id, os_id, nome, data_inicio, data_termino, status, responsavel, ordens_servico(codigo_os)"
      )
      .eq('company_id' as any, companyId),

    (supabase as any)
  .from("gastos")
      .select("os_id, valor")
      .eq("company_id", companyId),

    (supabase as any)
      .from("profiles")
      .select("id, nome")
      .eq('company_id' as any, companyId),

    
  (
  (supabase as any)
    .from("ordens_preventivas")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
),
]);

setOrdensPreventivasCount((opCountRes as any)?.count || 0);

if (osRes.error) {
  toast({
    title: "Erro ao carregar dados",
    description: osRes.error.message,
    variant: "destructive",
  });

  setLoading(false);
  return;
}

   const rows: any[] = osRes.data || [];
   const blocos: any[] = blocosRes.data || [];
    const profiles: any[] = profilesRes.data || [];
    const bMap: any = new Map(
  blocos.map((b: any) => [b.id, b.nome || "Sem nome"])
);
    const pMap: any = new Map(
  profiles.map((p: any) => [p.id, p.nome])
);
    setRawRows(rows);
    setBlocoMap(bMap);
    setProfilesMap(pMap);

    const s: Stats = { total: rows.length, naoIniciadas: 0, emTriagem: 0, aguardandoMaterial: 0, aguardandoAcesso: 0, emExecucao: 0, concluidas: 0, canceladas: 0 };
    const prioridadeCount: Record<string, number> = { Baixa: 0, Média: 0, Alta: 0, Crítica: 0 };
    const blocoStats: Record<string, BlocoChartRow> = {};

    rows.forEach((r) => {
      const st = (r.status || "").toLowerCase().trim();
      if (st === "não iniciada") s.naoIniciadas++;
      else if (st === "em triagem") s.emTriagem++;
      else if (st === "aguardando material") s.aguardandoMaterial++;
      else if (st === "aguardando acesso") s.aguardandoAcesso++;
      else if (st === "em execução" || st === "em andamento") s.emExecucao++;
      else if (st === "concluída" || st === "concluida") s.concluidas++;
      else if (st === "cancelada") s.canceladas++;

      const prio = r.prioridade || "Média";
      if (prio in prioridadeCount) prioridadeCount[prio]++;

      const blocoName = r.bloco_id ? (bMap.get(r.bloco_id) || "Sem bloco") : "Sem bloco";
      if (!blocoStats[blocoName]) {
        blocoStats[blocoName] = { bloco: blocoName, naoIniciadas: 0, emExecucao: 0, concluidas: 0, aguardando: 0 };
      }
      const bs = blocoStats[blocoName];
      if (st === "não iniciada" || st === "em triagem") bs.naoIniciadas++;
      else if (st === "em execução" || st === "em andamento") bs.emExecucao++;
      else if (st === "aguardando material" || st === "aguardando acesso") bs.aguardando++;
      else if (st === "concluída" || st === "concluida") bs.concluidas++;
    });

    setBlocoData(Object.values(blocoStats).sort((a, b) => a.bloco.localeCompare(b.bloco)));

    const monthMap: Record<string, number> = {};
    rows.forEach((r) => {
      if (r.created_at) {
        const key = r.created_at.substring(0, 7);
        monthMap[key] = (monthMap[key] || 0) + 1;
      }
    });
    const monthly = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, total]) => {
        const [y, mo] = m.split("-");
        return { name: `${mo}/${y}`, total };
      });
    setMonthlyData(monthly);
    setStats(s);
    setPrioStats(prioridadeCount);

    const ativDataForStats = (ativRes?.data as any[]) || [];
    const todayCrono = startOfDay(new Date());
    const cs = { total: ativDataForStats.length, emAndamento: 0, concluidos: 0, atrasados: 0 };
    ativDataForStats.forEach((a: any) => {
      const st = (a.status || "").trim();
      if (st === "Concluído") cs.concluidos++;
      else if (st === "Em andamento") {
        cs.emAndamento++;
        if (a.data_termino && isBefore(new Date(a.data_termino + "T00:00:00"), todayCrono)) cs.atrasados++;
      } else if (st === "Não iniciado" && a.data_termino && isBefore(new Date(a.data_termino + "T00:00:00"), todayCrono)) {
        cs.atrasados++;
      }
    });
    setCronoStats(cs);
    setCronogramasList(ativDataForStats);

    const ativData = (ativRes?.data as any[]) || [];
    setAtividades(ativData.map((d: any) => ({
      id: d.id, os_id: d.os_id, nome: d.nome,
      data_inicio: d.data_inicio, data_termino: d.data_termino,
      status: d.status, responsavel: d.responsavel,
      codigo_os: d.ordens_servico?.codigo_os || null,
    })));

    const gastosData = (gastosRes?.data as any[]) || [];
    const osById = new Map(rows.map((r: any) => [r.id, r]));
    const gastoMap: Record<string, number> = {};
    gastosData.forEach((g: any) => {
      if (g.os_id) gastoMap[g.os_id] = (gastoMap[g.os_id] || 0) + (g.valor || 0);
    });
    const gastosAgrupados = Object.entries(gastoMap)
      .map(([osId, total]) => {
        const os = osById.get(osId);
        return { osId, codigoOs: os?.codigo_os || "(sem código)", equipamentos: os?.equipamentos ? os.equipamentos.split("\n")[0].substring(0, 50) : "", total };
      })
      .sort((a, b) => b.total - a.total);
    setGastosPorOs(gastosAgrupados);

    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
useRealtime(
  ["ordens_servico", "blocos", "gastos", "atividades_os"],
  fetchStats,
  companyId
);

  // ── Filtered rows for dashboard sections ──
  const filteredRows = useMemo(() => {
    return rawRows.filter((r: any) => {
      if (filterOrigem !== "__all__" && r.origem !== filterOrigem) return false;
      if (filterStatus !== "__all__") {
        const st = (r.status || "").toLowerCase().trim();
        if (filterStatus === "Pendente" && (st === "concluída" || st === "concluida" || st === "cancelada")) return false;
        if (filterStatus === "Concluída" && st !== "concluída" && st !== "concluida") return false;
        if (filterStatus === "Atrasada") {
          const todayStr = new Date().toISOString().slice(0, 10);
          if (isFinishedStatus(r.status) || !r.prazo || r.prazo >= todayStr) return false;
        }
      }
      return true;
    });
  }, [rawRows, filterOrigem, filterStatus]);

  const openCount = stats.naoIniciadas + stats.emTriagem + stats.aguardandoMaterial + stats.aguardandoAcesso + stats.emExecucao;
  const todayStr = new Date().toISOString().slice(0, 10);

  const atrasadas = rawRows.filter((r: any) => {
    if (isFinishedStatus(r.status)) return false;
    const st = (r.status || "").toLowerCase().trim();
    if (st === "cancelada") return false;
    return r.prazo && r.prazo < todayStr;
  }).length;

  const currentMonth = new Date().toISOString().slice(0, 7);
  const concluidasMes = rawRows.filter((r: any) => {
    const st = (r.status || "").toLowerCase().trim();
    return (st === "concluída" || st === "concluida") && r.created_at && r.created_at.slice(0, 7) === currentMonth;
  }).length;

  const atividadesHoje = atividades.filter((a) => {
    return (isToday(new Date(a.data_inicio + "T00:00:00")) || isToday(new Date(a.data_termino + "T00:00:00"))) && a.status !== "Concluído";
  }).length;

  // ── Origin stats (preventivas = ordens_preventivas + legacy origem='Preventiva' em ordens_servico) ──
  const preventivaCount = ordensPreventivasCount + rawRows.filter((r: any) => r.origem === "Preventiva").length;
  const corretivaCount = rawRows.filter((r: any) => r.origem !== "Preventiva").length;

  // ── Performance metrics ──
  const preventivasNoPrazo = useMemo(() => {
    const preventivas = rawRows.filter((r: any) => r.origem === "Preventiva");
    const concluidas = preventivas.filter((r: any) => {
      const st = (r.status || "").toLowerCase().trim();
      return st === "concluída" || st === "concluida";
    });
    if (concluidas.length === 0) return null;
    const noPrazo = concluidas.filter((r: any) => {
      if (!r.prazo || !r.finalizado_em) return true;
      return r.finalizado_em.slice(0, 10) <= r.prazo;
    });
    return Math.round((noPrazo.length / concluidas.length) * 100);
  }, [rawRows]);

  const tempoMedioExecucao = useMemo(() => {
    const concluidas = rawRows.filter((r: any) => {
      const st = (r.status || "").toLowerCase().trim();
      return (st === "concluída" || st === "concluida") && r.data_inicio && r.finalizado_em;
    });
    if (concluidas.length === 0) return null;
    const totalDias = concluidas.reduce((sum: number, r: any) => {
      const dias = differenceInCalendarDays(new Date(r.finalizado_em), new Date(r.data_inicio));
      return sum + Math.max(dias, 0);
    }, 0);
    return Math.round(totalDias / concluidas.length);
  }, [rawRows]);

  // ── OS Críticas (vencidas e vencimento próximo) ──
  const osCriticas = useMemo(() => {
    const todayDate = startOfDay(new Date());
    return rawRows
      .filter((r: any) => {
        if (isFinishedStatus(r.status)) return false;
        const st = (r.status || "").toLowerCase().trim();
        if (st === "cancelada") return false;
        if (!r.prazo) return false;
        const prazoDate = new Date(r.prazo + "T00:00:00");
        const diff = differenceInCalendarDays(prazoDate, todayDate);
        return diff <= 1; // vencidas ou vencem hoje/amanhã
      })
      .map((r: any) => {
        const prazoDate = new Date(r.prazo + "T00:00:00");
        const diff = differenceInCalendarDays(prazoDate, startOfDay(new Date()));
        return { ...r, diasRestantes: diff };
      })
      .sort((a: any, b: any) => a.diasRestantes - b.diasRestantes);
  }, [rawRows]);

  // ── Preventiva vs Corretiva chart data ──
  const origemChartData = useMemo(() => {
    const monthMap: Record<string, { preventiva: number; corretiva: number }> = {};
    rawRows.forEach((r: any) => {
      if (!r.created_at) return;
      const key = r.created_at.substring(0, 7);
      if (!monthMap[key]) monthMap[key] = { preventiva: 0, corretiva: 0 };
      if (r.origem === "Preventiva") monthMap[key].preventiva++;
      else monthMap[key].corretiva++;
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, d]) => {
        const [y, mo] = m.split("-");
        return { name: `${mo}/${y}`, Preventiva: d.preventiva, Corretiva: d.corretiva };
      });
  }, [rawRows]);

  // Unique responsáveis for filter

  const cards = [
    { label: "Total de O.S.", value: stats.total, icon: ClipboardList, color: "from-blue-50 to-white border-blue-200", iconColor: "text-blue-600", to: "/ordens-servico" },
    { label: "Em Aberto", value: openCount, icon: Play, color: "from-sky-50 to-white border-sky-200", iconColor: "text-sky-600", to: "/ordens-servico" },
    { label: "Atrasadas", value: atrasadas, icon: AlertTriangle, color: "from-red-50 to-white border-red-200", iconColor: "text-red-600", to: "/ordens-servico?atrasada=true" },
    { label: "Concluídas no Mês", value: concluidasMes, icon: CheckCircle2, color: "from-emerald-50 to-white border-emerald-200", iconColor: "text-emerald-600", to: "/ordens-servico?status=Concluída" },
    { label: "Preventivas", value: preventivaCount, icon: ShieldCheck, color: "from-indigo-50 to-white border-indigo-200", iconColor: "text-indigo-600", to: "/ordens-preventivas" },
    { label: "Corretivas", value: corretivaCount, icon: Wrench, color: "from-orange-50 to-white border-orange-200", iconColor: "text-orange-600", to: "/ordens-servico?origem=Corretiva" },
    { label: "Atividades Hoje", value: atividadesHoje, icon: CalendarClock, color: "from-purple-50 to-white border-purple-200", iconColor: "text-purple-600", to: "/cronogramas" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <DashboardWeather />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={async () => {
            const doc = new jsPDF();
            const company = await getAtlasCompanyInfo();
            const startY = await addPdfHeader(doc, "Relatório Executivo", format(new Date(), "dd/MM/yyyy HH:mm"), company);

            // Resumo OS
            doc.setFontSize(13); doc.setTextColor(30);
            doc.text("Resumo de Ordens de Serviço", 14, startY);
            autoTable(doc, {
              startY: startY + 4,
              head: [["Indicador", "Quantidade"]],
              body: [
                ["Total de OS", stats.total],
                ["Em Aberto", openCount],
                ["Atrasadas", atrasadas],
                ["Concluídas no Mês", concluidasMes],
                ["Preventivas", preventivaCount],
                ["Corretivas", corretivaCount],
              ],
              headStyles: { fillColor: [58, 53, 92] },
              styles: { fontSize: 10 },
            });

            // OS por Prioridade
            const y1 = (doc as any).lastAutoTable.finalY + 10;
            doc.setFontSize(13); doc.text("OS por Prioridade", 14, y1);
            autoTable(doc, {
              startY: y1 + 4,
              head: [["Prioridade", "Quantidade"]],
              body: Object.entries(prioStats).map(([k, v]) => [k, v]),
              headStyles: { fillColor: [58, 53, 92] },
              styles: { fontSize: 10 },
            });

            // Performance
            const y2 = (doc as any).lastAutoTable.finalY + 10;
            doc.setFontSize(13); doc.text("Indicadores de Performance", 14, y2);
            autoTable(doc, {
              startY: y2 + 4,
              head: [["Indicador", "Valor"]],
              body: [
                ["Preventivas no Prazo", preventivasNoPrazo !== null ? `${preventivasNoPrazo}%` : "—"],
                ["Tempo Médio de Execução", tempoMedioExecucao !== null ? `${tempoMedioExecucao} dias` : "—"],
                ["OS com SLA Estourado", atrasadas],
              ],
              headStyles: { fillColor: [58, 53, 92] },
              styles: { fontSize: 10 },
            });

            // Gastos por OS
            if (gastosPorOs.length > 0) {
              const y3 = (doc as any).lastAutoTable.finalY + 10;
              if (y3 > 240) doc.addPage();
              const yg = y3 > 240 ? 14 : y3;
              doc.setFontSize(13); doc.text("Gastos por O.S.", 14, yg);
              autoTable(doc, {
                startY: yg + 4,
                head: [["Código OS", "Descrição", "Total"]],
                body: gastosPorOs.slice(0, 10).map(g => [g.codigoOs, g.equipamentos || "—", `R$ ${g.total.toFixed(2)}`]),
                headStyles: { fillColor: [58, 53, 92] },
                styles: { fontSize: 9 },
              });
            }

            doc.save(`relatorio-executivo-${format(new Date(), "yyyyMMdd")}.pdf`);
            toast({ title: "📄 Relatório gerado com sucesso!" });
          }}>
            <FileText className="h-4 w-4" /> Relatório PDF
          </Button>
          <Button variant="outline" size="icon" onClick={fetchStats} title="Atualizar">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5">
            <Skeleton className="h-5 w-40 mb-4" />
            <Skeleton className="h-32 w-full max-w-xs mx-auto rounded-full" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-10" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
        <DashboardHealthScore rows={rawRows} ordensPreventivasCount={ordensPreventivasCount} />
        <DashboardSatisfactionScore />
        <DashboardRiskHeatmap />
        <DashboardFunilChamados />
          {/* ── Cards principais ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            {cards.map((c) => (
              <div
                key={c.label}
                onClick={() => navigate(c.to)}
                className={`rounded-xl border bg-gradient-to-br ${c.color} p-4 flex flex-col gap-2 cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{c.label}</span>
                  <c.icon className={`h-4 w-4 ${c.iconColor}`} />
                </div>
                <span className="text-2xl font-bold tracking-tight">{c.value}</span>
              </div>
            ))}
          </div>

          {/* ── Indicadores de desempenho ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-muted-foreground">Preventivas no Prazo</span>
              </div>
              <span className="text-3xl font-bold">
                {preventivasNoPrazo !== null ? `${preventivasNoPrazo}%` : "—"}
              </span>
              <p className="text-xs text-muted-foreground mt-1">das preventivas concluídas dentro do prazo</p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-muted-foreground">Tempo Médio Execução</span>
              </div>
              <span className="text-3xl font-bold">
                {tempoMedioExecucao !== null ? `${tempoMedioExecucao}d` : "—"}
              </span>
              <p className="text-xs text-muted-foreground mt-1">dias em média para concluir uma OS</p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium text-muted-foreground">OS Atrasadas</span>
              </div>
              <span className="text-3xl font-bold text-destructive">{atrasadas}</span>
              <p className="text-xs text-muted-foreground mt-1">ordens de serviço com prazo vencido</p>
            </div>
          </div>

          {/* ── OS Críticas ── */}
          {osCriticas.length > 0 && (
            <div className="rounded-xl border bg-card p-5 mt-6">
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-destructive" /> OS Críticas
              </h2>
              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {osCriticas.slice(0, 15).map((os: any) => (
                  <div
                    key={os.id}
                    onClick={() => navigate("/ordens-servico")}
                    className="flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-lg shrink-0">
                      {os.diasRestantes < 0 ? "🔴" : os.diasRestantes === 0 ? "🟠" : "🟡"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{os.codigo_os || os.titulo || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {os.equipamentos ? os.equipamentos.split("\n")[0].substring(0, 60) : "Sem descrição"}
                        {os.responsible_user_id && ` • ${profilesMap.get(os.responsible_user_id) || ""}`}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant={os.diasRestantes < 0 ? "destructive" : "outline"} className="text-xs">
                        {os.diasRestantes < 0
                          ? `${Math.abs(os.diasRestantes)}d atraso`
                          : os.diasRestantes === 0
                          ? "Vence hoje"
                          : "Vence amanhã"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <AlertsPanel osRows={rawRows} atividades={atividades} cronogramas={cronogramasList} blocoMap={blocoMap} />
          <InsightsPanel rows={rawRows} blocoMap={blocoMap} />
          <InvestigadorAutomatico />

          {/* ── Preventivas vs Corretivas (chart) ── */}
          {origemChartData.length > 0 && (
            <div className="rounded-xl border bg-card p-5 mt-6">
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <BarChart3 className="h-5 w-5 text-primary" /> Preventivas vs Corretivas por Mês
              </h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={origemChartData}>
                  <XAxis dataKey="name" tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: "#fff", border: "1px solid hsl(220, 13%, 91%)", borderRadius: 8, color: "#111827" }} labelStyle={{ color: "#111827" }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "hsl(220, 9%, 46%)" }} />
                  <Bar dataKey="Preventiva" fill="hsl(220, 70%, 55%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Corretiva" fill="hsl(15, 80%, 55%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Prioridade cards */}
          <div className="rounded-xl border bg-card p-5 mt-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Flag className="h-5 w-5 text-primary" /> O.S. por Prioridade
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {(["Baixa", "Média", "Alta", "Crítica"] as const).map((prio) => {
                const styles: Record<string, string> = {
                  Baixa: "from-zinc-50 to-white border-zinc-200",
                  Média: "from-blue-50 to-white border-blue-200",
                  Alta: "from-amber-50 to-white border-amber-200",
                  Crítica: "from-red-50 to-white border-red-200",
                };
                return (
                  <div
                    key={prio}
                    onClick={() => navigate(`/ordens-servico?prioridade=${prio}`)}
                    className={`rounded-lg border bg-gradient-to-br ${styles[prio]} p-4 cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200`}
                  >
                    <span className="text-xs text-muted-foreground block">{prio}</span>
                    <span className="text-2xl font-bold">{prioStats[prio]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SLA Summary */}
          {(() => {
            const slaStats = { dentro_do_prazo: 0, em_risco: 0, atrasada: 0, sem_sla: 0 };
            rawRows.forEach((r: any) => {
              const st = (r.status || "").toLowerCase().trim();
              if (st === "concluída" || st === "concluida") return;
              const sla = computeSlaStatus(r.sla_prazo_limite, r.status, r.created_at);
              if (sla.status in slaStats) slaStats[sla.status as keyof typeof slaStats]++;
            });
            const hasAnySla = slaStats.dentro_do_prazo + slaStats.em_risco + slaStats.atrasada > 0;
            if (!hasAnySla) return null;
            return (
              <div className="rounded-xl border bg-card p-5 mt-6">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <Timer className="h-5 w-5 text-primary" /> SLA das O.S. em Aberto
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div onClick={() => navigate("/ordens-servico")} className="rounded-lg border bg-gradient-to-br from-emerald-50 to-white border-emerald-200 p-4 cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200">
                    <span className="text-xs text-muted-foreground block">Dentro do Prazo</span>
                    <span className="text-2xl font-bold text-emerald-600">{slaStats.dentro_do_prazo}</span>
                  </div>
                  <div onClick={() => navigate("/ordens-servico")} className="rounded-lg border bg-gradient-to-br from-amber-50 to-white border-amber-200 p-4 cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200">
                    <span className="text-xs text-muted-foreground block">Em Risco</span>
                    <span className="text-2xl font-bold text-amber-600">{slaStats.em_risco}</span>
                  </div>
                  <div onClick={() => navigate("/ordens-servico")} className="rounded-lg border bg-gradient-to-br from-red-50 to-white border-red-200 p-4 cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200">
                    <span className="text-xs text-muted-foreground block">SLA Estourado</span>
                    <span className="text-2xl font-bold text-red-600">{slaStats.atrasada}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Total gasto por O.S. */}
          {gastosPorOs.length > 0 && (
            <div className="rounded-xl border bg-card p-5 mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" /> Total Gasto por O.S.
                </h2>
                <Button variant="outline" size="sm" onClick={() => navigate("/gastos")}>Ver gastos</Button>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Código</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Descrição</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total Gasto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gastosPorOs.slice(0, 10).map((item) => (
                      <tr key={item.osId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-primary">{item.codigoOs}</td>
                        <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[250px]">{item.equipamentos || "—"}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold">
                          {item.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {gastosPorOs.length > 0 && (
                    <tfoot>
                      <tr className="bg-muted/30">
                        <td colSpan={2} className="px-4 py-2.5 font-semibold">Total Geral</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-primary">
                          {gastosPorOs.reduce((s, g) => s + g.total, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {gastosPorOs.length > 10 && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Exibindo 10 de {gastosPorOs.length} O.S. com gastos · <button className="text-primary hover:underline" onClick={() => navigate("/gastos")}>Ver todos</button>
                </p>
              )}
            </div>
          )}

          <DashboardAtividades atividades={atividades} navigate={navigate} />

          {/* Cronogramas resumo */}
          <div className="rounded-xl border bg-card p-5 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CalendarRange className="h-5 w-5 text-primary" /> Cronogramas
              </h2>
              <Button variant="outline" size="sm" onClick={() => navigate("/cronogramas")}>Ver cronogramas</Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total", value: cronoStats.total, style: "from-blue-50 to-white border-blue-200", filter: "" },
                { label: "Em Andamento", value: cronoStats.emAndamento, style: "from-sky-50 to-white border-sky-200", filter: "?status=Em andamento" },
                { label: "Concluídos", value: cronoStats.concluidos, style: "from-emerald-50 to-white border-emerald-200", filter: "?status=Concluído" },
                { label: "Atrasados", value: cronoStats.atrasados, style: "from-red-50 to-white border-red-200", filter: "?status=Atrasado" },
              ].map((item) => (
                <div key={item.label} onClick={() => navigate(`/cronogramas${item.filter}`)} className={`rounded-lg border bg-gradient-to-br ${item.style} p-4 cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200`}>
                  <span className="text-xs text-muted-foreground block">{item.label}</span>
                  <span className="text-2xl font-bold">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bar chart – O.S. por Status */}
          <div className="rounded-xl border bg-card p-5 mt-6">
            <h2 className="text-lg font-semibold mb-4">O.S. por Status</h2>
            {(() => {
              const barData = [
                { name: "Não Iniciadas", value: stats.naoIniciadas, fill: "hsl(45, 80%, 55%)" },
                { name: "Em Triagem", value: stats.emTriagem, fill: "hsl(270, 60%, 55%)" },
                { name: "Aguardando", value: stats.aguardandoMaterial + stats.aguardandoAcesso, fill: "hsl(30, 80%, 55%)" },
                { name: "Em Execução", value: stats.emExecucao, fill: "hsl(200, 80%, 55%)" },
                { name: "Concluídas", value: stats.concluidas, fill: "hsl(150, 65%, 45%)" },
                { name: "Canceladas", value: stats.canceladas, fill: "hsl(0, 70%, 55%)" },
              ];
              return barData.every((d) => d.value === 0) ? (
                <p className="text-muted-foreground text-sm">Nenhuma O.S. cadastrada.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barData}>
                    <XAxis dataKey="name" tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} />
                    <Tooltip contentStyle={{ background: "#fff", border: "1px solid hsl(220, 13%, 91%)", borderRadius: 8, color: "#111827" }} labelStyle={{ color: "#111827" }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {barData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </div>

          {/* Grouped bar chart – O.S. por Bloco */}
          <div className="rounded-xl border bg-card p-5 mt-6">
            <h2 className="text-lg font-semibold mb-4">O.S. por Bloco/Prédio</h2>
            {blocoData.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum dado por bloco.</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={blocoData}>
                  <XAxis dataKey="bloco" tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: "#fff", border: "1px solid hsl(220, 13%, 91%)", borderRadius: 8, color: "#111827" }} labelStyle={{ color: "#111827" }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "hsl(220, 9%, 46%)" }} />
                  <Bar dataKey="naoIniciadas" name="Não Iniciadas" fill="hsl(45, 80%, 55%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="emExecucao" name="Em Execução" fill="hsl(200, 80%, 55%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="aguardando" name="Aguardando" fill="hsl(30, 80%, 55%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="concluidas" name="Concluídas" fill="hsl(150, 65%, 45%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Line chart – Evolução mensal */}
          <div className="rounded-xl border bg-card p-5 mt-6">
            <h2 className="text-lg font-semibold mb-4">Evolução de O.S. por Mês</h2>
            {monthlyData.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sem dados de evolução.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={monthlyData}>
                  <XAxis dataKey="name" tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: "#fff", border: "1px solid hsl(220, 13%, 91%)", borderRadius: 8, color: "#111827" }} labelStyle={{ color: "#111827" }} />
                  <Line type="monotone" dataKey="total" stroke="hsl(243, 75%, 59%)" strokeWidth={2} dot={{ fill: "hsl(243, 75%, 59%)", r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
}
