// src/lib/generateOSResumidaPDF.ts
// Ficha Resumida de O.S. — página de resumo compacta + (se existirem) páginas com
// anexos/plantas e fotos renderizados como imagem real (mesma técnica usada no
// Relatório Geral, mas aplicada a uma única O.S.).
// Independente de generateRelatorioGeralPDF.ts — não altera esse arquivo.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

// Marca fixa do Atlas Control — esta ficha é uma ferramenta interna do sistema,
// por isso NÃO usa getCompanyInfo() (que traria a marca da empresa-cliente, ex.: APA).
const ATLAS_LOGO_PATH = "/icons/icon-256.png";
const ATLAS_NOME = "Atlas Control";
// TODO Ana: troque pelo slogan oficial exato do Atlas Control
const ATLAS_SLOGAN = "SLOGAN_DO_ATLAS_AQUI";

// ─── Types ─────────────────────────────────────────────────────────────────────

type OSRow = {
  id: string;
  codigo_os: string | null;
  status: string | null;
  prioridade: string | null;
  origem: string | null;
  created_at: string | null;
  data_termino: string | null;
  finalizado_em: string | null;
  observacoes: string | null;
  responsible_user_id: string | null;
  bloco_id: string | null;
  custo_total: number | null;
  equipamentos: string | null;
  numero_os_externo: string | null;
  andar: string | null;
  sala: string | null;
  natureza_servico?: string | null;
};

type Material = {
  id: string;
  os_id: string;
  nome_material: string;
  quantidade: number;
  unidade: string;
  custo_unitario: number;
  custo_total_item: number;
};

type PageImg = { b64: string; w: number; h: number };
type AnexoRender = { nome: string; kind: "pdf" | "image" | "outro" | "erro"; pages: PageImg[]; totalPages: number };
type FotoRender = { date: string | null; img: PageImg | null };

const ANEXO_BUCKET = "anexos-os";
const MAX_PDF_PAGES = 2;
const IMG_MAX_H = 195;

// ─── Layout ────────────────────────────────────────────────────────────────────

const ML = 16, MR = 16, MT = 14, MB = 12;
const PW = 210, PH = 297;
const CW = PW - ML - MR;

const C = {
  navy: [58, 53, 92] as [number, number, number],
  navyMid: [108, 100, 152] as [number, number, number],
  navyLight: [233, 239, 252] as [number, number, number],
  green: [22, 138, 70] as [number, number, number],
  red: [186, 46, 46] as [number, number, number],
  amber: [176, 108, 12] as [number, number, number],
  sky: [16, 118, 186] as [number, number, number],
  gray: [108, 118, 134] as [number, number, number],
  grayLight: [246, 248, 251] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  dark: [24, 30, 46] as [number, number, number],
  border: [203, 212, 228] as [number, number, number],
  blueSoft: [176, 200, 245] as [number, number, number],
};

// ─── Helpers básicos ───────────────────────────────────────────────────────────

const norm = (s: string | null | undefined) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return "—"; }
};

const fmtMoney = (v: number | null | undefined) =>
  "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtQtd = (q: number) =>
  Number.isInteger(q) ? String(q) : q.toFixed(2).replace(".", ",");

const fixAndar = (andar: string | null): string => {
  if (!andar) return "";
  const a = andar.trim();
  if (!a) return "";
  if (/^\d+\s*[ºo°]?$/.test(a)) return `${a.replace(/\s*[ºo°]\s*$/, "")}º Andar`;
  return a;
};

const getAmbiente = (os: OSRow): string => {
  const andar = fixAndar(os.andar);
  let sala = (os.sala || "").trim();
  if (sala && !/^sala/i.test(sala)) sala = `Sala ${sala}`;
  return [andar, sala].filter(Boolean).join(", ");
};

const statusColor = (s: string | null): [number, number, number] => {
  const v = norm(s);
  if (v.includes("conclu")) return C.green;
  if (v.includes("execu") || v.includes("andamento")) return C.sky;
  if (v.includes("cancel") || v.includes("reprov")) return C.red;
  if (v.includes("aguard") || v.includes("orcamento") || v.includes("triagem")) return C.amber;
  return C.gray;
};

const isAberta = (s: string | null) => {
  const v = norm(s);
  return !v.includes("conclu") && !v.includes("cancel");
};

function fitText(doc: jsPDF, text: string, maxW: number): string {
  let t = text || "";
  if (doc.getTextWidth(t) <= maxW) return t;
  while (t.length > 1 && doc.getTextWidth(t + "…") > maxW) t = t.slice(0, -1);
  return t + "…";
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PH - MB) {
    doc.addPage();
    return MT;
  }
  return y;
}

async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, limit = 4): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

function blobToDataURL(blob: Blob): Promise<string | null> {
  return new Promise(res => {
    const reader = new FileReader();
    reader.onloadend = () => res(reader.result as string);
    reader.onerror = () => res(null);
    reader.readAsDataURL(blob);
  });
}

function imgDims(b64: string): Promise<{ w: number; h: number } | null> {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => res({ w: im.naturalWidth || 1, h: im.naturalHeight || 1 });
    im.onerror = () => res(null);
    im.src = b64;
  });
}

async function blobToJpeg(blob: Blob, maxDim = 1500): Promise<PageImg | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const ratio = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * ratio));
    const h = Math.max(1, Math.round(bmp.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return { b64: canvas.toDataURL("image/jpeg", 0.82), w, h };
  } catch { return null; }
}

async function blobToJpegCover(blob: Blob, tw = 1200, th = 900): Promise<PageImg | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const sr = bmp.width / bmp.height;
    const tr = tw / th;
    let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
    if (sr > tr) { sw = bmp.height * tr; sx = (bmp.width - sw) / 2; }
    else { sh = bmp.width / tr; sy = (bmp.height - sh) / 2; }
    const canvas = document.createElement("canvas");
    canvas.width = tw; canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, tw, th);
    bmp.close();
    return { b64: canvas.toDataURL("image/jpeg", 0.8), w: tw, h: th };
  } catch { return null; }
}

let pdfjsReady: Promise<any> | null = null;
function getPdfjs(): Promise<any> {
  if (!pdfjsReady) {
    pdfjsReady = (async () => {
      const pdfjs: any = await import("pdfjs-dist");
      // @ts-ignore — o Vite resolve o worker como URL de asset
      const worker: any = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsReady;
}

async function renderPdfToImages(blob: Blob, maxPages: number): Promise<{ pages: PageImg[]; total: number }> {
  try {
    const pdfjs = await getPdfjs();
    const data = new Uint8Array(await blob.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
    const total: number = pdf.numPages;
    const n = Math.min(total, maxPages);
    const pages: PageImg[] = [];
    for (let i = 1; i <= n; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, Math.max(1, 1500 / base.width));
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
      pages.push({ b64: canvas.toDataURL("image/jpeg", 0.85), w: canvas.width, h: canvas.height });
      page.cleanup?.();
    }
    pdf.destroy?.();
    return { pages, total };
  } catch {
    return { pages: [], total: 0 };
  }
}

async function processAnexo(a: any): Promise<AnexoRender> {
  const nome = (a.nome_arquivo || "Anexo").replace(/_/g, " ").replace(/\.[^.]+$/, "");
  const erro: AnexoRender = { nome, kind: "erro", pages: [], totalPages: 0 };
  const bucket = a.bucket_name || ANEXO_BUCKET;
  const path = (a.file_path || a.url_arquivo || "").trim();
  if (!path) return erro;
  try {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) return erro;
    const lower = (a.nome_arquivo || "").toLowerCase();
    const tipo = (a.tipo_arquivo || "").toLowerCase();
    const isPdf = tipo.includes("pdf") || lower.endsWith(".pdf");
    const isImg = tipo.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/.test(lower);
    if (isPdf) {
      const r = await renderPdfToImages(data, MAX_PDF_PAGES);
      if (!r.pages.length) return erro;
      return { nome, kind: "pdf", pages: r.pages, totalPages: r.total };
    }
    if (isImg) {
      const img = await blobToJpeg(data, 1500);
      if (!img) return erro;
      return { nome, kind: "image", pages: [img], totalPages: 1 };
    }
    return { nome, kind: "outro", pages: [], totalPages: 0 };
  } catch { return erro; }
}

async function processFoto(f: any): Promise<FotoRender> {
  try {
    const { data, error } = await supabase.storage.from(ANEXO_BUCKET).download(f.photo_url);
    if (error || !data) return { date: f.created_at, img: null };
    const img = await blobToJpegCover(data, 1200, 900);
    return { date: f.created_at, img };
  } catch { return { date: f.created_at, img: null }; }
}

async function loadLogo(url: string | null | undefined): Promise<PageImg | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    const b64 = await blobToDataURL(blob);
    if (!b64) return null;
    const d = await imgDims(b64);
    return { b64, w: d?.w || 1, h: d?.h || 1 };
  } catch { return null; }
}

async function fetchAnexosEFotos(osId: string): Promise<{ anexos: AnexoRender[]; fotos: FotoRender[] }> {
  const [anexosRes, fotosRes] = await Promise.all([
    (supabase as any).from("anexos_os")
      .select("id, os_id, nome_arquivo, tipo_arquivo, url_arquivo, file_path, bucket_name")
      .eq("os_id", osId).order("created_at"),
    (supabase as any).from("os_photos")
      .select("id, os_id, photo_url, created_at")
      .eq("os_id", osId).order("created_at"),
  ]);
  const anexoRows = anexosRes?.data || [];
  const fotoRows = fotosRes?.data || [];
  const anexos = await pMap(anexoRows, processAnexo, 3);
  const fotos = await pMap(fotoRows, processFoto, 4);
  return { anexos, fotos };
}

// ─── Bullets da descrição ──────────────────────────────────────────────────────

function buildDescricaoBullets(os: OSRow): string[] {
  const natureza = (os.natureza_servico || "Instalação").trim();
  return [
    `${natureza} de Sistema de Climatização.`,
    "Lançamento de Linhas Frigorígenas (cobre, polipex).",
    "Execução de Interligações Elétricas e de Comando.",
    "Instalação de Rede de Drenagem e Bomba.",
    "Fixação das Unidades Condensadoras.",
    "Testes de Estanqueidade e Vácuo.",
    "Carga de Fluido Refrigerante.",
    "Partida Assistida e Verificação de Parâmetros.",
    "Conformidade: ABNT NBR 16401 & ABNT NBR 5410.",
  ];
}

// ─── Memorial de cálculo (simplificado) ───────────────────────────────────────

async function fetchMemorialResumo(osId: string): Promise<{ nome: string; qtd: number; unidade: string; valor: number }[]> {
  try {
    const { data: memRows } = await (supabase as any)
      .from("memorial_materiais")
      .select("id, material_nome, material_unidade, custo_unitario")
      .eq("os_id", osId);
    if (!memRows || !memRows.length) return [];
    const ids = memRows.map((m: any) => m.id);
    const { data: qtdRows } = await (supabase as any)
      .from("memorial_materiais_quantidades")
      .select("memorial_id, quantidade")
      .in("memorial_id", ids);
    return memRows.map((m: any) => {
      const totalQtd = (qtdRows || [])
        .filter((q: any) => q.memorial_id === m.id)
        .reduce((s: number, q: any) => s + (q.quantidade || 0), 0);
      return {
        nome: m.material_nome || "—",
        qtd: totalQtd,
        unidade: m.material_unidade || "",
        valor: totalQtd * (m.custo_unitario || 0),
      };
    });
  } catch { return []; }
}

// ─── Desenho — página de resumo ───────────────────────────────────────────────

function drawHeader(doc: jsPDF, os: OSRow, companyNome: string, logo: PageImg | null): number {
  doc.setFillColor(...C.navy);
  doc.rect(0, 0, PW, 36, "F");
  doc.setFillColor(...C.navyMid);
  doc.rect(0, 36, PW, 1.2, "F");

  let tx = ML;
  if (logo) {
    const maxH = 22, maxW = 26;
    const ratio = Math.min(maxW / logo.w, maxH / logo.h);
    const lw = logo.w * ratio, lh = logo.h * ratio;
    const fmt = logo.b64.startsWith("data:image/png") ? "PNG" : "JPEG";
    try { doc.addImage(logo.b64, fmt, ML, (36 - lh) / 2, lw, lh); } catch { /* ignora */ }
    tx = ML + lw + 6;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...C.white);
  doc.text("FICHA DE ORDEM DE SERVIÇO", tx, 13.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...C.blueSoft);
  doc.text(companyNome.toUpperCase(), tx, 19.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(150, 180, 235);
  doc.text(`O.S. ${os.codigo_os || "—"}  |  Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, tx, 24);

  return 44;
}

function drawSumarioTable(doc: jsPDF, os: OSRow, blocoNome: string, tecnicoNome: string, y: number): number {
  doc.setFillColor(...C.navyMid);
  doc.rect(ML, y, 2.6, 5.2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C.navy);
  doc.text("SUMÁRIO DA ORDEM DE SERVIÇO", ML + 5, y + 4.2);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Código", "Status", "Bloco", "Ambiente", "Técnico", "Abertura", "Custo (R$)"]],
    body: [[
      os.codigo_os || "—",
      os.status || "—",
      blocoNome,
      getAmbiente(os) || "—",
      tecnicoNome,
      fmtDate(os.created_at),
      (os.custo_total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
    ]],
    headStyles: { fillColor: C.navy, textColor: C.white, fontSize: 7.3, fontStyle: "bold", halign: "center", cellPadding: 1.6 },
    bodyStyles: { fontSize: 7.3, textColor: C.dark, cellPadding: 1.6 },
    columnStyles: {
      0: { cellWidth: 20, halign: "center" },
      1: { cellWidth: 24, halign: "center" },
      2: { cellWidth: 24, halign: "left" },
      3: { cellWidth: "auto", halign: "left" },
      4: { cellWidth: 30, halign: "left" },
      5: { cellWidth: 18, halign: "center" },
      6: { cellWidth: 20, halign: "right" },
    },
    margin: { left: ML, right: MR },
    tableWidth: CW,
    didParseCell: (d: any) => {
      if (d.section === "body" && d.column.index === 1) {
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.textColor = statusColor(String(d.cell.raw || ""));
      }
    },
  });

  return (doc as any).lastAutoTable.finalY + 7;
}

function drawDetalhesBox(doc: jsPDF, os: OSRow, blocoNome: string, tecnicoNome: string, y: number): number {
  const boxH = 64;
  doc.setDrawColor(...C.navyMid);
  doc.setLineWidth(0.5);
  doc.setFillColor(...C.white);
  doc.roundedRect(ML, y, CW, boxH, 2, 2, "FD");

  doc.setFillColor(...C.navy);
  doc.roundedRect(ML, y, CW, 9, 2, 2, "F");
  doc.rect(ML, y + 5, CW, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...C.white);
  doc.text(`DETALHES DA ORDEM DE SERVIÇO: ${os.codigo_os || "—"}`, ML + CW / 2, y + 6, { align: "center" });

  const bodyY = y + 14;
  const colDivX = ML + CW * 0.42;

  const fields: [string, string][] = [
    ["Prioridade", os.prioridade || "—"],
    ["Status", os.status || "—"],
    ["Data Abertura", fmtDate(os.created_at)],
    ["Conclusão", fmtDate(os.finalizado_em || os.data_termino) === "—" ? "Pendente" : fmtDate(os.finalizado_em || os.data_termino)],
    ["Técnico Responsável", tecnicoNome],
    ["Unidade/Bloco", blocoNome],
    ["Ambiente", getAmbiente(os) || "—"],
    ["Categoria", os.origem || "—"],
    ["Nº O.S. Externa", os.numero_os_externo?.trim() || "—"],
  ];

  let fy = bodyY;
  const lh = 5.6;
  fields.forEach(([label, val]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(...C.dark);
    doc.text("•", ML + 4, fy);
    doc.text(`${label}:`, ML + 8, fy);
    const labelW = doc.getTextWidth(`${label}: `);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 64, 72);
    doc.text(fitText(doc, val, colDivX - ML - 8 - labelW - 2), ML + 8 + labelW, fy);
    fy += lh;
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.8);
  doc.setTextColor(...C.navy);
  doc.text("DESCRIÇÃO DOS SERVIÇOS EXECUTADOS", colDivX + 4, bodyY);

  let dy = bodyY + 5.5;
  const descMaxW = ML + CW - colDivX - 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(...C.dark);
  buildDescricaoBullets(os).forEach((b) => {
    const lines = doc.splitTextToSize(b, descMaxW - 4) as string[];
    doc.text("•", colDivX + 4, dy);
    doc.text(lines, colDivX + 8, dy);
    dy += lines.length * 4.6;
  });

  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(colDivX, y + 10, colDivX, y + boxH - 2);

  return y + boxH + 7;
}

function drawMemorialEMateriaisBoxes(
  doc: jsPDF,
  memorial: { nome: string; qtd: number; unidade: string; valor: number }[],
  materiais: Material[],
  y: number,
): number {
  const boxH = 42;
  const gap = 6;
  const boxW = (CW - gap) / 2;

  // Memorial de Cálculo
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.4);
  doc.setFillColor(...C.grayLight);
  doc.roundedRect(ML, y, boxW, boxH, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.8);
  doc.setTextColor(...C.navy);
  doc.text("MEMORIAL DE CÁLCULO", ML + boxW / 2, y + 7, { align: "center" });

  if (!memorial.length) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.gray);
    doc.text("Não informado.", ML + boxW / 2, y + boxH / 2 + 2, { align: "center" });
  } else {
    let my = y + 13;
    doc.setFontSize(6.8);
    const totalMemorial = memorial.reduce((s, m) => s + m.valor, 0);
    memorial.slice(0, 3).forEach((m) => {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.dark);
      const line = `${fitText(doc, m.nome, boxW - 30)}  ${fmtQtd(m.qtd)} ${m.unidade}`.trim();
      doc.text(line, ML + 4, my);
      doc.setFont("helvetica", "bold");
      doc.text(fmtMoney(m.valor), ML + boxW - 4, my, { align: "right" });
      my += 5.2;
    });
    if (memorial.length > 3) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6.3);
      doc.setTextColor(...C.gray);
      doc.text(`+ ${memorial.length - 3} item(ns)`, ML + 4, my);
    }
    doc.setDrawColor(...C.border);
    doc.line(ML + 4, y + boxH - 7, ML + boxW - 4, y + boxH - 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...C.navy);
    doc.text("TOTAL", ML + 4, y + boxH - 2.5);
    doc.text(fmtMoney(totalMemorial), ML + boxW - 4, y + boxH - 2.5, { align: "right" });
  }

  // Resumo Consolidado de Materiais
  const x2 = ML + boxW + gap;
  doc.setFillColor(...C.grayLight);
  doc.roundedRect(x2, y, boxW, boxH, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.8);
  doc.setTextColor(...C.navy);
  doc.text("RESUMO DE MATERIAIS APLICADOS", x2 + boxW / 2, y + 7, { align: "center" });

  if (!materiais.length) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.gray);
    doc.text("Nenhum material registrado.", x2 + boxW / 2, y + boxH / 2 + 2, { align: "center" });
  } else {
    let my = y + 13;
    doc.setFontSize(6.8);
    const totalMat = materiais.reduce((s, m) => s + (m.custo_total_item || 0), 0);
    materiais.slice(0, 3).forEach((m) => {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.dark);
      const line = `${fitText(doc, m.nome_material, boxW - 30)}  ${fmtQtd(m.quantidade)} ${m.unidade || ""}`.trim();
      doc.text(line, x2 + 4, my);
      doc.setFont("helvetica", "bold");
      doc.text(fmtMoney(m.custo_total_item), x2 + boxW - 4, my, { align: "right" });
      my += 5.2;
    });
    if (materiais.length > 3) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6.3);
      doc.setTextColor(...C.gray);
      doc.text(`+ ${materiais.length - 3} item(ns)`, x2 + 4, my);
    }
    doc.setDrawColor(...C.border);
    doc.line(x2 + 4, y + boxH - 7, x2 + boxW - 4, y + boxH - 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...C.navy);
    doc.text("TOTAL", x2 + 4, y + boxH - 2.5);
    doc.text(fmtMoney(totalMat), x2 + boxW - 4, y + boxH - 2.5, { align: "right" });
  }

  return y + boxH + 8;
}

function drawAssinaturas(doc: jsPDF, tecnicoNome: string, y: number): number {
  const colW = (CW - 20) / 2;
  const x1 = ML + 4;
  const x2 = ML + 16 + colW;

  doc.setDrawColor(...C.dark);
  doc.setLineWidth(0.3);
  doc.line(x1, y + 9, x1 + colW, y + 9);
  doc.line(x2, y + 9, x2 + colW, y + 9);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.6);
  doc.setTextColor(...C.dark);
  if (tecnicoNome && tecnicoNome !== "—") {
    doc.text(fitText(doc, tecnicoNome, colW - 4), x1 + colW / 2, y + 13, { align: "center" });
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C.gray);
  doc.text("Técnico Responsável", x1 + colW / 2, y + 17, { align: "center" });
  doc.text("Fiscalização / Contratante", x2 + colW / 2, y + 17, { align: "center" });

  return y + 24;
}

// ─── Desenho — páginas de anexos / fotos ──────────────────────────────────────

function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFillColor(...C.navyMid);
  doc.rect(ML, y, 3, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...C.navy);
  doc.text(title, ML + 5.5, y + 4.8);
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(ML + 5.5, y + 7, ML + CW, y + 7);
  return y + 11;
}

function drawAnexosSection(doc: jsPDF, renders: AnexoRender[], y: number): number {
  y = ensureSpace(doc, y, 30);
  y = drawSectionTitle(doc, "PROJETO / PLANTA / DOCUMENTOS", y);

  for (const r of renders) {
    if (r.kind === "pdf" || r.kind === "image") {
      r.pages.forEach((pg, i) => {
        const ratio = pg.h / pg.w;
        let w = CW, h = w * ratio;
        if (h > IMG_MAX_H) { h = IMG_MAX_H; w = h / ratio; }
        y = ensureSpace(doc, y, h + 10);
        const x = ML + (CW - w) / 2;
        try { doc.addImage(pg.b64, "JPEG", x, y, w, h, undefined, "FAST"); } catch { /* ignora */ }
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.35);
        doc.rect(x, y, w, h);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.setTextColor(...C.gray);
        const cap = r.kind === "pdf" && r.totalPages > 1 ? `${r.nome} — página ${i + 1} de ${r.totalPages}` : r.nome;
        doc.text(fitText(doc, cap, CW - 4), PW / 2, y + h + 4.2, { align: "center" });
        y += h + 10;
      });
      if (r.kind === "pdf" && r.totalPages > r.pages.length) {
        y = ensureSpace(doc, y, 6);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.setTextColor(...C.gray);
        doc.text(`(Documento completo com ${r.totalPages} páginas — exibidas as ${r.pages.length} primeiras.)`, ML + 1, y);
        y += 6;
      }
    } else if (r.kind === "outro") {
      y = ensureSpace(doc, y, 14);
      doc.setFillColor(...C.navyLight);
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.3);
      doc.roundedRect(ML, y, CW, 11, 1, 1, "FD");
      doc.setFillColor(...C.navyMid);
      doc.roundedRect(ML + 2, y + 1.8, 9, 7.4, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      doc.setTextColor(...C.white);
      doc.text("ARQ", ML + 6.5, y + 6.4, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...C.dark);
      doc.text(fitText(doc, r.nome, CW - 18), ML + 14, y + 7);
      y += 14;
    } else {
      y = ensureSpace(doc, y, 6);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(...C.gray);
      doc.text(fitText(doc, `Anexo indisponível: ${r.nome}`, CW - 2), ML + 1, y);
      y += 6;
    }
  }
  return y + 2;
}

function drawFotosSection(doc: jsPDF, fotos: FotoRender[], y: number): number {
  y = ensureSpace(doc, y, 42);
  y = drawSectionTitle(doc, "REGISTRO FOTOGRÁFICO", y);

  const gap = 6;
  const w = (CW - gap) / 2;
  const h = w * 0.75;
  let col = 0, n = 0;

  for (const f of fotos) {
    if (col === 0) y = ensureSpace(doc, y, h + 12);
    const x = ML + col * (w + gap);
    n++;
    if (f.img) {
      try { doc.addImage(f.img.b64, "JPEG", x, y, w, h, undefined, "FAST"); } catch { /* ignora */ }
    } else {
      doc.setFillColor(...C.grayLight);
      doc.rect(x, y, w, h, "F");
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(...C.gray);
      doc.text("Foto indisponível", x + w / 2, y + h / 2, { align: "center" });
    }
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.35);
    doc.rect(x, y, w, h);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...C.gray);
    const cap = `Registro ${String(n).padStart(2, "0")}${f.date ? ` — ${fmtDate(f.date)}` : ""}`;
    doc.text(cap, x + w / 2, y + h + 4, { align: "center" });
    col++;
    if (col >= 2) { col = 0; y += h + 11; }
  }
  if (col > 0) y += h + 11;
  return y + 2;
}

function drawFooterAllPages(doc: jsPDF, companyNome: string): void {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(ML, PH - 11, PW - MR, PH - 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.gray);
    doc.text(`${companyNome}  •  Ficha Resumida de Ordem de Serviço`, ML, PH - 6.5);
    doc.text(`Página ${i} de ${total}`, PW - MR, PH - 6.5, { align: "right" });
  }
}

// ─── Função principal ─────────────────────────────────────────────────────────

export async function generateOSResumidaPDF(params: {
  osList: OSRow[];
  materiaisByOs: Record<string, Material[]>;
  blocosMap: Record<string, string>;
  profilesMap: Record<string, string>;
  companyId: string;
  companyName?: string;
}): Promise<void> {
  const { osList, materiaisByOs, blocosMap, profilesMap } = params;
  const os = osList[0];
  if (!os) return;

  const companyNome = ATLAS_NOME;
  const logo = await loadLogo(ATLAS_LOGO_PATH);

  const blocoNome = os.bloco_id ? (blocosMap[os.bloco_id] || "—") : "—";
  const tecnicoNome = os.responsible_user_id ? (profilesMap[os.responsible_user_id] || "—") : "—";
  const mats = materiaisByOs[os.id] || [];

  const [memorial, { anexos, fotos }] = await Promise.all([
    fetchMemorialResumo(os.id),
    fetchAnexosEFotos(os.id),
  ]);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setLineHeightFactor(1.25);

  let y = drawHeader(doc, os, companyNome, logo);
  y = drawSumarioTable(doc, os, blocoNome, tecnicoNome, y);
  y = drawDetalhesBox(doc, os, blocoNome, tecnicoNome, y);
  y = drawMemorialEMateriaisBoxes(doc, memorial, mats, y);
  drawAssinaturas(doc, tecnicoNome, y);

  // Anexos/plantas e fotos reais, em página(s) extra — só se existirem
  if (anexos.length) {
    doc.addPage();
    let ay = MT;
    ay = drawAnexosSection(doc, anexos, ay);
  }
  if (fotos.length) {
    doc.addPage();
    let fy = MT;
    drawFotosSection(doc, fotos, fy);
  }

  drawFooterAllPages(doc, companyNome);

  doc.save(`os-resumida-${(os.codigo_os || os.id).replace(/[^\w-]/g, "")}-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`);
}