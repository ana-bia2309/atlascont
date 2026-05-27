const fs = require('fs');
const code = `import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Send, Bot, User, Loader2 } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

type Message = { id: string; role: "user" | "assistant"; content: string; };

export default function AIChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ id: "1", role: "assistant", content: "Olá! Sou a IA do Atlas Control com dados reais do sistema!" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      (supabase as any).from("profiles").select("company_id").eq("user_id", user.id).single().then(({ data }: any) => {
        if (data?.company_id) setCompanyId(data.company_id);
      });
    });
  }, []);

  const getData = async () => {
    if (!companyId) return "sem dados";
    const [os, ativos, blocos] = await Promise.all([
      (supabase as any).from("ordens_servico").select("codigo_os,status,prioridade,bloco_id,custo_total").eq("company_id", companyId),
      (supabase as any).from("ativos").select("nome,codigo_identificacao,status,sistema").eq("company_id", companyId),
      (supabase as any).from("blocos").select("id,nome").eq("company_id", companyId),
    ]);
    const bmap: Record<string,string> = {};
    (blocos.data||[]).forEach((b: any) => { bmap[b.id]=b.nome; });
    const osList = (os.data||[]).map((o: any) => ({...o, bloco: bmap[o.bloco_id]||o.bloco_id}));
    return "OS: "+JSON.stringify(osList)+"\\nATIVOS: "+JSON.stringify(ativos.data||[]);
  };

  const send = async () => {
    if (!input.trim()||loading) return;
    const msg: Message = { id: Date.now().toString(), role: "user", content: input.trim() };
    setMessages(p => [...p, msg]);
    setInput("");
    setLoading(true);
    try {
      const ctx = await getData();
      console.log("CTX:", ctx.substring(0,300));
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer "+import.meta.env.VITE_OPENAI_API_KEY },
        body: JSON.stringify({ model: "gpt-4o-mini", max_tokens: 1000, messages: [
          { role: "system", content: "Assistente do Atlas Control. Use os dados abaixo para responder com precisao em portugues.\\n\\n"+ctx },
          ...messages.map(m => ({ role: m.role, content: m.content })),
          { role: "user", content: msg.content }
        ]})
      });
      const d = await r.json();
      setMessages(p => [...p, { id: (Date.now()+1).toString(), role: "assistant", content: d.choices?.[0]?.message?.content||"Erro" }]);
    } catch(e: any) { setMessages(p => [...p, { id: (Date.now()+1).toString(), role: "assistant", content: "Erro: "+e.message }]); }
    finally { setLoading(false); }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className={cn("fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg bg-primary text-primary-foreground flex items-center justify-center hover:scale-110 transition-all", open && "hidden")}>
        <Bot className="h-6 w-6" />
      </button>
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-h-[600px] flex flex-col rounded-2xl shadow-2xl border bg-background overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
            <div className="flex items-center gap-2"><Bot className="h-5 w-5" /><div><p className="font-semibold text-sm">Atlas IA</p><p className="text-xs opacity-80">Dados em tempo real</p></div></div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-primary-foreground hover:bg-primary/80" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[450px]">
            {messages.map(m => (
              <div key={m.id} className={cn("flex gap-2", m.role==="user" ? "justify-end" : "justify-start")}>
                {m.role==="assistant" && <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0"><Bot className="h-4 w-4 text-primary-foreground" /></div>}
                <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", m.role==="user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm")}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
                {m.role==="user" && <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0"><User className="h-4 w-4" /></div>}
              </div>
            ))}
            {loading && <div className="flex gap-2"><div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center"><Bot className="h-4 w-4 text-primary-foreground" /></div><div className="bg-muted rounded-2xl px-3 py-2"><Loader2 className="h-4 w-4 animate-spin" /></div></div>}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-3 border-t flex gap-2">
            <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==="Enter" && send()} placeholder="Pergunte sobre OS, ativos..." className="flex-1 text-sm" disabled={loading} />
            <Button size="icon" onClick={send} disabled={!input.trim()||loading}><Send className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </>
  );
}`;

fs.writeFileSync('src/components/AIChat.tsx', code);
console.log('ok:', fs.statSync('src/components/AIChat.tsx').size);