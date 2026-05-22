import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  isRecovery: boolean;
  clearRecovery: () => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  isRecovery: false,
  clearRecovery: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecovery, setIsRecovery] = useState(false);
  const initializedRef = useRef(false);

  const clearRecovery = useCallback(() => setIsRecovery(false), []);

  useEffect(() => {
    // Listen for auth changes — this is the ONLY source of truth after init
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log("[Auth] onAuthStateChange:", event, newSession?.user?.email ?? "no user");
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
      setSession(newSession);
      // Only mark loaded after we've also done the initial getSession
      if (initializedRef.current) {
        setLoading(false);
      }
    });

    // Get initial session — mark initialized after this completes
    supabase.auth.getSession().then(({ data: { session: initSession } }) => {
      console.log("[Auth] getSession:", initSession?.user?.email ?? "no session");
      setSession(initSession);
      initializedRef.current = true;
      setLoading(false);
    });

    // Safety timeout — never stay loading forever
    const timeout = setTimeout(() => {
      if (!initializedRef.current) {
        console.warn("[Auth] Timeout — forcing loading=false");
        initializedRef.current = true;
        setLoading(false);
      }
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, isRecovery, clearRecovery }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
