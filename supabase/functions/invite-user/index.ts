import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Authenticate caller using the Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use adminClient to verify the caller's JWT token directly
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: userError } = await adminClient.auth.getUser(token);

    if (userError || !caller) {
      console.error("Auth error:", userError?.message);
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify admin role
    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "administrador",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem convidar usuários" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { nome, cpf, email, role, perfil_acesso_id, redirectTo } = await req.json();

    if (!nome || !cpf || !email || !role) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: nome, cpf, email, role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check duplicate email in profiles
    const { data: existingEmail } = await adminClient
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingEmail) {
      return new Response(JSON.stringify({ error: "Usuário já cadastrado com este e-mail" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check duplicate CPF in profiles
    const { data: existingCpf } = await adminClient
      .from("profiles")
      .select("id")
      .eq("cpf", cpf)
      .maybeSingle();
    if (existingCpf) {
      return new Response(JSON.stringify({ error: "CPF já cadastrado" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Invite user by email — Supabase sends the invite email automatically
    const { data: authData, error: authError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { nome, cpf },
      redirectTo: redirectTo || undefined,
    });

    if (authError) {
      console.error("Invite error:", authError.message);
      // Handle "already registered" from Supabase Auth
      if (authError.message?.includes("already been registered") || authError.message?.includes("already exists")) {
        return new Response(JSON.stringify({ error: "Usuário já cadastrado com este e-mail" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authUserId = authData.user.id;

    // Wait for trigger to create/link the profile
    await new Promise((r) => setTimeout(r, 500));

    // Find profile and update CPF + role + perfil_acesso_id
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("user_id", authUserId)
      .single();

    if (profileError) {
      console.error("Profile lookup error:", profileError.message);
    }

    if (profile) {
      const { error: updateError } = await adminClient.from("profiles").update({
        cpf,
        nome,
        perfil_acesso_id: perfil_acesso_id || null,
      }).eq("id", profile.id);

      if (updateError) {
        console.error("Profile update error:", updateError.message);
      }

      if (role !== "visualizacao") {
        const { error: roleError } = await adminClient.from("user_roles").update({ role }).eq("user_id", profile.id);
        if (roleError) {
          console.error("Role update error:", roleError.message);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, userId: authUserId, profile_id: profile?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Unexpected error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
