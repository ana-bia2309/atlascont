import { useEffect, useState } from "react";
import { Ruler } from "@/lib/icons";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  atividadeId: string;
  tipoMedicao?: string | null;
  unidadeMedicao?: string | null;
  valorMedido?: string | null;
  disabled?: boolean;
  onUpdate: () => void;
}

export default function AtividadeMedicaoInput({
  atividadeId,
  tipoMedicao,
  unidadeMedicao,
  valorMedido,
  disabled,
  onUpdate,
}: Props) {
  const [valorInput, setValorInput] = useState<string>(valorMedido ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValorInput(valorMedido ?? "");
  }, [valorMedido]);

  const valorPreenchido = (valorInput ?? "").toString().trim().length > 0;

  const handleSave = async () => {
    if (saving) return;
    const value = valorInput.trim();
    if (value === (valorMedido ?? "").trim()) return;
    try {
      setSaving(true);
      const { error } = await (supabase.from("atividades_ordem_preventiva" as any) as any)
        .update({ valor_medido: value || null })
        .eq("id", atividadeId);
      if (error) throw error;
      toast({ title: "Valor salvo" });
      onUpdate();
    } catch (e: any) {
      toast({ title: "Erro ao salvar valor", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-1">
      <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
        <Ruler className="h-3 w-3" />
        {tipoMedicao ? `Valor medido — ${tipoMedicao}` : "Valor medido"}
        <span className="text-destructive">*</span>
      </label>
      <div className="flex items-center gap-1">
        <Input
          type="text"
          inputMode="decimal"
          value={valorInput}
          onChange={(e) => setValorInput(e.target.value)}
          onBlur={handleSave}
          placeholder="Ex.: 220"
          disabled={disabled || saving}
          className="h-7 text-xs flex-1"
        />
        {unidadeMedicao && (
          <span className="text-xs text-muted-foreground whitespace-nowrap px-1.5 py-0.5 rounded bg-muted border border-border/50">
            {unidadeMedicao}
          </span>
        )}
      </div>
      {!valorPreenchido && (
        <p className="text-[10px] text-destructive">
          Informe o valor medido para concluir esta atividade.
        </p>
      )}
    </div>
  );
}
