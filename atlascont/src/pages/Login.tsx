import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Eye, EyeOff } from "@/lib/icons";
import { logActivity } from "@/lib/activity-log";
import { buildPublicAppUrl } from "@/lib/publicAppUrl";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions, getFirstAccessibleRoute } from "@/hooks/use-permissions";

export default function Login() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { permissions, menuPermissions, loading: permissionsLoading } = usePermissions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

 useEffect(() => {
 const handleRedirect = async () => {
  if (!session?.user || permissionsLoading) return;

  console.log("SESSION EMAIL:", session.user.email);

const { data: profile, error } =
  await (supabase as any)
    .from("profiles")
    .select("company_id")
    .eq(
      "user_id",
      session.user.id
    )
    .maybeSingle();

console.log("PROFILE:", profile);
console.log("PROFILE ERROR:", error);

    const nextRoute =
      getFirstAccessibleRoute(permissions, menuPermissions) ??
      "/solicitar-acesso";

    navigate(nextRoute, { replace: true });
  };

  handleRedirect();
}, [
  session?.user?.id,
  permissionsLoading,
  permissions,
  menuPermissions,
  navigate,
]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast({ title: "E-mail inválido", description: "Informe um e-mail válido.", variant: "destructive" });
      return;
    }
    if (!password) {
      toast({ title: "Senha obrigatória", variant: "destructive" });
      return;
    }

    setLoading(true);

const { error: authErr } =
  await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

    if (authErr) {
      toast({ title: "Erro ao autenticar", description: "E-mail ou senha incorretos.", variant: "destructive" });
      setLoading(false);
      return;
    }

    toast({ title: "Login realizado com sucesso" });
    logActivity({ actionType: "login", module: "Autenticação", description: `Login realizado por ${email.trim()}` });
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast({ title: "E-mail inválido", description: "Informe um e-mail válido.", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: buildPublicAppUrl("/auth/callback"),
    });
    setLoading(false);

    if (error) {
      toast({ title: "Erro ao enviar e-mail", description: error.message, variant: "destructive" });
      return;
    }

    setResetSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-[400px]">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center">
            <ShieldCheck className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Atlas Control</CardTitle>
          <p className="text-sm text-muted-foreground">
            {forgotMode ? "Recuperação de senha" : "Entre com seu e-mail e senha"}
          </p>
        </CardHeader>
        <CardContent>
          {forgotMode ? (
            resetSent ? (
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.
                </p>
                <Button variant="outline" className="w-full" onClick={() => { setForgotMode(false); setResetSent(false); }}>
                  Voltar ao login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">E-mail</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    autoComplete="email"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Enviando..." : "Enviar link de recuperação"}
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => setForgotMode(false)}>
                  Voltar ao login
                </Button>
              </form>
            )
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">E-mail</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Senha</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Entrando..." : "Entrar"}
              </Button>
              <Button variant="link" className="w-full text-muted-foreground" onClick={() => setForgotMode(true)}>
                Esqueci minha senha
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
