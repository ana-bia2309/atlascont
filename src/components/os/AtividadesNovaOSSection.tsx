import { forwardRef, useImperativeHandle, useState } from "react";
import { Plus, Pencil, Trash2, Save, X, CalendarClock } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const STATUS_ATIVIDADE = ["Não iniciado", "Em andamento", "Concluído"];

export type LocalAtividade = {
  _localId: string;
  nome: string;
  data_inicio: string;
  data_termino: string;
  status: string;
  responsavel: string | null;
  tipo_atividade: string | null;
};

export interface AtividadesNovaOSSectionHandle {
  getLocalAtividades: () => LocalAtividade[];
  flushTo: (osId: string) => Promise<void>;
  clearLocal: () => void;
}

interface Props {
  /** Lista de tipos de atividade pré-carregados (opcional). */
  tiposAtividade?: { id: string; nome: string }[];
  readOnly?: boolean;
}

let local_id_counter = 0;
const next_local_id = () => `local-${++local_id_counter}`;

type Draft = {
  nome: string;
  data_inicio: string;
  data_termino: string;
  status: string;
  responsavel: string;
  tipo_atividade: string;
};

const empty_draft: Draft = {
  nome: "",
  data_inicio: "",
  data_termino: "",
  status: "Não iniciado",
  responsavel: "",
  tipo_atividade: "",
};

const AtividadesNovaOSSection = forwardRef<AtividadesNovaOSSectionHandle, Props>(
  ({ tiposAtividade = [], readOnly = false }, ref) => {
    const [items, setItems] = useState<LocalAtividade[]>([]);
    const [adding, setAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<Draft>(empty_draft);

    useImperativeHandle(ref, () => ({
      getLocalAtividades: () => items,
      clearLocal: () => setItems([]),
      flushTo: async (osId: string) => {
        if (items.length === 0) return;
        const rows = items.map((a) => ({
          os_id: osId,
          nome: a.nome,
          data_inicio: a.data_inicio,
          data_termino: a.data_termino,
          status: a.status,
          responsavel: a.responsavel,
          tipo_atividade: a.tipo_atividade,
        }));
        const { error } = await supabase.from("atividades_os").insert(rows as any);
        if (error) {
          toast({ title: "Falha ao salvar atividades", description: error.message, variant: "destructive" });
        }
        setItems([]);
      },
    }));

    const validate_draft = () => {
      if (!draft.nome.trim() || !draft.data_inicio || !draft.data_termino) {
        toast({ title: "Preencha nome, data de início e data de término.", variant: "destructive" });
        return false;
      }
      return true;
    };

    const reset_draft = () => {
      setDraft(empty_draft);
      setAdding(false);
      setEditingId(null);
    };

    const add_local = () => {
      if (!validate_draft()) return;
      setItems((prev) => [
        ...prev,
        {
          _localId: next_local_id(),
          nome: draft.nome.trim(),
          data_inicio: draft.data_inicio,
          data_termino: draft.data_termino,
          status: draft.status,
          responsavel: draft.responsavel.trim() || null,
          tipo_atividade: draft.tipo_atividade || null,
        },
      ]);
      reset_draft();
    };

    const update_local = (id: string) => {
      if (!validate_draft()) return;
      setItems((prev) => prev.map((a) => (a._localId === id ? {
        ...a,
        nome: draft.nome.trim(),
        data_inicio: draft.data_inicio,
        data_termino: draft.data_termino,
        status: draft.status,
        responsavel: draft.responsavel.trim() || null,
        tipo_atividade: draft.tipo_atividade || null,
      } : a)));
      reset_draft();
    };

    const start_edit = (a: LocalAtividade) => {
      setEditingId(a._localId);
      setAdding(false);
      setDraft({
        nome: a.nome,
        data_inicio: a.data_inicio,
        data_termino: a.data_termino,
        status: a.status,
        responsavel: a.responsavel || "",
        tipo_atividade: a.tipo_atividade || "",
      });
    };

    const remove_local = (id: string) => {
      setItems((prev) => prev.filter((a) => a._localId !== id));
    };

    const handle_save = () => {
      if (editingId) update_local(editingId);
      else add_local();
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Atividades</h3>
          </div>
          {!readOnly && !adding && !editingId && (
            <Button variant="outline" size="sm" onClick={() => { setAdding(true); setDraft(empty_draft); }}>
              <Plus className="mr-1 h-3 w-3" /> Nova atividade
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          As atividades adicionadas aqui serão criadas junto com a O.S. ao salvar.
        </p>

        {items.length === 0 && !adding ? (
          <p className="text-xs text-muted-foreground">Nenhuma atividade adicionada.</p>
        ) : (
          <div className="space-y-2">
            {items.map((a) =>
              editingId === a._localId ? (
                <AtividadeForm
                  key={a._localId}
                  draft={draft}
                  setDraft={setDraft}
                  tiposAtividade={tiposAtividade}
                  onSave={handle_save}
                  onCancel={reset_draft}
                  saveLabel="Salvar"
                />
              ) : (
                <div key={a._localId} className="rounded-md border bg-muted/30 px-3 py-2 text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{a.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.data_inicio} → {a.data_termino} · {a.status}
                        {a.tipo_atividade && <> · {a.tipo_atividade}</>}
                        {a.responsavel && <> · {a.responsavel}</>}
                      </p>
                    </div>
                    {!readOnly && (
                      <div className="flex gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => start_edit(a)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove_local(a._localId)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        )}

        {adding && (
          <AtividadeForm
            draft={draft}
            setDraft={setDraft}
            tiposAtividade={tiposAtividade}
            onSave={handle_save}
            onCancel={reset_draft}
            saveLabel="Adicionar"
          />
        )}
      </div>
    );
  },
);

AtividadesNovaOSSection.displayName = "AtividadesNovaOSSection";
export default AtividadesNovaOSSection;

function AtividadeForm({
  draft,
  setDraft,
  tiposAtividade,
  onSave,
  onCancel,
  saveLabel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  tiposAtividade: { id: string; nome: string }[];
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <div>
        <label className="text-xs text-muted-foreground">Nome *</label>
        <Input
          value={draft.nome}
          onChange={(e) => setDraft({ ...draft, nome: e.target.value })}
          placeholder="Ex: Instalação de split"
          className="h-8 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Início *</label>
          <Input type="date" value={draft.data_inicio} onChange={(e) => setDraft({ ...draft, data_inicio: e.target.value })} className="h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Término *</label>
          <Input type="date" value={draft.data_termino} onChange={(e) => setDraft({ ...draft, data_termino: e.target.value })} className="h-8 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_ATIVIDADE.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Tipo</label>
          <Select
            value={draft.tipo_atividade || "__none__"}
            onValueChange={(v) => setDraft({ ...draft, tipo_atividade: v === "__none__" ? "" : v })}
          >
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {tiposAtividade.map((t) => <SelectItem key={t.id} value={t.nome}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Responsável (texto livre)</label>
        <Input
          value={draft.responsavel}
          onChange={(e) => setDraft({ ...draft, responsavel: e.target.value })}
          placeholder="Opcional"
          className="h-8 text-sm"
        />
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
