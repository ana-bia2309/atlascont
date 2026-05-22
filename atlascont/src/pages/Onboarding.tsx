import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

const Onboarding = () => {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);

  const createSlug = (name: string) =>
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyName.trim()) return;

    setLoading(true);

    const { error } = await (supabase as any).rpc("create_company_for_current_user", {
      company_name: companyName.trim(),
      company_slug: createSlug(companyName),
    });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl"
      >
        <h1 className="text-2xl font-bold text-slate-900">
          Criar empresa
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Configure a empresa principal para começar a usar o Atlas.
        </p>

        <div className="mt-6">
          <label className="text-sm font-medium text-slate-700">
            Nome da empresa
          </label>
<input
  value={companyName}
  onChange={(e) => setCompanyName(e.target.value)}
  placeholder="Ex: Atlas Engenharia"
  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
/>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-slate-950 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {loading ? "Criando..." : "Criar empresa"}
        </button>
      </form>
    </div>
  );
};

export default Onboarding;