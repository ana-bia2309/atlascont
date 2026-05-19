import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ArrowRight, MapPin, Wrench, Calendar, FileText, ClipboardList, Package } from "@/lib/icons";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type OSData = {
  id: string;
  codigo_os: string | null;
  titulo: string | null;
  descricao: string | null;
  status: string | null;
  prazo: string | null;
  data_inicio: string | null;
  data_termino: string | null;
  equipamentos: string | null;
  observacoes: string | null;
  custo_total: number | null;
  bloco_id: string | null;
  andar: string | null;
  sala: string | null;
  ativo_id: string | null;
  created_at: string | null;
};

type MaterialOS = {
  id: string;
  nome_material: string;
  quantidade: number;
  custo_unitario: number;
  custo_total_item: number | null;
  unidade: string | null;
};

const STATUS_MAP: Record<string, string> = {
  "Concluída": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Em andamento": "bg-sky-50 text-sky-700 border-sky-200",
  "Não Iniciada": "bg-zinc-100 text-zinc-600 border-zinc-200",
  "Atrasada": "bg-red-50 text-red-700 border-red-200",
};

const fmtDate = (d: string | null) => {
  if (!d) return null;
  try { return format(new Date(d + "T12:00:00"), "dd/MM/yyyy"); } catch { return null; }
};

export default function OSPublica() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [os, setOs] = useState<OSData | null>(null);
  const [blocoNome, setBlocoNome] = useState("—");
  const [ativoNome, setAtivoNome] = useState<string | null>(null);
  const [materiais, setMateriais] = useState<MaterialOS[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);

   const {
  data: { user },
} = await supabase.auth.getUser();

if (!user) {
  setLoading(false);
  return;
}

const { data: profile }: any = await (supabase as any)
  .from("profiles")
  .select("company_id")
  .eq("user_id", user.id)
  .single();

if (!profile?.company_id) {
  setLoading(false);
  return;
}

const companyId = profile.company_id;

const { data: osData } = await (supabase as any)
  .from("ordens_servico")
  .select("*")
  .eq("id", id)
  .eq("company_id", companyId)
  .single();

    if (!osData) { setLoading(false); return; }
    setOs(osData as OSData);

    const promises: Promise<any>[] = [];

    if (osData.bloco_id) {
  promises.push(
    (supabase as any)
      .from("blocos")
      .select("nome")
      .eq("company_id", companyId)
      .eq("id", osData.bloco_id)
      .single()
      .then(({ data }: any) => {
        setBlocoNome(data?.nome || "—");
      }) as unknown as Promise<any>
  );
}

    if (osData.ativo_id) {
  promises.push(
    (supabase as any)
      .from("ativos")
      .select("nome")
      .eq("company_id", companyId)
      .eq("id", osData.ativo_id)
      .single()
      .then(({ data }: any) => {
        setAtivoNome(data?.nome || null);
      }) as unknown as Promise<any>
  );
}

    promises.push(
      (supabase as any).from("materiais_os").select("*").eq("company_id", companyId).eq("os_id", id).order("created_at", { ascending: true }).then(({ data }: any) => setMateriais((data as MaterialOS[]) || []))
    );

    await Promise.all(promises);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <p className="text-muted-foreground text-sm">Carregando O.S...</p>
      </div>
    );
  }

  if (!os) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 gap-4">
        <ClipboardList className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-muted-foreground text-center">Ordem de Serviço não encontrada.</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/ordens-servico")}>
          Ir para Ordens de Serviço
        </Button>
      </div>
    );
  }

  const prazo = fmtDate(os.prazo);
  const inicio = fmtDate(os.data_inicio);
  const termino = fmtDate(os.data_termino);
  const prazoDate = os.prazo ? new Date(os.prazo + "T12:00:00") : null;
  const isOverdue = prazoDate && prazoDate < new Date() && os.status !== "Concluída";

  const locParts = [blocoNome !== "—" ? blocoNome : null, os.andar, os.sala].filter(Boolean);

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-3 w-3" /> Voltar
          </Button>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Atlas Control</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Hero */}
        <Card>
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-mono">{os.codigo_os || "Sem código"}</p>
                <h1 className="text-lg font-bold leading-tight mt-0.5">
                  {os.titulo || os.equipamentos || "Ordem de Serviço"}
                </h1>
              </div>
              <span className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border shrink-0",
                STATUS_MAP[os.status || ""] || "bg-muted text-muted-foreground border-border"
              )}>
                {os.status || "—"}
              </span>
            </div>

            <Separator />

            {/* Localização */}
            {locParts.length > 0 && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm">{locParts.join(" › ")}</p>
              </div>
            )}

            {/* Datas */}
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-sm space-y-0.5">
                {inicio && <p>Início: {inicio}</p>}
                {prazo && (
                  <p className={cn(isOverdue && "text-red-600 font-medium")}>
                    Prazo: {prazo} {isOverdue && "⚠️"}
                  </p>
                )}
                {termino && <p>Término: {termino}</p>}
                {!inicio && !prazo && !termino && <p className="text-muted-foreground">Sem datas definidas</p>}
              </div>
            </div>

            {/* Equipamentos */}
            {os.equipamentos && (
              <div className="flex items-start gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm whitespace-pre-line">{os.equipamentos}</p>
              </div>
            )}

            {/* Ativo vinculado */}
            {ativoNome && os.ativo_id && (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between text-xs"
                onClick={() => navigate(`/ativo/${os.ativo_id}`)}
              >
                <span>Ativo: {ativoNome}</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Descrição / Observações */}
        {(os.descricao || os.observacoes) && (
          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Detalhes</span>
              </div>
              {os.descricao && <p className="text-sm whitespace-pre-line">{os.descricao}</p>}
              {os.observacoes && (
                <div className="rounded-md bg-muted/50 p-3">
                  <p className="text-sm whitespace-pre-line">{os.observacoes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Materiais */}
        {materiais.length > 0 && (
          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Materiais</span>
                </div>
                {os.custo_total != null && (
                  <span className="text-sm font-bold text-primary">
                    R$ {Number(os.custo_total).toFixed(2)}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {materiais.map(m => (
                  <div key={m.id} className="flex items-center justify-between text-sm rounded-md border p-2.5">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{m.nome_material}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.quantidade} {m.unidade || "un"} × R$ {m.custo_unitario.toFixed(2)}
                      </p>
                    </div>
                    <span className="font-semibold shrink-0 ml-2">
                      R$ {(m.custo_total_item ?? m.quantidade * m.custo_unitario).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
