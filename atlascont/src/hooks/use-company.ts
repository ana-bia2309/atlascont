import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export function useCompany() {

  const [companyId, setCompanyId] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    const fetchCompany = async () => {

      try {

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        console.log("AUTH USER:", user);
        console.log("AUTH ERROR:", userError);

        if (!user) {

          setCompanyId(null);
          setLoading(false);

          return;
        }

        const {
          data: profile,
          error: profileError,
        }: any =
          await (supabase as any)
            .from("profiles")
            .select("company_id")
            .eq("user_id", user.id)
            .maybeSingle();

        console.log("PROFILE:", profile);
        console.log("PROFILE ERROR:", profileError);
        console.log("COMPANY ID:", profile?.company_id);

        if (profile?.company_id) {

          setCompanyId(
            profile.company_id
          );

        } else {

          setCompanyId(null);
        }

      } catch (err) {

        console.error(
          "ERRO useCompany:",
          err
        );

        setCompanyId(null);

      } finally {

        setLoading(false);
      }
    };

    fetchCompany();

  }, []);

  return {
    companyId,
    loading,
  };
}