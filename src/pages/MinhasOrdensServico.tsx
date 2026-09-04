import { useState, useEffect, useCallback, useRef } from "react";
import { isFinishedStatus } from "@/lib/os-status";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, Eye, RefreshCw, Paperclip } from "@/lib/icons";
import { useNavigate } from "react-router-dom";
import { getStatusColor } from "@/lib/os-status";
import AnexosModal from "@/components/os/AnexosModal";
import { usePermissions } from "@/hooks/use-permissions";
import { useUserRole } from "@/hooks/use-user-role";

type OrdemServico = {
  id: string;
  codigo_os: string | null;
  titulo: string | null;
  status: string | null;
  prioridade: string;
  created_at: string | null;
  prazo: string | null;
  bloco_id: string | null;
};

type Bloco = { id: string; nome: string | null };

export default function MinhasOrdensServico() {
  const { session } = useAuth();
  const { can } = usePermissions();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const fetchIdRef = useRef(0);
  const [anexosCounts, setAnexosCounts] = useState<Record<string, number>>({});
  const [anexosModalOsId, setAnexosModalOsId] = useState<string | null>(null);

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

  const fetchData = useCallback(async () => {
    if (!profileId) return;
    const currentFetch = ++fetchIdRef.current;
    setLoading(true);
const {
  data: { user },
} = await supabase.auth.getUser();

if (!user) {
  setLoading(false);
  return;
}

const { data: profile }: any =
  await (supabase as any)
    .from("profiles")
    .select("company_id")
    .eq("user_id", user.id)
    .single();

if (!profile?.company_id) {
  setLoading(false);
  return;
}

const companyId = profile.company_id;
    // Admin sees ALL OS
    if (isAdmin) {
      const [osRes, blocosRes] = await Promise.all([
        (supabase as any)
  .from("ordens_servico")
          .select("id, codigo_os, titulo, status, prioridade, created_at, prazo, bloco_id")
          .eq("company_id", companyId)
          .not("origem", "in", "(Preventiva,Chamado)")
          .order("created_at", { ascending: false }),
        (supabase as any).from("blocos").select("id, nome"),
      ]);

      if (currentFetch !== fetchIdRef.current) return;

      if (osRes.error) {
        toast({ title: "Erro ao carregar O.S.", variant: "destructive" });
      } else {
        setOrdens(osRes.data || []);
       await fetchAnexosCounts(
  osRes.data || [],
  companyId
);
      }
      setBlocos(blocosRes.data || []);
      setLoading(false);
      return;
    }

    // For non-admin: collect OS IDs from all link sources
    const [respData, colabData, legacyData, atividadesData] = await Promise.all([
      // 1. Responsável (os_responsaveis)
      supabase.from("os_responsaveis").select("os_id").eq("profile_id", profileId),
      // 2. Auxiliar (os_colaboradores)
      supabase.from("os_colaboradores").select("os_id").eq("profile_id", profileId),
      // 3. Legacy responsible_user_id (excluindo preventivas)
      (supabase as any)
  .from("ordens_servico")
  .select("id")
  .eq("company_id", companyId)
  .eq("responsible_user_id", profileId)
  .not("origem", "in", "(Preventiva,Chamado)"),
      // 4. Responsável em atividades do cronograma (name match)
      supabase.from("profiles").select("nome").eq("id", profileId).maybeSingle(),
    ]);

    const respOsIds = (respData.data || []).map((r: any) => r.os_id);
    const colabOsIds = (colabData.data || []).map((r: any) => r.os_id);
    const legacyOsIds = (legacyData.data || []).map((r: any) => r.id);

    // Find OS where user is named in atividades_os.responsavel
    let atividadeOsIds: string[] = [];
    const userName = atividadesData.data?.nome;
    if (userName) {

  const { data: ativData } =
    await (supabase as any)
      .from("atividades_os")
      .select("os_id")
      .eq("company_id", companyId)
      .ilike(
        "responsavel",
        `%${userName}%`
      );

  atividadeOsIds = (ativData || []).map(
    (a: any) => a.os_id
  );
}

    if (currentFetch !== fetchIdRef.current) return;

    const allOsIds = [...new Set([...respOsIds, ...colabOsIds, ...legacyOsIds, ...atividadeOsIds])];

    if (allOsIds.length === 0) {
      setOrdens([]);
      setBlocos([]);
      setLoading(false);
      return;
    }

    const [osRes, blocosRes] =
  await Promise.all([
    (supabase as any)
      .from("ordens_servico")
      .select(
        "id, codigo_os, titulo, status, prioridade, created_at, prazo, bloco_id"
      )
      .in("id", allOsIds)
      .eq("company_id", companyId)
      .not(
        "origem",
        "in",
        "(Preventiva,Chamado)"
      )
      .order("created_at", {
        ascending: false,
      }),

    (supabase as any)
  .from("blocos")
  .select("id, nome")
  .eq("company_id", companyId)
  ]);

    if (currentFetch !== fetchIdRef.current) return;

    if (osRes.error) {
      toast({ title: "Erro ao carregar O.S.", variant: "destructive" });
    } else {
      setOrdens(osRes.data || []);
      await fetchAnexosCounts(
  osRes.data || [],
  companyId
);
    }
    setBlocos(blocosRes.data || []);
    setLoading(false);
  }, [profileId, isAdmin]);

  const fetchAnexosCounts = async (
  osList: OrdemServico[],
  companyId: string
) => {
    const osIds = osList.map((o) => o.id);
    if (osIds.length === 0) { setAnexosCounts({}); return; }
   const { data: anexosData } =
  await (supabase as any)
    .from("anexos_os")
    .select("os_id")
    .eq("company_id", companyId)
    .in("os_id", osIds);
    const counts: Record<string, number> = {};
    (anexosData || []).forEach((a: any) => {
      counts[a.os_id] = (counts[a.os_id] || 0) + 1;
    });
    setAnexosCounts(counts);
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const blocosMap = Object.fromEntries(blocos.map((b) => [b.id, b.nome]));

  const filtered = ordens.filter((os) => {
    if (isFinishedStatus(os.status)) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (os.codigo_os || "").toLowerCase().includes(s) ||
      (os.titulo || "").toLowerCase().includes(s)
    );
  });

  const prioridadeColor = (p: string) => {
    switch (p) {
      case "alta": return "destructive";
      case "media": return "default";
      default: return "secondary";
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Minhas Ordens de Serviço</h1>
        <Button variant="outline" size="icon" onClick={fetchData}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por código ou título..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma O.S. atribuída a você.</p>
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Bloco</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((os) => (
                <TableRow key={os.id}>
                  <TableCell className="font-mono text-xs">{os.codigo_os || "—"}</TableCell>
                  <TableCell>{os.titulo || "—"}</TableCell>
                  <TableCell>{os.bloco_id ? blocosMap[os.bloco_id] || "—" : "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getStatusColor(os.status)}>
                      {os.status || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={prioridadeColor(os.prioridade) as any}>
                      {os.prioridade}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {os.prazo ? new Date(os.prazo + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {can("minhas_os.anexar") && (anexosCounts[os.id] || 0) > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setAnexosModalOsId(os.id)}
                          title="Anexos"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          <span className="text-[10px] ml-0.5">{anexosCounts[os.id]}</span>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => navigate(`/ordens-servico?os=${os.id}`)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AnexosModal
        osId={anexosModalOsId}
        open={!!anexosModalOsId}
        onClose={() => setAnexosModalOsId(null)}
      />
    </div>
  );
}
