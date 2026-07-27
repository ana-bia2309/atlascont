import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPER_ADMIN_EMAIL = "anafranca00@icloud.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: userError } = await adminClient.auth.getUser(token);

    if (userError || !caller) {
      console.error("Auth error:", userError?.message);
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get caller's profile to find their company_id
    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("id, company_id")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (callerProfileError || !callerProfile) {
      console.error("Caller profile error:", callerProfileError?.message);
      return new Response(JSON.stringify({ error: "Perfil do administrador não encontrado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify admin role using caller.id (auth UUID) — has_role expects auth.uid
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

    const { nome, cpf, email, role, perfil_acesso_id, redirectTo, company_id: targetCompanyId } = await req.json();

    // Só o Super Admin pode definir uma empresa diferente da própria
    // (usado no fluxo de "Nova Empresa", que cria o admin inicial de outra empresa)
    const isSuperAdmin = caller.email === SUPER_ADMIN_EMAIL;

    if (targetCompanyId && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Você não pode convidar usuários para outra empresa" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!callerProfile.company_id && !targetCompanyId) {
      return new Response(JSON.stringify({ error: "Administrador sem empresa vinculada" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check duplicate email
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

    // Check duplicate CPF (somente se um CPF foi informado)
    if (cpf) {
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
    }

    // Invite user
    const { data: authData, error: authError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { nome, cpf },
      redirectTo: redirectTo || undefined,
    });

    if (authError) {
      console.error("Invite error:", authError.message);
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

    // Wait for trigger to create profile
    await new Promise((r) => setTimeout(r, 500));

    // Find and update profile with company_id from caller
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("user_id", authUserId)
      .single();

    if (profileError) {
      console.error("Profile lookup error:", profileError.message);
    }

    const finalCompanyId = (isSuperAdmin && targetCompanyId) ? targetCompanyId : callerProfile.company_id;

    if (profile) {
      const { error: updateError } = await adminClient.from("profiles").update({
        ...(cpf ? { cpf } : {}),
        nome,
        company_id: finalCompanyId,
        perfil_acesso_id: perfil_acesso_id || null,
      }).eq("id", profile.id);

      if (updateError) {
        console.error("Profile update error:", updateError.message);
      }

      // Remove any orphan 'visualizacao' role created by trigger (no company_id)
      await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", profile.id)
        .is("company_id", null);

      // Insert the correct role with company_id
      const { error: roleError } = await adminClient
        .from("user_roles")
        .insert({ user_id: profile.id, role, company_id: finalCompanyId });
      if (roleError) {
        console.error("Role insert error:", roleError.message);
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