import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Timer, Save, RefreshCw, ChevronLeft } from "@/lib/icons";
import { useNavigate } from "react-router-dom";

const PRIORIDADES = [
  { key: "Baixa",    color: "bg-zinc-100 text-zinc-700 border-zinc-200",   icon: "🔵" },
  { key: "Média",    color: "bg-blue-50 text-blue-700 border-blue-200",    icon: "🟡" },
  { key: "Alta",     color: "bg-amber-50 text-amber-700 border-amber-200", icon: "🟠" },
  { key: "Crítica",  color: "bg-red-50 text-red-700 border-red-200",       icon: "🔴" },
];

type Regra = {
  id?: string;
  prioridade: string;
  prazo_horas: number;
};

export default function RegrasPrioridade() {
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const [regras, setRegras] = useState<Record<string, number>>({
    Baixa: 720, Média: 360, Alta: 168, Crítica: 24,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchRegras = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("prioridade_regras")
      .select("prioridade, prazo_horas")
      .eq("company_id", companyId);

    if (data && data.length > 0) {
      const map: Record<string, number> = {};
      data.forEach((r: Regra) => { map[r.prioridade] = r.prazo_horas; });
      setRegras(prev => ({ ...prev, ...map }));
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchRegras(); }, [fetchRegras]);

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      for (const [prioridade, prazo_horas] of Object.entries(regras)) {
        await (supabase as any)
          .from("prioridade_regras")
          .upsert({ company_id: companyId, prioridade, prazo_horas }, { onConflict: "company_id,prioridade" });
      }
      toast({ title: "Regras de prioridade salvas!" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const formatPrazo = (horas: number) => {
    if (horas < 24) return `${horas}h`;
    if (horas < 168) return `${Math.floor(horas / 24)} dia(s)`;
    if (horas < 720) return `${Math.floor(horas / 168)} semana(s)`;
    return `${Math.floor(horas / 720)} mês(es)`;
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Timer className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Regras de Prioridade</h1>
            <p className="text-sm text-muted-foreground">
              Configure o prazo automático para cada nível de prioridade das O.S.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchRegras}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="rounded-lg bg-primary/5 border border-primary/10 p-4 text-sm text-muted-foreground">
        💡 Ao selecionar uma prioridade ao criar uma O.S., o prazo será preenchido automaticamente com base nas regras abaixo. O usuário poderá editar manualmente se necessário.
      </div>

      {/* Regras */}
      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <div className="space-y-4">
          {PRIORIDADES.map(({ key, color, icon }) => (
            <Card key={key}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${color}`}>
                    {icon} {key}
                  </span>
                  <span className="text-muted-foreground font-normal">
                    → prazo de <strong className="text-foreground">{formatPrazo(regras[key] || 24)}</strong> após abertura
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                      Prazo em horas
                    </label>
                    <Input
                      type="number"
                      min="1"
                      value={regras[key] || ""}
                      onChange={e => setRegras(prev => ({
                        ...prev,
                        [key]: parseInt(e.target.value) || 0
                      }))}
                      className="w-40"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "24h", value: 24 },
                      { label: "3 dias", value: 72 },
                      { label: "7 dias", value: 168 },
                      { label: "15 dias", value: 360 },
                      { label: "30 dias", value: 720 },
                      { label: "60 dias", value: 1440 },
                      { label: "90 dias", value: 2160 },
                      { label: "1 ano", value: 8760 },
                    ].map(({ label, value }) => (
                      <button
                        key={value}
                        onClick={() => setRegras(prev => ({ ...prev, [key]: value }))}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          regras[key] === value
                            ? "bg-primary text-white border-primary"
                            : "bg-card hover:bg-accent border-border"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}