import { useState, useEffect, useCallback, useImperativeHandle, forwardRef, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/use-company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Save, X, Send, ShoppingCart, Package } from "@/lib/icons";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
  id: string; os_id: string; nome_material: string; quantidade: number;
  unidade: string; custo_unitario: number; custo_total_item: number;
  fornecedor: string | null; data_compra: string | null;
};

type DraftMaterial = {
  nome_material: string; quantidade: string; unidade: string;
  custo_unitario: string; fornecedor: string; data_compra: string;
};

const emptyDraft: DraftMaterial = {
  nome_material: "", quantidade: "1", unidade: "un",
  custo_unitario: "0", fornecedor: "", data_compra: "",
};

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

// ── FiscaisSelector ──────────────────────────────────────────────────────────
function FiscaisSelector({ osId }: { osId: string }) {
  const [fiscais, setFiscais] = useState<{ id: string; profile_id: string; nome: string }[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; nome: string }[]>([]);
  const [showSelect, setShowSelect] = useState(false);

  const fetchFiscais = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("os_fiscais").select("id, profile_id, profiles(nome)").eq("os_id", osId);
    if (data) setFiscais(data.map((d: any) => ({
      id: d.id, profile_id: d.profile_id, nome: d.profiles?.nome || "—",
    })));
  }, [osId]);

  useEffect(() => {
    fetchFiscais();
    supabase.from("profiles").select("id, nome, company_id").eq("status", "ativo").order("nome")
      .then(({ data }) => {
        if (data) {
          supabase.from("ordens_servico").select("company_id").eq("id", osId).single()
            .then(({ data: osData }) => {
              if (osData?.company_id) {
                setProfiles((data as any[]).filter((p: any) => p.company_id === osData.company_id));
              } else {
                setProfiles(data as any);
              }
            });
        }
      });
  }, [fetchFiscais]);

  const add = async (profileId: string) => {
    if (fiscais.find(f => f.profile_id === profileId)) { setShowSelect(false); return; }
    await (supabase as any).from("os_fiscais").insert({ os_id: osId, profile_id: profileId });
    toast({ title: "Fiscal adicionado" });
    fetchFiscais(); setShowSelect(false);
  };

  const remove = async (id: string) => {
    await (supabase as any).from("os_fiscais").delete().eq("id", id);
    toast({ title: "Fiscal removido" }); fetchFiscais();
  };

  const available = profiles.filter(p => !fiscais.find(f => f.profile_id === p.id));

  return (
    <div className="px-4 py-3 border-t border-amber-100 bg-amber-50/60 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-amber-700">Fiscais para Aprovação</span>
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-amber-700 hover:bg-amber-100"
          onClick={() => setShowSelect(s => !s)}>
          <Plus className="h-3 w-3" /> Adicionar fiscal
        </Button>
      </div>
      {showSelect && available.length > 0 && (
        <div className="rounded-md border bg-popover shadow-md max-h-[160px] overflow-y-auto">
          {available.map(p => (
            <button key={p.id} type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b last:border-0"
              onClick={() => add(p.id)}>{p.nome}
            </button>
          ))}
        </div>
      )}
      {fiscais.length === 0
        ? <p className="text-xs text-muted-foreground italic">Nenhum fiscal vinculado.</p>
        : (
          <div className="flex flex-wrap gap-1.5">
            {fiscais.map(f => (
              <div key={f.id} className="flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-full px-2.5 py-1 text-xs font-medium">
                {f.nome}
                <button onClick={() => remove(f.id)} className="ml-0.5 hover:text-destructive">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

// ── MaterialForm ─────────────────────────────────────────────────────────────
function MaterialForm({
  draft, setDraft, onSave, onCancel, calcTotal, saveLabel, companyId, onMaterialSelect,
}: {
  draft: DraftMaterial;
  setDraft: (d: DraftMaterial) => void;
  onSave: () => void;
  onCancel: () => void;
  calcTotal: (qty: string, cost: string) => string;
  saveLabel: string;
  companyId: string | null;
  onMaterialSelect?: (id: string | null) => void;
}) {
  const [materiais, setMateriais] = useState<{
    id: string; codigo: string | null; descricao: string;
    unidade: string | null; valor_unitario: number | null;
    fornecedor: string | null; data_compra: string | null;
  }[]>([]);
  const [busca, setBusca] = useState("");
  const [showList, setShowList] = useState(false);
  const [estoqueInfo, setEstoqueInfo] = useState<{ disponivel: number; unidade: string } | null>(null);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const qtdNum = parseFloat(draft.quantidade) || 0;
  const qtdInsuficiente = estoqueInfo !== null && estoqueInfo.disponivel > 0 && qtdNum > estoqueInfo.disponivel;
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!companyId) return;
    (supabase as any)
      .from("materiais")
      .select("id, codigo, descricao, unidade, valor_unitario, fornecedor, data_compra")
      .eq("company_id", companyId)
      .eq("status", "ativo")
      .order("descricao")
      .then(({ data }: any) => setMateriais(data || []));
  }, [companyId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowList(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtrados = busca.length === 0
    ? materiais
    : materiais.filter(m => {
        const q = busca.toLowerCase();
        return m.descricao.toLowerCase().includes(q) || (m.codigo || "").toLowerCase().includes(q);
      });

  const selecionarMaterial = async (m: typeof materiais[0]) => {
    setDraft({
      ...draft,
      nome_material: m.descricao,
      unidade: m.unidade || "un",
      custo_unitario: m.valor_unitario?.toString() || "0",
      fornecedor: m.fornecedor || "",
      data_compra: m.data_compra || "",
    });
    setBusca(m.codigo ? `${m.codigo} — ${m.descricao}` : m.descricao);
    setShowList(false);
    setMaterialId(m.id);
    onMaterialSelect?.(m.id);

    // Busca estoque disponível
    const { data } = await (supabase as any)
      .from("estoque")
      .select("quantidade_disponivel")
      .eq("material_id", m.id)
      .maybeSingle();
    setEstoqueInfo({ disponivel: Number(data?.quantidade_disponivel || 0), unidade: m.unidade || "un" });
  };

  const limpar = () => {
    setDraft({ ...draft, nome_material: "", custo_unitario: "0", unidade: "un", fornecedor: "", data_compra: "" });
    setBusca(""); setEstoqueInfo(null); setMaterialId(null);
    onMaterialSelect?.(null);
  };

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <div className="relative" ref={dropdownRef}>
        <label className="text-xs text-muted-foreground">Buscar material (nome ou código)</label>
        <Input
          value={busca}
          onChange={e => { setBusca(e.target.value); setShowList(true); setDraft({ ...draft, nome_material: "" }); setEstoqueInfo(null); }}
          onFocus={() => setShowList(true)}
          onKeyDown={e => {
            if (e.key === "Enter" && filtrados.length > 0) selecionarMaterial(filtrados[0]);
            if (e.key === "Escape") setShowList(false);
          }}
          placeholder="Clique para ver todos os materiais..."
          className="h-8 text-sm"
        />
        {showList && filtrados.length > 0 && (
          <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover shadow-md max-h-[200px] overflow-y-auto">
            {filtrados.map(m => (
              <button key={m.id}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                onMouseDown={e => { e.preventDefault(); selecionarMaterial(m); }}>
                {m.codigo && <span className="font-mono text-xs text-muted-foreground">{m.codigo}</span>}
                <span className="flex-1">{m.descricao}</span>
                {m.unidade && <span className="text-xs text-muted-foreground">{m.unidade}</span>}
                {m.valor_unitario != null && <span className="text-xs text-primary">R$ {Number(m.valor_unitario).toFixed(2)}</span>}
              </button>
            ))}
          </div>
        )}
        {showList && busca.length > 0 && filtrados.length === 0 && (
          <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover shadow-md px-3 py-2 text-sm text-muted-foreground">
            Nenhum material encontrado
          </div>
        )}
      </div>

      {draft.nome_material && (
        <div className="rounded-md bg-primary/10 px-3 py-1.5 text-sm flex items-center gap-2">
          <span className="font-medium flex-1">{draft.nome_material}</span>
          <button onClick={limpar} className="text-muted-foreground hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Indicador de estoque */}
      {estoqueInfo !== null && (
        <div className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium border",
          estoqueInfo.disponivel === 0
            ? "bg-red-50 border-red-200 text-red-700"
            : qtdInsuficiente
              ? "bg-amber-50 border-amber-200 text-amber-700"
              : estoqueInfo.disponivel <= 5
                ? "bg-amber-50 border-amber-200 text-amber-700"
                : "bg-emerald-50 border-emerald-200 text-emerald-700"
        )}>
          {estoqueInfo.disponivel === 0 ? "🔴" : qtdInsuficiente ? "⚠️" : estoqueInfo.disponivel <= 5 ? "🟡" : "🟢"}
          <span>
            Estoque disponível: <strong>{estoqueInfo.disponivel} {estoqueInfo.unidade}</strong>
            {estoqueInfo.disponivel === 0 && " — Atenção: estoque zerado!"}
            {qtdInsuficiente && (
              <span className="block mt-0.5">
                Quantidade solicitada ({draft.quantidade} {estoqueInfo.unidade}) superior ao disponível!
              </span>
            )}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
       <div>
          <label className="text-xs text-muted-foreground">Qtd</label>
          <Input type="number" min="0.01" step="0.01"
            value={draft.quantidade}
            onChange={e => setDraft({ ...draft, quantidade: e.target.value })}
            className={cn("h-8 text-sm", qtdInsuficiente && "border-amber-400 focus-visible:ring-amber-400")}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Unidade</label>
          <Input value={draft.unidade} readOnly className="h-8 text-sm bg-muted cursor-not-allowed" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Valor unit. (R$)</label>
          <Input value={draft.custo_unitario} readOnly className="h-8 text-sm bg-muted cursor-not-allowed" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Subtotal</label>
          <p className="text-sm font-semibold text-primary h-8 flex items-center">
            R$ {calcTotal(draft.quantidade, draft.custo_unitario)}
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="mr-1 h-3 w-3" /> Cancelar
        </Button>
        <Button size="sm" onClick={onSave} disabled={!draft.nome_material}>
          <Save className="mr-1 h-3 w-3" /> {saveLabel}
        </Button>
      </div>
    </div>
  );
}

// ── MateriaisSection ─────────────────────────────────────────────────────────
const MateriaisSection = forwardRef<MateriaisSectionHandle, MateriaisSectionProps>(
  ({ osId, readOnly = false }, ref) => {
    const [persisted, setPersisted] = useState<PersistedMaterial[]>([]);
    const [local, setLocal] = useState<LocalMaterial[]>([]);
    const [loading, setLoading] = useState(false);
    const [adding, setAdding] = useState(false);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [draft, setDraft] = useState<DraftMaterial>(emptyDraft);
    const [currentMaterialId, setCurrentMaterialId] = useState<string | null>(null);
    const [orcamentoStatus, setOrcamentoStatus] = useState<string | null>(null);
    const { companyId } = useCompany();

    useImperativeHandle(ref, () => ({
      getLocalMateriais: () => local,
      clearLocal: () => setLocal([]),
    }));

    const fetchPersisted = useCallback(async () => {
      if (!osId) { setPersisted([]); return; }
      setLoading(true);
      const { data, error } = await supabase
        .from("materiais_os").select("*").eq("os_id", osId).order("created_at");
      if (error) toast({ title: "Erro ao carregar materiais", description: error.message, variant: "destructive" });
      else setPersisted((data as PersistedMaterial[]) || []);
      if (osId) {
        const { data: osData } = await (supabase as any)
          .from("ordens_servico").select("orcamento_status").eq("id", osId).single();
        setOrcamentoStatus(osData?.orcamento_status || null);
      }
      setLoading(false);
    }, [osId]);

    useEffect(() => { fetchPersisted(); }, [fetchPersisted]);

    const calcTotal = (qty: string, cost: string) =>
      ((parseFloat(qty) || 0) * (parseFloat(cost) || 0)).toFixed(2);

    const buildPayload = () => ({
      nome_material: draft.nome_material.trim(),
      quantidade: parseFloat(draft.quantidade) || 1,
      unidade: draft.unidade.trim() || "un",
      custo_unitario: parseFloat(draft.custo_unitario) || 0,
      fornecedor: draft.fornecedor.trim() || null,
      data_compra: draft.data_compra || null,
      material_id: currentMaterialId || null,
    });

    const addLocal = () => {
      if (!draft.nome_material.trim()) { toast({ title: "Selecione um material", variant: "destructive" }); return; }
      const p = buildPayload();
      setLocal(prev => [...prev, { _localId: nextLocalId(), ...p, fornecedor: p.fornecedor || undefined, data_compra: p.data_compra || undefined }]);
      setDraft(emptyDraft); setAdding(false);
    };

    const updateLocal = (localId: string) => {
      if (!draft.nome_material.trim()) { toast({ title: "Selecione um material", variant: "destructive" }); return; }
      const p = buildPayload();
      setLocal(prev => prev.map(m => m._localId === localId
        ? { ...m, ...p, fornecedor: p.fornecedor || undefined, data_compra: p.data_compra || undefined } : m));
      setEditingKey(null); setDraft(emptyDraft);
    };

    const deleteLocal = (localId: string) => setLocal(prev => prev.filter(m => m._localId !== localId));

    const resetOrcamentoStatus = async () => {
      if (!osId) return;
      const { data } = await (supabase as any).from("ordens_servico").select("orcamento_status").eq("id", osId).single();
      if (data?.orcamento_status === "aprovado" || data?.orcamento_status === "pendente") {
        await (supabase as any).from("ordens_servico").update({ orcamento_status: "pendente" }).eq("id", osId);
        toast({ title: "Materiais alterados", description: "O orçamento precisará ser reenviado para aprovação." });
      }
    };

    const addPersisted = async () => {
      if (!osId || !draft.nome_material.trim()) { toast({ title: "Selecione um material", variant: "destructive" }); return; }
      const { error } = await (supabase as any).from("materiais_os").insert({ os_id: osId, company_id: companyId, ...buildPayload() });
      if (error) { toast({ title: "Erro ao adicionar material", description: error.message, variant: "destructive" }); return; }
      setDraft(emptyDraft); setAdding(false);
      await resetOrcamentoStatus(); fetchPersisted();
    };

    const updatePersisted = async (id: string) => {
      if (!osId || !draft.nome_material.trim()) { toast({ title: "Selecione um material", variant: "destructive" }); return; }
      const { error } = await (supabase as any).from("materiais_os").update(buildPayload()).eq("id", id).eq("company_id", companyId);
      if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
      setEditingKey(null); setDraft(emptyDraft);
      await resetOrcamentoStatus(); fetchPersisted();
    };

    const deletePersisted = async (id: string) => {
      if (!osId) return;
      const { error } = await (supabase as any).from("materiais_os").delete().eq("id", id).eq("company_id", companyId);
      if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
      await resetOrcamentoStatus(); fetchPersisted();
    };

    const handleSaveForm = () => {
      if (editingKey) {
        if (osId && !editingKey.startsWith("local-")) updatePersisted(editingKey);
        else updateLocal(editingKey);
      } else {
        if (osId) addPersisted(); else addLocal();
      }
    };

    const startEdit = (key: string, m: any) => {
      setEditingKey(key); setAdding(false);
      setDraft({ nome_material: m.nome_material, quantidade: String(m.quantidade), unidade: m.unidade || "un", custo_unitario: String(m.custo_unitario), fornecedor: m.fornecedor || "", data_compra: m.data_compra || "" });
    };

    const cancelEdit = () => { setEditingKey(null); setAdding(false); setDraft(emptyDraft); };

    type DisplayItem = {
      key: string; nome_material: string; quantidade: number; unidade: string;
      custo_unitario: number; custo_total_item: number;
      fornecedor: string | null; data_compra: string | null;
    };

    const items: DisplayItem[] = [
      ...persisted.map(m => ({ key: m.id, nome_material: m.nome_material, quantidade: m.quantidade, unidade: m.unidade, custo_unitario: m.custo_unitario, custo_total_item: m.custo_total_item, fornecedor: m.fornecedor, data_compra: m.data_compra })),
      ...local.map(m => ({ key: m._localId, nome_material: m.nome_material, quantidade: m.quantidade, unidade: m.unidade, custo_unitario: m.custo_unitario, custo_total_item: m.quantidade * m.custo_unitario, fornecedor: m.fornecedor || null, data_compra: m.data_compra || null })),
    ];

    const totalGeral = items.reduce((s, m) => s + m.custo_total_item, 0);

    const fmtDate = (d: string | null) => {
      if (!d) return null;
      try { return format(new Date(d + "T00:00:00"), "dd/MM/yyyy"); } catch { return d; }
    };

    return (
      <div className="rounded-xl border-2 border-primary/20 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b border-primary/10">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Materiais Utilizados</h3>
            {items.length > 0 && (
              <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full">
                {items.length} {items.length === 1 ? "item" : "itens"}
              </span>
            )}
          </div>
          {!readOnly && !adding && !editingKey && (
            <Button variant="outline" size="sm" onClick={() => { setAdding(true); setDraft(emptyDraft); }}
              className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10">
              <Plus className="h-3 w-3" /> Adicionar material
            </Button>
          )}
        </div>

        <div className="p-4 space-y-2">
          {loading ? (
            <p className="text-xs text-muted-foreground">Carregando...</p>
          ) : items.length === 0 && !adding ? (
            <div className="flex flex-col items-center py-6 text-muted-foreground">
              <Package className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs">Nenhum material registrado.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((m, idx) =>
                editingKey === m.key ? (
                  <MaterialForm key={m.key} draft={draft} setDraft={setDraft}
                    onSave={handleSaveForm} onCancel={cancelEdit}
                    calcTotal={calcTotal} saveLabel="Salvar" companyId={companyId}
                    onMaterialSelect={setCurrentMaterialId} />
                ) : (
                  <div key={m.key} className="group flex items-center gap-3 rounded-lg border bg-background px-4 py-3 hover:bg-muted/40 transition-all">
                    <span className="text-xs font-mono text-muted-foreground w-5 shrink-0">{idx + 1}</span>
                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <Package className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{m.nome_material}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.quantidade} {m.unidade}
                        {m.custo_unitario > 0 && <> × R$ {Number(m.custo_unitario).toFixed(2)}</>}
                        {m.fornecedor && <> · {m.fornecedor}</>}
                        {m.data_compra && <> · {fmtDate(m.data_compra)}</>}
                      </p>
                    </div>
                    {m.custo_total_item > 0 && (
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">subtotal</p>
                        <p className="text-sm font-bold text-primary">R$ {Number(m.custo_total_item).toFixed(2)}</p>
                      </div>
                    )}
                    {!readOnly && (
                      <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(m.key, m)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                          onClick={() => m.key.startsWith("local-") ? deleteLocal(m.key) : deletePersisted(m.key)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}
          {adding && (
            <MaterialForm draft={draft} setDraft={setDraft}
              onSave={handleSaveForm} onCancel={cancelEdit}
              calcTotal={calcTotal} saveLabel="Adicionar" companyId={companyId}
              onMaterialSelect={setCurrentMaterialId} />
          )}
        </div>

        {!readOnly && (
          osId
            ? <FiscaisSelector osId={osId} />
            : <div className="px-4 py-3 border-t border-amber-100 bg-amber-50/60">
                <p className="text-xs text-amber-700 italic">💡 Salve a O.S. para adicionar fiscais e enviar para aprovação.</p>
              </div>
        )}

        {items.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-t border-primary/10">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Total geral</span>
              <span className="text-base font-bold text-primary">R$ {totalGeral.toFixed(2)}</span>
            </div>
            {!readOnly && osId && orcamentoStatus === "aprovado" && (
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                ✅ Orçamento Aprovado
              </span>
            )}
            {!readOnly && osId && orcamentoStatus !== "aprovado" && (
              <Button size="sm" variant="outline"
                className="gap-1.5 border-amber-400 text-amber-700 hover:bg-amber-50 h-8 text-xs"
                onClick={async () => {
                  try {
                    const { data: resps } = await (supabase as any).from("os_fiscais").select("profile_id").eq("os_id", osId);
                    if (!resps || resps.length === 0) { toast({ title: "Nenhum fiscal vinculado à O.S.", variant: "destructive" }); return; }
                    const { data: osData } = await (supabase as any).from("ordens_servico").select("codigo_os").eq("id", osId).single();
                    const notifs = resps.map((r: any) => ({
                      os_id: osId, user_id: r.profile_id, tipo: "orcamento",
                      titulo: "Orçamento aguardando aprovação",
                      mensagem: `A O.S. ${osData?.codigo_os || ""} tem materiais no valor de R$ ${totalGeral.toFixed(2)} aguardando sua aprovação.`,
                      read: false,
                    }));
                    const { error } = await (supabase as any).from("os_notifications").insert(notifs);
                    if (error) throw error;
                    await (supabase as any).from("ordens_servico").update({ orcamento_status: "pendente" }).eq("id", osId);
                    toast({ title: "Orçamento enviado para aprovação!", description: "O fiscal foi notificado." });
                  } catch (e: any) {
                    toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
                  }
                }}>
                <Send className="h-3.5 w-3.5" /> Enviar para aprovação
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }
);

MateriaisSection.displayName = "MateriaisSection";
export default MateriaisSection;