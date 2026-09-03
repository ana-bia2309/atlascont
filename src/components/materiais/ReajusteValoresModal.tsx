import { useState, useMemo, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-log";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  TrendingDown,
  ChevronRight,
  ChevronLeft as ChevronLeftIcon,
  X,
  Search,
  AlertTriangle,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

type MaterialLite = {
  id: string;
  codigo: string | null;
  descricao: string;
  categoria: string | null;
  valor_unitario: number | null;
};

const CATEGORIA_OPTIONS = ["Material", "Ferramenta", "EPI", "Serviço"];

type TipoOperacao = "majorar" | "reduzir";
type TipoReajuste = "percentual" | "valor_fixo";
type Criterio = "todos" | "categoria" | "intervalo" | "especificos";
type Step = "config" | "preview" | "confirm";

type PreviewRow = {
  material_id: string;
  codigo: string | null;
  descricao: string;
  categoria: string | null;
  valor_atual: number;
  valor_novo: number;
  diferenca: number;
};

interface ReajusteValoresModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materiais: MaterialLite[];
  onSuccess: () => void;
}

const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ReajusteValoresModal({
  open,
  onOpenChange,
  materiais,
  onSuccess,
}: ReajusteValoresModalProps) {
  const [step, setStep] = useState<Step>("config");

  const [tipoOperacao, setTipoOperacao] = useState<TipoOperacao>("majorar");
  const [tipoReajuste, setTipoReajuste] = useState<TipoReajuste>("percentual");
  const [percentual, setPercentual] = useState("");
  const [valorFixo, setValorFixo] = useState("");

  const [criterio, setCriterio] = useState<Criterio>("todos");
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState<string[]>([]);
  const [codigoInicial, setCodigoInicial] = useState("");
  const [codigoFinal, setCodigoFinal] = useState("");
  const [codigosEspecificos, setCodigosEspecificos] = useState<string[]>([]);
  const [buscaEspecifico, setBuscaEspecifico] = useState("");
  const [popoverEspecificoOpen, setPopoverEspecificoOpen] = useState(false);
  const especificoInputRef = useRef<HTMLInputElement>(null);

  const [justificativa, setJustificativa] = useState("");

  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingApply, setLoadingApply] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const resetAll = () => {
    setStep("config");
    setTipoOperacao("majorar");
    setTipoReajuste("percentual");
    setPercentual("");
    setValorFixo("");
    setCriterio("todos");
    setCategoriasSelecionadas([]);
    setCodigoInicial("");
    setCodigoFinal("");
    setCodigosEspecificos([]);
    setBuscaEspecifico("");
    setJustificativa("");
    setPreviewRows([]);
    setConfigError(null);
    setApplyError(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) resetAll();
    onOpenChange(v);
  };

  const materiaisComCodigo = useMemo(
    () => materiais.filter((m) => !!m.codigo),
    [materiais]
  );

  const opcoesEspecifico = useMemo(() => {
    const q = buscaEspecifico.toLowerCase().trim();
    return materiaisComCodigo
      .filter((m) => !codigosEspecificos.includes(m.codigo as string))
      .filter(
        (m) =>
          q === "" ||
          (m.codigo || "").toLowerCase().includes(q) ||
          m.descricao.toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [materiaisComCodigo, buscaEspecifico, codigosEspecificos]);

  useEffect(() => {
    if (popoverEspecificoOpen) {
      setTimeout(() => especificoInputRef.current?.focus(), 50);
    } else {
      setBuscaEspecifico("");
    }
  }, [popoverEspecificoOpen]);

  const validateConfig = (): string | null => {
    if (tipoReajuste === "percentual") {
      const n = Number(percentual);
      if (!percentual || isNaN(n) || n <= 0) return "Informe um percentual válido, maior que zero.";
    } else {
      const n = Number(valorFixo);
      if (!valorFixo || isNaN(n) || n <= 0) return "Informe um valor fixo válido, maior que zero.";
    }
    if (criterio === "categoria" && categoriasSelecionadas.length === 0) {
      return "Selecione ao menos uma categoria.";
    }
    if (criterio === "intervalo") {
      if (!codigoInicial.trim() || !codigoFinal.trim()) return "Informe o código inicial e final.";
      if (!/^\d+$/.test(codigoInicial.trim()) || !/^\d+$/.test(codigoFinal.trim())) {
        return "Os códigos do intervalo devem conter apenas números (ex: 0008).";
      }
      if (Number(codigoInicial) > Number(codigoFinal)) {
        return "O código inicial não pode ser maior que o código final.";
      }
    }
    if (criterio === "especificos" && codigosEspecificos.length === 0) {
      return "Selecione ao menos um material.";
    }
    return null;
  };

  const buildRpcArgs = () => ({
    p_tipo_operacao: tipoOperacao,
    p_tipo_reajuste: tipoReajuste,
    p_percentual: tipoReajuste === "percentual" ? Number(percentual) : null,
    p_valor_fixo: tipoReajuste === "valor_fixo" ? Number(valorFixo) : null,
    p_criterio_selecao: criterio,
    p_categorias: criterio === "categoria" ? categoriasSelecionadas : null,
    p_codigo_inicial: criterio === "intervalo" ? codigoInicial.trim() : null,
    p_codigo_final: criterio === "intervalo" ? codigoFinal.trim() : null,
    p_codigos_especificos: criterio === "especificos" ? codigosEspecificos : null,
  });

  const handleVerPrevia = async () => {
    const err = validateConfig();
    if (err) {
      setConfigError(err);
      return;
    }
    setConfigError(null);
    setLoadingPreview(true);
    try {
      const { data, error } = await (supabase as any).rpc(
        "preview_reajuste_materiais",
        buildRpcArgs()
      );
      if (error) {
        setConfigError(error.message || "Erro ao calcular a prévia do reajuste.");
        return;
      }
      setPreviewRows((data || []) as PreviewRow[]);
      setStep("preview");
    } finally {
      setLoadingPreview(false);
    }
  };

  const resumo = useMemo(() => {
    const qtd = previewRows.length;
    const totalAntes = previewRows.reduce((s, r) => s + Number(r.valor_atual), 0);
    const totalDepois = previewRows.reduce((s, r) => s + Number(r.valor_novo), 0);
    return { qtd, totalAntes, totalDepois, variacao: totalDepois - totalAntes };
  }, [previewRows]);

  const handleConfirmar = async () => {
    setApplyError(null);
    setLoadingApply(true);
    try {
      const { data, error } = await (supabase as any).rpc("aplicar_reajuste_materiais", {
        ...buildRpcArgs(),
        p_justificativa: justificativa.trim(),
      });
      if (error) {
        setApplyError(error.message || "Erro ao aplicar o reajuste. Nenhum valor foi alterado.");
        return;
      }
      const result = data as { materiais_afetados: number };
      logActivity({
        actionType: "edicao",
        module: "Materiais",
        description: `Reajuste em lote: ${tipoOperacao === "majorar" ? "majorou" : "reduziu"} ${
          result.materiais_afetados
        } material(is)`,
      });
      toast({
        title: "Reajuste realizado com sucesso",
        description: `${result.materiais_afetados} material(is) foram atualizados e a operação foi registrada no histórico.`,
      });
      handleClose(false);
      onSuccess();
    } finally {
      setLoadingApply(false);
    }
  };

  const valorLabel =
    tipoReajuste === "percentual" ? `${percentual || "0"}%` : money(Number(valorFixo || 0));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reajuste de Valores</DialogTitle>
          <DialogDescription>
            Altera em lote o valor unitário dos materiais selecionados. Nenhum valor é alterado
            até a confirmação final.
          </DialogDescription>
        </DialogHeader>

        {/* ===================== STEP 1 — CONFIGURAÇÃO ===================== */}
        {step === "config" && (
          <div className="space-y-5 py-2">
            <div>
              <Label className="mb-2 block">Tipo de operação</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={tipoOperacao === "majorar" ? "default" : "outline"}
                  className="justify-start gap-2"
                  onClick={() => setTipoOperacao("majorar")}
                >
                  <TrendingUp className="h-4 w-4" /> Majorar
                </Button>
                <Button
                  type="button"
                  variant={tipoOperacao === "reduzir" ? "default" : "outline"}
                  className="justify-start gap-2"
                  onClick={() => setTipoOperacao("reduzir")}
                >
                  <TrendingDown className="h-4 w-4" /> Reduzir
                </Button>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Tipo de reajuste</Label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Button
                  type="button"
                  variant={tipoReajuste === "percentual" ? "default" : "outline"}
                  onClick={() => setTipoReajuste("percentual")}
                >
                  Percentual (%)
                </Button>
                <Button
                  type="button"
                  variant={tipoReajuste === "valor_fixo" ? "default" : "outline"}
                  onClick={() => setTipoReajuste("valor_fixo")}
                >
                  Valor fixo (R$)
                </Button>
              </div>
              {tipoReajuste === "percentual" ? (
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={percentual}
                  onChange={(e) => setPercentual(e.target.value)}
                  placeholder="Ex: 15"
                />
              ) : (
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={valorFixo}
                  onChange={(e) => setValorFixo(e.target.value)}
                  placeholder="Ex: 2,63"
                />
              )}
            </div>

            <div>
              <Label className="mb-2 block">Materiais afetados</Label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {([
                  ["todos", "Todos os materiais"],
                  ["categoria", "Por categoria"],
                  ["intervalo", "Por intervalo de códigos"],
                  ["especificos", "Materiais específicos"],
                ] as [Criterio, string][]).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={criterio === value ? "default" : "outline"}
                    className="justify-start"
                    onClick={() => setCriterio(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              {criterio === "categoria" && (
                <div className="rounded-lg border bg-card p-3 space-y-2">
                  {CATEGORIA_OPTIONS.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={categoriasSelecionadas.includes(c)}
                        onCheckedChange={(checked) =>
                          setCategoriasSelecionadas((prev) =>
                            checked ? [...prev, c] : prev.filter((x) => x !== c)
                          )
                        }
                      />
                      {c}
                    </label>
                  ))}
                </div>
              )}

              {criterio === "intervalo" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      Código inicial
                    </Label>
                    <Input
                      value={codigoInicial}
                      onChange={(e) => setCodigoInicial(e.target.value)}
                      placeholder="0008"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      Código final
                    </Label>
                    <Input
                      value={codigoFinal}
                      onChange={(e) => setCodigoFinal(e.target.value)}
                      placeholder="0193"
                    />
                  </div>
                </div>
              )}

              {criterio === "especificos" && (
                <div>
                  <Popover open={popoverEspecificoOpen} onOpenChange={setPopoverEspecificoOpen}>
                    <PopoverTrigger asChild>
                      <div
                        className={cn(
                          "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 cursor-text"
                        )}
                        onClick={() => setPopoverEspecificoOpen(true)}
                      >
                        {codigosEspecificos.length === 0 && (
                          <span className="text-sm text-muted-foreground px-1">
                            Buscar por código ou descrição...
                          </span>
                        )}
                        {codigosEspecificos.map((cod) => {
                          const m = materiaisComCodigo.find((mm) => mm.codigo === cod);
                          return (
                            <Badge key={cod} variant="secondary" className="gap-1">
                              <span className="font-mono">{cod}</span>
                              {m && <span className="max-w-[140px] truncate">{m.descricao}</span>}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCodigosEspecificos((prev) => prev.filter((x) => x !== cod));
                                }}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    </PopoverTrigger>
                    <PopoverContent className="w-[380px] p-0" align="start">
                      <div className="p-2 border-b relative">
                        <Search className="absolute left-4 top-4.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          ref={especificoInputRef}
                          value={buscaEspecifico}
                          onChange={(e) => setBuscaEspecifico(e.target.value)}
                          placeholder="Código ou descrição..."
                          className="pl-8 h-8"
                        />
                      </div>
                      <div className="max-h-60 overflow-y-auto p-1">
                        {opcoesEspecifico.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            Nenhum material encontrado
                          </p>
                        ) : (
                          opcoesEspecifico.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted text-left"
                              onClick={() =>
                                setCodigosEspecificos((prev) => [...prev, m.codigo as string])
                              }
                            >
                              <span className="font-mono text-primary text-xs">{m.codigo}</span>
                              <span className="truncate">{m.descricao}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground mt-1">
                    {codigosEspecificos.length} material(is) selecionado(s)
                  </p>
                </div>
              )}
            </div>

            {configError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                {configError}
              </div>
            )}

            <Button className="w-full gap-2" onClick={handleVerPrevia} disabled={loadingPreview}>
              {loadingPreview ? "Calculando prévia..." : "Ver Prévia"}
              {!loadingPreview && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        )}

        {/* ===================== STEP 2 — PRÉVIA ===================== */}
        {step === "preview" && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Materiais afetados</p>
                <p className="text-lg font-bold">{resumo.qtd}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Valor total atual</p>
                <p className="text-lg font-bold">{money(resumo.totalAntes)}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Valor após reajuste</p>
                <p className="text-lg font-bold">{money(resumo.totalDepois)}</p>
              </div>
            </div>
            <div
              className={cn(
                "rounded-lg border p-3 text-sm font-medium",
                resumo.variacao >= 0
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-red-50 text-red-700 border-red-200"
              )}
            >
              Variação total: {resumo.variacao >= 0 ? "+" : ""}
              {money(resumo.variacao)}
            </div>

            <div className="rounded-md border overflow-auto max-h-64">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Código</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Valor atual</TableHead>
                    <TableHead>Novo valor</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        Nenhum material encontrado para os critérios informados
                      </TableCell>
                    </TableRow>
                  ) : (
                    previewRows.map((r) => (
                      <TableRow key={r.material_id}>
                        <TableCell className="font-mono text-sm">{r.codigo}</TableCell>
                        <TableCell>{r.descricao}</TableCell>
                        <TableCell>{money(Number(r.valor_atual))}</TableCell>
                        <TableCell className="font-medium">
                          {money(Number(r.valor_novo))}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right",
                            Number(r.diferenca) >= 0 ? "text-emerald-600" : "text-red-600"
                          )}
                        >
                          {Number(r.diferenca) >= 0 ? "+" : ""}
                          {money(Number(r.diferenca))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div>
              <Label className="mb-1 block">Justificativa do reajuste *</Label>
              <Textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Ex: Atualização dos valores conforme nova tabela de preços do fornecedor."
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={() => setStep("config")}>
                <ChevronLeftIcon className="h-4 w-4" /> Voltar
              </Button>
              <Button
                className="flex-1 gap-2"
                disabled={previewRows.length === 0 || !justificativa.trim()}
                onClick={() => setStep("confirm")}
              >
                Continuar <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ===================== STEP 3 — CONFIRMAÇÃO ===================== */}
        {step === "confirm" && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <p className="text-sm">
                Você está prestes a{" "}
                <strong>{tipoOperacao === "majorar" ? "majorar" : "reduzir"}</strong> em{" "}
                <strong>{valorLabel}</strong> o valor de <strong>{resumo.qtd}</strong> material(is).
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm pt-1">
                <div>
                  <span className="text-muted-foreground">Valor total atual: </span>
                  <span className="font-medium">{money(resumo.totalAntes)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Novo valor total: </span>
                  <span className="font-medium">{money(resumo.totalDepois)}</span>
                </div>
              </div>
              <div className="pt-1">
                <span className="text-muted-foreground text-sm">Justificativa: </span>
                <span className="text-sm">{justificativa}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-2 border-t mt-2">
                Essa operação será registrada no histórico do sistema.
              </p>
            </div>

            {applyError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                {applyError}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep("preview")}
                disabled={loadingApply}
              >
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleConfirmar} disabled={loadingApply}>
                {loadingApply ? "Aplicando..." : "Confirmar Reajuste"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
