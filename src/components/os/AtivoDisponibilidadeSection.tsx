import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Clock } from "@/lib/icons";

interface Props {
  osId: string;
  ativoId: string;
  ativoNome: string;
  readOnly?: boolean;
}

type Registro = {
  id: string;
  disponibilidade: "disponivel" | "indisponivel";
  indisponivel_desde: string | null;
  disponivel_em: string | null;
  tempo_total_indisponivel: number;
};

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export default function AtivoDisponibilidadeSection({ osId, ativoId, ativoNome, readOnly }: Props) {
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchRegistro = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("os_ativos_vinculados")
      .select("*")
      .eq("os_id", osId)
      .eq("ativo_id", ativoId)
      .maybeSingle();
    setRegistro(data || null);
  }, [osId, ativoId]);

  useEffect(() => { fetchRegistro(); }, [fetchRegistro]);

  // Contador de tempo parado
  useEffect(() => {
    if (!registro || registro.disponibilidade !== "indisponivel" || !registro.indisponivel_desde) {
      setElapsed(0); return;
    }
    const calc = () => {
      const since = new Date(registro.indisponivel_desde!).getTime();
      const now = Date.now();
      setElapsed(Math.floor((now - since) / 1000) + (registro.tempo_total_indisponivel || 0));
    };
    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [registro]);

  const marcar = async (status: "disponivel" | "indisponivel") => {
    setLoading(true);
    try {
      const now = new Date().toISOString();
      let payload: any = { disponibilidade: status };

      if (status === "indisponivel") {
        payload.indisponivel_desde = now;
        payload.disponivel_em = null;
      } else {
        payload.disponivel_em = now;
        // Calcula tempo total
        if (registro?.indisponivel_desde) {
          const since = new Date(registro.indisponivel_desde).getTime();
          const extra = Math.floor((Date.now() - since) / 1000);
          payload.tempo_total_indisponivel = (registro.tempo_total_indisponivel || 0) + extra;
        }
        payload.indisponivel_desde = null;
        // Atualiza ativo globalmente
        await (supabase as any).from("ativos")
          .update({ disponibilidade_status: "disponivel", indisponivel_desde: null })
          .eq("id", ativoId);
      }

      if (registro) {
        await (supabase as any).from("os_ativos_vinculados")
          .update(payload).eq("id", registro.id);
      } else {
        const { data: osData } = await (supabase as any)
          .from("ordens_servico").select("company_id").eq("id", osId).single();
        await (supabase as any).from("os_ativos_vinculados").insert({
          os_id: osId, ativo_id: ativoId, company_id: osData?.company_id, ...payload,
        });
        if (status === "indisponivel") {
          await (supabase as any).from("ativos")
            .update({ disponibilidade_status: "indisponivel", indisponivel_desde: now })
            .eq("id", ativoId);
        }
      }

      toast({ title: status === "disponivel" ? "Ativo marcado como Disponível" : "Ativo marcado como Indisponível" });
      fetchRegistro();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const isIndisponivel = registro?.disponibilidade === "indisponivel";
  const isDisponivel = registro?.disponibilidade === "disponivel";

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isIndisponivel ? "bg-red-500" : isDisponivel ? "bg-emerald-500" : "bg-zinc-300"}`} />
        <span className="font-semibold text-sm">{ativoNome}</span>
        {registro && (
          <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full border ${isIndisponivel ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
            {isIndisponivel ? "Indisponível" : "Disponível"}
          </span>
        )}
      </div>

      {/* Contador de tempo parado */}
      {isIndisponivel && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-md px-3 py-2">
          <Clock className="h-4 w-4 text-red-600 shrink-0" />
          <div>
            <p className="text-xs text-red-600 font-medium">Tempo parado</p>
            <p className="text-sm font-bold text-red-700">{formatDuration(elapsed)}</p>
          </div>
        </div>
      )}

      {registro?.disponibilidade === "disponivel" && registro.tempo_total_indisponivel > 0 && (
        <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2">
          <Clock className="h-4 w-4 text-zinc-500 shrink-0" />
          <p className="text-xs text-zinc-600">
            Tempo total indisponível: <span className="font-semibold">{formatDuration(registro.tempo_total_indisponivel)}</span>
          </p>
        </div>
      )}

      {/* Botões */}
      {!readOnly && (
        <div className="flex gap-2">
          <Button
            size="sm" variant="outline" disabled={loading || isDisponivel}
            className={`flex-1 gap-1.5 ${isDisponivel ? "border-emerald-400 text-emerald-700 bg-emerald-50" : "hover:border-emerald-400 hover:text-emerald-700"}`}
            onClick={() => marcar("disponivel")}>
            <CheckCircle2 className="h-4 w-4" /> Disponível
          </Button>
          <Button
            size="sm" variant="outline" disabled={loading || isIndisponivel}
            className={`flex-1 gap-1.5 ${isIndisponivel ? "border-red-400 text-red-700 bg-red-50" : "hover:border-red-400 hover:text-red-700"}`}
            onClick={() => marcar("indisponivel")}>
            <XCircle className="h-4 w-4" /> Indisponível
          </Button>
        </div>
      )}

      {!registro && !readOnly && (
        <p className="text-xs text-muted-foreground italic text-center">Marque a disponibilidade do ativo nesta O.S.</p>
      )}
    </div>
  );
}