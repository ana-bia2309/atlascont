import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, User, Loader2, FileSpreadsheet, FileText, Sparkles } from "@/lib/icons";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  excelData?: { titulo: string; rows: Record<string, unknown>[] };
  pdfData?: { titulo: string; rows: Record<string, unknown>[] };
};

const SYSTEM_PROMPT = `Você é um assistente inteligente do Atlas Control, sistema de gestão de manutenção predial.

REGRA OBRIGATÓRIA: Quando o usuário pedir qualquer relatório em Excel ou planilha, inclua:
<excel titulo="Título do Relatório">[{"Coluna1":"valor1","Coluna2":"valor2"}]</excel>

REGRA OBRIGATÓRIA: Quando pedir PDF:
<pdf titulo="Título do Relatório">[{"Coluna1":"valor1","Coluna2":"valor2"}]</pdf>

REGRA DE CONTEXTO: Use EXCLUSIVAMENTE os dados do módulo solicitado:
- Perguntas sobre ESTOQUE/MATERIAIS → use apenas dados de estoque e materiais
- Perguntas sobre OS/ORDENS DE SERVIÇO → use apenas dados de ordens de serviço
- Perguntas sobre FINANCEIRO/GASTOS/CUSTOS → use apenas dados financeiros
- Perguntas sobre EQUIPAMENTOS/ATIVOS → use apenas dados de ativos
- Perguntas sobre CHAMADOS → use apenas dados de chamados
- Perguntas sobre PREVENTIVAS → use apenas dados de ordens preventivas
NÃO misture dados de módulos diferentes.
NÃO use tabelas markdown. USE SEMPRE a tag correta.
Responda em português brasileiro.`;

// Detecta qual módulo o usuário está perguntando
function detectarModulo(texto: string): string[] {
  const t = texto.toLowerCase();
  const modulos: string[] = [];

  if (/estoque|material|materiais|almoxarifado|insumo|peca|peça|produto/.test(t)) modulos.push("estoque");
  if (/os|ordem de servi[çc]o|ordens de servi[çc]o|servi[çc]o|manuten[çc]ao|manutenção|corretiva|corretivo/.test(t)) modulos.push("os");
  if (/financ|gasto|custo|despesa|pagamento|valor|boleto|receita/.test(t)) modulos.push("financeiro");
  if (/ativo|equipamento|maquina|máquina|aparelho|instalac|instalação/.test(t)) modulos.push("ativos");
  if (/chamado|ticket|solicitac|solicitação|reclamac|reclamação/.test(t)) modulos.push("chamados");
  if (/preventiv|manutenc|manutenção preventiva|plano de manutenc/.test(t)) modulos.push("preventivas");

  // Se nada detectado, busca contexto geral
  if (modulos.length === 0) modulos.push("geral");

  return modulos;
}

async function buscarContexto(modulos: string[], companyId: string): Promise<string> {
  let ctx = "";

  for (const modulo of modulos) {
    try {
      if (modulo === "estoque") {
        const [matsRes, estoqueRes] = await Promise.all([
          (supabase as any).from("materiais")
            .select("codigo, descricao, unidade, categoria, status")
            .eq("company_id", companyId)
            .eq("status", "ativo")
            .order("codigo")
            .limit(200),
          (supabase as any).from("estoque")
            .select("material_id, quantidade_disponivel, quantidade_minima, quantidade_maxima")
            .eq("company_id", companyId),
        ]);
        if (matsRes.data?.length) {
          ctx += `\n\n[MÓDULO: ESTOQUE E MATERIAIS]`;
          ctx += `\nTotal de materiais cadastrados: ${matsRes.data.length}`;
          // Enriquece com dados de estoque
          const estoqueMap: Record<string, any> = {};
          (estoqueRes.data || []).forEach((e: any) => { estoqueMap[e.material_id] = e; });
          const materiaisComEstoque = matsRes.data.map((m: any) => {
            const est = estoqueMap[m.id] || {};
            return {
              ...m,
              quantidade_disponivel: est.quantidade_disponivel ?? 0,
              quantidade_minima: est.quantidade_minima ?? 0,
              status_estoque: est.quantidade_disponivel === 0 ? "Zerado" :
                (est.quantidade_minima > 0 && est.quantidade_disponivel <= est.quantidade_minima) ? "Baixo" : "OK",
            };
          });
          ctx += `\nMateriais: ${JSON.stringify(materiaisComEstoque)}`;
        }
      }

      if (modulo === "os") {
        const osRes = await (supabase as any).from("ordens_servico")
          .select("codigo_os, status, prioridade, tipo_servico, custo_total, created_at, finalizado_em, titulo")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(300);
        if (osRes.data?.length) {
          const osAbertas = osRes.data.filter((os: any) => !["Concluída", "Cancelada"].includes(os.status));
          const osConcluidas = osRes.data.filter((os: any) => os.status === "Concluída");
          ctx += `\n\n[MÓDULO: ORDENS DE SERVIÇO]`;
          ctx += `\nTotal OS: ${osRes.data.length} | Em aberto: ${osAbertas.length} | Concluídas: ${osConcluidas.length}`;
          ctx += `\nDetalhes: ${JSON.stringify(osRes.data)}`;
        }
      }

      if (modulo === "financeiro") {
        const [gastosRes, boletosRes] = await Promise.all([
          (supabase as any).from("gastos")
            .select("descricao, valor, data, categoria, status")
            .eq("company_id", companyId)
            .order("data", { ascending: false })
            .limit(200),
          (supabase as any).from("boletos")
            .select("descricao, valor, data_vencimento, status, categoria, banco_emissor")
            .eq("company_id", companyId)
            .order("data_vencimento", { ascending: true })
            .limit(100),
        ]);
        ctx += `\n\n[MÓDULO: FINANCEIRO]`;
        if (gastosRes.data?.length) {
          const totalGastos = gastosRes.data.reduce((s: number, g: any) => s + Number(g.valor || 0), 0);
          ctx += `\nTotal de gastos: ${gastosRes.data.length} | Valor total: R$ ${totalGastos.toFixed(2)}`;
          ctx += `\nGastos: ${JSON.stringify(gastosRes.data)}`;
        }
        if (boletosRes.data?.length) {
          const pendentes = boletosRes.data.filter((b: any) => ["pendente", "vencido"].includes(b.status));
          ctx += `\nBoletos: ${boletosRes.data.length} total | ${pendentes.length} pendentes/vencidos`;
          ctx += `\nBoletos: ${JSON.stringify(boletosRes.data)}`;
        }
      }

      if (modulo === "ativos") {
        const ativosRes = await (supabase as any).from("ativos")
          .select("nome, codigo_identificacao, sistema, status, marca, modelo, bloco_id")
          .eq("company_id", companyId)
          .limit(200);
        if (ativosRes.data?.length) {
          ctx += `\n\n[MÓDULO: ATIVOS/EQUIPAMENTOS]`;
          ctx += `\nTotal de ativos: ${ativosRes.data.length}`;
          ctx += `\nAtivos: ${JSON.stringify(ativosRes.data)}`;
        }
      }

      if (modulo === "chamados") {
        const chamadosRes = await (supabase as any).from("chamados_externos")
          .select("titulo, status, prioridade, created_at, descricao")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(100);
        if (chamadosRes.data?.length) {
          ctx += `\n\n[MÓDULO: CHAMADOS]`;
          ctx += `\nTotal de chamados: ${chamadosRes.data.length}`;
          ctx += `\nChamados: ${JSON.stringify(chamadosRes.data)}`;
        }
      }

      if (modulo === "preventivas") {
        const prevRes = await (supabase as any).from("ordens_preventivas")
          .select("codigo_op, status, prioridade, titulo, data_inicio, prazo")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(100);
        if (prevRes.data?.length) {
          ctx += `\n\n[MÓDULO: PREVENTIVAS]`;
          ctx += `\nTotal de ordens preventivas: ${prevRes.data.length}`;
          ctx += `\nPreventivas: ${JSON.stringify(prevRes.data)}`;
        }
      }

      if (modulo === "geral") {
        // Contexto resumido geral
        const [osRes, ativosRes] = await Promise.all([
          (supabase as any).from("ordens_servico")
            .select("status").eq("company_id", companyId),
          (supabase as any).from("ativos")
            .select("status").eq("company_id", companyId),
        ]);
        ctx += `\n\n[RESUMO GERAL DO SISTEMA]`;
        if (osRes.data?.length) {
          const abertas = osRes.data.filter((o: any) => !["Concluída", "Cancelada"].includes(o.status)).length;
          ctx += `\nOS em aberto: ${abertas} de ${osRes.data.length} total`;
        }
        if (ativosRes.data?.length) ctx += `\nAtivos cadastrados: ${ativosRes.data.length}`;
      }

    } catch (e) {
      console.warn(`[IAAtlas] Erro ao buscar contexto do módulo ${modulo}:`, e);
    }
  }

  return ctx;
}

function parseExcel(content: string) {
  const match = content.match(/<excel titulo="([^"]*)">([\s\S]*?)<\/excel>/);
  if (!match) return null;
  try { return { titulo: match[1], rows: JSON.parse(match[2]) }; } catch { return null; }
}

function parsePdf(content: string) {
  const match = content.match(/<pdf titulo="([^"]*)">([\s\S]*?)<\/pdf>/);
  if (!match) return null;
  try { return { titulo: match[1], rows: JSON.parse(match[2]) }; } catch { return null; }
}

function cleanContent(content: string) {
  return content
    .replace(/<excel titulo="[^"]*">[\s\S]*?<\/excel>/g, "")
    .replace(/<pdf titulo="[^"]*">[\s\S]*?<\/pdf>/g, "")
    .trim();
}

function downloadExcel(titulo: string, rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Relatório");
  XLSX.writeFile(wb, `${titulo}.xlsx`);
}

function downloadPdf(titulo: string, rows: Record<string, unknown>[]) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(titulo, 14, 16);
  const columns = Object.keys(rows[0] || {});
  autoTable(doc, {
    head: [columns],
    body: rows.map(r => columns.map(c => String(r[c] ?? ""))),
    startY: 22,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [139, 92, 246] },
  });
  doc.save(`${titulo}.pdf`);
}

const SUGGESTIONS = [
  "Quais OS estão em aberto hoje?",
  "Relatório de materiais em estoque",
  "Boletos pendentes este mês",
  "Resumo das OS concluídas este mês",
  "Quais ativos estão inativos?",
  "Materiais com estoque zerado",
];

export default function IAAtlas() {
  const { companyId } = useCompany();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [moduloAtual, setModuloAtual] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const content = (text || input).trim();
    if (!content || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      let ctx = "";
      if (companyId) {
        const modulos = detectarModulo(content);
        setModuloAtual(modulos.join(", "));
        ctx = await buscarContexto(modulos, companyId);
      }

      const isRelatorio = /excel|pdf|relat[oó]rio|planilha/i.test(content);
      const userContent = ctx
        ? `${content}\n\n[DADOS DO SISTEMA:${ctx}]${isRelatorio ? "\n[INSTRUÇÃO: Use as tags <excel> ou <pdf> para gerar o relatório com os dados acima]" : ""}`
        : content;

      const response = await fetch("https://tayxbbpyxbomiatbiirx.supabase.co/functions/v1/openai-proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: "user", content: userContent },
          ],
          max_tokens: 2000,
        }),
      });

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || "Erro ao processar.";
      const excelData = parseExcel(raw) ?? undefined;
      const pdfData = parsePdf(raw) ?? undefined;
      const msgContent = cleanContent(raw) || (excelData
        ? `Relatório "${excelData.titulo}" gerado!`
        : pdfData ? `Relatório "${pdfData.titulo}" gerado!` : raw);

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: msgContent,
        excelData,
        pdfData,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Erro ao conectar com a IA. Verifique sua conexão.",
      }]);
    } finally {
      setLoading(false);
      setModuloAtual("");
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 pb-4 border-b">
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-200">
            <Bot className="w-8 h-8 text-white" />
          </div>
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-background" />
        </div>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            IA Atlas Control
            <Sparkles className="w-4 h-4 text-violet-500" />
          </h1>
          <p className="text-sm text-muted-foreground">Assistente inteligente com dados reais do sistema</p>
        </div>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full space-y-6 text-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-xl shadow-violet-200">
              <Bot className="w-10 h-10 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">Como posso ajudar?</h2>
              <p className="text-muted-foreground max-w-md">
                Tenho acesso aos dados reais do Atlas Control. Posso responder perguntas, gerar relatórios e muito mais.
              </p>
            </div>
            {/* Módulos disponíveis */}
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                { label: "📋 OS", desc: "Ordens de Serviço" },
                { label: "📦 Estoque", desc: "Materiais e Almoxarifado" },
                { label: "💰 Financeiro", desc: "Gastos e Boletos" },
                { label: "🔧 Ativos", desc: "Equipamentos" },
                { label: "📞 Chamados", desc: "Tickets" },
                { label: "🔄 Preventivas", desc: "Manutenção Preventiva" },
              ].map(m => (
                <span key={m.label} className="text-xs px-2 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                  {m.label}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => sendMessage(s)}
                  className="text-left p-3 rounded-xl border bg-card hover:bg-accent hover:border-violet-200 transition-all text-sm font-medium">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}
              <div className={cn(
                "max-w-[75%] rounded-2xl px-4 py-3 text-sm",
                msg.role === "user"
                  ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-br-sm"
                  : "bg-card border rounded-bl-sm shadow-sm"
              )}>
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                {msg.excelData && (
                  <button onClick={() => downloadExcel(msg.excelData!.titulo, msg.excelData!.rows)}
                    className="mt-3 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-2 rounded-lg w-full justify-center transition-colors">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Baixar Excel — {msg.excelData.titulo}
                  </button>
                )}
                {msg.pdfData && (
                  <button onClick={() => downloadPdf(msg.pdfData!.titulo, msg.pdfData!.rows)}
                    className="mt-3 flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-2 rounded-lg w-full justify-center transition-colors">
                    <FileText className="w-3.5 h-3.5" />
                    Baixar PDF — {msg.pdfData.titulo}
                  </button>
                )}
              </div>
              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center shrink-0 mt-1">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))
        )}
        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-card border rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
              <span className="text-sm text-muted-foreground">
                {moduloAtual ? `Consultando módulo: ${moduloAtual}...` : "Pensando..."}
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t pt-4">
        <div className="flex gap-2 items-end">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Pergunte sobre OS, estoque, financeiro, ativos..."
            className="flex-1 rounded-xl"
            disabled={loading}
          />
          <Button onClick={() => sendMessage()} disabled={loading || !input.trim()}
            className="rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 px-4">
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          A IA identifica automaticamente o módulo e busca os dados corretos
        </p>
      </div>
    </div>
  );
}