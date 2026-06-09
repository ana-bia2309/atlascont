import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useCompany() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompany = async (userId: string) => {
      try {
        const { data: profile }: any = await (supabase as any)
          .from("profiles")
          .select("company_id")
          .eq("user_id", userId)
          .maybeSingle();

        console.log("COMPANY ID:", profile?.company_id);
        setCompanyId(profile?.company_id ?? null);
      } catch (err) {
        console.error("ERRO useCompany:", err);
        setCompanyId(null);
      } finally {
        setLoading(false);
      }
    };

    // Escuta mudanças de auth (resolve o problema de null no carregamento inicial)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchCompany(session.user.id);
      } else {
        setCompanyId(null);
        setLoading(false);
      }
    });

    // Também tenta imediatamente com sessão atual
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) fetchCompany(user.id);
      else setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { companyId, loading };
}