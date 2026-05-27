import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Plus, X } from "@/lib/icons";

const SISTEMA_OPTIONS = [
  "Ar-condicionado", "Bombeamento hidráulico", "Bebedouro", "Elétrico",
  "Hidrossanitário", "Incêndio", "Elevador", "Gerador", "CFTV",
  "Controle de acesso", "Outro",
];
const TIPO_EQUIPAMENTO_OPTIONS = [
  "Hi-wall", "Piso-teto", "Cassete", "Duto", "VRF", "Fancoil",
  "Chiller", "Bomba", "Quadro elétrico", "Outro",
];
const GRUPO_EQUIPAMENTOS_OPTIONS = [
  "Climatização", "Elétrica", "Hidráulica", "Segurança", "Elevação", "TI", "Outro",
];
const TIPO_ATIVIDADE_OPTIONS = [
  "Escritório", "Área técnica", "Sala de reunião", "Auditório",
  "Copa/Cozinha", "Banheiro", "Garagem", "Recepção", "CPD/Data center", "Outro",
];
const UNIDADE_OPTIONS = [
  "Subsolo", "Térreo", "1º Pavimento", "2º Pavimento", "3º Pavimento",
  "4º Pavimento", "5º Pavimento", "Cobertura", "Garagem", "Outro",
];

type Bloco = { id: string; nome: string | null };
type AtivoOption = { id: string; nome: string; codigo_identificacao: string | null; area_pavimento: string | null; identificacao_ambiente: string | null };

interface AtivoQuickModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (ativoId: string, ativoNome: string) => void;
  companyId: string | null;
}

const emptyForm = {
  nome: "", codigo_identificacao: "", tipo: "", sistema: "", grupo_equipamentos: "",
  marca: "", modelo: "", numero_serie: "", patrimonio: "",
  bloco_id: "", grupo_areas: "", area_pavimento: "", identificacao_ambiente: "", tipo_atividade: "",
  corrente: "", capacidade_btu: "", tensao: "", potencia: "",
  area_climatizada: "", ocupantes_fixos: "", ocupantes_flutuantes: "", carga_termica: "",
  responsavel_tecnico: "", data_instalacao: "", observacoes: "", categoria: "", status: "ativo",
};

export default function AtivoQuickModal({ open, onClose, onSelect, companyId }: AtivoQuickModalProps) {
  const [mode, setMode] = useState<"choose" | "search" | "create">("choose");
  const [ativos, setAtivos] = useState<AtivoOption[]>([]);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [busca, setBusca] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const fetchAtivos = useCallback(async () => {
    if (!companyId) return;
    const [ativosRes, blocosRes] = await Promise.all([
      (supabase as any).from("ativos").select("id, nome, codigo_identificacao, area_pavimento, identificacao_ambiente").eq("company_id", companyId).eq("status", "ativo").order("nome"),
      (supabase as any).from("blocos").select("id, nome").eq("company_id", companyId).order("nome"),
    ]);
    setAtivos(ativosRes.data || []);
    setBlocos(blocosRes.data || []);
  }, [companyId]);

  useEffect(() => { if (open) { fetchAtivos(); setMode("choose"); setBusca(""); setForm(emptyForm); } }, [open, fetchAtivos]);

  const filtrados = ativos.filter(a => {
    const q = busca.toLowerCase();
    return (
      a.nome.toLowerCase().includes(q) ||
      (a.codigo_identificacao || "").toLowerCase().includes(q) ||
      (a.area_pavimento || "").toLowerCase().includes(q) ||
      (a.identificacao_ambiente || "").toLowerCase().includes(q)
    );
  });

  const handleCreate = async () => {
    if (!form.nome.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    if (!companyId) return;
    setSaving(true);
    try {
      const payload: any = {
        company_id: companyId,
        nome: form.nome.trim(),
        codigo_identificacao: form.codigo_identificacao.trim() || null,
        tipo: form.tipo || null,
        sistema: form.sistema || null,
        grupo_equipamentos: form.grupo_equipamentos || null,
        marca: form.marca.trim() || null,
        modelo: form.modelo.trim() || null,
        numero_serie: form.numero_serie.trim() || null,
        patrimonio: form.patrimonio.trim() || null,
        bloco_id: form.bloco_id || null,
        grupo_areas: form.grupo_areas || null,
        area_pavimento: form.area_pavimento || null,
        identificacao_ambiente: form.identificacao_ambiente.trim() || null,
        tipo_atividade: form.tipo_atividade || null,
        corrente: form.corrente ? Number(form.corrente) : null,
        capacidade_btu: form.capacidade_btu ? Number(form.capacidade_btu) : null,
        tensao: form.tensao ? Number(form.tensao) : null,
        potencia: form.potencia ? Number(form.potencia) : null,
        area_climatizada: form.area_climatizada ? Number(form.area_climatizada) : null,
        ocupantes_fixos: form.ocupantes_fixos ? Number(form.ocupantes_fixos) : null,
        ocupantes_flutuantes: form.ocupantes_flutuantes ? Number(form.ocupantes_flutuantes) : null,
        carga_termica: form.carga_termica ? Number(form.carga_termica) : null,
        responsavel_tecnico: form.responsavel_tecnico.trim() || null,
        data_instalacao: form.data_instalacao || null,
        observacoes: form.observacoes.trim() || null,
        categoria: form.categoria.trim() || null,
        status: form.status,
      };
      const { data, error } = await (supabase as any).from("ativos").insert(payload).select("id, nome").single();
      if (error) throw error;
      toast({ title: "Ativo cadastrado e vinculado!" });
      onSelect(data.id, data.nome);
      onClose();
    } catch (e: any) {
      toast({ title: "Erro ao cadastrar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const F = ({ label, value, onChange, placeholder, disabled }: any) => (
    <div>
      <label className="text-xs font-medium mb-1 block">{label}</label>
      <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} className="h-8 text-sm" />
    </div>
  );

  const S = ({ label, value, onChange, options }: any) => (
    <div>
      <label className="text-xs font-medium mb-1 block">{label}</label>
      <Select value={value || "__none__"} onValueChange={v => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Nenhum —</SelectItem>
          {options.map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  const N = ({ label, value, onChange, unit }: any) => (
    <div>
      <label className="text-xs font-medium mb-1 block">{label}{unit && <span className="text-muted-foreground ml-1">({unit})</span>}</label>
      <Input type="number" value={value} onChange={e => onChange(e.target.value)} className="h-8 text-sm" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ativo Vinculado</DialogTitle>
        </DialogHeader>

        {mode === "choose" && (
          <div className="grid grid-cols-2 gap-4 py-4">
            <button
              onClick={() => setMode("search")}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary/40 p-8 hover:bg-primary/5 transition-colors"
            >
              <Search className="h-8 w-8 text-primary" />
              <div className="text-center">
                <p className="font-semibold">Adicionar ativo existente</p>
                <p className="text-xs text-muted-foreground mt-1">Buscar na lista de ativos cadastrados</p>
              </div>
            </button>
            <button
              onClick={() => setMode("create")}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-emerald-400/60 p-8 hover:bg-emerald-50 transition-colors"
            >
              <Plus className="h-8 w-8 text-emerald-600" />
              <div className="text-center">
                <p className="font-semibold">Cadastrar novo ativo</p>
                <p className="text-xs text-muted-foreground mt-1">Criar e vincular automaticamente</p>
              </div>
            </button>
          </div>
        )}

        {mode === "search" && (
          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por nome, código ou localização..."
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="max-h-[400px] overflow-y-auto space-y-1">
              {filtrados.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">Nenhum ativo encontrado</p>
              ) : filtrados.map(a => (
                <button
                  key={a.id}
                  onClick={() => { onSelect(a.id, a.nome); onClose(); }}
                  className="w-full text-left rounded-lg border p-3 hover:bg-accent transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{a.nome}</span>
                    {a.codigo_identificacao && <span className="font-mono text-xs text-muted-foreground">{a.codigo_identificacao}</span>}
                  </div>
                  {(a.area_pavimento || a.identificacao_ambiente) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[a.area_pavimento, a.identificacao_ambiente].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setMode("choose")}>
              <X className="h-3 w-3 mr-1" /> Voltar
            </Button>
          </div>
        )}

        {mode === "create" && (
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground bg-muted/30 rounded-md p-2">
              O ativo será cadastrado e vinculado automaticamente à O.S.
            </p>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identificação</p>
              <div className="grid grid-cols-2 gap-3">
                <F label="Nome *" value={form.nome} onChange={(v: string) => setForm(f => ({ ...f, nome: v }))} placeholder="Ex: Split Hi-Wall" />
                <F label="Código" value={form.codigo_identificacao} onChange={(v: string) => setForm(f => ({ ...f, codigo_identificacao: v }))} placeholder="Ex: EQ-001" />
                <S label="Tipo" value={form.tipo} onChange={(v: string) => setForm(f => ({ ...f, tipo: v }))} options={TIPO_EQUIPAMENTO_OPTIONS} />
                <S label="Sistema" value={form.sistema} onChange={(v: string) => setForm(f => ({ ...f, sistema: v }))} options={SISTEMA_OPTIONS} />
                <S label="Grupo" value={form.grupo_equipamentos} onChange={(v: string) => setForm(f => ({ ...f, grupo_equipamentos: v }))} options={GRUPO_EQUIPAMENTOS_OPTIONS} />
                <F label="Marca" value={form.marca} onChange={(v: string) => setForm(f => ({ ...f, marca: v }))} placeholder="Ex: Carrier" />
                <F label="Modelo" value={form.modelo} onChange={(v: string) => setForm(f => ({ ...f, modelo: v }))} placeholder="Ex: 42LUQA" />
                <F label="Nº Série" value={form.numero_serie} onChange={(v: string) => setForm(f => ({ ...f, numero_serie: v }))} placeholder="S/N" />
                <F label="Patrimônio" value={form.patrimonio} onChange={(v: string) => setForm(f => ({ ...f, patrimonio: v }))} placeholder="Nº patrimônio" />
              </div>
            </div>

            <div className="space-y-3 border-t pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Localização</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block">Unidade (Bloco)</label>
                  <Select value={form.bloco_id || "__none__"} onValueChange={v => setForm(f => ({ ...f, bloco_id: v === "__none__" ? "" : v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Nenhum —</SelectItem>
                      {blocos.map(b => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <S label="Grupo de Áreas" value={form.grupo_areas} onChange={(v: string) => setForm(f => ({ ...f, grupo_areas: v }))} options={["Ala Norte", "Ala Sul", "Ala Leste", "Ala Oeste", "Ala A", "Ala B", "Ala C", "Bloco Principal", "Anexo", "Outro"]} />
                <S label="Área / Pavimento" value={form.area_pavimento} onChange={(v: string) => setForm(f => ({ ...f, area_pavimento: v }))} options={UNIDADE_OPTIONS} />
                <F label="Identificação do Ambiente" value={form.identificacao_ambiente} onChange={(v: string) => setForm(f => ({ ...f, identificacao_ambiente: v }))} placeholder="Ex: Sala 301" />
                <S label="Tipo de Atividade" value={form.tipo_atividade} onChange={(v: string) => setForm(f => ({ ...f, tipo_atividade: v }))} options={TIPO_ATIVIDADE_OPTIONS} />
              </div>
            </div>

            <div className="space-y-3 border-t pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dados Técnicos</p>
              <div className="grid grid-cols-4 gap-3">
                <N label="Corrente" unit="A" value={form.corrente} onChange={(v: string) => setForm(f => ({ ...f, corrente: v }))} />
                <N label="Capacidade" unit="BTU/h" value={form.capacidade_btu} onChange={(v: string) => setForm(f => ({ ...f, capacidade_btu: v }))} />
                <N label="Tensão" unit="V" value={form.tensao} onChange={(v: string) => setForm(f => ({ ...f, tensao: v }))} />
                <N label="Potência" unit="W" value={form.potencia} onChange={(v: string) => setForm(f => ({ ...f, potencia: v }))} />
              </div>
            </div>

            <div className="space-y-3 border-t pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dados Operacionais</p>
              <div className="grid grid-cols-4 gap-3">
                <N label="Área Climatizada" unit="m²" value={form.area_climatizada} onChange={(v: string) => setForm(f => ({ ...f, area_climatizada: v }))} />
                <N label="Ocup. Fixos" value={form.ocupantes_fixos} onChange={(v: string) => setForm(f => ({ ...f, ocupantes_fixos: v }))} />
                <N label="Ocup. Flutuantes" value={form.ocupantes_flutuantes} onChange={(v: string) => setForm(f => ({ ...f, ocupantes_flutuantes: v }))} />
                <N label="Carga Térmica" unit="BTU/h" value={form.carga_termica} onChange={(v: string) => setForm(f => ({ ...f, carga_termica: v }))} />
              </div>
            </div>

            <div className="space-y-3 border-t pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Informações Adicionais</p>
              <div className="grid grid-cols-2 gap-3">
                <F label="Responsável Técnico" value={form.responsavel_tecnico} onChange={(v: string) => setForm(f => ({ ...f, responsavel_tecnico: v }))} placeholder="Nome" />
                <div>
                  <label className="text-xs font-medium mb-1 block">Data de Instalação</label>
                  <Input type="date" value={form.data_instalacao} onChange={e => setForm(f => ({ ...f, data_instalacao: e.target.value }))} className="h-8 text-sm" />
                </div>
                <F label="Categoria" value={form.categoria} onChange={(v: string) => setForm(f => ({ ...f, categoria: v }))} placeholder="Ex: Climatização" />
                <div>
                  <label className="text-xs font-medium mb-1 block">Status</label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Observações</label>
                <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} className="text-sm" />
              </div>
            </div>

            <div className="flex justify-between pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={() => setMode("choose")}>
                <X className="h-3 w-3 mr-1" /> Voltar
              </Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? "Cadastrando..." : "Cadastrar e Vincular"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}