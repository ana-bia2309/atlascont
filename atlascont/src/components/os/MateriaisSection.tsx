import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/use-company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Save, X } from "@/lib/icons";
import { format } from "date-fns";

export const UNIDADE_OPTIONS = [
  "un", "m", "m²", "m3", "kg", "l", "cx", "pct", "rol", "par",
] as const;

export type LocalMaterial = {
  _localId: string;
  nome_material: string;
  quantidade: number;
  unidade: string;
  custo_unitario: number;
  fornecedor?: string;
  data_compra?: string;
};

type PersistedMaterial = {
  id: string;
  os_id: string;
  nome_material: string;
  quantidade: number;
  unidade: string;
  custo_unitario: number;
  custo_total_item: number;
  fornecedor: string | null;
  data_compra: string | null;
};

type DraftMaterial = {
  nome_material: string;
  quantidade: string;
  unidade: string;
  custo_unitario: string;
  fornecedor: string;
  data_compra: string;
};

const emptyDraft: DraftMaterial = { nome_material: "", quantidade: "1", unidade: "un", custo_unitario: "0", fornecedor: "", data_compra: "" };

let localIdCounter = 0;
const nextLocalId = () => `local-${++localIdCounter}`;

export interface MateriaisSectionHandle {
  getLocalMateriais: () => LocalMaterial[];
  clearLocal: () => void;
}

interface MateriaisSectionProps {
  osId: string | null;
  readOnly?: boolean;
}

const MateriaisSection = forwardRef<MateriaisSectionHandle, MateriaisSectionProps>(
  ({ osId, readOnly = false }, ref) => {
    const [persisted, setPersisted] = useState<PersistedMaterial[]>([]);
    const [local, setLocal] = useState<LocalMaterial[]>([]);
    const [loading, setLoading] = useState(false);
    const [adding, setAdding] = useState(false);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [draft, setDraft] = useState<DraftMaterial>(emptyDraft);
    const { companyId } = useCompany();
    useImperativeHandle(ref, () => ({
      getLocalMateriais: () => local,
      clearLocal: () => setLocal([]),
    }));

    const fetchPersisted = useCallback(async () => {
      if (!osId) { setPersisted([]); return; }
      setLoading(true);
      const { data, error } = await supabase
        .from("materiais_os")
        .select("*")
        .eq("os_id", osId)
        .order("created_at");
      if (error) {
        toast({ title: "Erro ao carregar materiais", description: error.message, variant: "destructive" });
      } else {
        setPersisted((data as PersistedMaterial[]) || []);
      }
      setLoading(false);
    }, [osId]);

    useEffect(() => { fetchPersisted(); }, [fetchPersisted]);

    const calcTotal = (qty: string, cost: string) => {
      const q = parseFloat(qty) || 0;
      const c = parseFloat(cost) || 0;
      return (q * c).toFixed(2);
    };

    const buildPayload = () => ({
      nome_material: draft.nome_material.trim(),
      quantidade: parseFloat(draft.quantidade) || 1,
      unidade: draft.unidade.trim() || "un",
      custo_unitario: parseFloat(draft.custo_unitario) || 0,
      fornecedor: draft.fornecedor.trim() || null,
      data_compra: draft.data_compra || null,
    });

    // --- Local material CRUD ---
    const addLocal = () => {
      if (!draft.nome_material.trim()) { toast({ title: "Nome do material é obrigatório", variant: "destructive" }); return; }
      const p = buildPayload();
      setLocal((prev) => [...prev, {
        _localId: nextLocalId(),
        nome_material: p.nome_material,
        quantidade: p.quantidade,
        unidade: p.unidade,
        custo_unitario: p.custo_unitario,
        fornecedor: p.fornecedor || undefined,
        data_compra: p.data_compra || undefined,
      }]);
      setDraft(emptyDraft);
      setAdding(false);
    };

    const updateLocal = (localId: string) => {
      if (!draft.nome_material.trim()) { toast({ title: "Nome do material é obrigatório", variant: "destructive" }); return; }
      const p = buildPayload();
      setLocal((prev) => prev.map((m) => m._localId === localId ? {
        ...m, ...p, fornecedor: p.fornecedor || undefined, data_compra: p.data_compra || undefined,
      } : m));
      setEditingKey(null);
      setDraft(emptyDraft);
    };

    const deleteLocal = (localId: string) => {
      setLocal((prev) => prev.filter((m) => m._localId !== localId));
    };

    // --- Persisted material CRUD ---
    const addPersisted = async () => {
      if (!osId) return;
      if (!draft.nome_material.trim()) { toast({ title: "Nome do material é obrigatório", variant: "destructive" }); return; }
      const { error } = await (supabase as any)
  .from("materiais_os")
  .insert({
    os_id: osId,
    company_id: companyId,
    ...buildPayload()
  });
      if (error) { toast({ title: "Erro ao adicionar material", description: error.message, variant: "destructive" }); return; }
      setDraft(emptyDraft);
      setAdding(false);
      fetchPersisted();
    };

    const updatePersisted = async (id: string) => {
      if (!osId) return;
      if (!draft.nome_material.trim()) { toast({ title: "Nome do material é obrigatório", variant: "destructive" }); return; }
      const { error } = await (supabase as any)
  .from("materiais_os")
  .update(buildPayload())
  .eq("id", id)
  .eq("company_id", companyId);
      if (error) { toast({ title: "Erro ao atualizar material", description: error.message, variant: "destructive" }); return; }
      setEditingKey(null);
      setDraft(emptyDraft);
      fetchPersisted();
    };

    const deletePersisted = async (id: string) => {
      if (!osId) return;
      const { error } = await (supabase as any)
  .from("materiais_os")
  .delete()
  .eq("id", id)
  .eq("company_id", companyId);
      if (error) { toast({ title: "Erro ao excluir material", description: error.message, variant: "destructive" }); return; }
      fetchPersisted();
    };

    const handleSaveForm = () => {
      if (editingKey) {
        if (osId && !editingKey.startsWith("local-")) {
          updatePersisted(editingKey);
        } else {
          updateLocal(editingKey);
        }
      } else {
        if (osId) addPersisted(); else addLocal();
      }
    };

    const startEdit = (key: string, m: PersistedMaterial | (LocalMaterial & { custo_total_item?: number })) => {
      setEditingKey(key);
      setAdding(false);
      setDraft({
        nome_material: m.nome_material,
        quantidade: String(m.quantidade),
        unidade: m.unidade || "un",
        custo_unitario: String(m.custo_unitario),
        fornecedor: (m as any).fornecedor || "",
        data_compra: (m as any).data_compra || "",
      });
    };

    const cancelEdit = () => { setEditingKey(null); setAdding(false); setDraft(emptyDraft); };

    type DisplayItem = {
      key: string; nome_material: string; quantidade: number; unidade: string;
      custo_unitario: number; custo_total_item: number;
      fornecedor: string | null; data_compra: string | null;
    };

    const items: DisplayItem[] = [
      ...persisted.map((m) => ({
        key: m.id, nome_material: m.nome_material, quantidade: m.quantidade, unidade: m.unidade,
        custo_unitario: m.custo_unitario, custo_total_item: m.custo_total_item,
        fornecedor: m.fornecedor, data_compra: m.data_compra,
      })),
      ...local.map((m) => ({
        key: m._localId, nome_material: m.nome_material, quantidade: m.quantidade, unidade: m.unidade,
        custo_unitario: m.custo_unitario, custo_total_item: m.quantidade * m.custo_unitario,
        fornecedor: m.fornecedor || null, data_compra: m.data_compra || null,
      })),
    ];

    const totalGeral = items.reduce((s, m) => s + m.custo_total_item, 0);

    const fmtDate = (d: string | null) => {
      if (!d) return null;
      try { return format(new Date(d + "T00:00:00"), "dd/MM/yyyy"); } catch { return d; }
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Materiais Utilizados</h3>
          {!readOnly && !adding && !editingKey && (
            <Button variant="outline" size="sm" onClick={() => { setAdding(true); setDraft(emptyDraft); }}>
              <Plus className="mr-1 h-3 w-3" /> Adicionar material
            </Button>
          )}
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : items.length === 0 && !adding ? (
          <p className="text-xs text-muted-foreground">Nenhum material registrado.</p>
        ) : (
          <div className="space-y-2">
            {items.map((m) =>
              editingKey === m.key ? (
                <MaterialForm
                  key={m.key}
                  draft={draft}
                  setDraft={setDraft}
                  onSave={handleSaveForm}
                  onCancel={cancelEdit}
                  calcTotal={calcTotal}
                  saveLabel="Salvar"
                />
              ) : (
                <div key={m.key} className="rounded-md border bg-muted/30 px-3 py-2 text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{m.nome_material}</span>
                      <span className="text-muted-foreground ml-2">
                        {m.quantidade} {m.unidade}
                        {m.custo_unitario > 0 && <> × R$ {Number(m.custo_unitario).toFixed(2)}</>}
                      </span>
                      {m.custo_total_item > 0 && (
                        <span className="ml-2 font-semibold text-primary">
                          = R$ {Number(m.custo_total_item).toFixed(2)}
                        </span>
                      )}
                    </div>
                    {!readOnly && (
                      <div className="flex gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(m.key, m as any)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                          onClick={() => m.key.startsWith("local-") ? deleteLocal(m.key) : deletePersisted(m.key)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {(m.fornecedor || m.data_compra) && (
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      {m.fornecedor && <span>Fornecedor: <span className="text-foreground">{m.fornecedor}</span></span>}
                      {m.data_compra && <span>Data: <span className="text-foreground">{fmtDate(m.data_compra)}</span></span>}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )}

        {adding && (
          <MaterialForm
            draft={draft}
            setDraft={setDraft}
            onSave={handleSaveForm}
            onCancel={cancelEdit}
            calcTotal={calcTotal}
            saveLabel="Adicionar"
          />
        )}

        {items.length > 0 && totalGeral > 0 && (
          <div className="text-right text-sm font-semibold pt-1 border-t border-border">
            Custo Total: <span className="text-primary">R$ {totalGeral.toFixed(2)}</span>
          </div>
        )}
      </div>
    );
  }
);

MateriaisSection.displayName = "MateriaisSection";
export default MateriaisSection;

function MaterialForm({
  draft, setDraft, onSave, onCancel, calcTotal, saveLabel,
}: {
  draft: DraftMaterial;
  setDraft: (d: DraftMaterial) => void;
  onSave: () => void;
  onCancel: () => void;
  calcTotal: (qty: string, cost: string) => string;
  saveLabel: string;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Material</label>
          <Input
            value={draft.nome_material}
            onChange={(e) => setDraft({ ...draft, nome_material: e.target.value })}
            placeholder="Nome do material"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Qtd</label>
          <Input
            type="number" min="0" step="0.01"
            value={draft.quantidade}
            onChange={(e) => setDraft({ ...draft, quantidade: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Unidade</label>
          <Select value={draft.unidade} onValueChange={(v) => setDraft({ ...draft, unidade: v })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {UNIDADE_OPTIONS.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
        <div>
          <label className="text-xs text-muted-foreground">Valor unit. (R$)</label>
          <Input
            type="number" min="0" step="0.01"
            value={draft.custo_unitario}
            onChange={(e) => setDraft({ ...draft, custo_unitario: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Subtotal</label>
          <p className="text-sm font-semibold text-primary h-8 flex items-center">
            R$ {calcTotal(draft.quantidade, draft.custo_unitario)}
          </p>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Fornecedor</label>
          <Input
            value={draft.fornecedor}
            onChange={(e) => setDraft({ ...draft, fornecedor: e.target.value })}
            placeholder="Opcional"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Data compra</label>
          <Input
            type="date"
            value={draft.data_compra}
            onChange={(e) => setDraft({ ...draft, data_compra: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="mr-1 h-3 w-3" /> Cancelar
        </Button>
        <Button size="sm" onClick={onSave}>
          <Save className="mr-1 h-3 w-3" /> {saveLabel}
        </Button>
      </div>
    </div>
  );
}
