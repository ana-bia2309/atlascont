import {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";

import { supabase } from "@/integrations/supabase/client";

import { toast } from "@/hooks/use-toast";
import { useRealtime } from "@/hooks/use-realtime";
import { usePermissions } from "@/hooks/use-permissions";
import { useCompany } from "@/hooks/use-company";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

// ============================================================
// Tipos
// ============================================================

type Bloco = {
  id: string;
  nome: string;
  descricao?: string | null;
  company_id?: string;

  status: "Ativo" | "Inativo";
  codigo: string | null;
  situacao_imovel: string | null;
  classificacao: string | null;
  documento: string | null;
  inscricao_estadual: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  cep: string | null;
  pais: string | null;
  estado: string | null;
  cidade: string | null;
  endereco: string | null;

  resp_classificacao: string | null;
  resp_tipo: string | null;
  resp_razao_social: string | null;
  resp_documento: string | null;
  resp_telefone: string | null;
  resp_celular: string | null;
  resp_cep: string | null;
  resp_pais: string | null;
  resp_estado: string | null;
  resp_cidade: string | null;
  resp_endereco: string | null;
};

type FormState = {
  nome: string;
  status: "Ativo" | "Inativo";
  codigo: string;
  situacao_imovel: string;
  classificacao: string;
  documento: string;
  inscricao_estadual: string;
  razao_social: string;
  nome_fantasia: string;
  cep: string;
  pais: string;
  estado: string;
  cidade: string;
  endereco: string;

  resp_classificacao: string;
  resp_tipo: string;
  resp_razao_social: string;
  resp_documento: string;
  resp_telefone: string;
  resp_celular: string;
  resp_cep: string;
  resp_pais: string;
  resp_estado: string;
  resp_cidade: string;
  resp_endereco: string;
};

const EMPTY_FORM: FormState = {
  nome: "",
  status: "Ativo",
  codigo: "",
  situacao_imovel: "",
  classificacao: "",
  documento: "",
  inscricao_estadual: "",
  razao_social: "",
  nome_fantasia: "",
  cep: "",
  pais: "Brasil",
  estado: "",
  cidade: "",
  endereco: "",

  resp_classificacao: "",
  resp_tipo: "",
  resp_razao_social: "",
  resp_documento: "",
  resp_telefone: "",
  resp_celular: "",
  resp_cep: "",
  resp_pais: "Brasil",
  resp_estado: "",
  resp_cidade: "",
  resp_endereco: "",
};

const UF_OPTIONS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

// ============================================================
// Máscaras e validações (sem dependência externa)
// ============================================================

const onlyDigits = (v: string) => v.replace(/\D/g, "");

function maskCPF(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function maskCNPJ(v: string) {
  const d = onlyDigits(v).slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function maskDocumento(v: string, classificacao: string) {
  return classificacao === "Jurídica" ? maskCNPJ(v) : maskCPF(v);
}

function maskCEP(v: string) {
  const d = onlyDigits(v).slice(0, 8);
  return d.replace(/(\d{5})(\d{1,3})$/, "$1-$2");
}

function maskTelefone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return d
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

function isValidCPF(cpfRaw: string) {
  const cpf = onlyDigits(cpfRaw);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(cpf[10]);
}

function isValidCNPJ(cnpjRaw: string) {
  const cnpj = onlyDigits(cnpjRaw);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base: string) => {
    const weights = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base
      .split("")
      .reduce((acc, digit, idx) => acc + parseInt(digit) * weights[idx], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = calc(cnpj.slice(0, 12));
  const d2 = calc(cnpj.slice(0, 12) + d1);
  return cnpj.slice(12) === `${d1}${d2}`;
}

function isValidDocumento(doc: string, classificacao: string) {
  if (!doc.trim()) return true; // não obrigatório
  return classificacao === "Jurídica" ? isValidCNPJ(doc) : isValidCPF(doc);
}

// ============================================================
// Componente
// ============================================================

export default function Blocos() {
  const { companyId } = useCompany();
  const { can } = usePermissions();

  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingBloco, setEditingBloco] = useState<Bloco | null>(null);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setField = (field: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const fetchBlocos = useCallback(async () => {
    if (!companyId) return;

    setLoading(true);

    const { data, error } = await (supabase as any)
      .from("blocos")
      .select("*")
      .eq("company_id", companyId)
      .order("nome");

    if (error) {
      toast({
        title: "Erro ao carregar unidades",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setBlocos(data || []);
    }

    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    fetchBlocos();
  }, [fetchBlocos]);

  useRealtime(["blocos" as any], fetchBlocos, companyId);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setEditingBloco(null);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!form.nome.trim()) errs.nome = "Nome é obrigatório.";

    if (form.codigo.trim()) {
      const dup = blocos.some(
        (b) =>
          b.codigo &&
          b.codigo.trim().toLowerCase() === form.codigo.trim().toLowerCase() &&
          b.id !== editingBloco?.id
      );
      if (dup) errs.codigo = "Já existe uma unidade com esse código.";
    }

    if (form.documento && !isValidDocumento(form.documento, form.classificacao)) {
      errs.documento =
        form.classificacao === "Jurídica" ? "CNPJ inválido." : "CPF inválido.";
    }

    if (
      form.resp_documento &&
      !isValidDocumento(form.resp_documento, form.resp_classificacao)
    ) {
      errs.resp_documento =
        form.resp_classificacao === "Jurídica" ? "CNPJ inválido." : "CPF inválido.";
    }

    if (form.cep && onlyDigits(form.cep).length !== 8) {
      errs.cep = "CEP deve ter 8 dígitos.";
    }
    if (form.resp_cep && onlyDigits(form.resp_cep).length !== 8) {
      errs.resp_cep = "CEP deve ter 8 dígitos.";
    }

    if (form.estado && !UF_OPTIONS.includes(form.estado)) {
      errs.estado = "UF inválida.";
    }
    if (form.resp_estado && !UF_OPTIONS.includes(form.resp_estado)) {
      errs.resp_estado = "UF inválida.";
    }

    if (form.resp_telefone && onlyDigits(form.resp_telefone).length < 10) {
      errs.resp_telefone = "Telefone incompleto.";
    }
    if (form.resp_celular && onlyDigits(form.resp_celular).length < 10) {
      errs.resp_celular = "Celular incompleto.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!companyId) {
      toast({ title: "Empresa não identificada", variant: "destructive" });
      return;
    }

    if (!validate()) {
      toast({
        title: "Verifique os campos destacados",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    const payload = {
      nome: form.nome.trim(),
      status: form.status,
      codigo: form.codigo.trim() || null,
      situacao_imovel: form.situacao_imovel || null,
      classificacao: form.classificacao || null,
      documento: form.documento ? onlyDigits(form.documento) : null,
      inscricao_estadual: form.inscricao_estadual.trim() || null,
      razao_social: form.razao_social.trim() || null,
      nome_fantasia: form.nome_fantasia.trim() || null,
      cep: form.cep ? onlyDigits(form.cep) : null,
      pais: form.pais.trim() || null,
      estado: form.estado || null,
      cidade: form.cidade.trim() || null,
      endereco: form.endereco.trim() || null,

      resp_classificacao: form.resp_classificacao || null,
      resp_tipo: form.resp_tipo || null,
      resp_razao_social: form.resp_razao_social.trim() || null,
      resp_documento: form.resp_documento ? onlyDigits(form.resp_documento) : null,
      resp_telefone: form.resp_telefone ? onlyDigits(form.resp_telefone) : null,
      resp_celular: form.resp_celular ? onlyDigits(form.resp_celular) : null,
      resp_cep: form.resp_cep ? onlyDigits(form.resp_cep) : null,
      resp_pais: form.resp_pais.trim() || null,
      resp_estado: form.resp_estado || null,
      resp_cidade: form.resp_cidade.trim() || null,
      resp_endereco: form.resp_endereco.trim() || null,
    };

    if (editingBloco) {
      const { error } = await (supabase as any)
        .from("blocos")
        .update(payload)
        .eq("id", editingBloco.id)
        .eq("company_id", companyId);

      setSaving(false);

      if (error) {
        toast({
          title: "Erro ao atualizar",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Unidade atualizada com sucesso" });
    } else {
      const { error } = await (supabase as any)
        .from("blocos")
        .insert({ ...payload, company_id: companyId });

      setSaving(false);

      if (error) {
        toast({
          title: "Erro ao criar",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Unidade criada com sucesso" });
    }

    setDialogOpen(false);
    resetForm();
    fetchBlocos();
  };

  const handleEdit = (bloco: Bloco) => {
    setEditingBloco(bloco);
    setForm({
      nome: bloco.nome || "",
      status: (bloco.status as "Ativo" | "Inativo") || "Ativo",
      codigo: bloco.codigo || "",
      situacao_imovel: bloco.situacao_imovel || "",
      classificacao: bloco.classificacao || "",
      documento: bloco.documento
        ? maskDocumento(bloco.documento, bloco.classificacao || "")
        : "",
      inscricao_estadual: bloco.inscricao_estadual || "",
      razao_social: bloco.razao_social || "",
      nome_fantasia: bloco.nome_fantasia || "",
      cep: bloco.cep ? maskCEP(bloco.cep) : "",
      pais: bloco.pais || "Brasil",
      estado: bloco.estado || "",
      cidade: bloco.cidade || "",
      endereco: bloco.endereco || "",

      resp_classificacao: bloco.resp_classificacao || "",
      resp_tipo: bloco.resp_tipo || "",
      resp_razao_social: bloco.resp_razao_social || "",
      resp_documento: bloco.resp_documento
        ? maskDocumento(bloco.resp_documento, bloco.resp_classificacao || "")
        : "",
      resp_telefone: bloco.resp_telefone ? maskTelefone(bloco.resp_telefone) : "",
      resp_celular: bloco.resp_celular ? maskTelefone(bloco.resp_celular) : "",
      resp_cep: bloco.resp_cep ? maskCEP(bloco.resp_cep) : "",
      resp_pais: bloco.resp_pais || "Brasil",
      resp_estado: bloco.resp_estado || "",
      resp_cidade: bloco.resp_cidade || "",
      resp_endereco: bloco.resp_endereco || "",
    });
    setErrors({});
    setDialogOpen(true);
  };

  // Inativar em vez de excluir de fato quando a unidade já tem
  // histórico vinculado (OS, ativos, preventivas etc.) — evita
  // quebrar relacionamentos existentes.
  const handleInativar = async (bloco: Bloco) => {
    const novoStatus = bloco.status === "Inativo" ? "Ativo" : "Inativo";

    const confirmed = window.confirm(
      novoStatus === "Inativo"
        ? `Inativar a unidade "${bloco.nome}"? Ela deixa de aparecer para novos vínculos, mas o histórico é mantido.`
        : `Reativar a unidade "${bloco.nome}"?`
    );
    if (!confirmed) return;

    const { error } = await (supabase as any)
      .from("blocos")
      .update({ status: novoStatus })
      .eq("id", bloco.id)
      .eq("company_id", companyId);

    if (error) {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: novoStatus === "Inativo" ? "Unidade inativada" : "Unidade reativada",
    });
    fetchBlocos();
  };

  const handleDelete = async (bloco: Bloco) => {
    const confirmed = window.confirm(
      `Excluir definitivamente "${bloco.nome}"? Se ela tiver OS, ativos ou histórico vinculados, prefira inativar em vez de excluir.`
    );
    if (!confirmed) return;

    const { error } = await (supabase as any)
      .from("blocos")
      .delete()
      .eq("id", bloco.id)
      .eq("company_id", companyId);

    if (error) {
      toast({
        title: "Erro ao excluir",
        description:
          "Não foi possível excluir. Provavelmente há OS, ativos ou registros vinculados a esta unidade — use Inativar.",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Unidade excluída com sucesso" });
    fetchBlocos();
  };

  const documentoLabel = form.classificacao === "Jurídica" ? "CNPJ" : "CPF";
  const respDocumentoLabel = form.resp_classificacao === "Jurídica" ? "CNPJ" : "CPF";

  const blocosOrdenados = useMemo(
    () => [...blocos].sort((a, b) => a.nome.localeCompare(b.nome)),
    [blocos]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Unidades de Manutenção</h1>
          <p className="text-muted-foreground">
            Gerencie as unidades de manutenção da empresa
          </p>
        </div>

        {can("blocos.criar") && (
          <Button
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
          >
            Nova Unidade
          </Button>
        )}
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome / Razão Social</TableHead>
              <TableHead>Nome Fantasia</TableHead>
              <TableHead>CPF/CNPJ</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[220px]">Ações</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : blocosOrdenados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center">
                  Nenhuma unidade cadastrada.
                </TableCell>
              </TableRow>
            ) : (
              blocosOrdenados.map((bloco) => (
                <TableRow key={bloco.id}>
                  <TableCell>{bloco.codigo || "—"}</TableCell>
                  <TableCell>
                    {bloco.razao_social || bloco.nome}
                  </TableCell>
                  <TableCell>{bloco.nome_fantasia || "—"}</TableCell>
                  <TableCell>
                    {bloco.documento
                      ? maskDocumento(bloco.documento, bloco.classificacao || "")
                      : "—"}
                  </TableCell>
                  <TableCell>{bloco.situacao_imovel || "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={bloco.status === "Inativo" ? "outline" : "default"}
                    >
                      {bloco.status || "Ativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2 whitespace-nowrap">
                    {can("blocos.editar") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(bloco)}
                      >
                        Editar
                      </Button>
                    )}

                    {can("blocos.editar") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleInativar(bloco)}
                      >
                        {bloco.status === "Inativo" ? "Reativar" : "Inativar"}
                      </Button>
                    )}

                    {can("blocos.excluir") && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(bloco)}
                      >
                        Excluir
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBloco ? "Editar Unidade de Manutenção" : "Nova Unidade de Manutenção"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-8">
            {/* ================= DADOS DA UNIDADE ================= */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase text-muted-foreground border-b pb-1">
                Dados da Unidade
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    value={form.nome}
                    onChange={(e) => setField("nome", e.target.value)}
                  />
                  {errors.nome && (
                    <p className="text-xs text-destructive">{errors.nome}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setField("status", v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ativo">Ativo</SelectItem>
                      <SelectItem value="Inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Código da Unidade</Label>
                  <Input
                    value={form.codigo}
                    onChange={(e) => setField("codigo", e.target.value)}
                  />
                  {errors.codigo && (
                    <p className="text-xs text-destructive">{errors.codigo}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Situação do Imóvel</Label>
                  <Select
                    value={form.situacao_imovel || "__none__"}
                    onValueChange={(v) =>
                      setField("situacao_imovel", v === "__none__" ? "" : v)
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Selecione —</SelectItem>
                      <SelectItem value="Alugado">Alugado</SelectItem>
                      <SelectItem value="Próprio">Próprio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Classificação</Label>
                  <Select
                    value={form.classificacao || "__none__"}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        classificacao: v === "__none__" ? "" : v,
                        documento: "",
                      }))
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Selecione —</SelectItem>
                      <SelectItem value="Física">Física</SelectItem>
                      <SelectItem value="Jurídica">Jurídica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{documentoLabel}</Label>
                  <Input
                    value={form.documento}
                    onChange={(e) =>
                      setField("documento", maskDocumento(e.target.value, form.classificacao))
                    }
                    placeholder={form.classificacao === "Jurídica" ? "00.000.000/0000-00" : "000.000.000-00"}
                  />
                  {errors.documento && (
                    <p className="text-xs text-destructive">{errors.documento}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Inscrição Estadual</Label>
                  <Input
                    value={form.inscricao_estadual}
                    onChange={(e) => setField("inscricao_estadual", e.target.value)}
                  />
                </div>

                <div />

                <div className="space-y-2">
                  <Label>Razão Social</Label>
                  <Input
                    value={form.razao_social}
                    onChange={(e) => setField("razao_social", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Nome Fantasia</Label>
                  <Input
                    value={form.nome_fantasia}
                    onChange={(e) => setField("nome_fantasia", e.target.value)}
                  />
                </div>
              </div>

              <h4 className="text-xs font-semibold uppercase text-muted-foreground pt-2">
                Endereço
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CEP</Label>
                  <Input
                    value={form.cep}
                    onChange={(e) => setField("cep", maskCEP(e.target.value))}
                    placeholder="00000-000"
                  />
                  {errors.cep && (
                    <p className="text-xs text-destructive">{errors.cep}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>País</Label>
                  <Input
                    value={form.pais}
                    onChange={(e) => setField("pais", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Estado (UF)</Label>
                  <Select
                    value={form.estado || "__none__"}
                    onValueChange={(v) => setField("estado", v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Selecione —</SelectItem>
                      {UF_OPTIONS.map((uf) => (
                        <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.estado && (
                    <p className="text-xs text-destructive">{errors.estado}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input
                    value={form.cidade}
                    onChange={(e) => setField("cidade", e.target.value)}
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label>Endereço</Label>
                  <Input
                    value={form.endereco}
                    onChange={(e) => setField("endereco", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* ============= RESPONSÁVEL PELA UNIDADE ============= */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase text-muted-foreground border-b pb-1">
                Responsável pela Unidade
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Classificação</Label>
                  <Select
                    value={form.resp_classificacao || "__none__"}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        resp_classificacao: v === "__none__" ? "" : v,
                        resp_documento: "",
                      }))
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Selecione —</SelectItem>
                      <SelectItem value="Física">Física</SelectItem>
                      <SelectItem value="Jurídica">Jurídica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Responsável</Label>
                  <Select
                    value={form.resp_tipo || "__none__"}
                    onValueChange={(v) => setField("resp_tipo", v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Selecione —</SelectItem>
                      <SelectItem value="Locatário">Locatário</SelectItem>
                      <SelectItem value="Preposto">Preposto</SelectItem>
                      <SelectItem value="Proprietário">Proprietário</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 col-span-2">
                  <Label>Razão Social / Nome</Label>
                  <Input
                    value={form.resp_razao_social}
                    onChange={(e) => setField("resp_razao_social", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{respDocumentoLabel}</Label>
                  <Input
                    value={form.resp_documento}
                    onChange={(e) =>
                      setField("resp_documento", maskDocumento(e.target.value, form.resp_classificacao))
                    }
                    placeholder={form.resp_classificacao === "Jurídica" ? "00.000.000/0000-00" : "000.000.000-00"}
                  />
                  {errors.resp_documento && (
                    <p className="text-xs text-destructive">{errors.resp_documento}</p>
                  )}
                </div>

                <div />

                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input
                    value={form.resp_telefone}
                    onChange={(e) => setField("resp_telefone", maskTelefone(e.target.value))}
                    placeholder="(00) 0000-0000"
                  />
                  {errors.resp_telefone && (
                    <p className="text-xs text-destructive">{errors.resp_telefone}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Celular</Label>
                  <Input
                    value={form.resp_celular}
                    onChange={(e) => setField("resp_celular", maskTelefone(e.target.value))}
                    placeholder="(00) 00000-0000"
                  />
                  {errors.resp_celular && (
                    <p className="text-xs text-destructive">{errors.resp_celular}</p>
                  )}
                </div>
              </div>

              <h4 className="text-xs font-semibold uppercase text-muted-foreground pt-2">
                Endereço
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CEP</Label>
                  <Input
                    value={form.resp_cep}
                    onChange={(e) => setField("resp_cep", maskCEP(e.target.value))}
                    placeholder="00000-000"
                  />
                  {errors.resp_cep && (
                    <p className="text-xs text-destructive">{errors.resp_cep}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>País</Label>
                  <Input
                    value={form.resp_pais}
                    onChange={(e) => setField("resp_pais", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Estado (UF)</Label>
                  <Select
                    value={form.resp_estado || "__none__"}
                    onValueChange={(v) => setField("resp_estado", v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Selecione —</SelectItem>
                      {UF_OPTIONS.map((uf) => (
                        <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.resp_estado && (
                    <p className="text-xs text-destructive">{errors.resp_estado}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input
                    value={form.resp_cidade}
                    onChange={(e) => setField("resp_cidade", e.target.value)}
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label>Endereço</Label>
                  <Input
                    value={form.resp_endereco}
                    onChange={(e) => setField("resp_endereco", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}