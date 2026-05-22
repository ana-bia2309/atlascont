import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

type OsData = {
  codigo_os: string | null;
  status: string | null;
  bloco: string;
  andar: string | null;
  sala: string | null;
  prazo: string | null;
  data_inicio: string | null;
  data_termino: string | null;
  equipamentos: string | null;
  observacoes: string | null;
  custo_total: number | null;
  materiais: { nome_material: string; quantidade: number; unidade: string | null; custo_unitario?: number; custo_total_item?: number | null; fornecedor?: string | null; data_compra?: string | null }[];
  anexos: { nome_arquivo: string; url_arquivo: string }[];
};

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "dd/MM/yyyy"); } catch { return "—"; }
};

export function generateOsPdf(os: OsData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Header
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Atlas Control", margin, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Emissão: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, pageWidth - margin, 14, { align: "right" });
  doc.setFontSize(12);
  doc.text(`Ordem de Serviço — ${os.codigo_os || "Sem código"}`, margin, 26);
  y = 40;

  // Reset text color
  doc.setTextColor(30, 30, 30);

  // Info fields in a grid
  const fields: [string, string][] = [
    ["Código", os.codigo_os || "—"],
    ["Status", os.status || "—"],
    ["Bloco", os.bloco || "—"],
    ["Andar", os.andar || "—"],
    ["Sala", os.sala || "—"],
    ["Prazo", fmtDate(os.prazo)],
    ["Data Início", fmtDate(os.data_inicio)],
    ["Data Término", fmtDate(os.data_termino)],
    ["Custo Total", os.custo_total ? `R$ ${Number(os.custo_total).toFixed(2)}` : "—"],
  ];

  const colW = contentWidth / 3;
  doc.setFontSize(9);
  fields.forEach((field, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = margin + col * colW;
    const fy = y + row * 12;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(field[0], x, fy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(field[1], x, fy + 5);
  });

  y += Math.ceil(fields.length / 3) * 12 + 4;

  // Long text sections
  const addLongSection = (title: string, text: string) => {
    if (y > 260) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text(title, margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const lines = doc.splitTextToSize(text, contentWidth);
    lines.forEach((line: string) => {
      if (y > 280) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += 4.5;
    });
    y += 3;
  };

  if (os.equipamentos) {
    addLongSection("Equipamentos", os.equipamentos);
  }
  if (os.observacoes) {
    addLongSection("Observações", os.observacoes);
  }

  // Materials table
  if (os.materiais.length > 0) {
    if (y > 240) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text("Materiais Utilizados", margin, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Material", "Qtd", "Unidade", "Custo Unit.", "Custo Total", "Fornecedor", "Data"]],
      body: os.materiais.map((m) => [
        m.nome_material,
        String(m.quantidade),
        m.unidade || "un",
        m.custo_unitario != null ? `R$ ${Number(m.custo_unitario).toFixed(2)}` : "—",
        m.custo_total_item != null ? `R$ ${Number(m.custo_total_item).toFixed(2)}` : "—",
        m.fornecedor || "—",
        m.data_compra ? fmtDate(m.data_compra) : "—",
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Anexos
  if (os.anexos.length > 0) {
    if (y > 260) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text("Anexos", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    os.anexos.forEach((a) => {
      if (y > 280) { doc.addPage(); y = margin; }
      doc.text(`• ${a.nome_arquivo}`, margin, y);
      y += 4.5;
    });
  }

  doc.save(`OS_${(os.codigo_os || "sem-codigo").replace(/\s+/g, "_")}.pdf`);
}
