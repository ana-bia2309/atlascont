import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APA_ID = "6a0001d2-7c27-4659-ad1f-e8d5aa7cad7f";
const SUPER_ADMIN = "anafranca00@icloud.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Nao autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !caller) {
      return new Response(JSON.stringify({ error: "Sessao invalida" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Só o super admin pode excluir empresas
    if (caller.email !== SUPER_ADMIN) {
      return new Response(JSON.stringify({ error: "Apenas o super admin pode excluir empresas" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { company_id } = await req.json();
    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id obrigatorio" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (company_id === APA_ID) {
      return new Response(JSON.stringify({ error: "A empresa principal (APA) nao pode ser excluida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 1) Buscar os usuarios do Auth vinculados (antes de apagar os profiles)
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("user_id")
      .eq("company_id", company_id);

    // 2) Apagar todos os dados + a empresa via funcao SQL em cascata
    const { error: rpcError } = await adminClient.rpc("delete_company_cascade", { target_company_id: company_id });
    if (rpcError) {
      return new Response(JSON.stringify({ error: rpcError.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3) Apagar os usuarios do Auth
    for (const p of profiles || []) {
      if (p.user_id) {
        try { await adminClient.auth.admin.deleteUser(p.user_id); } catch (e) { console.error("deleteUser", e); }
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});