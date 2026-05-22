import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut, Clock, RefreshCw } from "@/lib/icons";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions, getFirstAccessibleRoute } from "@/hooks/use-permissions";

export default function SolicitarAcesso() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { permissions, menuPermissions, loading: permissionsLoading, refetch } = usePermissions();
  const [checking, setChecking] = useState(false);
  const nextRoute = getFirstAccessibleRoute(permissions, menuPermissions);

  const checkAccess = async () => {
    if (!session?.user) return false;

    try {
      const { data: profile }: any =
  await (supabase as any)
        .from("profiles")
        .select("id, status, perfil_acesso_id")
        .eq("user_id", session.user.id)
.select("id, status, perfil_acesso_id, company_id")
        .maybeSingle();

      if (
  !profile ||
  !profile.company_id ||
  profile.status === "inativo" ||
  !profile.perfil_acesso_id
)
  return false;

      const { data: perms } = await supabase
        .from("permissoes_perfil")
        .select("id")
        .eq("perfil_acesso_id", profile.perfil_acesso_id)
        .limit(1);

      return !!(perms && perms.length > 0);
    } catch {
      return false;
    }
  };

  useEffect(() => {
  const handleAccessRedirect = async () => {
    if (!session?.user || permissionsLoading) return;

    const { data: profile } =
  await (supabase as any)
    .from("profiles")
    .select("company_id")
    .eq(
      "user_id",
      session.user.id
    )
    .maybeSingle();

    if (!(profile as any)?.company_id) {
      navigate("/onboarding", { replace: true });
      return;
    }

    if (nextRoute) {
      navigate(nextRoute, { replace: true });
    }
  };

  handleAccessRedirect();
}, [session?.user?.id, permissionsLoading, nextRoute, navigate]);

  useEffect(() => {
    if (!session?.user) return;

    let cancelled = false;

    const poll = async () => {
      const hasAccess = await checkAccess();
      if (cancelled) return;
      if (hasAccess) {
        refetch();
      }
    };

    poll();
    const interval = setInterval(poll, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session?.user?.id, refetch]);

  const handleRetry = async () => {
    setChecking(true);
    const hasAccess = await checkAccess();
    setChecking(false);

    if (hasAccess) {
      refetch();
      return;
    }

    toast({ title: "Acesso ainda não liberado", description: "Tente novamente em alguns instantes.", variant: "destructive" });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Sessão encerrada" });
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-[440px]">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center">
            <Clock className="h-10 w-10 text-amber-600" />
          </div>
          <CardTitle className="text-xl font-bold">Aguardando liberação de acesso</CardTitle>
          <p className="text-sm text-muted-foreground">
            Seu cadastro foi identificado, mas ainda não possui um perfil de acesso configurado no sistema.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground space-y-2">
            <p>
              <strong>E-mail autenticado:</strong>{" "}
              {session?.user?.email ?? "—"}
            </p>
            <p>
              Entre em contato com o administrador do sistema para que seu perfil e permissões sejam configurados.
            </p>
          </div>
          <Button className="w-full" onClick={handleRetry} disabled={checking}>
            <RefreshCw className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Verificando..." : "Tentar novamente"}
          </Button>
          <Button variant="outline" className="w-full" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
