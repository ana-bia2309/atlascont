import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, AlertCircle } from "@/lib/icons";

type AtivoSnapshot = {
  id: string | null;
  nome?: string | null;
  codigo_identificacao?: string | null;
  bloco_id?: string | null;
  andar?: string | null;
  sala?: string | null;
  identificacao_ambiente?: string | null;
  area_pavimento?: string | null;
  grupo_areas?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  atividadeNome: string;
  ativo: AtivoSnapshot | null;
  blocoNome?: string | null;
  contextoTitulo?: string | null;
  onCreated?: (osId: string, codigo: string) => void;
};

const PERMISSAO_RESPONSAVEL = [
  "painel_os.editar",
  "minhas_os.editar",
];

export default function AbrirChamadoDialog({
  open,
  onClose,
  atividadeNome,
  ativo,
  blocoNome,
  contextoTitulo,
  onCreated,
}: Props) {
  const { session } = useAuth();

  const [descricao, setDescricao] = useState("");
  const [responsavelId, setResponsavelId] =
    useState<string>("");

  const [profiles, setProfiles] = useState<
    { id: string; nome: string }[]
  >([]);

  const [loadingProfiles, setLoadingProfiles] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  useEffect(() => {
    if (!open) return;

    setDescricao("");
    setResponsavelId("");

    let cancelled = false;

    (async () => {
      setLoadingProfiles(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoadingProfiles(false);
        return;
      }

      const { data: profile }: any =
        await (supabase as any)
          .from("profiles")
          .select("company_id")
          .eq("user_id", user.id)
          .single();

      if (!profile?.company_id) {
        setLoadingProfiles(false);
        return;
      }

      const companyId = profile.company_id;

      const { data: perms } = await supabase
        .from("permissoes_perfil")
        .select(
          "perfil_acesso_id, permissao"
        )
        .in(
          "permissao",
          PERMISSAO_RESPONSAVEL
        );

      const perfilIds = Array.from(
        new Set(
          (perms || []).map(
            (p: any) => p.perfil_acesso_id
          )
        )
      );

      let query = (supabase as any)
        .from("profiles")
        .select(
          "id, nome, perfil_acesso_id"
        )
        .eq("status", "ativo")
        .eq("company_id", companyId)
        .order("nome");

      if (perfilIds.length > 0) {
        query = query.in(
          "perfil_acesso_id",
          perfilIds
        );
      }

      const { data } = await query;

      const { data: adminRoles } =
        await supabase
          .from("user_roles")
          .select("user_id")
          .eq(
            "role",
            "administrador" as any
          );

      const adminProfileIds = new Set(
        (adminRoles || []).map(
          (r: any) => r.user_id
        )
      );

      const { data: adminProfiles } =
        adminProfileIds.size
          ? await (supabase as any)
              .from("profiles")
              .select("id, nome")
              .in(
                "id",
                Array.from(adminProfileIds)
              )
              .eq("status", "ativo")
              .eq(
                "company_id",
                companyId
              )
          : { data: [] as any[] };

      const merged = new Map<
        string,
        { id: string; nome: string }
      >();

      (data || []).forEach((p: any) =>
        merged.set(p.id, {
          id: p.id,
          nome: p.nome,
        })
      );

      (adminProfiles || []).forEach(
        (p: any) =>
          merged.set(p.id, {
            id: p.id,
            nome: p.nome,
          })
      );

      if (!cancelled) {
        setProfiles(
          Array.from(
            merged.values()
          ).sort((a, b) =>
            a.nome.localeCompare(b.nome)
          )
        );

        setLoadingProfiles(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const ativoResumo = useMemo(() => {
    if (!ativo?.id) return null;

    return [
      ["Equipamento", ativo.nome || "—"],
      [
        "Código",
        ativo.codigo_identificacao || "—",
      ],
      [
        "Localização",
        [ativo.andar, ativo.sala]
          .filter(Boolean)
          .join(" / ") || "—",
      ],
      [
        "Unidade de Manutenção",
        blocoNome || "—",
      ],
      [
        "Área",
        ativo.area_pavimento ||
          ativo.grupo_areas ||
          "—",
      ],
      [
        "Identificação do Ambiente",
        ativo.identificacao_ambiente ||
          "—",
      ],
    ] as const;
  }, [ativo, blocoNome]);

  const canSubmit =
    descricao.trim().length > 0 &&
    responsavelId.length > 0 &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setSubmitting(false);
        return;
      }

      const { data: profile }: any =
        await (supabase as any)
          .from("profiles")
          .select("id, company_id")
          .eq("user_id", user.id)
          .single();

      if (!profile?.company_id) {
        setSubmitting(false);
        return;
      }

      const companyId =
        profile.company_id;

      const {
        data: codigoData,
        error: codigoErr,
      } = await supabase.rpc(
        "next_chamado_codigo" as any
      );

      if (codigoErr) throw codigoErr;

      const codigo =
        (codigoData as string) || "";

      const payload: any = {
        company_id: companyId,

        codigo_os: codigo,
        origem: "Chamado",

        status: "Aberto",
        prioridade: "Média",

        titulo: contextoTitulo
          ? `Chamado da atividade "${atividadeNome}" (${contextoTitulo})`
          : `Chamado da atividade "${atividadeNome}"`,

        descricao: descricao.trim(),

        observacoes:
          descricao.trim(),

        responsible_user_id:
          responsavelId,

        criado_por: profile.id,

        ativo_id: ativo?.id ?? null,

        bloco_id:
          ativo?.bloco_id ?? null,

        andar: ativo?.andar ?? null,

        sala: ativo?.sala ?? null,

        ativo_codigo:
          ativo?.codigo_identificacao ??
          null,

        ativo_area:
          ativo?.area_pavimento ||
          ativo?.grupo_areas ||
          null,

        ativo_ambiente:
          ativo?.identificacao_ambiente ??
          null,
      };

      const {
        data: created,
        error,
      } = await supabase
        .from("ordens_servico")
        .insert(payload)
        .select("id, codigo_os")
        .single();

      if (error) throw error;

      try {
        await supabase
          .from("os_notifications")
          .insert({
            os_id: (created as any).id,
            user_id: responsavelId,
          } as any);
      } catch {
        // ignora erro
      }

      toast({
        title: "Chamado enviado",
        description: `${(created as any).codigo_os} direcionado ao responsável.`,
      });

      onCreated?.(
        (created as any).id,
        (created as any).codigo_os
      );

      onClose();
    } catch (e: any) {
      toast({
        title:
          "Erro ao enviar chamado",

        description:
          e?.message ||
          "Tente novamente.",

        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !submitting)
          onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Abrir chamado
          </DialogTitle>

          <DialogDescription>
            Atividade:
            <strong>
              {" "}
              {atividadeNome}
            </strong>
          </DialogDescription>
        </DialogHeader>

        {ativoResumo ? (
          <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Ativo vinculado
              (snapshot)
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {ativoResumo.map(
                ([label, value]) => (
                  <div
                    key={label}
                    className="flex flex-col"
                  >
                    <span className="text-muted-foreground">
                      {label}
                    </span>

                    <span className="font-medium">
                      {value}
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />

            <span>
              Nenhum ativo vinculado
              a esta Ordem
              Preventiva.
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label
            htmlFor="chamado-descricao"
            className="text-xs font-medium"
          >
            Descrição do problema
          </Label>

          <Textarea
            id="chamado-descricao"
            value={descricao}
            onChange={(e) =>
              setDescricao(
                e.target.value
              )
            }
            rows={4}
            placeholder="Descreva o problema..."
          />
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="chamado-responsavel"
            className="text-xs font-medium"
          >
            Responsável
          </Label>

          <Select
            value={responsavelId}
            onValueChange={
              setResponsavelId
            }
            disabled={loadingProfiles}
          >
            <SelectTrigger id="chamado-responsavel">
              <SelectValue
                placeholder={
                  loadingProfiles
                    ? "Carregando..."
                    : "Selecione"
                }
              />
            </SelectTrigger>

            <SelectContent>
              {profiles.length ===
                0 &&
                !loadingProfiles && (
                  <SelectItem
                    value="__none__"
                    disabled
                  >
                    Nenhum
                    responsável
                  </SelectItem>
                )}

              {profiles.map((p) => (
                <SelectItem
                  key={p.id}
                  value={p.id}
                >
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </Button>

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}

            Enviar chamado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}