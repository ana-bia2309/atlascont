// src/lib/generateOrcamentoPDF.ts
// PDF do Orçamento — gerado a partir dos dados da própria O.S. na fase de aprovação
// (o Atlas Control não tem uma tabela "orçamentos" separada: o orçamento É a O.S.
// antes/durante a aprovação, controlado pelo campo orcamento_status).
// Reaproveita o mesmo padrão de PDF do Relatório Geral (jsPDF + jspdf-autotable +
// addPdfHeader/getCompanyInfo de pdfHeader.ts) — nenhuma tecnologia nova.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { addPdfHeader, addSectionTitle, getCompanyInfo } from "@/lib/pdfHeader";
import { getOrcamentoStatusLabel } from "@/lib/orcamento-status";

const NAVY: [number, number, number] = [58, 53, 92];
const GRAY: [number, number, number] = [108, 118, 134];
const DARK: [number, number, number] = [24, 30, 46];
const BORDER: [number, number, number] = [203, 212, 228];

const ML = 10, MR = 10;

type MaterialItem = {
  nome_material: string;
  quantidade: number;
  unidade: string | null;
  custo_unitario: number;
  custo_total_item: number;
};

export type OrcamentoPdfData = {
  codigo_os: string | null;
  orcamento_status: string | null;
  bloco_nome: string | null;
  andar: string | null;
  sala: string | null;
  objeto: string | null; // observacoes da O.S.
  data_inicio: string | null;
  data_termino: string | null;
  custo_total: number | null;
  materiais: MaterialItem[];
  aprovado_por_nome?: string | null;
  aprovado_em?: string | null;
  observacoes_fiscais?: string | null;
};

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try { return format(new Date(d.length <= 10 ? d + "T00:00:00" : d), "dd/MM/yyyy", { locale: ptBR }); } catch { return "—"; }
};

const fmtMoney = (v: number | null | undefined) =>
  "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function localExecucao(andar: string | null, sala: string | null): string {
  return [andar?.trim(), sala?.trim()].filter(Boolean).join(" — ") || "—";
}

export async function generateOrcamentoPDF(data: OrcamentoPdfData): Promise<void> {
  const company = await getCompanyInfo();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  let y = await addPdfHeader(
    doc,
    `Orçamento — O.S. ${data.codigo_os || "—"}`,
    getOrcamentoStatusLabel(data.orcamento_status),
    company
  );

  // ─── Dados da Unidade de Manutenção / objeto / prazo ───────────────────────
  y = addSectionTitle(doc, "DADOS DA UNIDADE DE MANUTENÇÃO", y + 2);

  const fieldsLeft: [string, string][] = [
    ["Unidade de Manutenção", data.bloco_nome || "—"],
    ["Local de Execução", localExecucao(data.andar, data.sala)],
    ["Status", getOrcamentoStatusLabel(data.orcamento_status)],
  ];
  const fieldsRight: [string, string][] = [
    ["Início", fmtDate(data.data_inicio)],
    ["Término", fmtDate(data.data_termino)],
  ];

  const colDivX = ML + (pageW - ML - MR) * 0.55;
  let fy = y + 4;
  doc.setFontSize(8.5);
  fieldsLeft.forEach(([label, val]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text(`${label}:`, ML, fy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 64, 72);
    doc.text(val, ML, fy + 4.5);
    fy += 11;
  });

  let fy2 = y + 4;
  fieldsRight.forEach(([label, val]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text(`${label}:`, colDivX, fy2);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 64, 72);
    doc.text(val, colDivX, fy2 + 4.5);
    fy2 += 11;
  });

  y = Math.max(fy, fy2) + 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  doc.text("Objeto:", ML, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 64, 72);
  const objetoLines = doc.splitTextToSize(data.objeto?.trim() || "—", pageW - ML - MR);
  doc.text(objetoLines, ML, y + 4.5);
  y += 4.5 + objetoLines.length * 4.2 + 4;

  // ─── Materiais e serviços ───────────────────────────────────────────────────
  y = addSectionTitle(doc, "MATERIAIS E SERVIÇOS", y + 2);

  if (data.materiais.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Item", "Qtd", "Unidade", "Valor Unit.", "Total"]],
      body: data.materiais.map((m) => [
        m.nome_material,
        String(m.quantidade),
        m.unidade || "—",
        fmtMoney(m.custo_unitario),
        fmtMoney(m.custo_total_item),
      ]),
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 8, textColor: DARK },
      columnStyles: {
        1: { halign: "right", cellWidth: 18 },
        2: { halign: "center", cellWidth: 22 },
        3: { halign: "right", cellWidth: 28 },
        4: { halign: "right", cellWidth: 30 },
      },
      margin: { left: ML, right: MR },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY);
    doc.text("Nenhum item cadastrado.", ML, y + 2);
    y += 10;
  }

  // ─── Total ──────────────────────────────────────────────────────────────────
  const totalCalc = data.materiais.reduce((s, m) => s + Number(m.custo_total_item || 0), 0);
  const total = data.custo_total ?? totalCalc;

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.4);
  doc.line(ML, y, pageW - MR, y);
  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text("TOTAL DO ORÇAMENTO", ML, y);
  doc.text(fmtMoney(total), pageW - MR, y, { align: "right" });
  y += 10;

  // ─── Aprovação / observações ────────────────────────────────────────────────
  if (data.observacoes_fiscais || data.aprovado_por_nome) {
    y = addSectionTitle(doc, "APROVAÇÃO / OBSERVAÇÕES", y);
    doc.setFontSize(8.5);
    if (data.aprovado_por_nome && data.aprovado_em) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      const label = data.orcamento_status === "reprovado" ? "Reprovado por" : "Aprovado por";
      doc.text(
        `${label}: ${data.aprovado_por_nome} em ${format(new Date(data.aprovado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
        ML,
        y + 4
      );
      y += 9;
    }
    if (data.observacoes_fiscais) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 64, 72);
      const obsLines = doc.splitTextToSize(data.observacoes_fiscais, pageW - ML - MR);
      doc.text(obsLines, ML, y + 4);
      y += 4 + obsLines.length * 4.2;
    }
  }

  // ─── Rodapé com paginação ───────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(`Página ${i} de ${totalPages}`, pageW - MR, pageH - 6, { align: "right" });
  }

  doc.save(`orcamento-${(data.codigo_os || "os").replace(/[^\w-]/g, "")}-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`);
}
