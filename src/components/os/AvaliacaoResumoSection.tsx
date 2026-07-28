import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Star, CheckCircle2, XCircle, Clock } from "@/lib/icons";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type Avaliacao = {
  status: string;
  nota_geral: number | null;
  decisao: string | null;
  avaliado_por_nome: string | null;
  avaliado_em: string | null;
  comentarios_fiscal: string | null;
};

const DECISAO_LABEL: Record<string, string> = {
  aprovado: "Serviço aprovado",
  aprovado_com_ressalvas: "Aprovado com ressalvas",
  reprovado: "Serviço reprovado",
};

export default function AvaliacaoResumoSection({ osId }: { osId: string }) {
  const [avaliacao, setAvaliacao] = useState<Avaliacao | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("avaliacoes_os")
        .select("status, nota_geral, decisao, avaliado_por_nome, avaliado_em, comentarios_fiscal")
        .eq("os_id", osId)
        .maybeSingle();
      if (active) {
        setAvaliacao(data || null);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [osId]);

  if (loading || !avaliacao || avaliacao.status !== "avaliada") return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Avaliação de Qualidade
      </p>
      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} className={cn("h-4 w-4", (avaliacao.nota_geral || 0) >= n ? "fill-amber-400 text-amber-400" : "text-slate-200")} />
            ))}
          </div>
          {avaliacao.decisao && (
            <span className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border",
              avaliacao.decisao === "reprovado"
                ? "bg-rose-50 text-rose-700 border-rose-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            )}>
              {avaliacao.decisao === "reprovado" ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {DECISAO_LABEL[avaliacao.decisao] || avaliacao.decisao}
            </span>
          )}
          {avaliacao.avaliado_em && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
              <Clock className="h-3.5 w-3.5" />
              {avaliacao.avaliado_por_nome ? `${avaliacao.avaliado_por_nome} · ` : ""}
              {format(new Date(avaliacao.avaliado_em), "dd/MM/yyyy", { locale: ptBR })}
            </span>
          )}
        </div>
        {avaliacao.comentarios_fiscal && (
          <p className="text-xs text-slate-600">{avaliacao.comentarios_fiscal}</p>
        )}
      </div>
    </div>
  );
}
