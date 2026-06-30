import { useCallback, useEffect, useState, useMemo, forwardRef, useImperativeHandle } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Trash2, Save, ChevronDown, Check } from "@/lib/icons";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Material = {
  id: string;
  descricao: string;
  unidade: string;
  valor_unitario: number;
};

type Ativo = {
  id: string;
  nome: string;
  codigo_identificacao: string | null;
};

type MemorialRow = {
  id?: string; // uuid se já salvo
  material_id: string | null;
  material_nome: string;
  material_unidade: string;
  custo_unitario: number;
  quantidades: Record<string, number>; // ativo_id -> quantidade
};

type Props = {
  osId: string | null;
  readOnly?: boolean;
  onTotalChange?: (total: number) => void;
};

export type MemorialHandle = {
  save: (osId: string) => Promise<void>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Component ────────────────────────────────────────────────────────────────

const MemorialMateriaisSection = forwardRef<MemorialHandle, Props>(
  ({ osId, readOnly = false, onTotalChange }, ref) => {
    const { companyId } = useCompany();

    const [materiais, setMateriais] = useState<Material[]>([]);
    const [ativos, setAtivos] = useState<Ativo[]>([]);
    const [rows, setRows] = useState<MemorialRow[]>([]);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(false);

    // Popover state per row for material picker
    const [materialPopover, setMaterialPopover] = useState<Record<number, boolean>>({});
    // Popover for adding ativos
    const [ativoPopover, setAtivoPopover] = useState(false);
    // Which ativo columns are shown
    const [selectedAtivos, setSelectedAtivos] = useState<Ativo[]>([]);

    // ── Load options ──────────────────────────────────────────────────────────
    useEffect(() => {
      if (!companyId) return;
      Promise.all([
        (supabase as any).from("materiais").select("id, descricao, unidade, valor_unitario")
          .eq("company_id", companyId).eq("status", "ativo").order("descricao"),
        (supabase as any).from("ativos").select("id, nome, codigo_identificacao")
          .eq("company_id", companyId).order("nome"),
      ]).then(([mRes, aRes]) => {
        setMateriais(mRes.data || []);
        setAtivos(aRes.data || []);
      });
    }, [companyId]);

    // ── Load saved memorial ───────────────────────────────────────────────────
    const loadMemorial = useCallback(async () => {
      if (!osId) return;
      setLoading(true);
      try {
        const { data: memData } = await (supabase as any)
          .from("memorial_materiais")
          .select("id, material_id, material_nome, material_unidade, custo_unitario")
          .eq("os_id", osId)
          .order("created_at");

        if (!memData || memData.length === 0) { setLoading(false); return; }

        const memIds = memData.map((m: any) => m.id);
        const { data: qtdData } = await (supabase as any)
          .from("memorial_materiais_quantidades")
          .select("memorial_id, ativo_id, quantidade")
          .in("memorial_id", memIds);

        // Collect ativo ids used
        const usedAtivoIds = new Set<string>((qtdData || []).map((q: any) => q.ativo_id));

        const loadedRows: MemorialRow[] = memData.map((m: any) => {
          const qtds: Record<string, number> = {};
          (qtdData || [])
            .filter((q: any) => q.memorial_id === m.id)
            .forEach((q: any) => { qtds[q.ativo_id] = q.quantidade; });
          return {
            id: m.id,
            material_id: m.material_id,
            material_nome: m.material_nome,
            material_unidade: m.material_unidade,
            custo_unitario: m.custo_unitario,
            quantidades: qtds,
          };
        });

        setRows(loadedRows);

        // Restore selected ativos columns
        if (usedAtivoIds.size > 0) {
          setSelectedAtivos(prev => {
            const existing = new Set(prev.map(a => a.id));
            const toAdd = ativos.filter(a => usedAtivoIds.has(a.id) && !existing.has(a.id));
            return [...prev, ...toAdd];
          });
        }
      } finally {
        setLoading(false);
      }
    }, [osId, ativos]);

    useEffect(() => { if (osId && ativos.length > 0) loadMemorial(); }, [osId, ativos.length]);

    // ── Imperative save ───────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      save: async (targetOsId: string) => {
        await saveMemorial(targetOsId);
      },
    }));

    const saveMemorial = async (targetOsId: string) => {
      if (!companyId || rows.length === 0) return;
      setSaving(true);
      try {
        // Delete existing and re-insert (simple upsert strategy)
        await (supabase as any).from("memorial_materiais").delete().eq("os_id", targetOsId);

        for (const row of rows) {
          if (!row.material_nome.trim()) continue;
          const { data: inserted } = await (supabase as any)
            .from("memorial_materiais")
            .insert({
              os_id: targetOsId,
              company_id: companyId,
              material_id: row.material_id || null,
              material_nome: row.material_nome,
              material_unidade: row.material_unidade,
              custo_unitario: row.custo_unitario,
            })
            .select("id")
            .single();

          if (!inserted?.id) continue;

          const qtdRows = Object.entries(row.quantidades)
            .filter(([, q]) => q > 0)
            .map(([ativo_id, quantidade]) => ({
              memorial_id: inserted.id,
              ativo_id,
              quantidade,
            }));

          if (qtdRows.length > 0) {
            await (supabase as any).from("memorial_materiais_quantidades").insert(qtdRows);
          }
        }
        toast({ title: "Memorial de Cálculo salvo!" });
      } catch (err: any) {
        toast({ title: "Erro ao salvar Memorial de Cálculo", description: err.message, variant: "destructive" });
      } finally {
        setSaving(false);
      }
    };

    // ── Row mutations ─────────────────────────────────────────────────────────
    const addRow = () => {
      setRows(prev => [...prev, {
        material_id: null,
        material_nome: "",
        material_unidade: "",
        custo_unitario: 0,
        quantidades: {},
      }]);
    };

    const removeRow = (idx: number) => {
      setRows(prev => prev.filter((_, i) => i !== idx));
    };

    const selectMaterial = (idx: number, mat: Material) => {
      setRows(prev => prev.map((r, i) => i !== idx ? r : {
        ...r,
        material_id: mat.id,
        material_nome: mat.descricao,
        material_unidade: mat.unidade,
        custo_unitario: mat.valor_unitario,
      }));
      setMaterialPopover(prev => ({ ...prev, [idx]: false }));
    };

    const setQtd = (rowIdx: number, ativoId: string, val: string) => {
      const num = parseFloat(val) || 0;
      setRows(prev => prev.map((r, i) => i !== rowIdx ? r : {
        ...r,
        quantidades: { ...r.quantidades, [ativoId]: num },
      }));
    };

    const addAtivo = (ativo: Ativo) => {
      if (!selectedAtivos.find(a => a.id === ativo.id)) {
        setSelectedAtivos(prev => [...prev, ativo]);
      }
      setAtivoPopover(false);
    };

    const removeAtivo = (ativoId: string) => {
      setSelectedAtivos(prev => prev.filter(a => a.id !== ativoId));
      setRows(prev => prev.map(r => {
        const q = { ...r.quantidades };
        delete q[ativoId];
        return { ...r, quantidades: q };
      }));
    };

    // ── Computed totals ───────────────────────────────────────────────────────
    // Arredonda para 2 casas decimais já no cálculo, evitando erros de ponto
    // flutuante (ex.: 4.8 + 4.8 + 3 = 12.600000000000001) em qualquer lugar
    // que use esse valor depois (coluna "Total", valor por linha, total geral).
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

    const rowTotals = useMemo(() => rows.map(r => {
      const totalQtd = round2(selectedAtivos.reduce((s, a) => s + (r.quantidades[a.id] || 0), 0));
      return {
        totalQtd,
        totalValor: round2(totalQtd * r.custo_unitario),
      };
    }), [rows, selectedAtivos]);

    const grandTotalValor = round2(rowTotals.reduce((s, r) => s + r.totalValor, 0));

    useEffect(() => {
      onTotalChange?.(grandTotalValor);
    }, [grandTotalValor, onTotalChange]);


    const availableAtivos = ativos.filter(a => !selectedAtivos.find(s => s.id === a.id));

    // ── Render ────────────────────────────────────────────────────────────────
    if (loading) return <p className="text-sm text-muted-foreground py-4 text-center">Carregando Memorial de Cálculo...</p>;

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Memorial de Cálculo</p>
            <p className="text-xs text-muted-foreground">Grade de materiais × equipamentos</p>
          </div>
          {!readOnly && (
            <Button size="sm" onClick={() => osId && saveMemorial(osId)} disabled={saving || !osId}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? "Salvando..." : "Salvar Memorial de Cálculo"}
            </Button>
          )}
        </div>

        {/* Add ativo column button */}
        {!readOnly && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">Equipamentos:</span>
            {selectedAtivos.map(a => (
              <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full px-2.5 py-1 font-medium">
                {a.nome}
                <button onClick={() => removeAtivo(a.id)} className="hover:text-destructive ml-0.5">×</button>
              </span>
            ))}
            <Popover open={ativoPopover} onOpenChange={setAtivoPopover}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Adicionar equipamento
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar ativo..." className="h-8" />
                  <CommandList>
                    <CommandEmpty>Nenhum ativo encontrado.</CommandEmpty>
                    <CommandGroup>
                      {availableAtivos.map(a => (
                        <CommandItem key={a.id} onSelect={() => addAtivo(a)} className="text-xs">
                          <span className="flex-1">{a.nome}</span>
                          {a.codigo_identificacao && (
                            <span className="text-muted-foreground font-mono">{a.codigo_identificacao}</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Grid table */}
        {(rows.length > 0 || !readOnly) && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-primary/5 border-b">
                  <th className="text-left px-3 py-2.5 font-semibold text-foreground min-w-[200px] sticky left-0 bg-primary/5 z-10">
                    Material
                  </th>
                  <th className="text-center px-2 py-2.5 font-semibold text-muted-foreground w-16">
                    Unid.
                  </th>
                  <th className="text-center px-2 py-2.5 font-semibold text-muted-foreground w-20">
                    R$ Unit.
                  </th>
                  {selectedAtivos.map((a, i) => (
                    <th key={a.id} className="text-center px-2 py-2.5 font-semibold min-w-[80px]">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-primary">{String.fromCharCode(65 + i)}</span>
                        <span className="text-muted-foreground font-normal text-[10px] max-w-[72px] truncate" title={a.nome}>
                          {a.nome}
                        </span>
                      </div>
                    </th>
                  ))}
                  <th className="text-center px-2 py-2.5 font-semibold text-foreground bg-muted/30 w-16">
                    Total
                  </th>
                  <th className="text-center px-2 py-2.5 font-semibold text-primary bg-primary/5 w-24">
                    Valor (R$)
                  </th>
                  {!readOnly && <th className="w-8" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/20 transition-colors">
                    {/* Material picker */}
                    <td className="px-2 py-1.5 sticky left-0 bg-card z-10">
                      {readOnly ? (
                        <span className="font-medium">{row.material_nome || "—"}</span>
                      ) : (
                        <Popover
                          open={materialPopover[idx]}
                          onOpenChange={o => setMaterialPopover(prev => ({ ...prev, [idx]: o }))}
                        >
                          <PopoverTrigger asChild>
                            <button className={cn(
                              "w-full text-left flex items-center justify-between gap-1 rounded px-2 py-1 border text-xs",
                              "hover:border-primary/50 transition-colors",
                              row.material_nome ? "text-foreground" : "text-muted-foreground"
                            )}>
                              <span className="truncate">{row.material_nome || "Selecionar ou digitar..."}</span>
                              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 p-0" align="start">
                            <Command>
                              <CommandInput
                                placeholder="Buscar ou digitar material..."
                                className="h-8"
                                onValueChange={v => {
                                  // Allow free typing
                                  setRows(prev => prev.map((r, i) => i !== idx ? r : {
                                    ...r,
                                    material_nome: v,
                                    material_id: null,
                                  }));
                                }}
                              />
                              <CommandList>
                                <CommandEmpty>
                                  <button
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-muted"
                                    onClick={() => setMaterialPopover(prev => ({ ...prev, [idx]: false }))}
                                  >
                                    Usar "{row.material_nome}" como digitado
                                  </button>
                                </CommandEmpty>
                                <CommandGroup heading="Materiais cadastrados">
                                  {materiais.map(m => (
                                    <CommandItem key={m.id} onSelect={() => selectMaterial(idx, m)} className="text-xs">
                                      <Check className={cn("h-3 w-3 mr-1.5", row.material_id === m.id ? "opacity-100" : "opacity-0")} />
                                      <span className="flex-1">{m.descricao}</span>
                                      <span className="text-muted-foreground">{m.unidade} · R${m.valor_unitario}</span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      )}
                    </td>

                    {/* Unidade */}
                    <td className="px-2 py-1.5 text-center text-muted-foreground">
                      <span className="text-xs">{row.material_unidade || "—"}</span>
                    </td>

                    {/* Custo unitário */}
                    <td className="px-2 py-1.5 text-center text-muted-foreground">
                      <span className="text-xs">R$ {fmt(row.custo_unitario)}</span>
                    </td>

                    {/* Quantity per ativo */}
                    {selectedAtivos.map(a => (
                      <td key={a.id} className="px-1 py-1.5 text-center">
                        {readOnly ? (
                          <span className={cn(row.quantidades[a.id] ? "font-medium text-foreground" : "text-muted-foreground/40")}>
                            {row.quantidades[a.id] || "—"}
                          </span>
                        ) : (
                          <Input
                            type="number"
                            min={0}
                            value={row.quantidades[a.id] || ""}
                            onChange={e => setQtd(idx, a.id, e.target.value)}
                            className="h-6 w-16 text-center text-xs px-1 mx-auto"
                            placeholder="0"
                          />
                        )}
                      </td>
                    ))}

                    {/* Total qty */}
                    <td className="px-2 py-1.5 text-center font-semibold bg-muted/20">
                      {rowTotals[idx]?.totalQtd > 0 ? rowTotals[idx].totalQtd : "—"}
                    </td>

                    {/* Total valor */}
                    <td className="px-2 py-1.5 text-center font-semibold text-primary bg-primary/5">
                      {rowTotals[idx]?.totalValor > 0 ? `R$ ${fmt(rowTotals[idx].totalValor)}` : "—"}
                    </td>

                    {/* Remove row */}
                    {!readOnly && (
                      <td className="px-1 py-1.5 text-center">
                        <button onClick={() => removeRow(idx)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}

                {/* Empty state */}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5 + selectedAtivos.length} className="text-center py-8 text-muted-foreground text-xs">
                      Nenhum material adicionado ao Memorial de Cálculo.
                    </td>
                  </tr>
                )}
              </tbody>

              {/* Footer totals */}
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/30">
                    <td
                      className="px-3 py-2 font-bold text-xs sticky left-0 bg-muted/30"
                      colSpan={3 + selectedAtivos.length + 1}
                    >
                      TOTAL GERAL
                    </td>
                    <td className="px-2 py-2 text-center font-bold text-primary text-xs bg-primary/10">
                      R$ {fmt(grandTotalValor)}
                    </td>
                    {!readOnly && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Add material row button */}
        {!readOnly && (
          <Button variant="outline" size="sm" onClick={addRow} className="gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Adicionar material
          </Button>
        )}

        {/* Summary card */}
        {grandTotalValor > 0 && (
          <div className="rounded-lg border bg-primary/5 p-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">Custo total do Memorial de Cálculo</p>
            <p className="text-lg font-bold text-primary">R$ {fmt(grandTotalValor)}</p>
          </div>
        )}
      </div>
    );
  }
);

MemorialMateriaisSection.displayName = "MemorialCalculoSection";
export default MemorialMateriaisSection;