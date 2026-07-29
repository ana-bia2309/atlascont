import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Download, FileText, RefreshCw, Star, TrendingDown, TrendingUp } from "@/lib/icons";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid,
} from "recharts";

type AvaliacaoCompleta = {
  os_id: string;
  codigo_os: string | null;
  titulo: string | null;
  bloco_nome: string | null;
  empresa_nome: string | null;
  responsavel_nome: string | null;
  avaliado_por_nome: string | null;
  tipo_servico: string | null;
  nota_geral: number | null;
  decisao: string | null;
  comentarios_fiscal: string | null;
  sugestoes_melhoria: string | null;
  avaliado_em: string | null;
};

type Periodo = "dia" | "mes" | "trimestre" | "ano";

function groupAvg(rows: AvaliacaoCompleta[], key: keyof AvaliacaoCompleta) {
  const map = new Map<string, { soma: number; qtd: number; reprovadas: number }>();
  rows.forEach((r) => {
    const k = (r[key] as string) || "—";
    if (r.nota_geral == null) return;
    const v = map.get(k) || { soma: 0, qtd: 0, reprovadas: 0 };
    v.soma += r.nota_geral;
    v.qtd += 1;
    if (r.decisao === "reprovado") v.reprovadas += 1;
    map.set(k, v);
  });
  return [...map.entries()]
    .map(([nome, v]) => ({ nome, media: v.soma / v.qtd, qtd: v.qtd, reprovadas: v.reprovadas }))
    .sort((a, b) => b.media - a.media);
}

function periodoKey(dateStr: string, periodo: Periodo) {
  const d = new Date(dateStr);
  if (periodo === "dia") return format(d, "dd/MM/yyyy");
  if (periodo === "mes") return format(d, "MM/yyyy");
  if (periodo === "trimestre") return `T${Math.floor(d.getMonth() / 3) + 1}/${d.getFullYear()}`;
  return String(d.getFullYear());
}

export default function RelatoriosAvaliacoes() {
  const [allRows, setAllRows] = useState<AvaliacaoCompleta[]>([]);
  const [loading, setLoading] = useState(true);

  const [filtroEmpresa, setFiltroEmpresa] = useState("todos");
  const [filtroBloco, setFiltroBloco] = useState("todos");
  const [filtroFiscal, setFiltroFiscal] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [periodo, setPeriodo] = useState<Periodo>("mes");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: avals, error } = await (supabase as any)
        .from("avaliacoes_os")
        .select("os_id, nota_geral, decisao, comentarios_fiscal, sugestoes_melhoria, avaliado_por_nome, avaliado_em")
        .eq("status", "avaliada")
        .order("avaliado_em", { ascending: false });
      if (error) throw error;

      const osIds = (avals || []).map((a: any) => a.os_id);
      const { data: osList } = osIds.length
        ? await (supabase as any).from("ordens_servico")
          .select("id, codigo_os, titulo, bloco_id, company_id, responsible_user_id, tipo_servico")
          .in("id", osIds)
        : { data: [] };

      const blocoIds = [...new Set((osList || []).map((o: any) => o.bloco_id).filter(Boolean))];
      const companyIds = [...new Set((osList || []).map((o: any) => o.company_id).filter(Boolean))];
      const respIds = [...new Set((osList || []).map((o: any) => o.responsible_user_id).filter(Boolean))];

      const [blocosRes, companiesRes, profilesRes] = await Promise.all([
        blocoIds.length ? (supabase as any).from("blocos").select("id, nome").in("id", blocoIds) : Promise.resolve({ data: [] }),
        companyIds.length ? (supabase as any).from("companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: [] }),
        respIds.length ? (supabase as any).from("profiles").select("id, nome").in("id", respIds) : Promise.resolve({ data: [] }),
      ]);

      const blocoMap = new Map((blocosRes.data || []).map((b: any) => [b.id, b.nome]));
      const companyMap = new Map((companiesRes.data || []).map((c: any) => [c.id, c.name]));
      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p.nome]));
      const osMap = new Map((osList || []).map((o: any) => [o.id, o]));

      const merged: AvaliacaoCompleta[] = (avals || []).map((a: any) => {
        const o: any = osMap.get(a.os_id) || {};
        return {
          os_id: a.os_id,
          codigo_os: o.codigo_os || null,
          titulo: o.titulo || null,
          bloco_nome: blocoMap.get(o.bloco_id) || null,
          empresa_nome: companyMap.get(o.company_id) || null,
          responsavel_nome: profileMap.get(o.responsible_user_id) || null,
          avaliado_por_nome: a.avaliado_por_nome || null,
          tipo_servico: o.tipo_servico || null,
          nota_geral: a.nota_geral,
          decisao: a.decisao,
          comentarios_fiscal: a.comentarios_fiscal,
          sugestoes_melhoria: a.sugestoes_melhoria,
          avaliado_em: a.avaliado_em,
        };
      });

      setAllRows(merged);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao carregar relatório", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const empresasDisponiveis = useMemo(() => [...new Set(allRows.map((r) => r.empresa_nome).filter(Boolean))] as string[], [allRows]);
  const blocosDisponiveis = useMemo(() => [...new Set(allRows.map((r) => r.bloco_nome).filter(Boolean))] as string[], [allRows]);
  const fiscaisDisponiveis = useMemo(() => [...new Set(allRows.map((r) => r.avaliado_por_nome).filter(Boolean))] as string[], [allRows]);
  const tiposDisponiveis = useMemo(() => [...new Set(allRows.map((r) => r.tipo_servico).filter(Boolean))] as string[], [allRows]);

  const rows = useMemo(() => allRows.filter((r) =>
    (filtroEmpresa === "todos" || r.empresa_nome === filtroEmpresa) &&
    (filtroBloco === "todos" || r.bloco_nome === filtroBloco) &&
    (filtroFiscal === "todos" || r.avaliado_por_nome === filtroFiscal) &&
    (filtroTipo === "todos" || r.tipo_servico === filtroTipo)
  ), [allRows, filtroEmpresa, filtroBloco, filtroFiscal, filtroTipo]);

  const porEmpresa = useMemo(() => groupAvg(rows, "empresa_nome"), [rows]);
  const porFiscal = useMemo(() => groupAvg(rows, "avaliado_por_nome"), [rows]);
  const porBloco = useMemo(() => groupAvg(rows, "bloco_nome"), [rows]);
  const porTipo = useMemo(() => groupAvg(rows, "tipo_servico"), [rows]);

  const mediaGeral = useMemo(() => {
    const validas = rows.filter((r) => r.nota_geral != null);
    return validas.length ? validas.reduce((s, r) => s + (r.nota_geral || 0), 0) / validas.length : 0;
  }, [rows]);

  const distribuicaoEstrelas = useMemo(() => {
    const buckets = [1, 2, 3, 4, 5].map((n) => ({ estrela: `${n} ★`, quantidade: 0 }));
    rows.forEach((r) => {
      if (r.nota_geral == null) return;
      const idx = Math.min(5, Math.max(1, Math.round(r.nota_geral))) - 1;
      buckets[idx].quantidade += 1;
    });
    return buckets;
  }, [rows]);

  const evolucao = useMemo(() => {
    const map = new Map<string, { soma: number; qtd: number; ts: number }>();
    rows.forEach((r) => {
      if (r.nota_geral == null || !r.avaliado_em) return;
      const k = periodoKey(r.avaliado_em, periodo);
      const v = map.get(k) || { soma: 0, qtd: 0, ts: new Date(r.avaliado_em).getTime() };
      v.soma += r.nota_geral;
      v.qtd += 1;
      v.ts = Math.min(v.ts, new Date(r.avaliado_em).getTime());
      map.set(k, v);
    });
    return [...map.entries()]
      .map(([periodoLabel, v]) => ({ periodo: periodoLabel, media: Math.round((v.soma / v.qtd) * 100) / 100, ts: v.ts }))
      .sort((a, b) => a.ts - b.ts);
  }, [rows, periodo]);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();

    const wsAval = XLSX.utils.json_to_sheet(rows.map((r) => ({
      "OS": r.codigo_os, "Título": r.titulo, "Bloco": r.bloco_nome, "Empresa": r.empresa_nome,
      "Responsável": r.responsavel_nome, "Fiscal": r.avaliado_por_nome, "Tipo de Serviço": r.tipo_servico,
      "Nota": r.nota_geral, "Decisão": r.decisao,
      "Data Avaliação": r.avaliado_em ? format(new Date(r.avaliado_em), "dd/MM/yyyy") : "",
      "Comentários": r.comentarios_fiscal, "Sugestões": r.sugestoes_melhoria,
    })));
    XLSX.utils.book_append_sheet(wb, wsAval, "Avaliações");

    const wsEmpresa = XLSX.utils.json_to_sheet(porEmpresa.map((e) => ({ Empresa: e.nome, "Média": e.media.toFixed(2), Avaliações: e.qtd, Reprovadas: e.reprovadas })));
    XLSX.utils.book_append_sheet(wb, wsEmpresa, "Média por Empresa");

    const wsFiscal = XLSX.utils.json_to_sheet(porFiscal.map((e) => ({ Fiscal: e.nome, "Média": e.media.toFixed(2), Avaliações: e.qtd })));
    XLSX.utils.book_append_sheet(wb, wsFiscal, "Média por Fiscal");

    const wsBloco = XLSX.utils.json_to_sheet(porBloco.map((e) => ({ Bloco: e.nome, "Média": e.media.toFixed(2), Avaliações: e.qtd })));
    XLSX.utils.book_append_sheet(wb, wsBloco, "Média por Bloco");

    const wsTipo = XLSX.utils.json_to_sheet(porTipo.map((e) => ({ "Tipo de Serviço": e.nome, "Média": e.media.toFixed(2), Avaliações: e.qtd, Reprovadas: e.reprovadas })));
    XLSX.utils.book_append_sheet(wb, wsTipo, "Média por Tipo");

    const wsEvolucao = XLSX.utils.json_to_sheet(evolucao.map((e) => ({ Período: e.periodo, "Média": e.media })));
    XLSX.utils.book_append_sheet(wb, wsEvolucao, "Evolução");

    XLSX.writeFile(wb, `relatorio-avaliacoes-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Relatório de Avaliações de Serviço", 14, 16);
    doc.setFontSize(10);
    doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })} · Nota média: ${mediaGeral.toFixed(2)}`, 14, 22);

    autoTable(doc, {
      startY: 28,
      head: [["Empresa", "Média", "Avaliações", "Reprovadas"]],
      body: porEmpresa.map((e) => [e.nome, e.media.toFixed(2), String(e.qtd), String(e.reprovadas)]),
      headStyles: { fillColor: [58, 53, 92] },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [["Tipo de Serviço", "Média", "Avaliações", "Reprovadas"]],
      body: porTipo.map((e) => [e.nome, e.media.toFixed(2), String(e.qtd), String(e.reprovadas)]),
      headStyles: { fillColor: [58, 53, 92] },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [["OS", "Bloco", "Empresa", "Nota", "Decisão", "Data"]],
      body: rows.map((r) => [
        r.codigo_os || "", r.bloco_nome || "", r.empresa_nome || "", String(r.nota_geral ?? ""),
        r.decisao || "", r.avaliado_em ? format(new Date(r.avaliado_em), "dd/MM/yyyy") : "",
      ]),
      headStyles: { fillColor: [58, 53, 92] },
      styles: { fontSize: 8 },
    });

    doc.save(`relatorio-avaliacoes-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-indigo-600" /> Relatórios de Avaliações
          </h1>
          <p className="text-sm text-slate-500 mt-1">Indicadores de qualidade dos serviços executados.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl" onClick={fetchData}>
            <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} /> Atualizar
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={exportExcel} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-1" /> Excel
          </Button>
          <Button className="rounded-xl bg-indigo-600 hover:bg-indigo-700" onClick={exportPDF} disabled={!rows.length}>
            <FileText className="h-4 w-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
          <SelectTrigger className="w-[180px] rounded-xl"><SelectValue placeholder="Empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as Empresas</SelectItem>
            {empresasDisponiveis.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroBloco} onValueChange={setFiltroBloco}>
          <SelectTrigger className="w-[160px] rounded-xl"><SelectValue placeholder="Bloco" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Blocos</SelectItem>
            {blocosDisponiveis.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroFiscal} onValueChange={setFiltroFiscal}>
          <SelectTrigger className="w-[180px] rounded-xl"><SelectValue placeholder="Fiscal" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Fiscais</SelectItem>
            {fiscaisDisponiveis.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-[180px] rounded-xl"><SelectValue placeholder="Tipo de Serviço" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Tipos</SelectItem>
            {tiposDisponiveis.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-[160px] rounded-xl"><SelectValue placeholder="Agrupar por" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="dia">Por dia</SelectItem>
            <SelectItem value="mes">Por mês</SelectItem>
            <SelectItem value="trimestre">Por trimestre</SelectItem>
            <SelectItem value="ano">Por ano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Carregando...</div>
      ) : !rows.length ? (
        <div className="text-center py-16 text-slate-400">Nenhuma avaliação finalizada para os filtros selecionados.</div>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase text-slate-400">Índice Geral de Satisfação</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-3xl font-bold text-slate-900">{mediaGeral.toFixed(2)}</p>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className={cn("h-4 w-4", Math.round(mediaGeral) >= n ? "fill-amber-400 text-amber-400" : "text-slate-200")} />
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase text-slate-400">Total de Avaliações</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{rows.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase text-slate-400">Reprovações</p>
              <p className="text-3xl font-bold text-rose-600 mt-1">{rows.filter((r) => r.decisao === "reprovado").length}</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm font-semibold text-slate-700 mb-3">Evolução das Notas</p>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={evolucao}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="media" stroke="#4F46E5" strokeWidth={2} dot={{ r: 3, fill: "#4F46E5" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm font-semibold text-slate-700 mb-3">Distribuição por Estrelas</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={distribuicaoEstrelas}>
                  <XAxis dataKey="estrela" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="quantidade" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <RankCard title="Empresas Mais Bem Avaliadas" icon={<TrendingUp className="h-4 w-4 text-emerald-500" />} data={porEmpresa} />
            <RankCard title="Empresas com Menor Satisfação" icon={<TrendingDown className="h-4 w-4 text-rose-500" />} data={[...porEmpresa].reverse()} showReprovadas />
            <RankCard title="Média por Fiscal" data={porFiscal} />
            <RankCard title="Média por Bloco" data={porBloco} />
            <RankCard title="Serviços Mais Bem Avaliados" data={porTipo} />
            <RankCard title="Tipos de Serviço com Mais Reclamações" icon={<TrendingDown className="h-4 w-4 text-rose-500" />} data={[...porTipo].sort((a, b) => b.reprovadas - a.reprovadas)} showReprovadas />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-700 mb-3">Comentários Recentes dos Fiscais</p>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {rows.filter((r) => r.comentarios_fiscal || r.sugestoes_melhoria).map((r) => (
                <div key={r.os_id} className="border border-slate-100 rounded-xl p-3 text-sm">
                  <p className="font-semibold text-slate-800">{r.codigo_os} · {r.empresa_nome || "—"}</p>
                  {r.comentarios_fiscal && <p className="text-slate-600 mt-1"><span className="font-medium">Comentário:</span> {r.comentarios_fiscal}</p>}
                  {r.sugestoes_melhoria && <p className="text-slate-600 mt-1"><span className="font-medium">Sugestão:</span> {r.sugestoes_melhoria}</p>}
                </div>
              ))}
              {!rows.some((r) => r.comentarios_fiscal || r.sugestoes_melhoria) && <p className="text-sm text-slate-400">Nenhum comentário registrado.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RankCard({ title, data, icon, showReprovadas }: {
  title: string;
  data: { nome: string; media: number; qtd: number; reprovadas: number }[];
  icon?: React.ReactNode;
  showReprovadas?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase text-slate-400 mb-3 flex items-center gap-1.5">{icon}{title}</p>
      <div className="space-y-2">
        {data.slice(0, 6).map((d) => (
          <div key={d.nome} className="flex items-center justify-between text-sm">
            <span className="text-slate-700 truncate max-w-[55%]">{d.nome}</span>
            <span className="flex items-center gap-2">
              {showReprovadas && d.reprovadas > 0 && <span className="text-xs text-rose-600 font-semibold">{d.reprovadas} reprovada(s)</span>}
              <span className="flex items-center gap-1 font-semibold text-slate-900">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {d.media.toFixed(1)}
              </span>
              <span className="text-xs text-slate-400">({d.qtd})</span>
            </span>
          </div>
        ))}
        {!data.length && <p className="text-sm text-slate-400">Sem dados suficientes.</p>}
      </div>
    </div>
  );
}
