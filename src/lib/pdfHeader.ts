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

export async function addPdfHeader(
  doc: jsPDF,
  title: string,
  subtitle?: string,
  company?: PdfCompanyInfo
): Promise<number> {
  const pageW = doc.internal.pageSize.getWidth();
  const isLandscape = pageW > 200;
  const maxW = isLandscape ? 297 : 210;

  // Fundo do cabeçalho
  doc.setFillColor(248, 248, 255);
  doc.rect(0, 0, maxW, 30, "F");

  let logoW = 0;

  // Logo
  if (company?.logoUrl) {
    const base64 = await loadImageAsBase64(company.logoUrl);
    if (base64) {
      try {
        const logoH = 18;
        logoW = 18;
        doc.addImage(base64, "PNG", 10, 6, logoW, logoH);
        logoW += 14; // margem após logo
      } catch {
        logoW = 0;
      }
    }
  }

  const textX = 10 + logoW;

  // Nome da empresa
  if (company?.nome && company.nome !== "Atlas Control") {
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 150);
    doc.text(company.nome.toUpperCase(), textX, 10);
  }

  // Título do relatório
  doc.setFontSize(14);
  doc.setTextColor(50, 50, 80);
  doc.setFont("helvetica", "bold");
  doc.text(title, textX, company?.nome && company.nome !== "Atlas Control" ? 18 : 14);
  doc.setFont("helvetica", "normal");

  // Subtítulo
  if (subtitle) {
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 150);
    doc.text(subtitle, textX, company?.nome && company.nome !== "Atlas Control" ? 24 : 20);
  }

  // Data geração (direita)
  const hoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 175);
  doc.text(`Gerado em ${hoje}`, maxW - 10, 10, { align: "right" });

  // Atlas Control (marca d'água discreta)
  doc.setFontSize(7);
  doc.setTextColor(190, 190, 210);
  doc.text("Atlas Control", maxW - 10, 16, { align: "right" });

  // Linha separadora
  doc.setDrawColor(99, 102, 241);
  doc.setLineWidth(0.8);
  doc.line(10, 31, maxW - 10, 31);

  return 36; // y inicial após o cabeçalho
}