import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Handles Supabase auth callbacks (invite, recovery, magic-link, etc.).
 * Supabase redirects here with ?code=... or #access_token=...
 * We exchange the token and redirect the user appropriately.
 */
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handle = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

      const code = searchParams.get("code");
      const type = searchParams.get("type") ?? hashParams.get("type");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const error = searchParams.get("error") ?? hashParams.get("error");

      // If there's an error, send to reset-password page to show the error
      if (error) {
        navigate(`/reset-password${window.location.search}${window.location.hash}`, { replace: true });
        return;
      }

      // Exchange code for session (PKCE flow)
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          console.error("[AuthCallback] Code exchange error:", exchangeError.message);
          navigate("/login", { replace: true });
          return;
        }
      }

      // Set session from hash tokens (implicit flow)
      if (!code && accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          console.error("[AuthCallback] Session error:", sessionError.message);
          navigate("/login", { replace: true });
          return;
        }
      }

      // For invite or recovery, redirect to reset-password to set new password
      if (type === "recovery" || type === "invite") {
        navigate(`/reset-password?type=${type}`, { replace: true });
        return;
      }

  // Valida se existe profile
const {
  data: { user },
} = await supabase.auth.getUser();

if (!user) {
  navigate("/login", {
    replace: true,
  });

  return;
}

const { data: profile }: any =
  await (supabase as any)
    .from("profiles")
    .select("id, company_id")
    .eq("user_id", user.id)
    .single();

if (!profile?.company_id) {
  await supabase.auth.signOut();

  navigate("/login", {
    replace: true,
  });

  return;
}

// Default
navigate("/dashboard", {
  replace: true,
});
    };

    handle();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
      Processando autenticação...
    </div>
  );
}
