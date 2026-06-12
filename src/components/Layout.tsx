import { useEffect, useState, useRef } from "react";
import { Moon, Sun } from "@/lib/icons";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions, ROUTE_TO_SCREEN, getFirstAccessibleRoute } from "@/hooks/use-permissions";
import { ROUTE_TO_MENU_KEY } from "@/lib/menu-permissions";
import { logActivity } from "@/lib/activity-log";
import { supabase } from "@/integrations/supabase/client";
import { GlobalSearch } from "@/components/GlobalSearch";
import { useUserRole } from "@/hooks/use-user-role";

type ProfileStatus = "loading" | "active" | "inactive" | "no_profile" | "error";

export default function Layout() {
  const { session, loading, isRecovery } = useAuth();
  const { can, canMenu, permissions, menuPermissions, loading: permLoading, refetch: refetchPerms } = usePermissions();
  const { role, loading: roleLoading } = useUserRole();
  const location = useLocation();
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("loading");
  const profileStatusRef = useRef<ProfileStatus>("loading");
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  // Track which user_id the profileStatus was resolved for
  const profileCheckedForRef = useRef<string | null>(null);
  const [dark, setDark] = useState(() => localStorage.getItem("theme") === "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  // Keep ref in sync so timeout never reads stale closure
  useEffect(() => {
    profileStatusRef.current = profileStatus;
  }, [profileStatus]);

  // Check if the authenticated user has a valid, active profile
  useEffect(() => {
    setProfileStatus("loading");
    profileCheckedForRef.current = null;
    retryCountRef.current = 0;

    if (loading) return;

    if (!session?.user) {
      setProfileStatus("no_profile");
      return;
    }

    let cancelled = false;

    const checkProfile = async () => {
      try {
        console.log("[Layout] Checking profile for", session.user.email, "attempt", retryCountRef.current + 1);
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("id, status, perfil_acesso_id")
          .eq("email", session.user.email)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          console.error("[Layout] Profile query error:", error.message);
          if (retryCountRef.current < maxRetries) {
            retryCountRef.current++;
            const delay = 1000 * retryCountRef.current;
            console.log(`[Layout] Retrying in ${delay}ms...`);
            setTimeout(() => {
              if (!cancelled) checkProfile();
            }, delay);
            return;
          }
          setProfileStatus("error");
          return;
        }

        if (!profile) {
          console.log("[Layout] No profile found — showing access request");
          profileCheckedForRef.current = session.user.id;
          setProfileStatus("no_profile");
          return;
        }

        if (profile.status === "inativo") {
          console.log("[Layout] Profile inactive");
          profileCheckedForRef.current = session.user.id;
          setProfileStatus("inactive");
          return;
        }

        console.log("[Layout] Profile active, perfil_acesso_id:", profile.perfil_acesso_id);
        profileCheckedForRef.current = session.user.id;
        setProfileStatus("active");
      } catch (err) {
        if (cancelled) return;
        console.error("[Layout] Profile check exception:", err);
        if (retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          setTimeout(() => {
            if (!cancelled) checkProfile();
          }, 1000 * retryCountRef.current);
          return;
        }
        setProfileStatus("error");
      }
    };

    const timeout = setTimeout(() => {
      if (!cancelled && profileStatusRef.current === "loading") {
        console.warn("[Layout] Profile check timed out after 15s");
        setProfileStatus("error");
      }
    }, 15000);

    checkProfile();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [session?.user?.id, loading]);

  // Subscribe to profile changes (e.g. admin changed perfil_acesso_id) → re-fetch permissions
  useEffect(() => {
    if (!session?.user?.id || profileStatus !== "active") return;

    const channel = supabase
      .channel(`profile-changes-${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `user_id=eq.${session.user.id}`,
        },
        () => {
          console.log("[Layout] Profile updated via realtime, refetching permissions");
          refetchPerms();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, profileStatus, refetchPerms]);

  // Activity logging
  useEffect(() => {
    if (session) {
      const moduleMap: Record<string, string> = {
        "/dashboard": "Dashboard",
        "/blocos": "Blocos",
        "/ordens-servico": "Ordens de Serviço",
        "/gastos": "Gastos",
        "/relatorios": "Relatórios",
        "/relatorio-mensal": "Relatório Mensal",
        "/cronogramas": "Cronogramas",
        "/ativos": "Ativos",
        "/controle-acesso": "Controle de Acesso",
        "/historico-atividades": "Histórico de Atividades",
      };
      const mod = moduleMap[location.pathname] || location.pathname;
      logActivity({ actionType: "acesso", module: mod, description: `Acessou ${mod}` });
    }
  }, [location.pathname, session]);

  // Treat as loading if profileStatus was resolved for a different user (stale state)
  const profileStale = session?.user?.id ? profileCheckedForRef.current !== session.user.id && profileStatus !== "loading" : false;
  const isLoading = loading || (session && (profileStatus === "loading" || profileStale)) || (session && profileStatus === "active" && permLoading);
  const firstAccessibleRoute = getFirstAccessibleRoute(permissions, menuPermissions);
  const fallbackRoute = firstAccessibleRoute ?? "/solicitar-acesso";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (isRecovery) {
    return <Navigate to="/reset-password" replace />;
  }

  if (profileStatus === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <p className="text-lg font-semibold text-destructive">Erro ao carregar perfil</p>
          <p className="text-sm text-muted-foreground">
            Não foi possível verificar seu acesso. Tente recarregar a página ou entre em contato com o administrador.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }

if (
  profileStatus === "no_profile" ||
  profileStatus === "inactive"
) {
  return (
    <Navigate
      to="/solicitar-acesso"
      replace
    />
  );
}
console.log("ROLE CHECK:", role, "roleLoading:", roleLoading);
if (!roleLoading && role === "visualizacao") {
  return <Navigate to="/portal-cliente" replace />;
}

if (
  permissions.size === 0 &&
  !permLoading
) {
}

const basePath =
  "/" + location.pathname.split("/")[1];

const screen =
  ROUTE_TO_SCREEN[basePath];

if (
  screen &&
  !can(`${screen}.visualizar`)
) {
  return (
    <Navigate
      to={fallbackRoute}
      replace
    />
  );
}

const menuKey =
  ROUTE_TO_MENU_KEY[basePath];

if (
  menuKey &&
  !canMenu(menuKey)
) {
  return (
    <Navigate
      to={fallbackRoute}
      replace
    />
  );
}
if (!roleLoading && role === "visualizacao" && location.pathname !== "/portal-cliente") {
  return <Navigate to="/portal-cliente" replace />;
}
return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-h-screen">
          <header className="sticky top-0 z-40 h-12 flex items-center border-b border-border px-2 gap-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <SidebarTrigger />
            <div className="flex-1" />
            <GlobalSearch />
            <button
              onClick={() => setDark(d => !d)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-accent transition-colors"
              title={dark ? "Modo claro" : "Modo escuro"}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </header>
          <main className="flex-1 p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
