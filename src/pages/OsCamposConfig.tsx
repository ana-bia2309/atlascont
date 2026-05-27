import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { RefreshCw, Settings2, ChevronLeft } from "@/lib/icons";

const CAMPOS = [
  { key: "codigo_os", label: "Código da O.S.", sempre: true },
  { key: "bloco_id", label: "Bloco / Unidade" },
  { key: "andar", label: "Andar" },
  { key: "sala", label: "Sala" },
  { key: "status", label: "Status", sempre: true },
  { key: "prioridade", label: "Prioridade" },
  { key: "tipo_servico", label: "Tipo de Serviço" },
  { key: "responsavel", label: "Responsável (Técnico)" },
  { key: "prazo", label: "Prazo" },
  { key: "data_inicio", label: "Data Início" },
  { key: "data_termino", label: "Data Término" },
  { key: "cronograma", label: "Cronograma" },
  { key: "ativo_id", label: "Ativo Vinculado" },
  { key: "equipamentos", label: "Equipamentos" },
  { key: "observacoes", label: "Observações" },
];

export default function OsCamposConfig() {
  const { companyId } = useCompany();
  const [config, setConfig] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("os_campos_config")
      .select("campo, obrigatorio")
      .eq("company_id", companyId);

    const map: Record<string, boolean> = {};
    (data || []).forEach((d: any) => { map[d.campo] = d.obrigatorio; });
    setConfig(map);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleToggle = (campo: string, value: boolean) => {
    setConfig(prev => ({ ...prev, [campo]: value }));
  };

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const rows = CAMPOS
        .filter(c => !c.sempre)
        .map(c => ({
          company_id: companyId,
          campo: c.key,
          obrigatorio: config[c.key] || false,
        }));

      const { error } = await (supabase as any)
        .from("os_campos_config")
        .upsert(rows, { onConflict: "company_id,campo" });

      if (error) throw error;
      toast({ title: "Configurações salvas!" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Settings2 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Campos Obrigatórios da O.S.</h1>
            <p className="text-sm text-muted-foreground">Configure quais campos serão obrigatórios ao criar uma O.S.</p>
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={fetchConfig}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campos do Formulário</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Carregando...</p>
          ) : (
            CAMPOS.map(c => (
              <div key={c.key} className="flex items-center justify-between py-2.5 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{c.label}</p>
                  {c.sempre && <p className="text-xs text-muted-foreground">Sempre obrigatório</p>}
                </div>
                {c.sempre ? (
                  <Switch checked disabled />
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {config[c.key] ? "Obrigatório" : "Opcional"}
                    </span>
                    <Switch
                      checked={config[c.key] || false}
                      onCheckedChange={v => handleToggle(c.key, v)}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Button className="w-full" onClick={handleSave} disabled={saving}>
        {saving ? "Salvando..." : "Salvar Configurações"}
      </Button>
    </div>
  );
}