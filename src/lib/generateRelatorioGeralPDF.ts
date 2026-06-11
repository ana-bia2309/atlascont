// src/lib/generateRelatorioGeralPDF.ts
// Relatório Geral de O.S. — padrão profissional (modelo Denteck)
// - Anexos PDF renderizados como IMAGEM via pdfjs-dist (até 3 páginas por anexo)
// - Texto técnico elaborado gerado localmente (sem chamadas de IA = geração rápida)
// - Acentuação correta, contadores normalizados, layout alinhado, assinaturas
// - Pré-carregamento paralelo de anexos/fotos (2 queries únicas + downloads simultâneos)

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyInfo } from "@/lib/pdfHeader";

// ─── Types ────────────────────────────────────────────────────────────────────

type OSRow = {
  id: string;
  codigo_os: string | null;
  titulo: string | null;
  descricao: string | null;
  status: string | null;
  prioridade: string | null;
  origem: string | null;
  created_at: string | null;
  data_inicio: string | null;
  data_termino: string | null;
  finalizado_em: string | null;
  observacoes: string | null;
  responsible_user_id: string | null;
  bloco_id: string | null;
  ativo_id: string | null;
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

type AnexoRow = {
  id: string;
  os_id: string;
  nome_arquivo: string | null;
  tipo_arquivo: string | null;
  url_arquivo: string | null;
  file_path: string | null;
  bucket_name: string | null;
};

type OsPhotoRow = {
  id: string;
  os_id: string;
  photo_url: string;
  created_at: string | null;
};

type PageImg = { b64: string; w: number; h: number };

type AnexoRender = {
  nome: string;
  kind: "pdf" | "image" | "outro" | "erro";
  pages: PageImg[];
  totalPages: number;
};

type FotoRender = { date: string | null; img: PageImg | null };

type MemorialItemRow = {
  material_nome: string;
  material_unidade: string;
  custo_unitario: number;
  quantidades: Record<string, number>; // ativo_id -> quantidade
};

type MemorialData = {
  rows: MemorialItemRow[];
  ativoNames: Record<string, string>; // ativo_id -> nome
};

type OsAssets = { anexos: AnexoRender[]; fotos: FotoRender[]; memorial: MemorialData };

// ─── Constantes de layout ─────────────────────────────────────────────────────

const ML = 18;            // margem esquerda
const MR = 18;            // margem direita
const MT = 18;            // margem topo
const MB = 18;            // margem base
const PW = 210;           // largura A4 (mm)
const PH = 297;           // altura A4 (mm)
const CW = PW - ML - MR;  // largura útil

const FS_BODY = 9.5;
const FS_SMALL = 8;
const LHF = 1.4;                               // fator de entrelinha
const LH_BODY = FS_BODY * LHF * 0.352778;      // altura de linha do corpo (mm)

const MAX_PDF_PAGES = 3;   // páginas renderizadas por anexo PDF
const IMG_MAX_H = 195;     // altura máxima de um anexo renderizado (mm)
const ANEXO_BUCKET = "anexos-os";

const C = {
  navy:      [16, 36, 86]    as [number, number, number],
  navyMid:   [40, 70, 140]   as [number, number, number],
  navyLight: [233, 239, 252] as [number, number, number],
  green:     [22, 138, 70]   as [number, number, number],
  red:       [186, 46, 46]   as [number, number, number],
  amber:     [176, 108, 12]  as [number, number, number],
  sky:       [16, 118, 186]  as [number, number, number],
  gray:      [108, 118, 134] as [number, number, number],
  grayLight: [246, 248, 251] as [number, number, number],
  white:     [255, 255, 255] as [number, number, number],
  dark:      [24, 30, 46]    as [number, number, number],
  border:    [203, 212, 228] as [number, number, number],
  blueSoft:  [176, 200, 245] as [number, number, number],
};

// ─── Helpers gerais ───────────────────────────────────────────────────────────

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
  const l = norm(a);
  if (l.includes("andar") || l.includes("terreo") || l.includes("subsolo") ||
      l.includes("garagem") || l.includes("sobrelo") || l.includes("cobertura") ||
      l.includes("mezanino")) return a;
  if (/^\d+\s*[ºo°]?$/.test(a)) return `${a.replace(/\s*[ºo°]\s*$/, "")}º Andar`;
  return `${a} Andar`;
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

function listJoin(arr: string[]): string {
  const a = arr.filter(Boolean);
  if (a.length === 0) return "";
  if (a.length === 1) return a[0];
  return a.slice(0, -1).join(", ") + " e " + a[a.length - 1];
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PH - MB) {
    doc.addPage();
    return MT;
  }
  return y;
}

/** Executa promessas com limite de concorrência, preservando a ordem dos resultados */
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

// ─── Processamento de imagens ─────────────────────────────────────────────────

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

/** Redimensiona (contain) e comprime para JPEG */
async function blobToJpeg(blob: Blob, maxDim = 1500): Promise<PageImg | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const ratio = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * ratio));
    const h = Math.max(1, Math.round(bmp.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return { b64: canvas.toDataURL("image/jpeg", 0.82), w, h };
  } catch { return null; }
}

/** Corte central (cover) para grade uniforme de fotos */
async function blobToJpegCover(blob: Blob, tw = 1200, th = 900): Promise<PageImg | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const sr = bmp.width / bmp.height;
    const tr = tw / th;
    let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
    if (sr > tr) { sw = bmp.height * tr; sx = (bmp.width - sw) / 2; }
    else { sh = bmp.width / tr; sy = (bmp.height - sh) / 2; }
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, tw, th);
    bmp.close();
    return { b64: canvas.toDataURL("image/jpeg", 0.8), w: tw, h: th };
  } catch { return null; }
}

// ─── pdfjs-dist: renderiza páginas de PDF como imagem ────────────────────────

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

// ─── Pré-carregamento de anexos e fotos ───────────────────────────────────────

async function processAnexo(a: AnexoRow): Promise<AnexoRender> {
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
  } catch {
    return erro;
  }
}

async function processFoto(f: OsPhotoRow): Promise<FotoRender> {
  try {
    const { data, error } = await supabase.storage.from(ANEXO_BUCKET).download(f.photo_url);
    if (error || !data) return { date: f.created_at, img: null };
    const img = await blobToJpegCover(data, 1200, 900);
    return { date: f.created_at, img };
  } catch {
    return { date: f.created_at, img: null };
  }
}

async function preloadAssets(osIds: string[]): Promise<Record<string, OsAssets>> {
  const map: Record<string, OsAssets> = {};
  osIds.forEach(id => { map[id] = { anexos: [], fotos: [], memorial: { rows: [], ativoNames: {} } }; });
  if (!osIds.length) return map;

  const [anexosRes, fotosRes, memorialRes, memQtdRes] = await Promise.all([
    (supabase as any)
      .from("anexos_os")
      .select("id, os_id, nome_arquivo, tipo_arquivo, url_arquivo, file_path, bucket_name")
      .in("os_id", osIds)
      .order("created_at"),
    (supabase as any)
      .from("os_photos")
      .select("id, os_id, photo_url, created_at")
      .in("os_id", osIds)
      .order("created_at"),
    (supabase as any)
      .from("memorial_materiais")
      .select("id, os_id, material_nome, material_unidade, custo_unitario")
      .in("os_id", osIds)
      .order("created_at"),
    (supabase as any)
      .from("memorial_materiais_quantidades")
      .select("memorial_id, ativo_id, quantidade"),
  ]);

  const anexoRows: AnexoRow[] = anexosRes?.data || [];
  const fotoRows: OsPhotoRow[] = fotosRes?.data || [];

  const anexoRenders = await pMap(anexoRows, processAnexo, 3);
  anexoRows.forEach((a, i) => {
    const r = anexoRenders[i];
    if (r && map[a.os_id]) map[a.os_id].anexos.push(r);
  });

  const fotoRenders = await pMap(fotoRows, processFoto, 4);
  fotoRows.forEach((f, i) => {
    const r = fotoRenders[i];
    if (r && map[f.os_id]) map[f.os_id].fotos.push(r);
  });

  // Memorial de Cálculo
  const memRows: any[] = memorialRes?.data || [];
  const memQtdRows: any[] = memQtdRes?.data || [];

  // Coletar todos os ativo_ids usados para buscar nomes
  const allAtivoIds = new Set<string>(memQtdRows.map((q: any) => q.ativo_id).filter(Boolean));
  const ativoNamesGlobal: Record<string, string> = {};
  if (allAtivoIds.size > 0) {
    try {
      const { data: ativosData } = await (supabase as any)
        .from("ativos")
        .select("id, nome")
        .in("id", Array.from(allAtivoIds));
      (ativosData || []).forEach((a: any) => { ativoNamesGlobal[a.id] = a.nome; });
    } catch { /* silencioso */ }
  }

  // Agrupar linhas do memorial por os_id
  const memByOsId: Record<string, any[]> = {};
  memRows.forEach((m: any) => {
    if (!memByOsId[m.os_id]) memByOsId[m.os_id] = [];
    memByOsId[m.os_id].push(m);
  });

  // Construir MemorialData por OS
  osIds.forEach(osId => {
    const rows = memByOsId[osId] || [];
    const usedAtivoIds = new Set<string>();
    const builtRows: MemorialItemRow[] = rows.map((m: any) => {
      const qtds: Record<string, number> = {};
      memQtdRows
        .filter((q: any) => q.memorial_id === m.id)
        .forEach((q: any) => {
          qtds[q.ativo_id] = q.quantidade;
          usedAtivoIds.add(q.ativo_id);
        });
      return {
        material_nome: m.material_nome || "",
        material_unidade: m.material_unidade || "",
        custo_unitario: m.custo_unitario || 0,
        quantidades: qtds,
      };
    });
    const ativoNames: Record<string, string> = {};
    usedAtivoIds.forEach(id => { ativoNames[id] = ativoNamesGlobal[id] || id; });
    map[osId].memorial = { rows: builtRows, ativoNames };
  });

  return map;
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

// ─── Texto padrão oficial do Relatório Geral ──────────────────────────────────
// TEXTO PADRÃO OFICIAL do sistema — redação, pontuação, ordem dos parágrafos e
// normas citadas são FIXAS e não devem ser alteradas. Apenas os campos dinâmicos
// são substituídos com os dados reais da O.S.:
// (NÚMERO DA OS), (NATUREZA DO SERVIÇO), (LOCAL DA EXECUÇÃO), (QUANTIDADE),
// (TIPO DO EQUIPAMENTO), (CAPACIDADES BTU/H), (DATA DE CONCLUSÃO).

function parseEquipamentos(equip: string | null) {
  const lines = (equip || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let total = 0;
  const tipos = new Set<string>();
  const caps = new Set<string>();

  for (const l of lines) {
    const m = l.match(/^(\d+)/);
    const n = m ? parseInt(m[1], 10) : 1;
    total += Number.isNaN(n) ? 1 : n;

    const ln = norm(l);
    if (ln.includes("cassete")) tipos.add("split cassete");
    else if (ln.includes("piso") || /\bp\/?t\b/.test(ln)) tipos.add("split piso-teto");
    else if (ln.includes("cortina")) tipos.add("cortina de ar");
    else if (ln.includes("hiwall") || (ln.includes("hi") && ln.includes("wall")) || /\bhw\b/.test(ln)) tipos.add("split hi-wall");
    else if (ln.includes("split")) tipos.add("split");
    else tipos.add("equipamento de climatização");

    const cap = l.match(/([\d.,]+)\s*btu/i)?.[1];
    if (cap) caps.add(cap);
  }
  return { lines, total, tipos: Array.from(tipos), caps: Array.from(caps) };
}

function gerarDescricaoTecnica(os: OSRow, blocoNome: string): string[] {
  // (NATUREZA DO SERVIÇO) — usa exclusivamente o valor do campo da O.S.
  // Nunca combina "instalação e manutenção".
  const natureza = (os.natureza_servico || "Instalação").trim().toLowerCase();

  // (LOCAL DA EXECUÇÃO)
  const ambiente = getAmbiente(os);
  const locParts: string[] = [];
  if (blocoNome && blocoNome !== "—") locParts.push(blocoNome);
  if (ambiente) locParts.push(ambiente);
  const loc = locParts.join(" — ") || "—";

  // (QUANTIDADE), (TIPO DO EQUIPAMENTO), (CAPACIDADES BTU/H)
  const eq = parseEquipamentos(os.equipamentos);
  let equipPart = "";
  if (eq.total > 0) {
    const qtd = String(eq.total).padStart(2, "0");
    const plural = eq.total > 1 ? "equipamentos" : "equipamento";
    const capTxt = eq.caps.length
      ? `, com ${eq.caps.length > 1 ? "capacidades" : "capacidade"} de ${listJoin(eq.caps)} BTU/h`
      : "";
    equipPart = `, contemplando o fornecimento e a instalação de ${qtd} ${plural} do tipo ${listJoin(eq.tipos)}${capTxt}`;
  }

  // ── Parágrafo 1 (campos dinâmicos)
  const p1 =
    `A presente Ordem de Serviço (${os.codigo_os || "—"}) tem por objeto a execução de serviços de ${natureza} ` +
    `de sistema de climatização, executados em ${loc}${equipPart}.`;

  // ── Parágrafo 2 (FIXO)
  const p2 =
    "O escopo dos trabalhos compreendeu o lançamento das linhas frigorígenas em tubulação de cobre flexível, " +
    "com isolamento térmico em polipex blindado, a execução das interligações elétricas e de comando entre as " +
    "unidades evaporadora e condensadora, em cabo multipolar, a instalação da rede de drenagem de condensado, " +
    "com bomba de dreno, a fixação das unidades condensadoras sobre suportes metálicos e o acabamento e a " +
    "identificação das linhas com fita de PVC.";

  // ── Parágrafo 3 (FIXO)
  const p3 =
    "Concluída a montagem, foram realizados os testes de estanqueidade do circuito frigorígeno, o processo de " +
    "desidratação (vácuo), a liberação da carga de fluido refrigerante e a partida assistida dos equipamentos, " +
    "com verificação dos parâmetros operacionais de pressão, corrente e temperatura.";

  // ── Parágrafo 4 (campo dinâmico: data de conclusão)
  const p4 =
    `Os serviços foram finalizados em ${fmtDate(os.finalizado_em || os.data_termino)}, em conformidade com as ` +
    "especificações técnicas da O.S., as recomendações dos fabricantes e as normas ABNT NBR 16401 e ABNT NBR 5410, " +
    "encontrando-se o sistema em plenas condições de operação.";

  return [p1, p2, p3, p4];
}

// ─── Elementos de desenho ─────────────────────────────────────────────────────

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

function drawParagraphs(doc: jsPDF, paragraphs: string[], y: number): number {
  const maxW = CW - 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FS_BODY);
  doc.setTextColor(...C.dark);

  for (const p of paragraphs) {
    if (!p) continue;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(FS_BODY);
    doc.setTextColor(...C.dark);
    const lines = doc.splitTextToSize(p, maxW) as string[];
    const h = lines.length * LH_BODY;

    if (y + h > PH - MB && h <= PH - MT - MB) {
      doc.addPage();
      y = MT + 2;
    }

    if (y + h <= PH - MB) {
      doc.text(p, ML + 1, y, { maxWidth: maxW, align: "justify" });
      y += h + 2.5;
    } else {
      // Parágrafo maior que uma página: fluxo linha a linha
      let rest = [...lines];
      while (rest.length) {
        const avail = Math.floor((PH - MB - y) / LH_BODY);
        if (avail < 2) { doc.addPage(); y = MT + 2; continue; }
        const chunk = rest.slice(0, avail);
        doc.text(chunk, ML + 1, y);
        y += chunk.length * LH_BODY;
        rest = rest.slice(avail);
      }
      y += 2.5;
    }
  }
  return y + 2;
}

function drawBulletList(doc: jsPDF, items: string[], y: number): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FS_BODY);
  doc.setTextColor(...C.dark);

  for (const it of items) {
    const sub = doc.splitTextToSize(it, CW - 9) as string[];
    const h = sub.length * LH_BODY;
    if (y + h + 1 > PH - MB) { doc.addPage(); y = MT + 2; }
    doc.text("•", ML + 2, y);
    doc.text(sub, ML + 7, y);
    y += h + 1.4;
  }
  return y + 3;
}

function drawOsHeader(
  doc: jsPDF,
  os: OSRow,
  y: number,
  blocoNome: string,
  tecnicoNome: string,
): number {
  // Faixa do código da O.S.
  doc.setFillColor(...C.navy);
  doc.roundedRect(ML, y, CW, 13, 1.8, 1.8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...C.white);
  doc.text(`O.S.  ${os.codigo_os || "—"}`, ML + 4.5, y + 8.8);

  // Badge de status
  const statusText = (os.status || "Sem status").substring(0, 26);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  const bW = Math.max(doc.getTextWidth(statusText) + 8, 20);
  doc.setFillColor(...statusColor(os.status));
  doc.roundedRect(PW - MR - bW - 2.5, y + 2.7, bW, 7.6, 1.2, 1.2, "F");
  doc.setTextColor(...C.white);
  doc.text(statusText, PW - MR - 2.5 - bW / 2, y + 7.8, { align: "center" });

  // Prioridade
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.blueSoft);
  doc.text(`Prioridade: ${os.prioridade || "—"}`, PW - MR - bW - 6.5, y + 7.8, { align: "right" });

  y += 15;

  // Grid de informações
  const hasExtra = !!(os.titulo?.trim() || os.numero_os_externo?.trim());
  const rows = hasExtra ? 4 : 3;
  const gridH = rows * 7 + 7;

  doc.setFillColor(...C.navyLight);
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(ML, y, CW, gridH, 1.2, 1.2, "FD");
  doc.line(ML + CW / 2, y + 2.5, ML + CW / 2, y + gridH - 2.5);

  const col1 = ML + 4;
  const col2 = ML + CW / 2 + 5;
  const valOff = 35;
  const valMaxW = CW / 2 - valOff - 8;

  const ambiente = getAmbiente(os) || "—";

  type Field = { label: string; val: string; x: number; row: number };
  const fields: Field[] = [
    { label: "Data de abertura:",    val: fmtDate(os.created_at),                       x: col1, row: 0 },
    { label: "Data de conclusão:",   val: fmtDate(os.finalizado_em || os.data_termino), x: col1, row: 1 },
    { label: "Unidade / Bloco:",     val: blocoNome,                                    x: col1, row: 2 },
    { label: "Técnico responsável:", val: tecnicoNome,                                  x: col2, row: 0 },
    { label: "Ambiente:",            val: ambiente,                                     x: col2, row: 1 },
    { label: "Categoria:",           val: os.origem || "—",                             x: col2, row: 2 },
  ];
  if (hasExtra) {
    fields.push({ label: "Título:", val: os.titulo?.trim() || "—", x: col1, row: 3 });
    fields.push({ label: "Nº O.S. externa:", val: os.numero_os_externo?.trim() || "—", x: col2, row: 3 });
  }

  fields.forEach(f => {
    const fy = y + 6 + f.row * 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.3);
    doc.setTextColor(...C.gray);
    doc.text(f.label, f.x, fy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(...C.dark);
    doc.text(fitText(doc, f.val, valMaxW), f.x + valOff, fy);
  });

  return y + gridH + 6;
}

function drawMateriaisTable(doc: jsPDF, mats: Material[], y: number): number {
  const total = mats.reduce((s, m) => s + (m.custo_total_item || 0), 0);

  y = ensureSpace(doc, y, 38);
  y = drawSectionTitle(doc, "MATERIAIS APLICADOS NESTA O.S.", y);

  autoTable(doc, {
    startY: y,
    head: [["Material", "Unid.", "Qtd.", "Vl. Unitário", "Subtotal"]],
    body: mats.map(m => [
      m.nome_material,
      m.unidade || "—",
      fmtQtd(m.quantidade),
      fmtMoney(m.custo_unitario),
      fmtMoney(m.custo_total_item),
    ]),
    foot: [[
      { content: "TOTAL DA O.S.", colSpan: 4, styles: { halign: "right" } } as any,
      { content: fmtMoney(total), styles: { halign: "right" } } as any,
    ]],
    headStyles: {
      fillColor: C.navy, textColor: C.white,
      fontSize: FS_SMALL, fontStyle: "bold", halign: "center",
      cellPadding: 2,
    },
    bodyStyles: { fontSize: FS_SMALL, textColor: C.dark, cellPadding: 1.8 },
    alternateRowStyles: { fillColor: C.navyLight },
    footStyles: {
      fillColor: C.navyMid, textColor: C.white,
      fontStyle: "bold", fontSize: FS_SMALL,
    },
    columnStyles: {
      0: { cellWidth: "auto", halign: "left" },
      1: { cellWidth: 15, halign: "center" },
      2: { cellWidth: 15, halign: "right" },
      3: { cellWidth: 27, halign: "right" },
      4: { cellWidth: 27, halign: "right" },
    },
    margin: { top: MT, bottom: MB, left: ML, right: MR },
    tableWidth: CW,
    rowPageBreak: "avoid",
  });

  return (doc as any).lastAutoTable.finalY + 8;
}

function drawMemorialCalculo(doc: jsPDF, memorial: MemorialData, y: number): number {
  const { rows, ativoNames } = memorial;

  y = ensureSpace(doc, y, 28);
  y = drawSectionTitle(doc, "MEMORIAL DE CÁLCULO", y);

  if (!rows.length) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(FS_SMALL);
    doc.setTextColor(...C.gray);
    doc.text("Não informado.", ML + 1, y);
    return y + 8;
  }

  const ativoIds = Array.from(
    new Set(rows.flatMap(r => Object.keys(r.quantidades)))
  );

  // Cabeçalho: Material | Unid. | (ativo A) | (ativo B) | ... | Total Qtd | Valor Total
  const head: string[][] = [[
    "Material", "Unid.",
    ...ativoIds.map((id, i) => String.fromCharCode(65 + i)),
    "Total", "Valor (R$)",
  ]];

  const body: string[][] = rows.map(r => {
    const totalQtd = ativoIds.reduce((s, id) => s + (r.quantidades[id] || 0), 0);
    const totalValor = totalQtd * r.custo_unitario;
    return [
      r.material_nome,
      r.material_unidade || "—",
      ...ativoIds.map(id => {
        const q = r.quantidades[id] || 0;
        return q > 0 ? fmtQtd(q) : "0";
      }),
      fmtQtd(totalQtd),
      fmtMoney(totalValor),
    ];
  });

  // Rodapé com totais de colunas
  const colTotals = ativoIds.map(id =>
    rows.reduce((s, r) => s + (r.quantidades[id] || 0), 0)
  );
  const grandQtd = colTotals.reduce((a, b) => a + b, 0);
  const grandValor = rows.reduce((s, r) => {
    const q = ativoIds.reduce((sq, id) => sq + (r.quantidades[id] || 0), 0);
    return s + q * r.custo_unitario;
  }, 0);

  const foot: string[][] = [[
    "TOTAL", "",
    ...colTotals.map(t => fmtQtd(t)),
    fmtQtd(grandQtd),
    fmtMoney(grandValor),
  ]];

  // Legendas dos ativos (abaixo da tabela)
  const legendas = ativoIds.map((id, i) =>
    `${String.fromCharCode(65 + i)} = ${ativoNames[id] || id}`
  );

  // Larguras dinâmicas
  const fixedW = 56 + 12; // Material + Unid
  const endW = 16 + 26;   // Total + Valor
  const remaining = CW - fixedW - endW;
  const ativoColW = ativoIds.length > 0
    ? Math.max(Math.floor(remaining / ativoIds.length), 12)
    : 20;

  const columnStyles: Record<number, object> = {
    0: { cellWidth: 56, halign: "left" },
    1: { cellWidth: 12, halign: "center" },
  };
  ativoIds.forEach((_, i) => {
    columnStyles[i + 2] = { cellWidth: ativoColW, halign: "center" };
  });
  columnStyles[ativoIds.length + 2] = { cellWidth: 16, halign: "center", fontStyle: "bold" };
  columnStyles[ativoIds.length + 3] = { cellWidth: 26, halign: "right", fontStyle: "bold" };

  autoTable(doc, {
    startY: y,
    head,
    body,
    foot,
    headStyles: {
      fillColor: C.navy, textColor: C.white,
      fontSize: 7.5, fontStyle: "bold", halign: "center", cellPadding: 1.8,
    },
    bodyStyles: { fontSize: 7.5, textColor: C.dark, cellPadding: 1.6 },
    alternateRowStyles: { fillColor: C.navyLight },
    footStyles: {
      fillColor: C.navyMid, textColor: C.white, fontStyle: "bold", fontSize: 7.5, halign: "center",
    },
    columnStyles,
    margin: { top: MT, bottom: MB, left: ML, right: MR },
    tableWidth: CW,
    rowPageBreak: "avoid",
  });

  let finalY = (doc as any).lastAutoTable.finalY + 3;

  // Legendas dos ativos
  if (legendas.length > 0) {
    finalY = ensureSpace(doc, finalY, 5);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...C.gray);
    doc.text(legendas.join("   "), ML + 1, finalY);
    finalY += 5;
  }

  return finalY + 3;
}

function drawAnexosSection(doc: jsPDF, renders: AnexoRender[], y: number): number {
  y = ensureSpace(doc, y, 30);
  y = drawSectionTitle(doc, "PROJETO / PLANTA / DOCUMENTOS", y);

  for (const r of renders) {
    if (r.kind === "pdf" || r.kind === "image") {
      r.pages.forEach((pg, i) => {
        const ratio = pg.h / pg.w;
        let w = CW;
        let h = w * ratio;
        if (h > IMG_MAX_H) { h = IMG_MAX_H; w = h / ratio; }

        y = ensureSpace(doc, y, h + 10);
        const x = ML + (CW - w) / 2;

        try {
          doc.addImage(pg.b64, "JPEG", x, y, w, h, undefined, "FAST");
        } catch { /* ignora imagem inválida */ }
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.35);
        doc.rect(x, y, w, h);

        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.setTextColor(...C.gray);
        const cap = r.kind === "pdf" && r.totalPages > 1
          ? `${r.nome} — página ${i + 1} de ${r.totalPages}`
          : r.nome;
        doc.text(fitText(doc, cap, CW - 4), PW / 2, y + h + 4.2, { align: "center" });

        y += h + 10;
      });

      if (r.kind === "pdf" && r.totalPages > r.pages.length) {
        y = ensureSpace(doc, y, 6);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.setTextColor(...C.gray);
        doc.text(
          `(Documento completo com ${r.totalPages} páginas — exibidas as ${r.pages.length} primeiras.)`,
          ML + 1, y,
        );
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
      doc.setFontSize(FS_SMALL);
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
  let col = 0;
  let n = 0;

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

function drawAssinaturas(doc: jsPDF, tecnicoNome: string, y: number): number {
  y = ensureSpace(doc, y, 34);
  y += 10;

  const colW = (CW - 24) / 2;
  const x1 = ML + 6;
  const x2 = ML + 18 + colW;

  doc.setDrawColor(...C.dark);
  doc.setLineWidth(0.3);
  doc.line(x1, y + 9, x1 + colW, y + 9);
  doc.line(x2, y + 9, x2 + colW, y + 9);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C.dark);
  if (tecnicoNome && tecnicoNome !== "—") {
    doc.text(fitText(doc, tecnicoNome, colW - 4), x1 + colW / 2, y + 13.5, { align: "center" });
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C.gray);
  doc.text("Técnico Responsável", x1 + colW / 2, y + 17.5, { align: "center" });
  doc.text("Fiscalização / Contratante", x2 + colW / 2, y + 17.5, { align: "center" });

  return y + 23;
}

// ─── Capa ─────────────────────────────────────────────────────────────────────

function drawCapa(
  doc: jsPDF,
  companyNome: string,
  logo: PageImg | null,
  periodo: string,
  stats: { total: number; concluidas: number; abertas: number; custo: string },
  osList: OSRow[],
  blocosMap: Record<string, string>,
  profilesMap: Record<string, string>,
): void {
  // Faixa superior
  doc.setFillColor(...C.navy);
  doc.rect(0, 0, PW, 50, "F");
  doc.setFillColor(...C.navyMid);
  doc.rect(0, 50, PW, 1.4, "F");

  // Logo em "chip" branco (contraste garantido sobre o fundo escuro)
  let tx = ML;
  if (logo) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(ML, 9, 32, 32, 2.5, 2.5, "F");
    const ratio = Math.min(26 / logo.w, 26 / logo.h);
    const lw = logo.w * ratio;
    const lh = logo.h * ratio;
    const fmt = logo.b64.includes("image/png") ? "PNG" : "JPEG";
    try {
      doc.addImage(logo.b64, fmt, ML + (32 - lw) / 2, 9 + (32 - lh) / 2, lw, lh);
    } catch { /* ignora logo inválido */ }
    tx = ML + 40;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...C.white);
  doc.text("RELATÓRIO GERAL DE ORDENS DE SERVIÇO", tx, 20);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C.blueSoft);
  doc.text(companyNome.toUpperCase(), tx, 28);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(periodo, tx, 34.5);

  doc.setFontSize(7);
  doc.setTextColor(150, 180, 235);
  doc.text(`Emitido em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, PW - MR, 45, { align: "right" });

  // Cards de resumo
  let y = 59;
  const cards = [
    { label: "Total de O.S.", value: String(stats.total),      color: C.navyMid },
    { label: "Concluídas",    value: String(stats.concluidas), color: C.green },
    { label: "Em Aberto",     value: String(stats.abertas),    color: C.amber },
    { label: "Custo Total",   value: stats.custo,              color: C.navy },
  ];
  const cW = (CW - 9) / 4;
  cards.forEach((c, i) => {
    const x = ML + i * (cW + 3);
    doc.setFillColor(...C.grayLight);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.4);
    doc.roundedRect(x, y, cW, 25, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13.5);
    doc.setTextColor(...c.color);
    doc.text(c.value, x + cW / 2, y + 13, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.gray);
    doc.text(c.label, x + cW / 2, y + 21, { align: "center" });
  });

  // Sumário das ordens de serviço
  y += 35;
  y = drawSectionTitle(doc, "SUMÁRIO DAS ORDENS DE SERVIÇO", y);

  autoTable(doc, {
    startY: y,
    head: [["Código", "Status", "Bloco", "Ambiente", "Técnico", "Abertura", "Custo (R$)"]],
    body: osList.map(os => [
      os.codigo_os || "—",
      os.status || "—",
      os.bloco_id ? (blocosMap[os.bloco_id] || "—") : "—",
      getAmbiente(os) || "—",
      os.responsible_user_id ? (profilesMap[os.responsible_user_id] || "—") : "—",
      fmtDate(os.created_at),
      (os.custo_total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
    ]),
    foot: [[
      { content: "CUSTO TOTAL DO PERÍODO", colSpan: 6, styles: { halign: "right" } } as any,
      { content: stats.custo.replace("R$ ", ""), styles: { halign: "right" } } as any,
    ]],
    headStyles: {
      fillColor: C.navy, textColor: C.white,
      fontSize: 7.5, fontStyle: "bold", halign: "center", cellPadding: 1.8,
    },
    bodyStyles: { fontSize: 7.5, textColor: C.dark, cellPadding: 1.6 },
    alternateRowStyles: { fillColor: C.navyLight },
    footStyles: {
      fillColor: C.navyMid, textColor: C.white, fontStyle: "bold", fontSize: 7.5,
    },
    columnStyles: {
      0: { cellWidth: 20, halign: "center" },
      1: { cellWidth: 26, halign: "center" },
      2: { cellWidth: 25, halign: "left" },
      3: { cellWidth: "auto", halign: "left" },
      4: { cellWidth: 30, halign: "left" },
      5: { cellWidth: 18, halign: "center" },
      6: { cellWidth: 21, halign: "right" },
    },
    margin: { top: MT, bottom: MB, left: ML, right: MR },
    tableWidth: CW,
    didParseCell: (d: any) => {
      if (d.section === "body" && d.column.index === 1) {
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.textColor = statusColor(String(d.cell.raw || ""));
      }
    },
  });
}

// ─── Resumo consolidado de materiais ─────────────────────────────────────────

function drawResumoConsolidado(
  doc: jsPDF,
  osList: OSRow[],
  materiaisByOs: Record<string, Material[]>,
  companyNome: string,
  periodo: string,
): void {
  doc.addPage();

  doc.setFillColor(...C.navy);
  doc.rect(0, 0, PW, 26, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...C.white);
  doc.text("RESUMO CONSOLIDADO DE MATERIAIS", PW / 2, 11.5, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C.blueSoft);
  doc.text(`${companyNome}  |  ${periodo}`, PW / 2, 19, { align: "center" });

  const y = 34;
  const osComMat = osList.filter(os => (materiaisByOs[os.id] || []).length > 0);

  if (!osComMat.length) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...C.gray);
    doc.text("Nenhum material registrado no período.", ML, y + 8);
    return;
  }

  const allMats = new Map<string, { unidade: string }>();
  osList.forEach(os => {
    (materiaisByOs[os.id] || []).forEach(m => {
      if (!allMats.has(m.nome_material)) {
        allMats.set(m.nome_material, { unidade: m.unidade || "—" });
      }
    });
  });

  const osLabels = osComMat.map(os => (os.codigo_os || "OS").replace(/^OS-0*/, "OS-"));
  const head = [["Material", "Unid.", ...osLabels, "Total Qtd.", "Total R$"]];

  const body: string[][] = [];
  let grandTotal = 0; // acumula em R$

  allMats.forEach((info, matNome) => {
    const row: string[] = [matNome, info.unidade];
    let rowTotalQtd = 0;
    osComMat.forEach(os => {
      const mat = (materiaisByOs[os.id] || []).find(m => m.nome_material === matNome);
      const qtd = mat ? mat.quantidade : 0;
      rowTotalQtd += qtd;
      row.push(qtd > 0 ? fmtQtd(qtd) : "0");
    });
    row.push(rowTotalQtd > 0 ? fmtQtd(rowTotalQtd) : "0");
    // Valor total da linha em R$
    const rowValor = osComMat.reduce((s, os) => {
      const mat = (materiaisByOs[os.id] || []).find(m => m.nome_material === matNome);
      return s + (mat ? (mat.custo_total_item || 0) : 0);
    }, 0);
    row.push(fmtMoney(rowValor));
    grandTotal += rowValor;
    body.push(row);
  });

  // Linha de total: "TOTAL GERAL" abrangendo todas as colunas exceto a última + valor em R$
  const totalCols = 2 + osComMat.length + 1; // Material + Unid + colunas OS + Total Qtd
  const footRow: (string | object)[] = [
  { content: `TOTAL GERAL          ${fmtMoney(grandTotal)}`, colSpan: totalCols + 1, styles: { halign: "center", fontStyle: "bold" } } as any,
];

  const fixedW = 58 + 13;
  const totalColW = 18;
  const valorColW = 26;
  const remaining = CW - fixedW - totalColW - valorColW;
  const osColW = Math.max(Math.floor(remaining / Math.max(osComMat.length, 1)), 13);

  const columnStyles: Record<number, object> = {
    0: { cellWidth: 58, halign: "left" },
    1: { cellWidth: 13, halign: "center" },
  };
  osComMat.forEach((_, i) => {
    columnStyles[i + 2] = { cellWidth: osColW, halign: "center" };
  });
  columnStyles[osComMat.length + 2] = { cellWidth: totalColW, halign: "center", fontStyle: "bold" };
  columnStyles[osComMat.length + 3] = { cellWidth: valorColW, halign: "right", fontStyle: "bold" };
// alinhamento do footer sobreposto via didParseCell
// ↑ O alinhamento do footer é controlado via didParseCell abaixo

  autoTable(doc, {
    startY: y,
    head,
    body,
    foot: [footRow],
    headStyles: {
      fillColor: C.navy, textColor: C.white,
      fontSize: 7.5, fontStyle: "bold", halign: "center", cellPadding: 1.6,
    },
    bodyStyles: { fontSize: 7.5, textColor: C.dark, cellPadding: 1.5 },
    alternateRowStyles: { fillColor: C.navyLight },
    footStyles: {
      fillColor: C.dark, textColor: C.white, fontStyle: "bold", fontSize: 8, halign: "center",
    },
    columnStyles,
    margin: { top: MT, bottom: MB, left: ML, right: MR },
    tableWidth: CW,
    didParseCell: (d: any) => {
      if (d.section === "foot") {
        d.cell.styles.halign = "center";
      }
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.gray);
  doc.text(
    "Tabela gerada automaticamente a partir dos materiais aplicados nas O.S. do período.",
    ML, finalY,
  );
}

// ─── Paginação / rodapé ───────────────────────────────────────────────────────

function drawPageNumbers(doc: jsPDF, companyNome: string): void {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(ML, PH - 11, PW - MR, PH - 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.gray);
    doc.text(`${companyNome}  •  Relatório Geral de Ordens de Serviço`, ML, PH - 6.5);
    doc.text(`Página ${i} de ${total}`, PW - MR, PH - 6.5, { align: "right" });
  }
}

// ─── Função principal ─────────────────────────────────────────────────────────

export async function generateRelatorioGeralPDF(params: {
  osList: OSRow[];
  materiaisByOs: Record<string, Material[]>;
  blocosMap: Record<string, string>;
  profilesMap: Record<string, string>;
  companyId: string;
  filterDateFrom?: string;
  filterDateTo?: string;
  companyName?: string;
}): Promise<void> {
  const { osList, materiaisByOs, blocosMap, profilesMap, filterDateFrom, filterDateTo } = params;

  // Dados da empresa + logo
  const company = await getCompanyInfo();
  const companyNome = company.nome || "Atlas Control";
  const logo = await loadLogo(company.logoUrl);

  const periodo = filterDateFrom && filterDateTo
    ? `Período: ${fmtDate(filterDateFrom + "T00:00:00")} a ${fmtDate(filterDateTo + "T00:00:00")}`
    : `Todas as O.S.  |  Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`;

  // Pré-carrega TODOS os anexos e fotos (2 queries + downloads em paralelo)
  const assets = await preloadAssets(osList.map(o => o.id));

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setLineHeightFactor(LHF);

  // Capa + sumário
  drawCapa(doc, companyNome, logo, periodo, {
    total: osList.length,
    concluidas: osList.filter(o => norm(o.status).includes("conclu")).length,
    abertas: osList.filter(o => isAberta(o.status)).length,
    custo: fmtMoney(osList.reduce((s, o) => s + (o.custo_total || 0), 0)),
  }, osList, blocosMap, profilesMap);

  // Uma seção por O.S.
  for (const os of osList) {
    doc.addPage();
    let y = MT;

    const blocoNome = os.bloco_id ? (blocosMap[os.bloco_id] || "—") : "—";
    const tecnicoNome = os.responsible_user_id ? (profilesMap[os.responsible_user_id] || "—") : "—";
    const mats = materiaisByOs[os.id] || [];
    const osAssets = assets[os.id] || { anexos: [], fotos: [], memorial: { rows: [], ativoNames: {} } };

    // Cabeçalho da O.S.
    y = drawOsHeader(doc, os, y, blocoNome, tecnicoNome);

    // Descrição técnica elaborada
    y = ensureSpace(doc, y, 28);
    y = drawSectionTitle(doc, "DESCRIÇÃO DOS SERVIÇOS EXECUTADOS", y);
    y = drawParagraphs(doc, gerarDescricaoTecnica(os, blocoNome), y);

    // Equipamentos
    const equipLines = (os.equipamentos || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (equipLines.length) {
      y = ensureSpace(doc, y, 24);
      y = drawSectionTitle(doc, "EQUIPAMENTOS INSTALADOS", y);
      y = drawBulletList(doc, equipLines, y);
    }

    // Materiais
    if (mats.length) {
      y = drawMateriaisTable(doc, mats, y);
    }

    // Memorial de Cálculo
    if (osAssets.memorial.rows.length > 0 || true) {
      y = drawMemorialCalculo(doc, osAssets.memorial, y);
    }

    // Observações
    if (os.observacoes?.trim()) {
      y = ensureSpace(doc, y, 24);
      y = drawSectionTitle(doc, "OBSERVAÇÕES", y);
      y = drawParagraphs(doc, [os.observacoes.trim()], y);
    }

    // Anexos (PDFs renderizados como imagem + imagens)
    if (osAssets.anexos.length) {
      y = drawAnexosSection(doc, osAssets.anexos, y);
    }

    // Fotos
    if (osAssets.fotos.length) {
      y = drawFotosSection(doc, osAssets.fotos, y);
    }

    // Assinaturas
    drawAssinaturas(doc, tecnicoNome, y);
  }

  // Resumo consolidado
  drawResumoConsolidado(doc, osList, materiaisByOs, companyNome, periodo);

  // Rodapé / paginação
  drawPageNumbers(doc, companyNome);

  doc.save(`relatorio-geral-os-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`);
}