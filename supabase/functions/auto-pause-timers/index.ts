import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all running timers with their user's work_end
    const { data: runningTimers, error: fetchErr } = await supabase
      .from("os_timers")
      .select("id, os_id, user_id, total_seconds, started_at, status")
      .eq("status", "running");

    if (fetchErr) {
      console.error("Error fetching timers:", fetchErr.message);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!runningTimers || runningTimers.length === 0) {
      return new Response(JSON.stringify({ paused: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let pausedCount = 0;
    const now = new Date();

    for (const timer of runningTimers) {
      // Get user's work_end
      const { data: profile } = await supabase
        .from("profiles")
        .select("work_end")
        .eq("id", timer.user_id)
        .maybeSingle();

      if (!profile?.work_end) continue;

      // Parse work_end (HH:MM:SS or HH:MM)
      const [h, m] = profile.work_end.split(":").map(Number);
      const workEndToday = new Date(now);
      workEndToday.setHours(h, m, 0, 0);

      if (now >= workEndToday) {
        // Calculate elapsed seconds
        const startedAt = timer.started_at ? new Date(timer.started_at) : now;
        const elapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
        const newTotal = (timer.total_seconds || 0) + Math.max(0, elapsed);

        const { error: updateErr } = await supabase
          .from("os_timers")
          .update({
            status: "paused",
            total_seconds: newTotal,
            paused_at: now.toISOString(),
            started_at: null,
          })
          .eq("id", timer.id);

        if (updateErr) {
          console.error(`Error pausing timer ${timer.id}:`, updateErr.message);
        } else {
          pausedCount++;
          console.log(`Auto-paused timer ${timer.id}, total: ${newTotal}s`);
        }
      }
    }

    return new Response(JSON.stringify({ paused: pausedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
