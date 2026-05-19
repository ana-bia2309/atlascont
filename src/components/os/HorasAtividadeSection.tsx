import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Clock, Plus, Pencil, Trash2 } from "@/lib/icons";
import { format } from "date-fns";

type HoraRegistro = {
  id: string;
  atividade_id: string;
  os_id: string;
  user_id: string;
  data_registro: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  total_minutos: number;
  descricao: string | null;
  origem: string;
  created_at: string;
};

type Props = {
  atividadeId: string;
  osId: string;
  readOnly?: boolean;
};

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h ${min.toString().padStart(2, "0")}min`;
}

function timeDiffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

export default function HorasAtividadeSection({ atividadeId, osId, readOnly = false }: Props) {
  const { session } = useAuth();
  const [registros, setRegistros] = useState<HoraRegistro[]>([]);
  const [loading, setLoading] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // form
  const [modo, setModo] = useState<"periodo" | "direto">("direto");
  const [dataRegistro, setDataRegistro] = useState(format(new Date(), "yyyy-MM-dd"));
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFim, setHoraFim] = useState("");
  const [totalMinutos, setTotalMinutos] = useState("");
  const [descricao, setDescricao] = useState("");

  // get profile id
  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from("profiles")
      .select("id")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfileId(data.id);
      });
  }, [session?.user?.id]);

  const fetchRegistros = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("horas_atividade")
      .select("*")
      .eq("atividade_id", atividadeId)
      .order("data_registro", { ascending: false })
      .order("created_at", { ascending: false });
    if (data) setRegistros(data as HoraRegistro[]);
    setLoading(false);
  }, [atividadeId]);

  useEffect(() => { fetchRegistros(); }, [fetchRegistros]);

  useEffect(() => {
    const channel = supabase
      .channel(`horas_atividade_${atividadeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "horas_atividade", filter: `atividade_id=eq.${atividadeId}` }, () => {
        fetchRegistros();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [atividadeId, fetchRegistros]);

  const totalGeral = registros.reduce((s, r) => s + r.total_minutos, 0);

  const resetForm = () => {
    setEditingId(null);
    setModo("direto");
    setDataRegistro(format(new Date(), "yyyy-MM-dd"));
    setHoraInicio("");
    setHoraFim("");
    setTotalMinutos("");
    setDescricao("");
    setShowDialog(false);
  };

  const openNew = () => {
    resetForm();
    setShowDialog(true);
  };

  const openEdit = (r: HoraRegistro) => {
    setEditingId(r.id);
    setDataRegistro(r.data_registro);
    setDescricao(r.descricao || "");
    if (r.hora_inicio && r.hora_fim) {
      setModo("periodo");
      setHoraInicio(r.hora_inicio.slice(0, 5));
      setHoraFim(r.hora_fim.slice(0, 5));
      setTotalMinutos("");
    } else {
      setModo("direto");
      setTotalMinutos(String(r.total_minutos));
      setHoraInicio("");
      setHoraFim("");
    }
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!profileId) {
      toast({ title: "Usuário não identificado", variant: "destructive" });
      return;
    }

    let mins = 0;
    if (modo === "periodo") {
      if (!horaInicio || !horaFim) {
        toast({ title: "Informe hora de início e fim", variant: "destructive" });
        return;
      }
      mins = timeDiffMinutes(horaInicio, horaFim);
      if (mins <= 0) {
        toast({ title: "Hora fim deve ser maior que hora início", variant: "destructive" });
        return;
      }
    } else {
      mins = parseInt(totalMinutos) || 0;
      if (mins <= 0) {
        toast({ title: "Informe um total de minutos válido", variant: "destructive" });
        return;
      }
    }

    const payload = {
      tipo: "Corretiva",
      atividade_id: atividadeId,
      os_id: osId,
      user_id: profileId,
      data_registro: dataRegistro,
      hora_inicio: modo === "periodo" ? horaInicio : null,
      hora_fim: modo === "periodo" ? horaFim : null,
      total_minutos: mins,
      descricao: descricao.trim() || null,
      origem: "manual",
    };

    if (editingId) {
      const { error } = await supabase
        .from("horas_atividade")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        toast({ title: "Erro ao atualizar registro", variant: "destructive" });
        return;
      }
      toast({ title: "Registro atualizado" });
    } else {
      const { error } = await supabase
        .from("horas_atividade")
        .insert(payload);
      if (error) {
        toast({ title: "Erro ao registrar horas", variant: "destructive" });
        return;
      }
      toast({ title: "Horas registradas" });
    }
    resetForm();
    fetchRegistros();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("horas_atividade").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir registro", variant: "destructive" });
      return;
    }
    toast({ title: "Registro excluído" });
    fetchRegistros();
  };

  const fmtDate = (d: string) => {
    try { return format(new Date(d + "T00:00:00"), "dd/MM/yyyy"); } catch { return d; }
  };

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> Horas Trabalhadas
          {totalGeral > 0 && (
            <span className="ml-1 text-primary font-bold">({formatMinutes(totalGeral)})</span>
          )}
        </h5>
        {!readOnly && (
          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={openNew}>
            <Plus className="h-3 w-3 mr-1" /> Registrar
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : registros.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum registro de horas.</p>
      ) : (
        <div className="space-y-1">
          {registros.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded border px-2 py-1.5 text-xs">
              <div className="flex-1 min-w-0">
                <span className="font-medium">{formatMinutes(r.total_minutos)}</span>
                <span className="text-muted-foreground ml-2">{fmtDate(r.data_registro)}</span>
                {r.hora_inicio && r.hora_fim && (
                  <span className="text-muted-foreground ml-1">
                    ({r.hora_inicio.slice(0, 5)} → {r.hora_fim.slice(0, 5)})
                  </span>
                )}
                {r.descricao && (
                  <span className="text-muted-foreground ml-2 truncate">— {r.descricao}</span>
                )}
              </div>
              {!readOnly && (
                <div className="flex gap-1 ml-2 shrink-0">
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => openEdit(r)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleDelete(r.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={(o) => { if (!o) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Registro de Horas" : "Registrar Horas"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Modo de registro</label>
              <Select value={modo} onValueChange={(v) => setModo(v as "periodo" | "direto")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="direto">Informar total de minutos</SelectItem>
                  <SelectItem value="periodo">Informar hora início e fim</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block">Data *</label>
              <Input type="date" value={dataRegistro} onChange={(e) => setDataRegistro(e.target.value)} />
            </div>

            {modo === "periodo" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block">Hora início *</label>
                  <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Hora fim *</label>
                  <Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium mb-1 block">Total de minutos *</label>
                <Input
                  type="number"
                  min="1"
                  value={totalMinutos}
                  onChange={(e) => setTotalMinutos(e.target.value)}
                  placeholder="Ex: 120 (para 2h)"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-medium mb-1 block">Descrição do trabalho</label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Opcional: descreva o trabalho executado"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={resetForm}>Cancelar</Button>
            <Button onClick={handleSave}>{editingId ? "Atualizar" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
