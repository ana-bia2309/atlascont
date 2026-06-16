// src/lib/generateRelatorioGeralWord.ts
// Relatório Geral de O.S. em WORD (.doc) — mesmo modelo do PDF (Denteck)
// - Documento 100% editável no Microsoft Word
// - Formato MHTML (.doc): imagens (logo, anexos, fotos) EMBUTIDAS no arquivo
// - Anexos PDF renderizados como imagem via pdfjs-dist (até 3 páginas por anexo)
// - Texto padrão oficial idêntico ao do PDF
// - Rodapé com "Página X de Y" dinâmico do Word

import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyInfo } from "@/lib/pdfHeader";

// ─── Types (idênticos ao gerador PDF) ────────────────────────────────────────

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
  quantidades: Record<string, number>;
};

type MemorialData = {
  rows: MemorialItemRow[];
  ativoNames: Record<string, string>;
};

type OsAssets = { anexos: AnexoRender[]; fotos: FotoRender[]; memorial: MemorialData };

// ─── Constantes ───────────────────────────────────────────────────────────────

const MAX_PDF_PAGES = 3;
const ANEXO_BUCKET = "anexos-os";

// Paleta (hex) — mesma do PDF
const HX = {
  navy: "#102456",
  navyMid: "#28468C",
  navyLight: "#E9EFFC",
  green: "#168A46",
  red: "#BA2E2E",
  amber: "#B06C0C",
  sky: "#1076BA",
  gray: "#6C7686",
  grayLight: "#F6F8FB",
  white: "#FFFFFF",
  dark: "#181E2E",
  border: "#CBD4E4",
  blueSoft: "#B0C8F5",
};

// ─── Helpers gerais (idênticos ao PDF) ───────────────────────────────────────

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

const statusColorHex = (s: string | null): string => {
  const v = norm(s);
  if (v.includes("conclu")) return HX.green;
  if (v.includes("execu") || v.includes("andamento")) return HX.sky;
  if (v.includes("cancel") || v.includes("reprov")) return HX.red;
  if (v.includes("aguard") || v.includes("orcamento") || v.includes("triagem")) return HX.amber;
  return HX.gray;
};

const isAberta = (s: string | null) => {
  const v = norm(s);
  return !v.includes("conclu") && !v.includes("cancel");
};

function listJoin(arr: string[]): string {
  const a = arr.filter(Boolean);
  if (a.length === 0) return "";
  if (a.length === 1) return a[0];
  return a.slice(0, -1).join(", ") + " e " + a[a.length - 1];
}

/** Escapa texto para HTML */
function esc(s: string | null | undefined): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Executa promessas com limite de concorrência, preservando a ordem */
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

// ─── Processamento de imagens (idêntico ao PDF) ──────────────────────────────

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

// ─── Pré-carregamento de anexos, fotos e memorial (idêntico ao PDF) ──────────

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

  const memByOsId: Record<string, any[]> = {};
  memRows.forEach((m: any) => {
    if (!memByOsId[m.os_id]) memByOsId[m.os_id] = [];
    memByOsId[m.os_id].push(m);
  });

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

// ─── Texto padrão oficial (idêntico ao PDF — NÃO alterar) ────────────────────

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
  const natureza = (os.natureza_servico || "Instalação").trim().toLowerCase();

  const ambiente = getAmbiente(os);
  const locParts: string[] = [];
  if (blocoNome && blocoNome !== "—") locParts.push(blocoNome);
  if (ambiente) locParts.push(ambiente);
  const loc = locParts.join(" — ") || "—";

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

  const p1 =
    `A presente Ordem de Serviço (${os.codigo_os || "—"}) tem por objeto a execução de serviços de ${natureza} ` +
    `de sistema de climatização, executados em ${loc}${equipPart}.`;

  const p2 =
    "O escopo dos trabalhos compreendeu o lançamento das linhas frigorígenas em tubulação de cobre flexível, " +
    "com isolamento térmico em polipex blindado, a execução das interligações elétricas e de comando entre as " +
    "unidades evaporadora e condensadora, em cabo multipolar, a instalação da rede de drenagem de condensado, " +
    "com bomba de dreno, a fixação das unidades condensadoras sobre suportes metálicos e o acabamento e a " +
    "identificação das linhas com fita de PVC.";

  const p3 =
    "Concluída a montagem, foram realizados os testes de estanqueidade do circuito frigorígeno, o processo de " +
    "desidratação (vácuo), a liberação da carga de fluido refrigerante e a partida assistida dos equipamentos, " +
    "com verificação dos parâmetros operacionais de pressão, corrente e temperatura.";

  const p4 =
    `Os serviços foram finalizados em ${fmtDate(os.finalizado_em || os.data_termino)}, em conformidade com as ` +
    "especificações técnicas da O.S., as recomendações dos fabricantes e as normas ABNT NBR 16401 e ABNT NBR 5410, " +
    "encontrando-se o sistema em plenas condições de operação.";

  return [p1, p2, p3, p4];
}

// ─── Armazém de imagens embutidas no MHT ──────────────────────────────────────

class ImgStore {
  parts: { loc: string; mime: string; data: string }[] = [];
  private n = 0;

  /** Recebe dataURL e devolve o Content-Location ABSOLUTO para usar em <img src=""> */
  add(dataUrl: string): string | null {
    const m = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
    if (!m) return null;
    const mime = m[1].toLowerCase();
    const ext = mime.includes("png") ? "png" : "jpg";
    // URL absoluta idêntica no <img src> e no Content-Location da parte —
    // é assim que o Word resolve as imagens embutidas no MHT.
    const loc = `file:///C:/relatorio/img${String(++this.n).padStart(3, "0")}.${ext}`;
    this.parts.push({ loc, mime, data: m[2] });
    return loc;
  }
}

// ─── Blocos HTML do documento ─────────────────────────────────────────────────

function pageBreak(): string {
  return `<br clear="all" style="mso-special-character:line-break;page-break-before:always">`;
}

function sectionTitle(t: string): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:14pt 0 6pt 0;border-collapse:collapse;">
  <tr>
    <td width="6" style="background:${HX.navyMid};font-size:1pt;">&nbsp;</td>
    <td style="padding-left:6pt;border-bottom:0.75pt solid ${HX.border};">
      <span style="font-size:10.5pt;font-weight:bold;color:${HX.navy};">${esc(t)}</span>
    </td>
  </tr>
</table>`;
}

function statusBadge(status: string | null): string {
  const cor = statusColorHex(status);
  return `<span style="background:${cor};color:#FFFFFF;font-size:7pt;font-weight:bold;padding:2pt 7pt;">${esc(status || "Sem status")}</span>`;
}

function infoCell(label: string, val: string): string {
  return `
      <td width="50%" style="padding:3pt 8pt;">
        <span style="font-size:7.3pt;font-weight:bold;color:${HX.gray};">${esc(label)}</span>
        &nbsp;&nbsp;<span style="font-size:8.2pt;font-weight:bold;color:${HX.dark};">${esc(val)}</span>
      </td>`;
}

function osHeaderHtml(os: OSRow, blocoNome: string, tecnicoNome: string): string {
  const ambiente = getAmbiente(os) || "—";
  const hasExtra = !!(os.titulo?.trim() || os.numero_os_externo?.trim());

  let extraRow = "";
  if (hasExtra) {
    extraRow = `<tr>${infoCell("Título:", os.titulo?.trim() || "—")}${infoCell("Nº O.S. externa:", os.numero_os_externo?.trim() || "—")}</tr>`;
  }

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
  <tr>
    <td style="background:${HX.navy};padding:7pt 10pt;">
      <span style="font-size:12.5pt;font-weight:bold;color:#FFFFFF;">O.S.&nbsp;&nbsp;${esc(os.codigo_os || "—")}</span>
    </td>
    <td align="right" style="background:${HX.navy};padding:7pt 10pt;">
      <span style="font-size:7.5pt;color:${HX.blueSoft};">Prioridade: ${esc(os.prioridade || "—")}</span>
      &nbsp;&nbsp;${statusBadge(os.status)}
    </td>
  </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${HX.navyLight};border:0.5pt solid ${HX.border};margin-top:4pt;">
  <tr>${infoCell("Data de abertura:", fmtDate(os.created_at))}${infoCell("Técnico responsável:", tecnicoNome)}</tr>
  <tr>${infoCell("Data de conclusão:", fmtDate(os.finalizado_em || os.data_termino))}${infoCell("Ambiente:", ambiente)}</tr>
  <tr>${infoCell("Unidade / Bloco:", blocoNome)}${infoCell("Categoria:", os.origem || "—")}</tr>
  ${extraRow}
</table>`;
}

function paragraphsHtml(ps: string[]): string {
  return ps
    .filter(Boolean)
    .map(p => `<p style="font-size:9.5pt;color:${HX.dark};text-align:justify;line-height:140%;margin:0 0 7pt 0;">${esc(p)}</p>`)
    .join("\n");
}

function bulletsHtml(items: string[]): string {
  const lis = items
    .map(it => `<li style="font-size:9.5pt;color:${HX.dark};line-height:140%;margin-bottom:2pt;">${esc(it)}</li>`)
    .join("\n");
  return `<ul style="margin:2pt 0 8pt 18pt;">${lis}</ul>`;
}

const TH = (txt: string, extra = "") =>
  `<td style="background:${HX.navy};color:#FFFFFF;font-size:7.5pt;font-weight:bold;text-align:center;padding:3pt 4pt;border:0.5pt solid ${HX.navy};${extra}">${esc(txt)}</td>`;

const TD = (txt: string, zebra: boolean, align = "center", extra = "") =>
  `<td style="background:${zebra ? HX.navyLight : "#FFFFFF"};color:${HX.dark};font-size:7.5pt;text-align:${align};padding:2.5pt 4pt;border:0.5pt solid ${HX.border};${extra}">${esc(txt)}</td>`;

function materiaisHtml(mats: Material[]): string {
  const total = mats.reduce((s, m) => s + (m.custo_total_item || 0), 0);

  const rows = mats.map((m, i) => `
  <tr>
    ${TD(m.nome_material, i % 2 === 1, "left")}
    ${TD(m.unidade || "—", i % 2 === 1)}
    ${TD(fmtQtd(m.quantidade), i % 2 === 1, "right")}
    ${TD(fmtMoney(m.custo_unitario), i % 2 === 1, "right")}
    ${TD(fmtMoney(m.custo_total_item), i % 2 === 1, "right")}
  </tr>`).join("");

  return `
${sectionTitle("MATERIAIS APLICADOS NESTA O.S.")}
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
  <tr>${TH("Material")}${TH("Unid.")}${TH("Qtd.")}${TH("Vl. Unitário")}${TH("Subtotal")}</tr>
  ${rows}
  <tr>
    <td colspan="4" style="background:${HX.navyMid};color:#FFFFFF;font-size:8pt;font-weight:bold;text-align:right;padding:3pt 6pt;border:0.5pt solid ${HX.navyMid};">TOTAL DA O.S.</td>
    <td style="background:${HX.navyMid};color:#FFFFFF;font-size:8pt;font-weight:bold;text-align:right;padding:3pt 6pt;border:0.5pt solid ${HX.navyMid};">${esc(fmtMoney(total))}</td>
  </tr>
</table>`;
}

function memorialHtml(memorial: MemorialData): string {
  const { rows, ativoNames } = memorial;

  if (!rows.length) {
    return `${sectionTitle("MEMORIAL DE CÁLCULO")}
<p style="font-size:8pt;font-style:italic;color:${HX.gray};margin:0 0 8pt 0;">Não informado.</p>`;
  }

  const ativoIds = Array.from(new Set(rows.flatMap(r => Object.keys(r.quantidades))));

  // Larguras proporcionais fixas (soma = 100%) — espelha o layout do PDF
  const nAtCols = Math.max(ativoIds.length, 1);
  const atPct = Math.round((37 / nAtCols) * 10) / 10;
  const headCols = [
    TH("Material", "width:32%;"), TH("Unid.", "width:7%;"),
    ...ativoIds.map((_, i) => TH(String.fromCharCode(65 + i), `width:${atPct}%;`)),
    TH("Total", "width:9%;"), TH("Valor (R$)", "width:15%;"),
  ].join("");

  const bodyRows = rows.map((r, i) => {
    const totalQtd = ativoIds.reduce((s, id) => s + (r.quantidades[id] || 0), 0);
    const totalValor = totalQtd * r.custo_unitario;
    const cells = [
      TD(r.material_nome, i % 2 === 1, "left"),
      TD(r.material_unidade || "—", i % 2 === 1),
      ...ativoIds.map(id => {
        const q = r.quantidades[id] || 0;
        return TD(q > 0 ? fmtQtd(q) : "0", i % 2 === 1);
      }),
      TD(fmtQtd(totalQtd), i % 2 === 1, "center", "font-weight:bold;"),
      TD(fmtMoney(totalValor), i % 2 === 1, "right", "font-weight:bold;"),
    ].join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  const colTotals = ativoIds.map(id => rows.reduce((s, r) => s + (r.quantidades[id] || 0), 0));
  const grandQtd = colTotals.reduce((a, b) => a + b, 0);
  const grandValor = rows.reduce((s, r) => {
    const q = ativoIds.reduce((sq, id) => sq + (r.quantidades[id] || 0), 0);
    return s + q * r.custo_unitario;
  }, 0);

  const footTd = (txt: string, align = "center") =>
    `<td style="background:${HX.navyMid};color:#FFFFFF;font-size:7.5pt;font-weight:bold;text-align:${align};padding:3pt 4pt;border:0.5pt solid ${HX.navyMid};">${esc(txt)}</td>`;

  const footRow = [
    footTd("TOTAL", "left"), footTd(""),
    ...colTotals.map(t => footTd(fmtQtd(t))),
    footTd(fmtQtd(grandQtd)),
    footTd(fmtMoney(grandValor), "right"),
  ].join("");

  const legendas = ativoIds
    .map((id, i) => `${String.fromCharCode(65 + i)} = ${ativoNames[id] || id}`)
    .join("&nbsp;&nbsp;&nbsp;");

  return `
${sectionTitle("MEMORIAL DE CÁLCULO")}
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;">
  <tr>${headCols}</tr>
  ${bodyRows}
  <tr>${footRow}</tr>
</table>
${legendas ? `<p style="font-size:7pt;font-style:italic;color:${HX.gray};margin:3pt 0 8pt 0;">${legendas}</p>` : ""}`;
}

function anexosHtml(renders: AnexoRender[], store: ImgStore): string {
  let html = sectionTitle("PROJETO / PLANTA / DOCUMENTOS");

  for (const r of renders) {
    if (r.kind === "pdf" || r.kind === "image") {
      r.pages.forEach((pg, i) => {
        const loc = store.add(pg.b64);
        if (!loc) return;
        // largura útil A4 c/ margens 18mm ≈ 174mm ≈ 658px @96dpi
        const maxW = 650;
        const maxH = 720;
        const ratio = pg.h / pg.w;
        let w = maxW;
        let h = Math.round(w * ratio);
        if (h > maxH) { h = maxH; w = Math.round(h / ratio); }

        const cap = r.kind === "pdf" && r.totalPages > 1
          ? `${r.nome} — página ${i + 1} de ${r.totalPages}`
          : r.nome;

        html += `
<p align="center" style="margin:6pt 0 2pt 0;">
  <img src="${loc}" width="${w}" height="${h}" style="border:0.5pt solid ${HX.border};">
</p>
<p align="center" style="font-size:7pt;font-style:italic;color:${HX.gray};margin:0 0 8pt 0;">${esc(cap)}</p>`;
      });

      if (r.kind === "pdf" && r.totalPages > r.pages.length) {
        html += `<p style="font-size:7pt;font-style:italic;color:${HX.gray};margin:0 0 6pt 0;">(Documento completo com ${r.totalPages} páginas — exibidas as ${r.pages.length} primeiras.)</p>`;
      }
    } else if (r.kind === "outro") {
      html += `
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${HX.navyLight};border:0.5pt solid ${HX.border};margin:3pt 0;">
  <tr>
    <td width="34" align="center" style="background:${HX.navyMid};color:#FFFFFF;font-size:5.5pt;font-weight:bold;padding:4pt 2pt;">ARQ</td>
    <td style="padding:4pt 8pt;font-size:8pt;color:${HX.dark};">${esc(r.nome)}</td>
  </tr>
</table>`;
    } else {
      html += `<p style="font-size:7.5pt;font-style:italic;color:${HX.gray};margin:2pt 0;">Anexo indisponível: ${esc(r.nome)}</p>`;
    }
  }
  return html;
}

function fotosHtml(fotos: FotoRender[], store: ImgStore): string {
  let html = sectionTitle("REGISTRO FOTOGRÁFICO");
  html += `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">`;

  let n = 0;
  for (let i = 0; i < fotos.length; i += 2) {
    const pair = [fotos[i], fotos[i + 1]].filter(Boolean) as FotoRender[];
    const cells = pair.map(f => {
      n++;
      const cap = `Registro ${String(n).padStart(2, "0")}${f.date ? ` — ${fmtDate(f.date)}` : ""}`;
      let inner: string;
      if (f.img) {
        const loc = store.add(f.img.b64);
        inner = loc
          ? `<img src="${loc}" width="318" height="239" style="border:0.5pt solid ${HX.border};">`
          : `<span style="font-size:7pt;font-style:italic;color:${HX.gray};">Foto indisponível</span>`;
      } else {
        inner = `<span style="font-size:7pt;font-style:italic;color:${HX.gray};">Foto indisponível</span>`;
      }
      return `
    <td width="50%" align="center" style="padding:4pt;">
      ${inner}<br>
      <span style="font-size:7pt;font-style:italic;color:${HX.gray};">${esc(cap)}</span>
    </td>`;
    }).join("");
    html += `<tr>${cells}${pair.length === 1 ? `<td width="50%"></td>` : ""}</tr>`;
  }

  html += `</table>`;
  return html;
}

function assinaturasHtml(tecnicoNome: string): string {
  const nome = tecnicoNome && tecnicoNome !== "—" ? esc(tecnicoNome) : "&nbsp;";
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:34pt;">
  <tr>
    <td width="44%" align="center" style="border-top:0.75pt solid ${HX.dark};padding-top:4pt;">
      <span style="font-size:8pt;font-weight:bold;color:${HX.dark};">${nome}</span><br>
      <span style="font-size:7pt;color:${HX.gray};">Técnico Responsável</span>
    </td>
    <td width="12%">&nbsp;</td>
    <td width="44%" align="center" style="border-top:0.75pt solid ${HX.dark};padding-top:4pt;">
      <span style="font-size:8pt;font-weight:bold;color:${HX.dark};">&nbsp;</span><br>
      <span style="font-size:7pt;color:${HX.gray};">Fiscalização / Contratante</span>
    </td>
  </tr>
</table>`;
}

function capaHtml(
  companyNome: string,
  logoLoc: string | null,
  periodo: string,
  stats: { total: number; concluidas: number; abertas: number; custo: string },
  osList: OSRow[],
  blocosMap: Record<string, string>,
  profilesMap: Record<string, string>,
): string {
  const logoCell = logoLoc
    ? `<td width="120" style="padding:10pt;text-align:center;vertical-align:middle;">
      <table cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-collapse:collapse;">
        <tr>
          <td style="padding:6pt;text-align:center;">
            <img src="${logoLoc}" width="76" style="width:76px;height:auto;display:block;">
          </td>
        </tr>
      </table>
    </td>`
    : "";

  const cards = [
    { label: "Total de O.S.", value: String(stats.total), color: HX.navyMid },
    { label: "Concluídas", value: String(stats.concluidas), color: HX.green },
    { label: "Em Aberto", value: String(stats.abertas), color: HX.amber },
    { label: "Custo Total", value: stats.custo, color: HX.navy },
  ].map(c => `
    <td width="25%" align="center" style="background:${HX.grayLight};border:0.5pt solid ${HX.border};padding:9pt 4pt;">
      <span style="font-size:13.5pt;font-weight:bold;color:${c.color};">${esc(c.value)}</span><br>
      <span style="font-size:7pt;color:${HX.gray};">${esc(c.label)}</span>
    </td>`).join(`<td width="4" style="font-size:1pt;">&nbsp;</td>`);

  const sumRows = osList.map((os, i) => `
  <tr>
    ${TD(os.codigo_os || "—", i % 2 === 1)}
    <td style="background:${i % 2 === 1 ? HX.navyLight : "#FFFFFF"};font-size:7.5pt;font-weight:bold;text-align:center;padding:2.5pt 4pt;border:0.5pt solid ${HX.border};color:${statusColorHex(os.status)};">${esc(os.status || "—")}</td>
    ${TD(os.bloco_id ? (blocosMap[os.bloco_id] || "—") : "—", i % 2 === 1, "left")}
    ${TD(getAmbiente(os) || "—", i % 2 === 1, "left")}
    ${TD(os.responsible_user_id ? (profilesMap[os.responsible_user_id] || "—") : "—", i % 2 === 1, "left")}
    ${TD(fmtDate(os.created_at), i % 2 === 1)}
    ${TD((os.custo_total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }), i % 2 === 1, "right")}
  </tr>`).join("");

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${HX.navy};">
  <tr>
    ${logoCell}
    <td style="padding:12pt 10pt;">
      <span style="font-size:15pt;font-weight:bold;color:#FFFFFF;">RELATÓRIO GERAL DE ORDENS DE SERVIÇO</span><br>
      <span style="font-size:9.5pt;font-weight:bold;color:${HX.blueSoft};">${esc(companyNome.toUpperCase())}</span><br>
      <span style="font-size:8pt;color:${HX.blueSoft};">${esc(periodo)}</span><br>
      <span style="font-size:7pt;color:#96B4EB;">Emitido em ${format(new Date(), "dd/MM/yyyy HH:mm")}</span>
    </td>
  </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:10pt;">
  <tr>${cards}</tr>
</table>
${sectionTitle("SUMÁRIO DAS ORDENS DE SERVIÇO")}
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
  <tr>${TH("Código")}${TH("Status")}${TH("Bloco")}${TH("Ambiente")}${TH("Técnico")}${TH("Abertura")}${TH("Custo (R$)")}</tr>
  ${sumRows}
  <tr>
    <td colspan="6" style="background:${HX.navyMid};color:#FFFFFF;font-size:7.5pt;font-weight:bold;text-align:right;padding:3pt 6pt;border:0.5pt solid ${HX.navyMid};">CUSTO TOTAL DO PERÍODO</td>
    <td style="background:${HX.navyMid};color:#FFFFFF;font-size:7.5pt;font-weight:bold;text-align:right;padding:3pt 6pt;border:0.5pt solid ${HX.navyMid};">${esc(stats.custo.replace("R$ ", ""))}</td>
  </tr>
</table>`;
}

function consolidadoHtml(
  osList: OSRow[],
  materiaisByOs: Record<string, Material[]>,
  companyNome: string,
  periodo: string,
): string {
  let html = `
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${HX.navy};">
  <tr>
    <td align="center" style="padding:10pt;">
      <span style="font-size:12.5pt;font-weight:bold;color:#FFFFFF;">RESUMO CONSOLIDADO DE MATERIAIS</span><br>
      <span style="font-size:8pt;color:${HX.blueSoft};">${esc(companyNome)}&nbsp;&nbsp;|&nbsp;&nbsp;${esc(periodo)}</span>
    </td>
  </tr>
</table>`;

  const osComMat = osList.filter(os => (materiaisByOs[os.id] || []).length > 0);

  if (!osComMat.length) {
    return html + `<p style="font-size:10pt;font-style:italic;color:${HX.gray};margin-top:10pt;">Nenhum material registrado no período.</p>`;
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

  // Larguras proporcionais fixas (soma = 100%) — espelha o layout do PDF
  const nOSCols = Math.max(osComMat.length, 1);
  const osPct = Math.round((38 / nOSCols) * 10) / 10;
  const headCols = [
    TH("Material", "width:31%;"), TH("Unid.", "width:7%;"),
    ...osLabels.map(l => TH(l, `width:${osPct}%;`)),
    TH("Total Qtd.", "width:10%;"), TH("Total R$", "width:14%;"),
  ].join("");

  let grandTotal = 0;
  const bodyRows: string[] = [];
  let i = 0;

  allMats.forEach((info, matNome) => {
    let rowTotalQtd = 0;
    const qtdCells = osComMat.map(os => {
      const mat = (materiaisByOs[os.id] || []).find(m => m.nome_material === matNome);
      const qtd = mat ? mat.quantidade : 0;
      rowTotalQtd += qtd;
      return TD(qtd > 0 ? fmtQtd(qtd) : "0", i % 2 === 1);
    }).join("");

    const rowValor = osComMat.reduce((s, os) => {
      const mat = (materiaisByOs[os.id] || []).find(m => m.nome_material === matNome);
      return s + (mat ? (mat.custo_total_item || 0) : 0);
    }, 0);
    grandTotal += rowValor;

    bodyRows.push(`
  <tr>
    ${TD(matNome, i % 2 === 1, "left")}
    ${TD(info.unidade, i % 2 === 1)}
    ${qtdCells}
    ${TD(rowTotalQtd > 0 ? fmtQtd(rowTotalQtd) : "0", i % 2 === 1, "center", "font-weight:bold;")}
    ${TD(fmtMoney(rowValor), i % 2 === 1, "right", "font-weight:bold;")}
  </tr>`);
    i++;
  });

  const totalColSpan = 2 + osComMat.length + 2;

  html += `
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;margin-top:8pt;">
  <tr>${headCols}</tr>
  ${bodyRows.join("")}
  <tr>
    <td colspan="${totalColSpan}" align="center" style="background:${HX.dark};color:#FFFFFF;font-size:8.5pt;font-weight:bold;text-align:center;padding:5pt;border:0.5pt solid ${HX.dark};">
      TOTAL GERAL:&nbsp;&nbsp;${esc(fmtMoney(grandTotal))}
    </td>
  </tr>
</table>
<p style="font-size:7.5pt;font-style:italic;color:${HX.gray};margin-top:8pt;">Tabela gerada automaticamente a partir dos materiais aplicados nas O.S. do período.</p>`;

  return html;
}

// ─── Montagem do MHT (.doc com imagens embutidas) ────────────────────────────

function wrap76(s: string): string {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += 76) out.push(s.slice(i, i + 76));
  return out.join("\r\n");
}

/** Quoted-printable (RFC 2045) sobre bytes UTF-8 — formato que o Word usa nas partes HTML do MHT */
function qpEncodeUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  const lines: string[] = [];
  let line = "";

  const pushTok = (tok: string) => {
    if (line.length + tok.length > 73) { // soft break antes de estourar 76
      lines.push(line + "=");
      line = "";
    }
    line += tok;
  };

  for (const b of bytes) {
    if (b === 0x0a) {            // \n → quebra real de linha
      lines.push(line);
      line = "";
    } else if (b === 0x0d) {
      // ignora \r (normalizado pelo \n)
    } else if (b === 0x3d || b < 0x20 || b > 0x7e) {
      pushTok("=" + b.toString(16).toUpperCase().padStart(2, "0"));
    } else {
      pushTok(String.fromCharCode(b));
    }
  }
  if (line) lines.push(line);

  // espaço/tab no fim de linha precisa ser codificado
  return lines
    .map(l => l.replace(/ $/, "=20").replace(/\t$/, "=09"))
    .join("\r\n");
}

function buildMht(html: string, store: ImgStore): string {
  const B = "----=_NextPart_AtlasControl";
  const lines: string[] = [];

  lines.push("MIME-Version: 1.0");
  lines.push(`Content-Type: multipart/related; boundary="${B}"; type="text/html"`);
  lines.push("");
  lines.push(`--${B}`);
  lines.push(`Content-Type: text/html; charset="utf-8"`);
  lines.push("Content-Transfer-Encoding: quoted-printable");
  lines.push("Content-Location: file:///C:/relatorio/documento.htm");
  lines.push("");
  lines.push(qpEncodeUtf8(html));
  lines.push("");

  for (const p of store.parts) {
    lines.push(`--${B}`);
    lines.push(`Content-Type: ${p.mime}`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push(`Content-Location: ${p.loc}`);
    lines.push("");
    lines.push(wrap76(p.data));
    lines.push("");
  }

  lines.push(`--${B}--`);
  return lines.join("\r\n");
}

// ─── Função principal ─────────────────────────────────────────────────────────

export async function generateRelatorioGeralWord(params: {
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

  // Pré-carrega anexos, fotos e memorial (mesmo pipeline do PDF)
  const assets = await preloadAssets(osList.map(o => o.id));

  const store = new ImgStore();
  const logoLoc = logo ? store.add(logo.b64) : null;

  const stats = {
    total: osList.length,
    concluidas: osList.filter(o => norm(o.status).includes("conclu")).length,
    abertas: osList.filter(o => isAberta(o.status)).length,
    custo: fmtMoney(osList.reduce((s, o) => s + (o.custo_total || 0), 0)),
  };

  // ── Corpo do documento ──
  let body = capaHtml(companyNome, logoLoc, periodo, stats, osList, blocosMap, profilesMap);

  for (const os of osList) {
    const blocoNome = os.bloco_id ? (blocosMap[os.bloco_id] || "—") : "—";
    const tecnicoNome = os.responsible_user_id ? (profilesMap[os.responsible_user_id] || "—") : "—";
    const mats = materiaisByOs[os.id] || [];
    const osAssets = assets[os.id] || { anexos: [], fotos: [], memorial: { rows: [], ativoNames: {} } };

    body += pageBreak();
    body += osHeaderHtml(os, blocoNome, tecnicoNome);

    body += sectionTitle("DESCRIÇÃO DOS SERVIÇOS EXECUTADOS");
    body += paragraphsHtml(gerarDescricaoTecnica(os, blocoNome));

    const equipLines = (os.equipamentos || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (equipLines.length) {
      body += sectionTitle("EQUIPAMENTOS INSTALADOS");
      body += bulletsHtml(equipLines);
    }

    if (mats.length) {
      body += materiaisHtml(mats);
    }

    body += memorialHtml(osAssets.memorial);

    if (os.observacoes?.trim()) {
      body += sectionTitle("OBSERVAÇÕES");
      body += paragraphsHtml([os.observacoes.trim()]);
    }

    if (osAssets.anexos.length) {
      body += anexosHtml(osAssets.anexos, store);
    }

    if (osAssets.fotos.length) {
      body += fotosHtml(osAssets.fotos, store);
    }

    body += assinaturasHtml(tecnicoNome);
  }

  body += pageBreak();
  body += consolidadoHtml(osList, materiaisByOs, companyNome, periodo);

  // ── Documento HTML completo (Word) ──
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="Microsoft Word 15">
<meta name="Originator" content="Microsoft Word 15">
<title>Relatório Geral de Ordens de Serviço</title>
<!--[if gte mso 9]><xml>
<w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument>
</xml><![endif]-->
<style>
@page WordSection1 {
  size: 595.3pt 841.9pt;
  margin: 51pt 51pt 51pt 51pt;
  mso-header-margin: 28pt;
  mso-footer-margin: 24pt;
  mso-footer: f1;
  mso-paper-source: 0;
}
div.WordSection1 { page: WordSection1; }
body { font-family: Helvetica, Arial, sans-serif; color: ${HX.dark}; }
table { border-collapse: collapse; }
p { margin: 0; }
</style>
</head>
<body lang="PT-BR">
<div class="WordSection1">
${body}
<div style="mso-element:footer" id="f1">
<p style="font-size:7pt;color:${HX.gray};border-top:0.5pt solid ${HX.border};padding-top:3pt;margin:0;">
${esc(companyNome)}&nbsp;&nbsp;•&nbsp;&nbsp;Relatório Geral de Ordens de Serviço&nbsp;&nbsp;—&nbsp;&nbsp;Página
<!--[if supportFields]><span style="mso-element:field-begin"></span> PAGE <span style="mso-element:field-separator"></span><![endif]--><span style="mso-no-proof:yes">1</span><!--[if supportFields]><span style="mso-element:field-end"></span><![endif]-->
de
<!--[if supportFields]><span style="mso-element:field-begin"></span> NUMPAGES <span style="mso-element:field-separator"></span><![endif]--><span style="mso-no-proof:yes">1</span><!--[if supportFields]><span style="mso-element:field-end"></span><![endif]-->
</p>
</div>
</div>
</body>
</html>`;

  // ── Empacota como MHT (.doc) e dispara o download ──
  const mht = buildMht(html, store);
  const blob = new Blob([mht], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `relatorio-geral-os-${format(new Date(), "yyyyMMdd-HHmm")}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}