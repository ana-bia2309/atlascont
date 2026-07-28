import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { BarChart3, Download, FileText, RefreshCw, Star, TrendingDown, TrendingUp } from "@/lib/icons";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { cn } from "@/lib/utils";

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

export default function RelatoriosAvaliacoes() {
  const [rows, setRows] = useState<AvaliacaoCompleta[]>([]);
  const [loading, setLoading] = useState(true);

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

      setRows(merged);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao carregar relatório", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const porEmpresa = useMemo(() => groupAvg(rows, "empresa_nome"), [rows]);
  const porFiscal = useMemo(() => groupAvg(rows, "avaliado_por_nome"), [rows]);
  const porBloco = useMemo(() => groupAvg(rows, "bloco_nome"), [rows]);
  const porTipo = useMemo(() => groupAvg(rows, "tipo_servico"), [rows]);

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

    XLSX.writeFile(wb, `relatorio-avaliacoes-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Relatório de Avaliações de Serviço", 14, 16);
    doc.setFontSize(10);
    doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}`, 14, 22);

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

      {loading ? (
        <div className="text-center py-16 text-slate-400">Carregando...</div>
      ) : !rows.length ? (
        <div className="text-center py-16 text-slate-400">Nenhuma avaliação finalizada até o momento.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <RankCard title="Ranking de Empresas Contratadas" icon={<TrendingUp className="h-4 w-4 text-emerald-500" />} data={porEmpresa} />
          <RankCard title="Média por Fiscal" data={porFiscal} />
          <RankCard title="Média por Bloco" data={porBloco} />
          <RankCard title="Tipos de Serviço com Mais Reclamações" icon={<TrendingDown className="h-4 w-4 text-rose-500" />} data={[...porTipo].sort((a, b) => b.reprovadas - a.reprovadas)} showReprovadas />
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-700 mb-3">Comentários e Sugestões dos Fiscais</p>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {rows.filter((r) => r.comentarios_fiscal || r.sugestoes_melhoria).map((r) => (
              <div key={r.os_id} className="border border-slate-100 rounded-xl p-3 text-sm">
                <p className="font-semibold text-slate-800">{r.codigo_os} · {r.empresa_nome || "—"}</p>
                {r.comentarios_fiscal && <p className="text-slate-600 mt-1"><span className="font-medium">Comentário:</span> {r.comentarios_fiscal}</p>}
                {r.sugestoes_melhoria && <p className="text-slate-600 mt-1"><span className="font-medium">Sugestão:</span> {r.sugestoes_melhoria}</p>}
              </div>
            ))}
          </div>
        </div>
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
