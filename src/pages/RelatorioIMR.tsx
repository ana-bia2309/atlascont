import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { DateFilterButton } from "@/components/ui/date-filter-button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { RefreshCw, Download, FileSpreadsheet, Gauge, AlertTriangle, Clock, Star } from "@/lib/icons";
import { format, subDays } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addPdfHeader, getAtlasCompanyInfo } from "@/lib/pdfHeader";

type OSRow = { id: string; codigo_os: string | null; status: string; prazo: string | null; finalizado_em: string | null; bloco_id: string | null; responsible_user_id: string | null };
type Avaliacao = {
  os_id: string;
  nota_geral: number | null;
  nota_qualidade_execucao: number | null;
  nota_cumprimento_prazo: number | null;
  nota_organizacao_limpeza: number | null;
  nota_atendimento_expectativas: number | null;
  decisao: string | null;
};
type Responsavel = { os_id: string; profile_id: string };

const SUBNOTA_LABELS: Record<string, string> = {
  nota_qualidade_execucao: "Qualidade de Execução",
  nota_cumprimento_prazo: "Cumprimento de Prazo (percepção do fiscal)",
  nota_organizacao_limpeza: "Organização e Limpeza",
  nota_atendimento_expectativas: "Atendimento às Expectativas",
};

const fmtPct = (n: number | null) => n === null ? "—" : `${n.toFixed(1)}%`;

export default function RelatorioIMR() {
  const { companyId } = useCompany();
  const [loading, setLoading] = useState(true);
  const [osRows, setOsRows] = useState<OSRow[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [exportingPdf, setExportingPdf] = useState(false);

  const [filterDateFrom, setFilterDateFrom] = useState(format(subDays(new Date(), 90), "yyyy-MM-dd"));
  const [filterDateTo, setFilterDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);

    const [osRes, avalRes, respRes, profRes] = await Promise.all([
      (supabase as any).from("ordens_servico")
        .select("id, codigo_os, status, prazo, finalizado_em, bloco_id, responsible_user_id")
        .eq("company_id", companyId)
        .eq("arquivada", false)
        .eq("status", "Concluída")
        .gte("finalizado_em", `${filterDateFrom}T00:00:00`)
        .lte("finalizado_em", `${filterDateTo}T23:59:59`),
      (supabase as any).from("avaliacoes_os")
        .select("os_id, nota_geral, nota_qualidade_execucao, nota_cumprimento_prazo, nota_organizacao_limpeza, nota_atendimento_expectativas, decisao")
        .eq("company_id", companyId)
        .eq("rascunho", false),
      (supabase as any).from("os_responsaveis").select("os_id, profile_id").eq("company_id", companyId),
      (supabase as any).from("profiles").select("id, nome").eq("company_id", companyId),
    ]);

    if (osRes.error) toast({ title: "Erro ao carregar O.S.", description: osRes.error.message, variant: "destructive" });
    setOsRows(osRes.data || []);
    setAvaliacoes(avalRes.data || []);
    setResponsaveis(respRes.data || []);
    const pMap: Record<string, string> = {};
    (profRes.data || []).forEach((p: any) => { pMap[p.id] = p.nome; });
    setProfilesMap(pMap);
    setLoading(false);
  }, [companyId, filterDateFrom, filterDateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Restringe avaliações às O.S. do período/filtro atual
  const avaliacoesDoFiltro = useMemo(() => {
    const idsNoFiltro = new Set(osRows.map((o) => o.id));
    return avaliacoes.filter((a) => idsNoFiltro.has(a.os_id));
  }, [osRows, avaliacoes]);

  const calc = useMemo(() => {
    const comPrazo = osRows.filter((o) => o.prazo);
    const cumpridos = comPrazo.filter((o) => o.finalizado_em && o.finalizado_em.slice(0, 10) <= (o.prazo as string));
    const pctPrazo = comPrazo.length ? (cumpridos.length / comPrazo.length) * 100 : null;

    const notas = avaliacoesDoFiltro.filter((a) => a.nota_geral !== null).map((a) => Number(a.nota_geral));
    const pctAvaliacao = notas.length ? (notas.reduce((s, n) => s + n, 0) / notas.length / 5) * 100 : null;

    const imr = pctPrazo !== null && pctAvaliacao !== null ? (pctPrazo + pctAvaliacao) / 2
      : pctPrazo !== null ? pctPrazo
      : pctAvaliacao !== null ? pctAvaliacao
      : null;

    // Médias por sub-critério de avaliação, pra achar o ponto mais fraco
    const subMedias: { key: string; media: number; n: number }[] = Object.keys(SUBNOTA_LABELS).map((key) => {
      const vals = avaliacoesDoFiltro.map((a: any) => a[key]).filter((v: any) => v !== null && v !== undefined);
      const media = vals.length ? vals.reduce((s: number, v: number) => s + v, 0) / vals.length : 0;
      return { key, media, n: vals.length };
    }).filter((s) => s.n > 0);

    // IMR por responsável
    const porTecnico: Record<string, { comPrazo: number; cumpridos: number; notas: number[] }> = {};

    // Time real de cada OS: usa os_responsaveis quando existir; se a OS não
    // tiver ninguém lá (tabela pouco usada hoje), cai pro campo antigo
    // responsible_user_id -- mesma logica de fallback ja usada no PDF de OS
    const responsaveisDe = (os: OSRow): string[] => {
      const modernos = responsaveis.filter((r) => r.os_id === os.id).map((r) => r.profile_id);
      if (modernos.length > 0) return modernos;
      return os.responsible_user_id ? [os.responsible_user_id] : [];
    };

    osRows.forEach((os) => {
      responsaveisDe(os).forEach((profileId) => {
        if (!porTecnico[profileId]) porTecnico[profileId] = { comPrazo: 0, cumpridos: 0, notas: [] };
        if (os.prazo) {
          porTecnico[profileId].comPrazo++;
          if (os.finalizado_em && os.finalizado_em.slice(0, 10) <= os.prazo) porTecnico[profileId].cumpridos++;
        }
      });
    });
    avaliacoesDoFiltro.forEach((a) => {
      if (a.nota_geral === null) return;
      const os = osRows.find((o) => o.id === a.os_id);
      if (!os) return;
      responsaveisDe(os).forEach((profileId) => {
        if (!porTecnico[profileId]) porTecnico[profileId] = { comPrazo: 0, cumpridos: 0, notas: [] };
        porTecnico[profileId].notas.push(Number(a.nota_geral));
      });
    });
    const tecnicos = Object.entries(porTecnico).map(([profileId, d]) => {
      const pP = d.comPrazo ? (d.cumpridos / d.comPrazo) * 100 : null;
      const pA = d.notas.length ? (d.notas.reduce((s, n) => s + n, 0) / d.notas.length / 5) * 100 : null;
      const imrT = pP !== null && pA !== null ? (pP + pA) / 2 : pP ?? pA;
      return { nome: profilesMap[profileId] || "—", pctPrazo: pP, pctAvaliacao: pA, imr: imrT, qtdOS: d.comPrazo, qtdAvaliacoes: d.notas.length };
    }).filter((t) => t.qtdOS > 0 || t.qtdAvaliacoes > 0)
      .sort((a, b) => (a.imr ?? 100) - (b.imr ?? 100));

    const reprovacoes = avaliacoesDoFiltro.filter((a) => a.decisao === "reprovado").length;

    return { pctPrazo, pctAvaliacao, imr, comPrazoQtd: comPrazo.length, cumpridosQtd: cumpridos.length, avaliadasQtd: notas.length, subMedias, tecnicos, reprovacoes };
  }, [osRows, avaliacoesDoFiltro, responsaveis, profilesMap]);

  const pontosDeAtencao = useMemo(() => {
    const pontos: string[] = [];
    if (calc.pctPrazo !== null && calc.pctPrazo < 80) {
      pontos.push(`${(100 - calc.pctPrazo).toFixed(0)}% das O.S. com prazo definido estouraram o prazo (${calc.comPrazoQtd - calc.cumpridosQtd} de ${calc.comPrazoQtd}) — vale revisar se os prazos combinados são realistas ou se há gargalo de equipe/material.`);
    }
    if (calc.subMedias.length > 0) {
      const pior = [...calc.subMedias].sort((a, b) => a.media - b.media)[0];
      if (pior.media < 4) {
        pontos.push(`O critério com nota mais baixa nas avaliações é "${SUBNOTA_LABELS[pior.key]}" (média ${pior.media.toFixed(1)}/5, em ${pior.n} avaliação(ões)) — ponto de melhoria mais direto pra subir o IMR.`);
      }
    }
    if (calc.reprovacoes > 0) {
      pontos.push(`${calc.reprovacoes} avaliação(ões) reprovada(s) no período — vale revisar essas O.S. específicas com a equipe responsável.`);
    }
    const piorTecnico = calc.tecnicos.find((t) => t.imr !== null && t.imr < 70 && (t.qtdOS + t.qtdAvaliacoes) >= 3);
    if (piorTecnico) {
      pontos.push(`${piorTecnico.nome} está com IMR individual de ${piorTecnico.imr!.toFixed(0)}% — abaixo da média da equipe. Pode valer uma conversa de alinhamento ou suporte extra.`);
    }
    if (calc.avaliadasQtd === 0) {
      pontos.push("Nenhuma O.S. concluída no período foi avaliada ainda — o IMR está considerando só o cumprimento de prazo. Avalie as O.S. concluídas pra ter o índice completo.");
    }
    return pontos;
  }, [calc]);

  const exportarExcel = () => {
    const rows = calc.tecnicos.map((t) => ({
      "Responsável": t.nome,
      "% Prazos Cumpridos": t.pctPrazo !== null ? Number(t.pctPrazo.toFixed(1)) : "—",
      "% Avaliação": t.pctAvaliacao !== null ? Number(t.pctAvaliacao.toFixed(1)) : "—",
      "IMR": t.imr !== null ? Number(t.imr.toFixed(1)) : "—",
      "O.S. no período": t.qtdOS,
      "Avaliações": t.qtdAvaliacoes,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "IMR por Responsável");
    XLSX.writeFile(wb, `imr-${filterDateFrom}-a-${filterDateTo}.xlsx`);
  };

  const exportarPDF = async () => {
    setExportingPdf(true);
    try {
      const doc = new jsPDF({ orientation: "landscape" });
      const pageW = doc.internal.pageSize.getWidth();
      const company = await getAtlasCompanyInfo();
      let y = await addPdfHeader(
        doc,
        "IMR — Índice de Medição de Rendimento",
        `Período: ${format(new Date(filterDateFrom), "dd/MM/yyyy")} a ${format(new Date(filterDateTo), "dd/MM/yyyy")} · IMR Geral: ${fmtPct(calc.imr)}`,
        company
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 30, 40);
      doc.text(`Prazos cumpridos: ${fmtPct(calc.pctPrazo)} (${calc.cumpridosQtd}/${calc.comPrazoQtd})   ·   Avaliação média: ${fmtPct(calc.pctAvaliacao)} (${calc.avaliadasQtd} avaliação(ões))`, 14, y);
      y += 8;

      if (pontosDeAtencao.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(30, 30, 40);
        doc.text("Pontos de Atenção:", 14, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(50, 50, 60);
        pontosDeAtencao.forEach((p) => {
          const lines = doc.splitTextToSize(`• ${p}`, pageW - 28) as string[];
          doc.text(lines, 14, y);
          y += lines.length * 4.2 + 1.5;
        });
        y += 3;
      }

      autoTable(doc, {
        startY: y,
        head: [["Responsável", "% Prazos Cumpridos", "% Avaliação", "IMR", "O.S. no período", "Avaliações"]],
        body: calc.tecnicos.map((t) => [t.nome, fmtPct(t.pctPrazo), fmtPct(t.pctAvaliacao), fmtPct(t.imr), t.qtdOS, t.qtdAvaliacoes]),
        headStyles: { fillColor: [58, 53, 92], textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 8, textColor: [40, 40, 40] },
        alternateRowStyles: { fillColor: [250, 250, 255] },
        margin: { left: 10, right: 10 },
        tableWidth: pageW - 20,
      });

      doc.save(`imr-${filterDateFrom}-a-${filterDateTo}.pdf`);
      toast({ title: "PDF exportado!" });
    } catch (err: any) {
      toast({ title: "Erro ao exportar PDF", description: err?.message, variant: "destructive" });
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gauge className="h-6 w-6 text-primary" /> IMR — Índice de Medição de Rendimento
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Rendimento da prestação de serviço: prazos cumpridos + avaliações das O.S. concluídas.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={exportarPDF} disabled={exportingPdf} className="gap-1.5">
            <Download className="h-4 w-4" /> {exportingPdf ? "Gerando..." : "PDF"}
          </Button>
          <Button variant="outline" onClick={exportarExcel} className="gap-1.5">
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Período (por data de conclusão)</label>
          <div className="flex items-center gap-1.5">
            <DateFilterButton value={filterDateFrom} onChange={setFilterDateFrom} placeholder="Início" />
            <span className="text-muted-foreground text-sm">até</span>
            <DateFilterButton value={filterDateTo} onChange={setFilterDateTo} placeholder="Fim" />
          </div>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : osRows.length === 0 ? (
        <EmptyState icon={Gauge} title="Nenhuma O.S. concluída no período" description="Ajuste o período selecionado." className="py-10" />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Gauge className="h-4 w-4 text-primary" /> IMR Geral</div>
              <div className="text-4xl font-bold mt-1 text-primary">{fmtPct(calc.imr)}</div>
              <p className="text-xs text-muted-foreground mt-1">Média entre prazos cumpridos e avaliação</p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4 text-sky-600" /> Prazos Cumpridos</div>
              <div className="text-2xl font-bold mt-1">{fmtPct(calc.pctPrazo)}</div>
              <p className="text-xs text-muted-foreground mt-1">{calc.cumpridosQtd} de {calc.comPrazoQtd} O.S. com prazo definido</p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Star className="h-4 w-4 text-amber-500" /> Avaliação Média</div>
              <div className="text-2xl font-bold mt-1">{fmtPct(calc.pctAvaliacao)}</div>
              <p className="text-xs text-muted-foreground mt-1">{calc.avaliadasQtd} avaliação(ões) no período</p>
            </div>
          </div>

          {pontosDeAtencao.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-300">Pontos de Atenção — Sugestões pra Melhorar o IMR</h2>
              </div>
              <ul className="space-y-2">
                {pontosDeAtencao.map((p, i) => (
                  <li key={i} className="text-sm text-amber-900 dark:text-amber-200 flex gap-2">
                    <span className="text-amber-600 dark:text-amber-500">•</span> {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold mb-2">IMR por Responsável</h2>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Responsável</TableHead>
                    <TableHead className="text-right">% Prazos Cumpridos</TableHead>
                    <TableHead className="text-right">% Avaliação</TableHead>
                    <TableHead className="text-right">IMR</TableHead>
                    <TableHead className="text-right">O.S. no período</TableHead>
                    <TableHead className="text-right">Avaliações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calc.tecnicos.length === 0 ? (
                    <TableRow><TableCell colSpan={6}><EmptyState icon={Gauge} title="Nenhum responsável com dados no período" className="py-6" /></TableCell></TableRow>
                  ) : calc.tecnicos.map((t) => (
                    <TableRow key={t.nome}>
                      <TableCell className="font-medium">{t.nome}</TableCell>
                      <TableCell className="text-right">{fmtPct(t.pctPrazo)}</TableCell>
                      <TableCell className="text-right">{fmtPct(t.pctAvaliacao)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtPct(t.imr)}</TableCell>
                      <TableCell className="text-right">{t.qtdOS}</TableCell>
                      <TableCell className="text-right">{t.qtdAvaliacoes}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
