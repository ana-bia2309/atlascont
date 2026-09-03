import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Eye, EyeOff, Mail, Lock, ArrowRight, Sparkles } from "@/lib/icons";
import { logActivity } from "@/lib/activity-log";
import { buildPublicAppUrl } from "@/lib/publicAppUrl";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions, getFirstAccessibleRoute } from "@/hooks/use-permissions";
import DigitalTwinNetwork from "./DigitalTwinNetwork";

// ── Saudação dinâmica por horário ─────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Bom dia. Os serviços operam normalmente.";
  if (h >= 12 && h < 18) return "Boa tarde. Os serviços operam normalmente.";
  return "Boa noite. Os serviços operam normalmente.";
}

// ── Gradiente de texto reutilizável (Atlas navy → indigo) ────────────────────
// #5B4FE0 é um acento intencionalmente mais claro que --primary, só usado
// aqui na tela de login para o brilho/glow do hero — não tem equivalente no
// design system principal. O ponto de chegada do gradiente (--primary) e o
// --navy-mid abaixo são os mesmos tokens usados no resto do app.
const gradientTextStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #5B4FE0 0%, hsl(var(--primary)) 100%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
};

// ── Main Component ────────────────────────────────────────────────────────────
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

  // Redirect if already logged in
  useEffect(() => {
    const handleRedirect = async () => {
      if (!session?.user || permissionsLoading) return;
      const nextRoute =
        getFirstAccessibleRoute(permissions, menuPermissions) ?? "/solicitar-acesso";
      navigate(nextRoute, { replace: true });
    };
    handleRedirect();
  }, [session?.user?.id, permissionsLoading, permissions, menuPermissions, navigate]);

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
    const { error: authErr } = await supabase.auth.signInWithPassword({
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
    <div className="relative h-screen w-screen overflow-hidden bg-[#F8FAFC] antialiased">
      {/* ── Fundo: rede viva (Digital Twin) ── */}
      <DigitalTwinNetwork className="absolute inset-0 z-0 h-full w-full" />

      {/* ── UI Overlay ── */}
      <div className="relative z-10 flex h-screen w-full flex-col items-center justify-between gap-12 overflow-y-auto px-8 py-12 pointer-events-none sm:px-12 lg:h-screen lg:flex-row lg:overflow-hidden lg:px-24 lg:py-0 xl:px-32 lg:gap-16">
        {/* ── Lado esquerdo: branding institucional ── */}
        <div className="flex w-full flex-col justify-center pointer-events-auto lg:max-w-xl">
          <div className="animate-[fadeInUp_0.8s_cubic-bezier(0.16,1,0.3,1)_forwards] opacity-0" style={{ animationDelay: "0.2s" }}>
            <div className="mb-5 flex items-center gap-3">
              <img
                src="/icons/icon-256.png"
                alt="Atlas Control"
                className="h-11 w-11 drop-shadow-md"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <div className="flex items-center gap-3">
                <div className="h-[2px] w-8 bg-[#5B4FE0]" />
                <span className="font-mono text-xs font-semibold uppercase tracking-[0.25em] text-[#5B4FE0] sm:text-sm">
                  Engenharia &amp; Operações
                </span>
              </div>
            </div>

            <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
              Atlas<span style={gradientTextStyle}>Control</span>
            </h1>

            <p className="mt-6 max-w-lg text-lg font-light leading-relaxed text-slate-600 sm:text-xl">
              Gestão inteligente de ativos, infraestrutura e manutenção.
            </p>

            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100/80 px-3 py-1 text-xs font-semibold tracking-wide text-slate-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              SISTEMAS OPERACIONAIS
            </div>
          </div>
        </div>

        {/* ── Lado direito: painel de login (glass panel) ── */}
        <div
          className="flex w-full justify-center pointer-events-auto opacity-0 animate-[fadeInUp_0.8s_cubic-bezier(0.16,1,0.3,1)_forwards] lg:w-auto lg:justify-end"
          style={{ animationDelay: "0.4s" }}
        >
          <div
            className="w-full rounded-[2rem] p-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.05),0_0_40px_rgba(255,255,255,0.4),inset_0_0_0_1px_rgba(255,255,255,0.5)] transition-transform duration-300 ease-out hover:-translate-y-0.5 sm:w-[420px] sm:p-10"
            style={{
              background: "rgba(255, 255, 255, 0.45)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255, 255, 255, 0.6)",
            }}
          >
            {/* Cabeçalho + saudação dinâmica */}
            <div className="mb-6 flex items-center gap-2 text-sm font-medium" style={{ color: "hsl(var(--navy-mid))" }}>
              <Sparkles className="h-4 w-4 shrink-0" />
              <span>{getGreeting()}</span>
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                {forgotMode ? "Recuperar senha" : "Acesso ao ambiente"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {forgotMode
                  ? "Informe seu e-mail para receber o link de redefinição."
                  : "Autentique-se para visualizar a rede."}
              </p>
            </div>

            {/* ── FORGOT MODE ── */}
            {forgotMode ? (
              resetSent ? (
                <div className="space-y-5">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                    Se o e-mail estiver cadastrado, você receberá um link de redefinição em instantes.
                  </div>
                  <button
                    onClick={() => {
                      setForgotMode(false);
                      setResetSent(false);
                    }}
                    className="w-full rounded-2xl border border-slate-200/70 bg-white/50 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white/80"
                  >
                    Voltar ao login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-6">
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                      E-mail Corporativo
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="engenharia@empresa.com"
                        autoComplete="email"
                        required
                        className="input-elegant w-full rounded-2xl py-4 pl-12 pr-4 text-sm text-slate-900 placeholder-slate-400"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-gradient mt-4 flex w-full items-center justify-center space-x-2 rounded-2xl px-6 py-4 text-sm font-medium tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {loading ? (
                      <span className="spinner" />
                    ) : (
                      <span>Enviar link de recuperação</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setForgotMode(false)}
                    className="w-full rounded-2xl border border-slate-200/70 bg-white/50 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white/80"
                  >
                    Voltar ao login
                  </button>
                </form>
              )
            ) : (
              /* ── LOGIN MODE ── */
              <form onSubmit={handleLogin} className="space-y-6">
                {/* Email */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    E-mail Corporativo
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="engenharia@empresa.com"
                      autoComplete="email"
                      required
                      className="input-elegant w-full rounded-2xl py-4 pl-12 pr-4 text-sm text-slate-900 placeholder-slate-400"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Senha
                    </label>
                    <button
                      type="button"
                      onClick={() => setForgotMode(true)}
                      className="text-xs font-medium text-[#5B4FE0] transition-colors hover:text-[hsl(var(--navy-mid))]"
                    >
                      Recuperar
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                      className="input-elegant w-full rounded-2xl py-4 pl-12 pr-11 text-sm text-slate-900 placeholder-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 transition-colors hover:text-slate-600 focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {/* CTA */}
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-gradient mt-4 flex w-full items-center justify-center space-x-2 rounded-2xl px-6 py-4 text-sm font-medium tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? (
                    <span className="spinner" />
                  ) : (
                    <>
                      <span>Iniciar Sessão Segura</span>
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Rodapé com termos */}
            <p className="mt-8 text-center text-xs font-medium text-slate-400">
              Ao entrar, você concorda com os{" "}
              <span className="cursor-pointer text-slate-600 hover:underline">Termos de Serviço</span> e{" "}
              <span className="cursor-pointer text-slate-600 hover:underline">Política de Privacidade</span>.
            </p>
          </div>
        </div>
      </div>

      {/* Branding sutil no canto inferior */}
      <div className="pointer-events-none absolute bottom-8 right-8 z-10 font-mono text-[10px] tracking-widest text-slate-400 opacity-60 sm:right-16 lg:right-32">
        ATLAS_CORE // ONLINE
      </div>

      {/* Estilos locais: inputs, botão gradiente, spinner e animação de entrada */}
      <style>{`
        @keyframes fadeInUp {
          to { opacity: 1; transform: translateY(0); }
        }
        .input-elegant {
          background: rgba(255, 255, 255, 0.6);
          border: 1px solid rgba(0, 0, 0, 0.05);
          transition: all 0.3s ease;
        }
        .input-elegant:focus {
          background: #ffffff;
          border-color: #5B4FE0;
          box-shadow: 0 0 0 4px rgba(91, 79, 224, 0.12);
          outline: none;
        }
        .btn-gradient {
          background: linear-gradient(135deg, #5B4FE0 0%, hsl(var(--primary)) 100%);
          background-size: 200% auto;
          transition: 0.4s ease;
        }
        .btn-gradient:hover:not(:disabled) {
          background-position: right center;
          box-shadow: 0 10px 25px -5px rgba(139, 92, 246, 0.4);
          transform: translateY(-1px);
        }
        .spinner {
          border: 2px solid rgba(255,255,255,0.3);
          border-radius: 50%;
          border-top: 2px solid #fff;
          width: 18px;
          height: 18px;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}