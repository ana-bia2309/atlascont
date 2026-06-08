import { useState, useEffect, useCallback, useMemo } from "react";
import { usePermissions } from "@/hooks/use-permissions";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, RefreshCw, Eye, Search, X, Box, CheckCircle2, AlertTriangle, Wrench, Tags, Upload } from "@/lib/icons";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { logActivity } from "@/lib/activity-log";

type Bloco = { id: string; nome: string | null };

type Ativo = {
  id: string;
  nome: string;
  codigo_identificacao: string | null;
  categoria: string | null;
  bloco_id: string | null;
  andar: string | null;
  sala: string | null;
  sistema: string | null;
  marca: string | null;
  modelo: string | null;
  status: string;
  data_instalacao: string | null;
  observacoes: string | null;
  criado_em: string;
  tipo: string | null;
  numero_serie: string | null;
  patrimonio: string | null;
  grupo_equipamentos: string | null;
  corrente: number | null;
  capacidade_btu: number | null;
  tensao: number | null;
  potencia: number | null;
  responsavel_tecnico: string | null;
  grupo_areas: string | null;
  area_pavimento: string | null;
  identificacao_ambiente: string | null;
  tipo_atividade: string | null;
  area_climatizada: number | null;
  ocupantes_fixos: number | null;
  ocupantes_flutuantes: number | null;
  carga_termica: number | null;
};

const STATUS_OPTIONS = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "manutenção", label: "Manutenção" },
];

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

const emptyForm = {
  nome: "", codigo_identificacao: "", categoria: "", bloco_id: "",
  andar: "", sala: "", sistema: "", marca: "", modelo: "",
  status: "ativo", data_instalacao: "", observacoes: "",
  tipo: "", numero_serie: "", patrimonio: "", grupo_equipamentos: "",
  corrente: "", capacidade_btu: "", tensao: "", potencia: "",
  responsavel_tecnico: "",
  grupo_areas: "", area_pavimento: "", identificacao_ambiente: "", tipo_atividade: "",
  area_climatizada: "", ocupantes_fixos: "", ocupantes_flutuantes: "", carga_termica: "",
};

export default function Ativos() {
  const { can } = usePermissions();
  const [list, setList] = useState<Ativo[]>([]);
  const navigate = useNavigate();
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [blocosMap, setBlocosMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Ativo | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBloco, setFilterBloco] = useState("all");

  // Confirmação de exclusão
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteNome, setConfirmDeleteNome] = useState("");
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: profile }: any = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
    if (!profile?.company_id) { setLoading(false); return; }
    const companyId = profile.company_id;

    const [ativosRes, blocosRes] = await Promise.all([
      (supabase as any).from("ativos").select("*").eq("company_id", companyId).order("criado_em", { ascending: false }),
      (supabase as any).from("blocos").select("id, nome").eq("company_id", companyId).order("nome"),
    ]);

    if (ativosRes.error) {
      toast({ title: "Erro ao carregar ativos", description: ativosRes.error.message, variant: "destructive" });
    } else {
      setList((ativosRes.data as any[]) || []);
    }

    const bList = blocosRes.data || [];
    setBlocos(bList);
    const map: Record<string, string> = {};
    bList.forEach((b: any) => { map[b.id] = b.nome || ""; });
    setBlocosMap(map);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    if (!editing && !can("ativos.criar")) { toast({ title: "Sem permissão para criar", variant: "destructive" }); return; }
    if (editing && !can("ativos.editar")) { toast({ title: "Sem permissão para editar", variant: "destructive" }); return; }
    if (!form.nome.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }

    const payload: any = {
      nome: form.nome.trim(),
      codigo_identificacao: form.codigo_identificacao.trim() || null,
      categoria: form.categoria.trim() || null,
      bloco_id: form.bloco_id || null,
      andar: form.andar.trim() || null,
      sala: form.sala.trim() || null,
      sistema: form.sistema || null,
      marca: form.marca.trim() || null,
      modelo: form.modelo.trim() || null,
      status: form.status,
      data_instalacao: form.data_instalacao || null,
      observacoes: form.observacoes.trim() || null,
      tipo: form.tipo || null,
      numero_serie: form.numero_serie.trim() || null,
      patrimonio: form.patrimonio.trim() || null,
      grupo_equipamentos: form.grupo_equipamentos || null,
      corrente: form.corrente ? Number(form.corrente) : null,
      capacidade_btu: form.capacidade_btu ? Number(form.capacidade_btu) : null,
      tensao: form.tensao ? Number(form.tensao) : null,
      potencia: form.potencia ? Number(form.potencia) : null,
      responsavel_tecnico: form.responsavel_tecnico.trim() || null,
      grupo_areas: form.grupo_areas || null,
      area_pavimento: form.area_pavimento || null,
      identificacao_ambiente: form.identificacao_ambiente.trim() || null,
      tipo_atividade: form.tipo_atividade || null,
      area_climatizada: form.area_climatizada ? Number(form.area_climatizada) : null,
      ocupantes_fixos: form.ocupantes_fixos ? Number(form.ocupantes_fixos) : null,
      ocupantes_flutuantes: form.ocupantes_flutuantes ? Number(form.ocupantes_flutuantes) : null,
      carga_termica: form.carga_termica ? Number(form.carga_termica) : null,
    };

    if (editing) {
      const { error } = await (supabase.from("ativos" as any) as any).update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Ativo atualizado" });
      logActivity({ actionType: "edicao", module: "Ativos", description: `Editou ativo: ${form.nome}` });
    } else {
      if (form.codigo_identificacao.trim()) {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: prof }: any = await supabase.from("profiles").select("company_id").eq("user_id", user!.id).single();
        const { data: existing } = await (supabase.from("ativos" as any) as any)
          .select("id").eq("codigo_identificacao", form.codigo_identificacao.trim()).eq("company_id", prof.company_id).maybeSingle();
        if (existing?.id) {
          toast({ title: "Código já cadastrado", description: `O código "${form.codigo_identificacao.trim()}" já existe. Use um código diferente.`, variant: "destructive" });
          return;
        }
      }
      const { error } = await (supabase.from("ativos" as any) as any).insert(payload);
      if (error) { toast({ title: "Erro ao criar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Ativo cadastrado" });
      logActivity({ actionType: "criacao", module: "Ativos", description: `Cadastrou ativo: ${form.nome}` });
    }
    setOpen(false); setEditing(null); setForm(emptyForm); fetchData();
  };

  // Exclusão lógica — abre modal de confirmação
  const handleDelete = (id: string, nome: string) => {
    if (!can("ativos.excluir")) { toast({ title: "Sem permissão para excluir", variant: "destructive" }); return; }
    setConfirmDeleteId(id);
    setConfirmDeleteNome(nome);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      const { error } = await (supabase.from("ativos" as any) as any)
        .update({ status: "excluído" })
        .eq("id", confirmDeleteId);
      if (error) {
        toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Ativo excluído com sucesso" });
      logActivity({ actionType: "exclusao", module: "Ativos", description: `Excluiu ativo: ${confirmDeleteNome}` });
      setConfirmDeleteId(null);
      fetchData();
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (a: Ativo) => {
    setEditing(a);
    setForm({
      nome: a.nome, codigo_identificacao: a.codigo_identificacao || "",
      categoria: a.categoria || "", bloco_id: a.bloco_id || "",
      andar: a.andar || "", sala: a.sala || "", sistema: a.sistema || "",
      marca: a.marca || "", modelo: a.modelo || "", status: a.status,
      data_instalacao: a.data_instalacao || "", observacoes: a.observacoes || "",
      tipo: a.tipo || "", numero_serie: a.numero_serie || "",
      patrimonio: a.patrimonio || "", grupo_equipamentos: a.grupo_equipamentos || "",
      corrente: a.corrente?.toString() || "", capacidade_btu: a.capacidade_btu?.toString() || "",
      tensao: a.tensao?.toString() || "", potencia: a.potencia?.toString() || "",
      responsavel_tecnico: a.responsavel_tecnico || "", grupo_areas: a.grupo_areas || "",
      area_pavimento: a.area_pavimento || "", identificacao_ambiente: a.identificacao_ambiente || "",
      tipo_atividade: a.tipo_atividade || "", area_climatizada: a.area_climatizada?.toString() || "",
      ocupantes_fixos: a.ocupantes_fixos?.toString() || "", ocupantes_flutuantes: a.ocupantes_flutuantes?.toString() || "",
      carga_termica: a.carga_termica?.toString() || "",
    });
    setOpen(true);
  };

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };

  const filtered = useMemo(() => {
    return list.filter(a => {
      if (a.status === "excluído") return false;
      if (filterStatus !== "all" && a.status !== filterStatus) return false;
      if (filterBloco !== "all" && a.bloco_id !== filterBloco) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase();
        const match = [a.nome, a.codigo_identificacao, a.categoria, a.marca, a.modelo, a.sistema, a.patrimonio, a.numero_serie]
          .some(f => (f || "").toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [list, filterStatus, filterBloco, filterSearch]);

  const hasFilters = filterStatus !== "all" || filterBloco !== "all" || filterSearch.trim() !== "";
  const countByStatus = (s: string) => list.filter(a => a.status === s).length;

  const COLUMN_MAP: Record<string, string> = {
    "nome": "nome", "codigo": "codigo_identificacao", "tipo": "tipo", "sistema": "sistema",
    "grupo": "grupo_equipamentos", "marca": "marca", "modelo": "modelo",
    "numero_serie": "numero_serie", "patrimonio": "patrimonio", "bloco": "bloco_nome_import",
    "grupo_areas": "grupo_areas", "area_pavimento": "area_pavimento", "ambiente": "identificacao_ambiente",
    "tipo_atividade": "tipo_atividade", "corrente": "corrente", "capacidade": "capacidade_btu",
    "tensao": "tensao", "potencia": "potencia", "area_climatizada": "area_climatizada",
    "ocupantes_fixos": "ocupantes_fixos", "ocupantes_flutuantes": "ocupantes_flutuantes",
    "carga_termica": "carga_termica", "status": "status", "categoria": "categoria",
    "data_instalacao": "data_instalacao", "observacoes": "observacoes",
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      setImportPreview(rows.slice(0, 5) as any[]);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile }: any = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
      if (!profile?.company_id) return;
      const companyId = profile.company_id;

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as any[];
        let success = 0, errors = 0;

        for (const row of rows) {
          const payload: any = { company_id: companyId, status: "ativo" };
          for (const [col, val] of Object.entries(row)) {
            const normalizedCol = col.toLowerCase().trim().replace(/\s+/g, "_");
            const field = COLUMN_MAP[normalizedCol] || COLUMN_MAP[col.toLowerCase().trim()];
            if (field && field !== "bloco_nome_import" && val !== "") payload[field] = val;
            if (field === "bloco_nome_import" && val) {
              const found = blocos.find(b => b.nome?.toLowerCase() === String(val).toLowerCase());
              if (found) payload["bloco_id"] = found.id;
            }
          }
          if (!payload.nome) { errors++; continue; }

          const { data: existing } = await (supabase as any).from("ativos").select("id")
            .eq("codigo_identificacao", payload.codigo_identificacao).eq("company_id", companyId).maybeSingle();
          if (existing?.id) {
            const { error } = await (supabase as any).from("ativos").update(payload).eq("id", existing.id);
            if (error) errors++; else success++;
          } else {
            const { error } = await (supabase as any).from("ativos").insert(payload);
            if (error) errors++; else success++;
          }
        }

        toast({ title: "Importação concluída", description: `${success} importado(s), ${errors} erro(s).` });
        setImportOpen(false); setImportFile(null); setImportPreview([]);
        fetchData();
      };
      reader.readAsArrayBuffer(importFile);
    } finally {
      setImporting(false);
    }
  };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{children}</h3>
  );

  const FormSelect = ({ label, value, onChange, options, placeholder = "Selecione" }: {
    label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
  }) => (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <Select value={value} onValueChange={v => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Nenhum —</SelectItem>
          {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  const NumericInput = ({ label, value, onChange, placeholder, unit }: {
    label: string; value: string; onChange: (v: string) => void; placeholder?: string; unit?: string;
  }) => (
    <div>
      <label className="text-sm font-medium">{label}{unit && <span className="text-muted-foreground text-xs ml-1">({unit})</span>}</label>
      <Input type="number" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ativos</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5">
            <Upload className="h-4 w-4" /> Importar Excel
          </Button>
          <Button variant="outline" onClick={() => navigate("/ativos/etiquetas")} className="gap-1.5">
            <Tags className="h-4 w-4" /> Etiquetas
          </Button>
          <Button variant="outline" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
          <Dialog open={open} onOpenChange={setOpen}>
            {can("ativos.criar") && (
              <DialogTrigger asChild>
                <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo Ativo</Button>
              </DialogTrigger>
            )}
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar Ativo" : "Novo Ativo"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-5 pt-2">
                <div>
                  <SectionTitle>Identificação do Equipamento</SectionTitle>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Nome *</label>
                      <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Split, Fancoil, Chiller" />
                    </div>
                    <FormSelect label="Tipo" value={form.tipo} onChange={v => setForm(f => ({ ...f, tipo: v }))} options={TIPO_EQUIPAMENTO_OPTIONS} />
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <FormSelect label="Sistema" value={form.sistema} onChange={v => setForm(f => ({ ...f, sistema: v }))} options={SISTEMA_OPTIONS} />
                    <FormSelect label="Grupo de Equipamentos" value={form.grupo_equipamentos} onChange={v => setForm(f => ({ ...f, grupo_equipamentos: v }))} options={GRUPO_EQUIPAMENTOS_OPTIONS} />
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <label className="text-sm font-medium">Marca</label>
                      <Input value={form.marca} onChange={e => setForm(f => ({ ...f, marca: e.target.value }))} placeholder="Ex: Carrier" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Modelo</label>
                      <Input value={form.modelo} onChange={e => setForm(f => ({ ...f, modelo: e.target.value }))} placeholder="Ex: 42LUQA012515LC" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <label className="text-sm font-medium">Número de Série</label>
                      <Input value={form.numero_serie} onChange={e => setForm(f => ({ ...f, numero_serie: e.target.value }))} placeholder="S/N" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Patrimônio</label>
                      <Input value={form.patrimonio} onChange={e => setForm(f => ({ ...f, patrimonio: e.target.value }))} placeholder="Nº patrimônio" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="text-sm font-medium">Código de Identificação</label>
                    <Input value={form.codigo_identificacao} onChange={e => setForm(f => ({ ...f, codigo_identificacao: e.target.value }))} placeholder="Ex: EQ-001" />
                  </div>
                </div>
                <div className="border-t" />
                <div>
                  <SectionTitle>Dados Técnicos</SectionTitle>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <NumericInput label="Corrente" value={form.corrente} onChange={v => setForm(f => ({ ...f, corrente: v }))} placeholder="0" unit="A" />
                    <NumericInput label="Capacidade" value={form.capacidade_btu} onChange={v => setForm(f => ({ ...f, capacidade_btu: v }))} placeholder="0" unit="BTU/h" />
                    <NumericInput label="Tensão" value={form.tensao} onChange={v => setForm(f => ({ ...f, tensao: v }))} placeholder="0" unit="V" />
                    <NumericInput label="Potência" value={form.potencia} onChange={v => setForm(f => ({ ...f, potencia: v }))} placeholder="0" unit="W" />
                  </div>
                </div>
                <div className="border-t" />
                <div>
                  <SectionTitle>Localização</SectionTitle>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Unidade de Manutenção (Bloco)</label>
                      <Select value={form.bloco_id} onValueChange={v => setForm(f => ({ ...f, bloco_id: v === "__none__" ? "" : v }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Nenhum —</SelectItem>
                          {blocos.map(b => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <FormSelect label="Grupo de Áreas" value={form.grupo_areas} onChange={v => setForm(f => ({ ...f, grupo_areas: v }))} options={["Ala Norte", "Ala Sul", "Ala Leste", "Ala Oeste", "Ala A", "Ala B", "Ala C", "Bloco Principal", "Anexo", "Outro"]} />
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <FormSelect label="Área / Pavimento" value={form.area_pavimento} onChange={v => setForm(f => ({ ...f, area_pavimento: v }))} options={["Subsolo", "Térreo", "1º Pavimento", "2º Pavimento", "3º Pavimento", "4º Pavimento", "5º Pavimento", "Cobertura", "Garagem", "Outro"]} />
                    <div>
                      <label className="text-sm font-medium">Identificação do Ambiente</label>
                      <Input value={form.identificacao_ambiente} onChange={e => setForm(f => ({ ...f, identificacao_ambiente: e.target.value }))} placeholder="Ex: Sala 301, Copa, CPD" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <FormSelect label="Tipo de Atividade" value={form.tipo_atividade} onChange={v => setForm(f => ({ ...f, tipo_atividade: v }))} options={TIPO_ATIVIDADE_OPTIONS} />
                  </div>
                </div>
                <div className="border-t" />
                <div>
                  <SectionTitle>Dados Operacionais</SectionTitle>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <NumericInput label="Área Climatizada" value={form.area_climatizada} onChange={v => setForm(f => ({ ...f, area_climatizada: v }))} placeholder="0" unit="m²" />
                    <NumericInput label="Ocupantes Fixos" value={form.ocupantes_fixos} onChange={v => setForm(f => ({ ...f, ocupantes_fixos: v }))} placeholder="0" />
                    <NumericInput label="Ocupantes Flutuantes" value={form.ocupantes_flutuantes} onChange={v => setForm(f => ({ ...f, ocupantes_flutuantes: v }))} placeholder="0" />
                    <NumericInput label="Carga Térmica" value={form.carga_termica} onChange={v => setForm(f => ({ ...f, carga_termica: v }))} placeholder="0" unit="BTU/h" />
                  </div>
                </div>
                <div className="border-t" />
                <div>
                  <SectionTitle>Responsabilidade e Datas</SectionTitle>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Responsável Técnico</label>
                      <Input value={form.responsavel_tecnico} onChange={e => setForm(f => ({ ...f, responsavel_tecnico: e.target.value }))} placeholder="Nome do responsável" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Data de Instalação</label>
                      <Input type="date" value={form.data_instalacao} onChange={e => setForm(f => ({ ...f, data_instalacao: e.target.value }))} />
                    </div>
                  </div>
                </div>
                <div className="border-t" />
                <div>
                  <SectionTitle>Informações Adicionais</SectionTitle>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Status</label>
                      <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Categoria</label>
                      <Input value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} placeholder="Ex: Climatização" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="text-sm font-medium">Observações</label>
                    <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={3} placeholder="Informações adicionais..." />
                  </div>
                </div>
                <Button className="w-full" onClick={handleSave}>{editing ? "Salvar Alterações" : "Cadastrar Ativo"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
            <Box className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent><span className="text-2xl font-bold">{list.filter(a => a.status !== "excluído").length}</span></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ativos</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent><span className="text-2xl font-bold">{countByStatus("ativo")}</span></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Em Manutenção</CardTitle>
            <Wrench className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent><span className="text-2xl font-bold">{countByStatus("manutenção")}</span></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inativos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-zinc-600" />
          </CardHeader>
          <CardContent><span className="text-2xl font-bold">{countByStatus("inativo")}</span></CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Buscar</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Nome, código, marca, patrimônio..." className="pl-9" />
          </div>
        </div>
        <div className="min-w-[140px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Bloco</label>
          <Select value={filterBloco} onValueChange={setFilterBloco}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {blocos.map(b => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterSearch(""); setFilterStatus("all"); setFilterBloco("all"); }}>
            <X className="mr-1 h-3 w-3" /> Limpar
          </Button>
        )}
        <span className="text-sm text-muted-foreground ml-auto">{filtered.length} ativo(s)</span>
      </div>

      {/* Tabela */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Localização</TableHead>
              <TableHead>Sistema</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum ativo encontrado</TableCell></TableRow>
            ) : filtered.map(a => (
              <TableRow key={a.id}>
                <TableCell className="font-mono text-sm font-semibold">{a.codigo_identificacao || "—"}</TableCell>
                <TableCell className="font-medium">{a.nome}</TableCell>
                <TableCell className="text-sm">
                  {[a.bloco_id ? blocosMap[a.bloco_id] : null, a.area_pavimento || a.andar, a.identificacao_ambiente || (a.sala ? `Sala ${a.sala}` : null)].filter(Boolean).join(", ") || "—"}
                </TableCell>
                <TableCell className="text-sm">{a.sistema || "—"}</TableCell>
                <TableCell>
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border",
                    a.status === "ativo" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                    a.status === "manutenção" && "bg-yellow-50 text-yellow-700 border-yellow-200",
                    a.status === "inativo" && "bg-zinc-100 text-zinc-600 border-zinc-200",
                  )}>
                    {STATUS_OPTIONS.find(s => s.value === a.status)?.label || a.status}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => navigate(`/ativos/${a.id}`)} title="Ver"><Eye className="h-4 w-4" /></Button>
                    {can("ativos.editar") && <Button variant="ghost" size="icon" onClick={() => openEdit(a)} title="Editar"><Pencil className="h-4 w-4" /></Button>}
                    {can("ativos.excluir") && <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id, a.nome)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dialog Importar Excel */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Importar Ativos via Excel</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <p className="text-sm font-medium">Passo 1 — Baixe o modelo</p>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                const headers = ["nome","codigo","tipo","sistema","grupo","marca","modelo","numero_serie","patrimonio","bloco","grupo_areas","area_pavimento","ambiente","tipo_atividade","corrente","capacidade","tensao","potencia","area_climatizada","ocupantes_fixos","ocupantes_flutuantes","carga_termica","status","categoria","data_instalacao","observacoes"];
                const exemplo = ["Split Hi-Wall","EQ-001","Hi-wall","Ar-condicionado","Climatização","Carrier","42LUQA012515LC","S/N123","PAT001","Bloco K","Ala Sul","2º Pavimento","Sala 280","Escritório","5.5","12000","220","1500","30","10","5","15000","ativo","Climatização","2024-01-15","Exemplo"];
                const ws = XLSX.utils.aoa_to_sheet([headers, exemplo]);
                ws["!cols"] = headers.map(h => ({ wch: Math.max(h.length + 4, 16) }));
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Ativos");
                XLSX.writeFile(wb, "modelo_ativos.xlsx");
              }}>
                <Upload className="h-4 w-4" /> Baixar modelo (.xlsx)
              </Button>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <p className="text-sm font-medium">Passo 2 — Importe a planilha preenchida</p>
              <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
            </div>
            {importPreview.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Prévia ({importPreview.length} linhas):</p>
                <div className="rounded-md border overflow-auto max-h-[200px]">
                  <table className="text-xs w-full">
                    <thead><tr className="bg-muted">{Object.keys(importPreview[0]).map(col => <th key={col} className="px-2 py-1 text-left font-medium border-b">{col}</th>)}</tr></thead>
                    <tbody>{importPreview.map((row, i) => <tr key={i} className="border-b">{Object.values(row).map((val: any, j) => <td key={j} className="px-2 py-1">{String(val)}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setImportOpen(false); setImportFile(null); setImportPreview([]); }}>Cancelar</Button>
              <Button onClick={handleImport} disabled={!importFile || importing}>
                <Upload className="h-4 w-4 mr-2" />{importing ? "Importando..." : "Importar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Confirmar Exclusão */}
      <Dialog open={!!confirmDeleteId} onOpenChange={o => { if (!o) setConfirmDeleteId(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir o ativo <strong>{confirmDeleteNome}</strong>?
            </p>
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              ⚠️ O ativo possui registros históricos vinculados. Ele será <strong>inativado</strong> e não aparecerá mais nas listagens, mas todo histórico será preservado.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}