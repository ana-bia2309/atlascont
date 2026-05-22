import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type AppRole = "administrador" | "gestor" | "tecnico" | "visualizacao";

interface UseUserRole {
  role: AppRole | null;
  loading: boolean;
  isAdmin: boolean;
}

export function useUserRole(): UseUserRole {
  const { session, loading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (authLoading) return;

    if (!session?.user) {
      console.log("[Role] No session — clearing role");
      setRole(null);
      setLoading(false);
      return;
    }

    const currentFetch = ++fetchIdRef.current;
    let settled = false;
    setLoading(true);

    const fetchRole = async () => {
      try {
        console.log("[Role] Fetching role for", session.user.email);
        const { data, error } = await supabase.rpc("get_my_role");

        if (currentFetch !== fetchIdRef.current) return;

        if (error) {
          console.warn("[Role] RPC error:", error.message);
          setRole(null);
        } else {
          console.log("[Role] Got role:", data);
          setRole(data ? (data as AppRole) : null);
        }
      } catch (err) {
        if (currentFetch !== fetchIdRef.current) return;
        console.error("[Role] Exception:", err);
        setRole(null);
      } finally {
        if (currentFetch === fetchIdRef.current && !settled) {
          settled = true;
          setLoading(false);
        }
      }
    };

    const timeout = setTimeout(() => {
      if (currentFetch === fetchIdRef.current && !settled) {
        settled = true;
        console.warn("[Role] Timeout — forcing loading=false");
        setLoading(false);
      }
    }, 10000);

    fetchRole();

    return () => {
      settled = true;
      clearTimeout(timeout);
    };
  }, [session?.user?.id, authLoading]);

  return { role, loading, isAdmin: role === "administrador" };
}
