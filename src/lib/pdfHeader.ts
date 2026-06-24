import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

export type PdfCompanyInfo = {
  nome: string;
  logoUrl: string | null;
};

export async function getCompanyInfo(): Promise<PdfCompanyInfo> {
  
  try {
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { nome: "Atlas Control", logoUrl: null };

    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.company_id) return { nome: "Atlas Control", logoUrl: null };

    const { data: company } = await (supabase as any)
      .from("companies")
      .select("name, logo_url")
      .eq("id", profile.company_id)
      .maybeSingle();

    return {
      nome: company?.name || "Atlas Control",
      logoUrl: company?.logo_url || null,
    };
  } catch {
    return { nome: "Atlas Control", logoUrl: null };
  }
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Branding fixo do Atlas Control — usado pelos relatórios internos do sistema
// (Mensal de Gastos, Consolidado de Materiais, Materiais por O.S., Executivo).
// NÃO usar no Relatório Geral de O.S., que mantém a marca da empresa-cliente
// (ex.: APA) via getCompanyInfo(), pois é um documento voltado ao cliente.
export function getAtlasCompanyInfo(): PdfCompanyInfo {
  return {
    nome: "Atlas Control",
    logoUrl: `${window.location.origin}/icons/icon-256.png`,
  };
}

export async function addPdfHeader(
  doc: jsPDF,
  title: string,
  subtitle?: string,
  company?: PdfCompanyInfo
): Promise<number> {
  const pageW = doc.internal.pageSize.getWidth();

  // Fundo branco limpo
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, 35, "F");

  let logoW = 0;

  // Logo
  if (company?.logoUrl) {
    const base64 = await loadImageAsBase64(company.logoUrl);
    if (base64) {
      try {
        doc.addImage(base64, "PNG", 10, 5, 20, 20);
        logoW = 26;
      } catch {
        logoW = 0;
      }
    }
  }

  const textX = 10 + logoW;

  // Nome da empresa — pequeno, cinza
  if (company?.nome) {
    doc.setFontSize(8);
    doc.setTextColor(108, 100, 152);
    doc.setFont("helvetica", "normal");
    doc.text(company.nome.toUpperCase(), textX, 10);
  }

  // Título — preto, negrito
  doc.setFontSize(15);
  doc.setTextColor(58, 53, 92);
  doc.setFont("helvetica", "bold");
  doc.text(title, textX, 19);
  doc.setFont("helvetica", "normal");

  // Subtítulo — cinza
  if (subtitle) {
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(subtitle, textX, 26);
  }

  // Data geração (direita)
  const hoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.text(`Gerado em ${hoje}`, pageW - 10, 10, { align: "right" });
  doc.text("Atlas Control", pageW - 10, 16, { align: "right" });

  // Linha separadora — tom Atlas suave
  doc.setDrawColor(108, 100, 152);
  doc.setLineWidth(0.5);
  doc.line(10, 32, pageW - 10, 32);

  return 38;
}

// Função auxiliar para título de seção dentro do PDF
export function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFontSize(10);
  doc.setTextColor(58, 53, 92);
  doc.setFont("helvetica", "bold");
  doc.text(title, 10, y);
  doc.setFont("helvetica", "normal");
  doc.setDrawColor(108, 100, 152);
  doc.setLineWidth(0.3);
  doc.line(10, y + 2, pageW - 10, y + 2);
  return y + 7;
}

// Função auxiliar para label de item (ex: nome do material ou código da OS)
export function addItemLabel(doc: jsPDF, label: string, y: number): void {
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "bold");
  doc.text(label, 10, y);
  doc.setFont("helvetica", "normal");
}