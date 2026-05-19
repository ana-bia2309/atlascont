import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const today = new Date().toISOString().split("T")[0];

    // Verifica dia útil usando função do banco (fonte única de verdade)
    const { data: isBizData, error: isBizErr } = await supabase.rpc("is_business_day", { d: today });
    if (isBizErr) {
      console.error("Erro em is_business_day:", isBizErr);
      return new Response(JSON.stringify({ error: isBizErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isBizData) {
      console.log(`[${today}] Not a business day — skipping generation.`);
      return new Response(JSON.stringify({ message: "Not a business day", generated: 0, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: preventivas, error: prevError } = await supabase
      .from("manutencao_preventiva")
      .select("*")
      .eq("ativo", true)
      .lte("proxima_execucao", today);

    if (prevError) {
      console.error("Error fetching preventivas:", prevError);
      return new Response(JSON.stringify({ error: prevError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!preventivas || preventivas.length === 0) {
      console.log(`[${today}] No preventivas due.`);
      return new Response(JSON.stringify({ message: "No preventivas due", generated: 0, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const frequenciaDays: Record<string, number> = { diaria: 1, semanal: 7, quinzenal: 15 };
    const frequenciaToMonths: Record<string, number> = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };

    function calcPrazo(frequencia: string): string {
      const d = new Date();
      const days = frequenciaDays[frequencia];
      if (days) d.setDate(d.getDate() + days);
      else d.setMonth(d.getMonth() + (frequenciaToMonths[frequencia] || 1));
      if (frequencia === "diaria") return today;
      return d.toISOString().split("T")[0];
    }

    async function calcNextExecution(fromDateStr: string, frequencia: string): Promise<string> {
      const nextDate = new Date(fromDateStr + "T00:00:00");
      const days = frequenciaDays[frequencia];
      const months = frequenciaToMonths[frequencia] || (days ? 0 : 1);
      const advance = () => {
        if (days) nextDate.setDate(nextDate.getDate() + days);
        else nextDate.setMonth(nextDate.getMonth() + months);
      };
      advance();
      const now = new Date();
      while (nextDate <= now) advance();
      const candidate = nextDate.toISOString().split("T")[0];
      // Ajusta para o próximo dia útil usando função do banco
      const { data: nextBiz, error } = await supabase.rpc("next_business_day_from", { d: candidate });
      if (error || !nextBiz) {
        console.error("Erro em next_business_day_from:", error);
        return candidate;
      }
      return nextBiz as string;
    }

    let generated = 0;
    let skipped = 0;

    for (const prev of preventivas) {
      // Deduplication: check if Ordem Preventiva already generated today
      const { data: existing } = await supabase
        .from("historico_preventiva")
        .select("id")
        .eq("preventiva_id", prev.id)
        .gte("data_geracao", today + "T00:00:00")
        .lte("data_geracao", today + "T23:59:59")
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`[${today}] Skipped preventiva "${prev.titulo}" (${prev.id}) - already generated today`);
        skipped++;
        continue;
      }

      const prazo = calcPrazo(prev.frequencia);

      // Insert into ordens_preventivas (codigo_op gerado automaticamente AP-XXXX pelo DEFAULT)
      const { data: opData, error: opError } = await supabase
        .from("ordens_preventivas")
        .insert({
          preventiva_id: prev.id,
          status: "Não Iniciada",
          prioridade: prev.prioridade,
          bloco_id: prev.bloco_id,
          tipo_servico: prev.tipo_servico,
          ativo_id: prev.ativo_id,
          equipamentos: prev.titulo,
          titulo: prev.titulo,
          responsible_user_id: prev.responsavel_id || null,
          data_inicio: today,
          prazo: prazo,
          observacoes: [
            `Gerada automaticamente - Preventiva: ${prev.titulo}`,
            prev.descricao || "",
            prev.tipo_atividade ? `Tipo de atividade: ${prev.tipo_atividade}` : "",
            prev.tipo_medicao ? `Medição: ${prev.tipo_medicao}` : "",
            prev.unidade_medicao ? `Unidade: ${prev.unidade_medicao}` : "",
            prev.ordem_grandeza ? `Ordem de grandeza: ${prev.ordem_grandeza}` : "",
          ].filter(Boolean).join("\n").trim(),
        })
        .select("id, codigo_op")
        .single();

      if (opError || !opData) {
        console.error(`[${today}] Error creating ordem_preventiva for ${prev.id}:`, opError);
        continue;
      }

      // Copy activities from atividades_preventiva → atividades_ordem_preventiva
      const { data: prevActivities } = await supabase
        .from("atividades_preventiva")
        .select("*")
        .eq("preventiva_id", prev.id)
        .order("ordem");

      if (prevActivities && prevActivities.length > 0) {
        const atividadesPayload = prevActivities.map((a: any, idx: number) => ({
          ordem_preventiva_id: opData.id,
          nome: a.nome,
          descricao: a.descricao || null,
          data_inicio: today,
          data_termino: prazo,
          status: "Não iniciado",
          ordem: idx,
          responsavel: null,
          tipo_atividade: a.tipo_atividade || null,
          tipo_medicao: a.tipo_atividade === "Medição" ? (a.tipo_medicao || null) : null,
          unidade_medicao: a.tipo_atividade === "Medição" ? (a.unidade_medicao || null) : null,
        }));
        const { error: atvErr } = await supabase
          .from("atividades_ordem_preventiva")
          .insert(atividadesPayload);
        if (atvErr) console.error(`[${today}] Error copying activities to OP ${opData.id}:`, atvErr);
      }

      // Record history
      await supabase.from("historico_preventiva").insert({
        preventiva_id: prev.id,
        ordem_preventiva_id: opData.id,
        observacao: "Geração automática programada",
      });

      // Update next execution (já ajustado para dia útil pela função do banco)
      const nextExec = await calcNextExecution(prev.proxima_execucao, prev.frequencia);
      await supabase
        .from("manutencao_preventiva")
        .update({ ultima_execucao: today, proxima_execucao: nextExec })
        .eq("id", prev.id);

      generated++;
      console.log(`[${today}] Generated ${opData.codigo_op} for "${prev.titulo}" | prazo: ${prazo} | next: ${nextExec}`);
    }

    const summary = {
      date: today,
      total_checked: preventivas.length,
      generated,
      skipped,
      message: `Generated ${generated} ordens preventivas, skipped ${skipped}`,
    };
    console.log(`[${today}] Summary:`, JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
