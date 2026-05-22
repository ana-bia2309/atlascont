import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { format, differenceInDays, startOfDay, addDays } from "date-fns";

type ExportActivity = {
  nome: string;
  codigo_os: string | null;
  data_inicio: string;
  data_termino: string;
  responsavel: string | null;
  status: string;
};

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "dd/MM/yyyy"); } catch { return d || "—"; }
};

const STATUS_COLORS: Record<string, [number, number, number]> = {
  "Em andamento": [56, 189, 248],   // sky-400
  "Concluído": [52, 211, 153],      // emerald-400
  "Atrasada": [251, 113, 133],      // rose-400
  "Não iniciado": [161, 161, 170],  // zinc-400
};

function getEffectiveStatus(a: ExportActivity, today: Date): string {
  if (a.status === "Concluído") return "Concluído";
  const termino = new Date(a.data_termino + "T00:00:00");
  if (termino < today) return "Atrasada";
  if (a.status === "Em andamento") return "Em andamento";
  return "Não iniciado";
}

function drawGanttChart(doc: jsPDF, atividades: ExportActivity[], startY: number) {
  if (atividades.length === 0) return;

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const labelColW = 70;
  const chartX = margin + labelColW;
  const chartW = pageW - chartX - margin;
  const rowH = 8;
  const headerH = 14;
  const today = startOfDay(new Date());

  // Calculate timeline range
  let minDate = new Date(atividades[0].data_inicio + "T00:00:00");
  let maxDate = new Date(atividades[0].data_termino + "T00:00:00");
  atividades.forEach((a) => {
    const s = new Date(a.data_inicio + "T00:00:00");
    const e = new Date(a.data_termino + "T00:00:00");
    if (s < minDate) minDate = s;
    if (e > maxDate) maxDate = e;
  });
  const padStart = addDays(minDate, -2);
  const padEnd = addDays(maxDate, 2);
  const totalDays = Math.max(1, differenceInDays(padEnd, padStart));

  // Check if we need a new page
  const ganttTotalH = headerH + atividades.length * rowH + 10;
  if (startY + ganttTotalH > pageH - 10) {
    doc.addPage();
    startY = 20;
  }

  // Title
  doc.setFontSize(12);
  doc.setTextColor(30, 58, 95);
  doc.text("Gráfico de Gantt", margin, startY);
  startY += 8;

  // Legend
  doc.setFontSize(7);
  let legendX = margin;
  const legendEntries: [string, [number, number, number]][] = [
    ["Em andamento", STATUS_COLORS["Em andamento"]],
    ["Concluído", STATUS_COLORS["Concluído"]],
    ["Atrasada", STATUS_COLORS["Atrasada"]],
    ["Não iniciado", STATUS_COLORS["Não iniciado"]],
  ];
  legendEntries.forEach(([label, color]) => {
    doc.setFillColor(...color);
    doc.roundedRect(legendX, startY - 3, 4, 4, 1, 1, "F");
    doc.setTextColor(80);
    doc.text(label, legendX + 5.5, startY);
    legendX += doc.getTextWidth(label) + 10;
  });
  startY += 6;

  // Header background
  doc.setFillColor(235, 238, 245);
  doc.rect(margin, startY, pageW - 2 * margin, headerH, "F");

  // Label column header
  doc.setFontSize(7);
  doc.setTextColor(80);
  doc.text("Atividade", margin + 2, startY + headerH / 2 + 1);

  // Date columns — generate ticks
  const tickCount = Math.min(totalDays, 12);
  const tickStep = totalDays / tickCount;
  doc.setDrawColor(200);
  doc.setLineWidth(0.2);
  for (let i = 0; i <= tickCount; i++) {
    const dayOffset = Math.round(i * tickStep);
    const x = chartX + (dayOffset / totalDays) * chartW;
    const tickDate = addDays(padStart, dayOffset);
    doc.setTextColor(100);
    doc.text(format(tickDate, "dd/MM"), x, startY + headerH / 2 + 1, { align: "center" });
    // Vertical grid line
    doc.setDrawColor(220);
    doc.line(x, startY + headerH, x, startY + headerH + atividades.length * rowH);
  }

  startY += headerH;

  // Rows
  atividades.forEach((a, i) => {
    const rowY = startY + i * rowH;

    // Check page break
    if (rowY + rowH > pageH - 10) {
      doc.addPage();
      startY = 20 - i * rowH;
      return;
    }

    // Zebra striping
    if (i % 2 === 0) {
      doc.setFillColor(250, 251, 253);
      doc.rect(margin, rowY, pageW - 2 * margin, rowH, "F");
    }

    // Row border
    doc.setDrawColor(230);
    doc.setLineWidth(0.15);
    doc.line(margin, rowY + rowH, pageW - margin, rowY + rowH);

    // Activity name (truncated)
    doc.setFontSize(6.5);
    doc.setTextColor(40);
    const nameText = a.nome.length > 35 ? a.nome.substring(0, 33) + "…" : a.nome;
    doc.text(nameText, margin + 2, rowY + rowH / 2 + 1.5);

    // Bar
    const s = new Date(a.data_inicio + "T00:00:00");
    const e = new Date(a.data_termino + "T00:00:00");
    const startOffset = Math.max(0, differenceInDays(s, padStart));
    const duration = Math.max(1, differenceInDays(e, s) + 1);
    const barX = chartX + (startOffset / totalDays) * chartW;
    const barW = Math.max(3, (duration / totalDays) * chartW);
    const barH = rowH - 2.5;
    const barY = rowY + 1.2;

    const status = getEffectiveStatus(a, today);
    const color = STATUS_COLORS[status] || STATUS_COLORS["Não iniciado"];

    doc.setFillColor(...color);
    doc.roundedRect(barX, barY, barW, barH, 1.5, 1.5, "F");

    // Bar label if wide enough
    if (barW > 25) {
      doc.setFontSize(5);
      doc.setTextColor(255);
      const barLabel = a.nome.length > Math.floor(barW / 2.5) ? a.nome.substring(0, Math.floor(barW / 2.5) - 1) + "…" : a.nome;
      doc.text(barLabel, barX + 1.5, barY + barH / 2 + 1.2);
    }
  });

  // Today line
  const todayOffset = differenceInDays(today, padStart);
  if (todayOffset >= 0 && todayOffset <= totalDays) {
    const todayX = chartX + (todayOffset / totalDays) * chartW;
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.6);
    doc.line(todayX, startY - headerH, todayX, startY + atividades.length * rowH);
    // Label
    doc.setFontSize(5.5);
    doc.setTextColor(220, 38, 38);
    doc.text("Hoje", todayX + 0.8, startY - headerH + 4);
  }
}

export function exportCronogramaPDF(atividades: ExportActivity[], title = "Cronogramas — Visão Global") {
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(16);
  doc.text(title, 14, 18);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 25);
  doc.text(`Total de atividades: ${atividades.length}`, 14, 30);

  const head = [["Atividade", "OS Vinculada", "Início", "Término", "Responsável", "Status"]];
  const body = atividades.map((a) => [
    a.nome,
    a.codigo_os || "—",
    fmtDate(a.data_inicio),
    fmtDate(a.data_termino),
    a.responsavel || "—",
    a.status,
  ]);

  autoTable(doc, {
    startY: 35,
    head,
    body,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 95] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  // Get Y position after table
  const tableEndY = (doc as any).lastAutoTable?.finalY || 100;

  // Draw Gantt chart below the table
  drawGanttChart(doc, atividades, tableEndY + 12);

  doc.save("cronogramas.pdf");
}

export function exportCronogramaXLSX(atividades: ExportActivity[]) {
  const data = atividades.map((a) => ({
    "Atividade": a.nome,
    "OS Vinculada": a.codigo_os || "—",
    "Data Início": fmtDate(a.data_inicio),
    "Data Término": fmtDate(a.data_termino),
    "Responsável": a.responsavel || "—",
    "Status": a.status,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [{ wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cronogramas");
  XLSX.writeFile(wb, "cronogramas.xlsx");
}
