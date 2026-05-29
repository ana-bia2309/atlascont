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

NÃO use tabelas markdown. USE SEMPRE a tag correta.
Responda em português brasileiro.`;

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
  "Gera relatório de materiais em Excel",
  "Quantos ativos estão indisponíveis?",
  "Resumo das OS concluídas este mês",
];

export default function IAAtlas() {
  const { companyId } = useCompany();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
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
      // Busca contexto do sistema
      let ctx = "";
      if (companyId) {
        const [osRes, ativosRes] = await Promise.all([
          (supabase as any).from("ordens_servico").select("codigo_os, status, prioridade, bloco_id, custo_total").eq("company_id", companyId).limit(50),
          (supabase as any).from("ativos").select("nome, disponibilidade_status, sistema").eq("company_id", companyId).limit(30),
        ]);
        if (osRes.data?.length) ctx += `\nOS: ${JSON.stringify(osRes.data)}`;
        if (ativosRes.data?.length) ctx += `\nAtivos: ${JSON.stringify(ativosRes.data)}`;
      }

      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
      const isRelatorio = /excel|pdf|relat[oó]rio|planilha/i.test(content);
      const userContent = ctx
        ? `${content}\n\n[CONTEXTO DO SISTEMA:${ctx}]${isRelatorio ? "\n[INSTRUÇÃO: Use as tags <excel> ou <pdf> para gerar o relatório]" : ""}`
        : content;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
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
              <span className="text-sm text-muted-foreground">Pensando...</span>
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
            placeholder="Pergunte qualquer coisa sobre o Atlas Control..."
            className="flex-1 rounded-xl"
            disabled={loading}
          />
          <Button onClick={() => sendMessage()} disabled={loading || !input.trim()}
            className="rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 px-4">
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          IA com acesso aos dados reais do Atlas Control
        </p>
      </div>
    </div>
  );
}