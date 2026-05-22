import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/use-user-role";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { format, isToday, isBefore, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { CalendarClock } from "@/lib/icons";

type Atividade = {
  id: string;
  nome: string;
  data_inicio: string;
  data_termino: string;
  status: string;
  responsavel: string | null;
};

interface Props {
  osId: string;
}

export default function AtividadesUsuarioSection({ osId }: Props) {
  const { session } = useAuth();
  const { isAdmin } = useUserRole();
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [userName, setUserName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Get current user's profile name
  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from("profiles")
      .select("nome")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setUserName(data.nome);
      });
  }, [session?.user?.id]);

  const fetchAtividades = useCallback(async () => {
    if (!osId) return;
    // Non-admin needs userName resolved first
    if (!isAdmin && !userName) return;
    setLoading(true);

    let query = supabase
      .from("atividades_os")
      .select("id, nome, data_inicio, data_termino, status, responsavel")
      .eq("os_id", osId)
      .order("data_inicio", { ascending: true });

    // Filter by user only for non-admins
    if (!isAdmin && userName) {
      query = query.eq("responsavel", userName);
    }

    const { data } = await query;
    setAtividades(data || []);
    setLoading(false);
  }, [osId, userName, isAdmin]);

  useEffect(() => {
    fetchAtividades();
  }, [fetchAtividades]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`atividades_usuario_${osId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "atividades_os", filter: `os_id=eq.${osId}` }, () => fetchAtividades())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [osId, fetchAtividades]);

  const today = startOfDay(new Date());

  const isOverdue = (a: Atividade) => {
    const termino = new Date(a.data_termino + "T00:00:00");
    return isBefore(termino, today) && a.status !== "Concluído";
  };

  const isTodayActivity = (a: Atividade) => {
    const inicio = new Date(a.data_inicio + "T00:00:00");
    const termino = new Date(a.data_termino + "T00:00:00");
    return isToday(inicio) || isToday(termino);
  };

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d + "T00:00:00"), "dd/MM/yyyy"); } catch { return d; }
  };

  const statusColor = (s: string) => {
    if (s === "Concluído") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "Em andamento") return "bg-sky-50 text-sky-700 border-sky-200";
    return "bg-zinc-100 text-zinc-600 border-zinc-200";
  };

  const sorted = useMemo(() => {
    return [...atividades].sort((a, b) => {
      const aOver = isOverdue(a) ? 0 : 1;
      const bOver = isOverdue(b) ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      return a.data_inicio.localeCompare(b.data_inicio);
    });
  }, [atividades]);

  if (loading) return <p className="text-sm text-muted-foreground">Carregando atividades...</p>;

  if (atividades.length === 0) {
    return (
      <div>
        <span className="text-muted-foreground block mb-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5" /> {isAdmin ? "Atividades da O.S." : "Minhas Atividades"}
        </span>
        <p className="text-sm text-muted-foreground">{isAdmin ? "Nenhuma atividade nesta O.S." : "Nenhuma atividade atribuída a você nesta O.S."}</p>
      </div>
    );
  }

  return (
    <div>
      <span className="text-muted-foreground block mb-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
        <CalendarClock className="h-3.5 w-3.5" /> {isAdmin ? "Atividades da O.S." : "Minhas Atividades"} ({atividades.length})
      </span>
      <div className="rounded-lg border bg-card overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Atividade</TableHead>
              {isAdmin && <TableHead>Responsável</TableHead>}
              <TableHead>Início</TableHead>
              <TableHead>Término</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((a) => {
              const overdue = isOverdue(a);
              const todayItem = isTodayActivity(a) && !overdue;
              const future = !overdue && !todayItem && a.status !== "Concluído";
              return (
                <TableRow
                  key={a.id}
                  className={cn(
                    overdue && "bg-red-500/5",
                    todayItem && "bg-yellow-500/5",
                  )}
                >
                  <TableCell className="w-8 text-center">
                    {overdue && <span className="text-base" title="Atrasada">🔴</span>}
                    {todayItem && <span className="text-base" title="Hoje">🟡</span>}
                    {future && <span className="text-base" title="Futura">🔵</span>}
                    {a.status === "Concluído" && <span className="text-base" title="Concluída">🟢</span>}
                  </TableCell>
                  <TableCell className="font-medium">
                    {a.nome}
                    {todayItem && (
                      <span className="ml-2 text-[10px] font-bold uppercase text-yellow-600 bg-yellow-50 rounded px-1.5 py-0.5">
                        HOJE
                      </span>
                    )}
                    {overdue && (
                      <span className="ml-2 text-[10px] font-bold uppercase text-red-600 bg-red-50 rounded px-1.5 py-0.5">
                        ATRASADA
                      </span>
                    )}
                  </TableCell>
                  {isAdmin && <TableCell className="text-xs">{a.responsavel || "—"}</TableCell>}
                  <TableCell className="text-xs">{fmtDate(a.data_inicio)}</TableCell>
                  <TableCell className="text-xs">{fmtDate(a.data_termino)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColor(a.status)}>
                      {a.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
