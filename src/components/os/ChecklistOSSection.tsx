import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Plus, ListChecks, Loader2, Trash2, Wand2 } from "@/lib/icons";
import { toast } from "@/hooks/use-toast";

type ChecklistItem = {
  id: string;
  os_id: string;
  descricao: string;
  concluido: boolean;
  concluido_em: string | null;
  ordem: number;
};

type Props = {
  osId: string;
  tipoServico?: string | null;
  readOnly?: boolean;
};

export default function ChecklistOSSection({ osId, tipoServico, readOnly }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from("checklist_os")
      .select("*")
      .eq("os_id", osId)
      .order("ordem", { ascending: true });
    setItems((data as ChecklistItem[]) || []);
    setLoading(false);
  }, [osId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const toggleItem = async (item: ChecklistItem) => {
    if (readOnly) return;
    const newVal = !item.concluido;
    const { error } = await supabase
      .from("checklist_os")
      .update({
        concluido: newVal,
        concluido_em: newVal ? new Date().toISOString() : null,
      })
      .eq("id", item.id);
    if (!error) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, concluido: newVal, concluido_em: newVal ? new Date().toISOString() : null } : i));
    }
  };

  const addItem = async () => {
    if (!newItem.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("checklist_os").insert({
      os_id: osId,
      descricao: newItem.trim(),
      ordem: items.length,
    });
    if (!error) {
      setNewItem("");
      fetchItems();
    } else {
      toast({ title: "Erro ao adicionar item", variant: "destructive" });
    }
    setSaving(false);
  };

  const removeItem = async (id: string) => {
    await supabase.from("checklist_os").delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const loadFromTemplate = async () => {
    if (!tipoServico) {
      toast({ title: "Tipo de serviço não definido nesta O.S.", variant: "destructive" });
      return;
    }
    setSaving(true);
    // Find template for this service type
    const { data: templates } = await supabase
      .from("checklist_templates")
      .select("id")
      .eq("tipo_servico", tipoServico)
      .limit(1);

    if (!templates?.length) {
      toast({ title: `Nenhum template para "${tipoServico}"`, variant: "destructive" });
      setSaving(false);
      return;
    }

    const { data: templateItems } = await supabase
      .from("checklist_template_items")
      .select("descricao, ordem")
      .eq("template_id", templates[0].id)
      .order("ordem", { ascending: true });

    if (templateItems?.length) {
      const toInsert = templateItems.map((ti: any) => ({
        os_id: osId,
        descricao: ti.descricao,
        ordem: items.length + ti.ordem,
      }));
      await supabase.from("checklist_os").insert(toInsert);
      fetchItems();
      toast({ title: `${templateItems.length} itens carregados do template` });
    }
    setSaving(false);
  };

  const done = items.filter(i => i.concluido).length;
  const total = items.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <ListChecks className="h-4 w-4" /> Checklist
          {total > 0 && (
            <span className="text-xs text-muted-foreground font-normal">
              {done}/{total} ({pct}%)
            </span>
          )}
        </h4>
        {!readOnly && tipoServico && (
          <Button variant="ghost" size="sm" onClick={loadFromTemplate} disabled={saving} className="text-xs h-7">
            <Wand2 className="mr-1 h-3 w-3" /> Carregar template
          </Button>
        )}
      </div>

      {total > 0 && <Progress value={pct} className="h-2" />}

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 group py-1">
              <Checkbox
                checked={item.concluido}
                onCheckedChange={() => toggleItem(item)}
                disabled={readOnly}
              />
              <span className={`flex-1 text-sm ${item.concluido ? "line-through text-muted-foreground" : ""}`}>
                {item.descricao}
              </span>
              {!readOnly && (
                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => removeItem(item.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="flex gap-2">
          <Input
            placeholder="Novo item..."
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={addItem} disabled={saving || !newItem.trim()} className="h-8">
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
