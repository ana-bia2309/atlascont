import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Eye, EyeOff, Mail, Lock, ArrowRight, BarChart2, ShieldCheck, Cpu, Sparkles } from "@/lib/icons";
import { logActivity } from "@/lib/activity-log";
import { buildPublicAppUrl } from "@/lib/publicAppUrl";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions, getFirstAccessibleRoute } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";

// ── Saudação dinâmica por horário ─────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Bom dia. Os serviços operam normalmente.";
  if (h >= 12 && h < 18) return "Boa tarde. Os serviços operam normalmente.";
  return "Boa noite. Os serviços operam normalmente.";
}

// ── Feature list item ─────────────────────────────────────────────────────────
function Feature({
  icon: Icon,
  label,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  accent: "blue" | "purple" | "slate";
}) {
  const bg = {
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-purple-50 text-purple-600",
    slate: "bg-slate-100 text-slate-700",
  }[accent];

  return (
    <li className="flex items-center gap-3 text-slate-600">
      <div className={cn("p-1.5 rounded-md shrink-0", bg)}>
        <Icon className="w-4 h-4" />
      </div>
      <span className="font-medium text-sm">{label}</span>
    </li>
  );
}

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
    <div className="h-screen w-screen flex overflow-hidden bg-slate-50 antialiased">

      {/* ── LEFT PANEL ── */}
      <div className="hidden md:flex flex-col justify-between w-[55%] lg:w-[60%] h-full bg-white relative p-12 lg:p-20 border-r border-slate-200/60 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10 overflow-hidden">

        {/* Decorative glows */}
        <div
          className="pointer-events-none absolute"
          style={{
            width: 600, height: 600,
            background: "radial-gradient(circle, rgba(37,99,235,0.08) 0%, rgba(255,255,255,0) 70%)",
            top: -100, left: -100,
          }}
        />
        <div
          className="pointer-events-none absolute"
          style={{
            width: 500, height: 500,
            background: "radial-gradient(circle, rgba(147,51,234,0.08) 0%, rgba(255,255,255,0) 70%)",
            bottom: -150, right: -100,
          }}
        />

        {/* Top: Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-3">
            <img
              src="/icons/icon-256.png"
              alt="Atlas Control"
              className="w-14 h-14 drop-shadow-md"
              onError={(e) => {
                // Fallback se a logo não carregar
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">
              Atlas
              <span
                style={{
                  background: "linear-gradient(135deg, #2563eb 0%, #9333ea 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Control
              </span>
            </h1>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600 tracking-wide">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            SISTEMAS OPERACIONAIS
          </div>
        </div>

        {/* Center: headline + features */}
        <div className="relative z-10 max-w-xl">
          <h2 className="text-4xl lg:text-5xl font-extrabold text-slate-900 leading-[1.1] tracking-tight mb-6">
            Gestão inteligente.{" "}
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #9333ea 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Controle completo.
            </span>
          </h2>
          <p className="text-lg text-slate-500 leading-relaxed font-medium">
            O Atlas Control centraliza chamados, ativos e operações em uma plataforma moderna,
            intuitiva e preparada para os desafios do dia a dia.
          </p>

          <ul className="mt-10 space-y-4">
            <Feature icon={BarChart2} label="Ordens de serviço e chamados em um só lugar" accent="blue" />
            <Feature icon={ShieldCheck} label="Gestão de equipes com níveis de acesso" accent="purple" />
            <Feature icon={Cpu} label="Relatórios, ativos e manutenção integrados" accent="slate" />
          </ul>
        </div>

        {/* Bottom: footer */}
        <div className="relative z-10 flex items-center justify-between text-sm text-slate-400 font-medium">
          <span>&copy; {new Date().getFullYear()} Atlas Control</span>
          <div className="flex gap-4">
            <span className="hover:text-slate-600 transition-colors cursor-pointer">Privacidade</span>
            <span className="hover:text-slate-600 transition-colors cursor-pointer">Suporte</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="w-full md:w-[45%] lg:w-[40%] h-full flex flex-col justify-center items-center p-6 sm:p-12 bg-[#FAFAFA] overflow-y-auto">

        <div className="w-full max-w-[400px]">

          {/* Mobile logo */}
          <div className="md:hidden flex items-center justify-center gap-3 mb-10">
            <img
              src="/icons/icon-256.png"
              alt="Atlas Control"
              className="w-12 h-12"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">
              Atlas
              <span
                style={{
                  background: "linear-gradient(135deg, #2563eb 0%, #9333ea 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Control
              </span>
            </h1>
          </div>

          {/* Greeting */}
          <div className="h-6 mb-2 flex items-center gap-2 text-sm font-medium text-purple-600">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>{getGreeting()}</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
              {forgotMode ? "Recuperar senha" : "Acesso ao portal"}
            </h2>
            <p className="text-slate-500 mt-2 text-sm font-medium">
              {forgotMode
                ? "Informe seu e-mail para receber o link de redefinição."
                : "Insira suas credenciais para continuar."}
            </p>
          </div>

          {/* ── FORGOT MODE ── */}
          {forgotMode ? (
            resetSent ? (
              <div className="space-y-5">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
                  Se o e-mail estiver cadastrado, você receberá um link de redefinição em instantes.
                </div>
                <button
                  onClick={() => { setForgotMode(false); setResetSent(false); }}
                  className="w-full py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Voltar ao login
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                {/* Email field */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">E-mail</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                      <Mail className="w-5 h-5" />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="nome@empresa.com"
                      autoComplete="email"
                      required
                      className="block w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400
                                 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 rounded-xl text-sm font-semibold text-white transition-all
                             bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700
                             shadow-lg shadow-blue-600/20 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? "Enviando..." : "Enviar link de recuperação"}
                </button>

                <button
                  type="button"
                  onClick={() => setForgotMode(false)}
                  className="w-full py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Voltar ao login
                </button>
              </form>
            )
          ) : (
            /* ── LOGIN MODE ── */
            <form onSubmit={handleLogin} className="space-y-5">

              {/* Email */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">E-mail corporativo</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                    <Mail className="w-5 h-5" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="nome@empresa.com"
                    autoComplete="email"
                    required
                    className="block w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400
                               focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-semibold text-slate-700">Senha de acesso</label>
                  <button
                    type="button"
                    onClick={() => setForgotMode(true)}
                    className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-purple-500 transition-colors">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    className="block w-full pl-11 pr-11 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400
                               focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
                    tabIndex={-1}
                    title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3.5 px-4 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all
                           bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700
                           shadow-lg shadow-blue-600/20 hover:scale-[1.01] active:scale-[0.99]
                           disabled:opacity-70 disabled:cursor-not-allowed disabled:scale-100"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Processando...</span>
                  </>
                ) : (
                  <>
                    <span>Autenticar Sessão</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer note */}
          <p className="text-center text-xs text-slate-400 font-medium mt-8">
            Ao entrar, você concorda com os{" "}
            <span className="text-slate-600 hover:underline cursor-pointer">Termos de Serviço</span>
            {" "}e{" "}
            <span className="text-slate-600 hover:underline cursor-pointer">Política de Privacidade</span>.
          </p>
        </div>
      </div>
    </div>
  );
}