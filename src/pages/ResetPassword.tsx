import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowRight } from "@/lib/icons";
import { Progress } from "@/components/ui/progress";

type RecoveryStatus = "checking" | "ready" | "invalid" | "success";

const DEFAULT_RECOVERY_ERROR = "Não foi possível validar o link de recuperação. Solicite um novo link na tela de login.";
const EXPIRED_RECOVERY_ERROR = "Este link de recuperação expirou, já foi usado ou não é mais válido. Solicite um novo link na tela de login.";

function getRecoveryParams() {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return { searchParams, hashParams };
}

function getRecoveryErrorMessage() {
  const { searchParams, hashParams } = getRecoveryParams();
  const error = searchParams.get("error") ?? hashParams.get("error");
  const errorCode = searchParams.get("error_code") ?? hashParams.get("error_code");
  const errorDescription = searchParams.get("error_description") ?? hashParams.get("error_description");

  if (!error && !errorCode && !errorDescription) {
    return null;
  }

  if (errorCode === "otp_expired" || error === "access_denied") {
    return EXPIRED_RECOVERY_ERROR;
  }

  return errorDescription ?? DEFAULT_RECOVERY_ERROR;
}

function clearRecoveryUrl() {
  window.history.replaceState({}, document.title, window.location.pathname);
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const { clearRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<RecoveryStatus>("checking");
  const [statusMessage, setStatusMessage] = useState("Verificando link...");
  const [isInvite, setIsInvite] = useState(false);
  const [userName, setUserName] = useState("");
  const [redirectProgress, setRedirectProgress] = useState(0);

  useEffect(() => {
    let active = true;

    const setInvalidState = (message: string) => {
      if (!active) return;
      clearRecoveryUrl();
      setStatus("invalid");
      setStatusMessage(message);
    };

    const setReadyState = () => {
      if (!active) return;
      clearRecoveryUrl();
      setStatus("ready");
      setStatusMessage("");
      const { searchParams: sp, hashParams: hp } = getRecoveryParams();
      const rt = sp.get("type") ?? hp.get("type");
      if (rt === "invite") setIsInvite(true);
    };

    const { searchParams, hashParams } = getRecoveryParams();
    const recoveryType = searchParams.get("type") ?? hashParams.get("type");

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && (recoveryType === "recovery" || recoveryType === "invite"))) {
        setReadyState();
      }
    });

    const validateRecoveryLink = async () => {
      const recoveryErrorMessage = getRecoveryErrorMessage();
      if (recoveryErrorMessage) {
        setInvalidState(recoveryErrorMessage);
        return;
      }

      const code = searchParams.get("code");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          setInvalidState(error.message === "Email link is invalid or has expired" ? EXPIRED_RECOVERY_ERROR : error.message || DEFAULT_RECOVERY_ERROR);
          return;
        }

        setReadyState();
        return;
      }

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          setInvalidState(error.message === "Email link is invalid or has expired" ? EXPIRED_RECOVERY_ERROR : error.message || DEFAULT_RECOVERY_ERROR);
          return;
        }

        setReadyState();
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setReadyState();
        return;
      }

      setInvalidState(DEFAULT_RECOVERY_ERROR);
    };

    void validateRecoveryLink();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Senha muito curta", description: "A senha deve ter no mínimo 6 caracteres.", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Senhas não conferem", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setLoading(false);
      toast({ title: "Erro ao redefinir senha", description: error.message, variant: "destructive" });
      return;
    }

    // Get user name for welcome message
    const { data: { user } } = await supabase.auth.getUser();
    const name = user?.user_metadata?.nome || user?.email?.split("@")[0] || "";
    setUserName(name);
    setLoading(false);
    clearRecovery();

    if (isInvite) {
      setStatus("success");
    } else {
      toast({ title: "Senha redefinida com sucesso" });
      navigate("/dashboard", { replace: true });
    }
  };

  // Auto-redirect after success
  useEffect(() => {
    if (status !== "success") return;
    const duration = 4000;
    const interval = 50;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      setRedirectProgress(Math.min((elapsed / duration) * 100, 100));
      if (elapsed >= duration) {
        clearInterval(timer);
        navigate("/dashboard", { replace: true });
      }
    }, interval);
    return () => clearInterval(timer);
  }, [status, navigate]);

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-[440px]">
          <CardHeader className="text-center space-y-3">
            <div className="flex justify-center">
              <div className="rounded-full bg-emerald-500/15 p-3">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">
              Bem-vindo{userName ? `, ${userName}` : ""}!
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Sua conta foi ativada com sucesso. Você já está conectado ao Atlas Control.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center">Redirecionando para o sistema...</p>
              <Progress value={redirectProgress} className="h-1.5" />
            </div>
            <Button className="w-full" onClick={() => navigate("/dashboard", { replace: true })}>
              Ir para o sistema <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-[400px]">
          <CardContent className="pt-6 text-center text-muted-foreground">
            {statusMessage}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-[440px]">
          <CardHeader className="text-center space-y-2">
            <div className="flex justify-center">
              <AlertCircle className="h-10 w-10 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-bold">Link inválido</CardTitle>
            <p className="text-sm text-muted-foreground">{statusMessage}</p>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/login", { replace: true })}>
              Voltar ao login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-[400px]">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center">
            <ShieldCheck className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">
            {isInvite ? "Ative sua Conta" : "Defina sua Senha"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {isInvite
              ? "Bem-vindo ao Atlas Control! Crie sua senha para começar a usar o sistema."
              : "Crie sua senha de acesso ao Atlas Control"}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Nova senha</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
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
            <div>
              <label className="text-sm font-medium mb-1 block">Confirmar senha</label>
              <Input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Salvando..." : isInvite ? "Ativar Conta" : "Redefinir Senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
