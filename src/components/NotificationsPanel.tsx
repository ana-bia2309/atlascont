import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Bell, DollarSign } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format, differenceInDays, parseISO } from "date-fns";

interface Notification {
  id: string;
  os_id: string;
  read: boolean;
  created_at: string;
  codigo_os?: string;
  type?: "os" | "boleto";
  titulo?: string;
  dias?: number;
}

interface BoletoAlerta {
  id: string;
  descricao: string;
  data_vencimento: string;
  valor: number;
  status: string;
}

export function NotificationsPanel() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [boletosAlerta, setBoletosAlerta] = useState<BoletoAlerta[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [diasAlerta, setDiasAlerta] = useState<number>(7);

  useEffect(() => {
    if (!session?.user) return;
    (supabase as any)
      .from("profiles")
      .select("id, company_id")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          setProfileId(data.id);
          setCompanyId(data.company_id);
        }
      });
  }, [session?.user?.id]);

  // Carregar configuração de dias de alerta do localStorage
  useEffect(() => {
    const saved = localStorage.getItem("boleto_dias_alerta");
    if (saved) setDiasAlerta(Number(saved));
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!profileId) return;
    const { data: profileData }: any = await (supabase as any)
      .from("profiles")
      .select("company_id")
      .eq("id", profileId)
      .single();
    if (!profileData?.company_id) return;

    const { data } = await (supabase as any)
      .from("os_notifications")
      .select("id, os_id, read, created_at")
      .eq("user_id", profileId)
      .eq("company_id", profileData.company_id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!data) return;
    const osIds = [...new Set(data.map((n: any) => n.os_id).filter(Boolean))];
    if (osIds.length === 0) { setNotifications([]); return; }
    const { data: osList } = await (supabase as any)
      .from("ordens_servico")
      .select("id, codigo_os")
      .eq("company_id", profileData.company_id)
      .in("id", osIds);
    const osMap: Record<string, string> = {};
    (osList || []).forEach((os: any) => { osMap[os.id] = os.codigo_os || os.id.slice(0, 8); });
    setNotifications(data.map((n: any) => ({
      ...n, type: "os", codigo_os: osMap[n.os_id] || n.os_id.slice(0, 8),
    })));
  }, [profileId]);

  const fetchBoletosAlerta = useCallback(async () => {
    if (!companyId) return;
    const hoje = new Date().toISOString().slice(0, 10);
    const limite = new Date();
    limite.setDate(limite.getDate() + diasAlerta);
    const limiteStr = limite.toISOString().slice(0, 10);

    const { data } = await (supabase as any)
      .from("boletos")
      .select("id, descricao, data_vencimento, valor, status")
      .eq("company_id", companyId)
      .in("status", ["pendente", "vencido"])
      .lte("data_vencimento", limiteStr)
      .order("data_vencimento", { ascending: true });

    setBoletosAlerta(data || []);
  }, [companyId, diasAlerta]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);
  useEffect(() => { fetchBoletosAlerta(); }, [fetchBoletosAlerta]);

  // Recarregar boletos ao abrir o sino
  useEffect(() => { if (open) fetchBoletosAlerta(); }, [open]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const totalBadge = unreadCount + boletosAlerta.length;

  const markAsRead = async (id: string) => {
    await supabase.from("os_notifications").update({ read: true } as any).eq("id", id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    if (!profileId) return;
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("os_notifications").update({ read: true } as any).in("id", unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleClickNotification = (n: Notification) => {
    markAsRead(n.id);
    setOpen(false);
    navigate(`/ordens-servico`);
  };

  const getBoletoLabel = (b: BoletoAlerta) => {
    const dias = differenceInDays(parseISO(b.data_vencimento), new Date());
    if (b.status === "vencido" || dias < 0) return `🔴 Vencido há ${Math.abs(dias)}d`;
    if (dias === 0) return `⚠️ Vence hoje`;
    return `⚠️ Vence em ${dias}d`;
  };

  if (totalBadge === 0 && notifications.length === 0 && boletosAlerta.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {totalBadge > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] bg-destructive text-destructive-foreground border-0">
              {totalBadge}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-semibold">Notificações</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllRead}>
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto">

          {/* Alertas de Boletos */}
          {boletosAlerta.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-amber-50 border-b">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                  💰 Boletos — Alertas
                </p>
              </div>
              {boletosAlerta.map((b) => (
                <button
                  key={`boleto-${b.id}`}
                  onClick={() => { setOpen(false); navigate("/boletos"); }}
                  className="w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-accent/50 transition-colors bg-amber-50/40"
                >
                  <div className="flex items-start gap-2">
                    <DollarSign className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium truncate">{b.descricao}</p>
                      <p className="text-xs text-amber-700 font-medium">{getBoletoLabel(b)}</p>
                      <p className="text-xs text-muted-foreground">
                        R$ {Number(b.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · {format(parseISO(b.data_vencimento), "dd/MM/yyyy")}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Separador se tiver os dois */}
          {boletosAlerta.length > 0 && notifications.length > 0 && (
            <div className="px-4 py-2 bg-muted/30 border-b">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">🔔 Ordens de Serviço</p>
            </div>
          )}

          {/* Notificações de OS */}
          {notifications.length === 0 && boletosAlerta.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">Nenhuma notificação</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClickNotification(n)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-accent/50 transition-colors",
                  !n.read && "bg-primary/5"
                )}
              >
                <div className="flex items-start gap-2">
                  {!n.read && <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
                  <div className={cn(!n.read ? "" : "ml-4")}>
                    <p className="text-sm font-medium">O.S. {n.codigo_os} atribuída a você</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(n.created_at), "dd/MM/yyyy HH:mm")}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}