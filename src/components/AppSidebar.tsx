import {
  Gauge, ClipboardList, CalendarRange, Wrench, BarChart3, Clock, Activity,
  DollarSign, Timer, ListChecks, Building2, Box, ShieldCheck, KeyRound, LogOut, User, Settings, Briefcase, ChevronRight, MessagesSquare,
} from "@/lib/icons";
import { usePendingCounts } from "@/hooks/use-pending-counts";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { NavLink } from "@/components/NavLink";
import { useNavigate, useLocation } from "react-router-dom";
import { usePermissions } from "@/hooks/use-permissions";
import { URL_TO_MENU_KEY } from "@/lib/menu-permissions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-log";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type MenuItem = {
  title: string;
  url: string;
  icon: any;
  iconColor?: string;
  requiredPermission?: string;
};

type MenuGroup = {
  id: string;
  title: string;
  icon: any;
  iconColor?: string;
  menuKey?: string;
  items: MenuItem[];
};

/* ── Section: Dashboard (standalone) ── */
const dashboardItem: MenuItem = {
  title: "Dashboard", url: "/dashboard", icon: Gauge, iconColor: "#3B82F6", requiredPermission: "dashboard.visualizar",
};

/* ── Section: Operacional ── */
const osGroup: MenuGroup = {
  id: "os", title: "Ordens de Serviço", icon: ClipboardList, iconColor: "#6366F1", menuKey: "menu.os",
  items: [
    { title: "Painel de O.S.", url: "/ordens-servico", icon: ClipboardList, requiredPermission: "painel_os.visualizar" },
    { title: "Minhas Ordens de Serviço", url: "/minhas-ordens-servico", icon: User, requiredPermission: "minhas_os.visualizar" },
    { title: "Cronogramas", url: "/cronogramas", icon: CalendarRange, iconColor: "#64748B", requiredPermission: "cronogramas.visualizar" },
    { title: "Chamados", url: "/chamados-os", icon: MessagesSquare, iconColor: "#0EA5E9", requiredPermission: "chamados_os.visualizar" },
    { title: "Chamados Externos", url: "/chamados-externos", icon: MessagesSquare, iconColor: "#F97316", requiredPermission: "chamados_externos.visualizar" },
  ],
};

/* ── Section: Manutenção Preventiva ── */
const preventivaGroup: MenuGroup = {
  id: "preventiva",
  title: "Manutenção Preventiva",
  icon: Wrench,
  iconColor: "#22C55E",
  menuKey: "menu.os",
  items: [
    {
      title: "Planos de Manutenção",
      url: "/preventivas",
      icon: Wrench,
      iconColor: "#22C55E",
      requiredPermission: "preventivas.visualizar"
    },
    {
      title: "Ordens Preventivas",
      url: "/ordens-preventivas",
      icon: ClipboardList,
      iconColor: "#22C55E",
      requiredPermission: "preventivas.visualizar"
    },
    {
      title: "Chamados",
      url: "/chamados",
      icon: MessagesSquare,
      iconColor: "#F97316"
    },
  ],
};

/* ── Section: Gestão ── */
const relatoriosGroup: MenuGroup = {
  id: "relatorios", title: "Relatórios", icon: BarChart3, iconColor: "#14B8A6", menuKey: "menu.os",
  items: [
    { title: "Relatórios", url: "/relatorios", icon: BarChart3, requiredPermission: "relatorios.visualizar" },
    { title: "Relatório Homem-Hora", url: "/relatorio-homem-hora", icon: Clock, iconColor: "#0EA5E9", requiredPermission: "relatorio_hh.visualizar" },
    { title: "Histórico Atividades", url: "/historico-atividades", icon: Activity, iconColor: "#6B7280", requiredPermission: "sla.visualizar" },
  ],
};

const custosGroup: MenuGroup = {
  id: "custos", title: "Gestão de Custos", icon: DollarSign, iconColor: "#F59E0B", menuKey: "menu.custos",
  items: [
    { title: "Gastos", url: "/gastos", icon: DollarSign, requiredPermission: "gastos.visualizar" },
    { title: "Relatório Mensal", url: "/relatorio-mensal", icon: CalendarRange, requiredPermission: "relatorio_mensal.visualizar" },
    { title: "Tipos de Gasto", url: "/tipos-gasto", icon: DollarSign, requiredPermission: "tipos_gasto.visualizar" },
  ],
};

/* ── Section: Configurações ── */
const configGroup: MenuGroup = {
  id: "config", title: "Configurações", icon: Settings, iconColor: "#374151", menuKey: "menu.os",
  items: [
    { title: "Definições de SLA", url: "/sla", icon: Timer, requiredPermission: "sla.visualizar" },
    { title: "Checklist Templates", url: "/checklist-templates", icon: ListChecks, requiredPermission: "checklist_templates.visualizar" },
    { title: "Tipos de Atividade", url: "/tipos-atividade", icon: ClipboardList, requiredPermission: "sla.visualizar" },
  ],
};

const cadastrosGroup: MenuGroup = {
  id: "cadastros", title: "Cadastros", icon: Briefcase, iconColor: "#2563EB", menuKey: "menu.cadastros",
  items: [
    { title: "Unidades de Manutenção", url: "/blocos", icon: Building2, requiredPermission: "blocos.visualizar" },
    { title: "Ativos", url: "/ativos", icon: Box, requiredPermission: "ativos.visualizar" },
    { title: "Controle de Acesso", url: "/controle-acesso", icon: ShieldCheck, requiredPermission: "controle_acesso.visualizar" },
    { title: "Perfis de Acesso", url: "/perfis-acesso", icon: KeyRound, requiredPermission: "perfis_acesso.visualizar" },
  ],
};

/* ── Sidebar standalone item (Dashboard-level) ── */
function SidebarTopItem({ item, collapsed }: { item: MenuItem; collapsed: boolean }) {
  const iconStyle = item.iconColor ? { color: item.iconColor } : undefined;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild className="h-9">
        <NavLink
          to={item.url}
          className="relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-full before:bg-sidebar-primary"
        >
          <item.icon className="h-4 w-4 shrink-0" strokeWidth={2} style={iconStyle} />
          {!collapsed && <span className="truncate">{item.title}</span>}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/* ── Sidebar Sub-Item Component (lighter weight) ── */
function SidebarSubItem({ item, collapsed, badgeCount }: { item: MenuItem; collapsed: boolean; badgeCount?: number }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild className="h-8">
        <NavLink
          to={item.url}
          className="relative flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-normal text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          activeClassName="bg-sidebar-accent text-sidebar-primary font-medium before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-full before:bg-sidebar-primary"
        >
          <item.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
          {!collapsed && <span className="truncate">{item.title}</span>}
          {!collapsed && badgeCount != null && badgeCount > 0 && (
            <span className="ml-auto inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold min-w-[18px] h-[18px] px-1">
              {badgeCount}
            </span>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/* ── Collapsible Group Component ── */
function CollapsibleGroup({
  group, collapsed, open, onToggle, filterItems, badgeCounts,
}: {
  group: MenuGroup;
  collapsed: boolean;
  open: boolean;
  onToggle: (id: string) => void;
  filterItems: (items: MenuItem[]) => MenuItem[];
  badgeCounts?: Record<string, number>;
}) {
  const visible = filterItems(group.items);
  if (visible.length === 0) return null;

  const groupIconStyle = group.iconColor ? { color: group.iconColor } : undefined;
  const totalBadge = badgeCounts ? visible.reduce((sum, item) => sum + (badgeCounts[item.url] || 0), 0) : 0;

  return (
    <Collapsible open={open} onOpenChange={() => onToggle(group.id)}>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton className="h-9 w-full justify-between hover:bg-sidebar-accent">
            <span className="flex items-center gap-2">
              <group.icon className="h-4 w-4 shrink-0" strokeWidth={2} style={groupIconStyle} />
              {!collapsed && <span className="text-sm font-semibold text-sidebar-foreground">{group.title}</span>}
            </span>
            {!collapsed && (
              <span className="flex items-center gap-1">
                {!open && totalBadge > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold min-w-[18px] h-[18px] px-1">
                    {totalBadge}
                  </span>
                )}
                <ChevronRight
                  className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", open && "rotate-90")}
                />
              </span>
            )}
          </SidebarMenuButton>
        </CollapsibleTrigger>
      </SidebarMenuItem>
      <CollapsibleContent>
        <SidebarMenu className="ml-3 border-l border-sidebar-border pl-2">
          {visible.map((item) => (
            <SidebarSubItem key={item.url} item={item} collapsed={collapsed} badgeCount={badgeCounts?.[item.url]} />
          ))}
        </SidebarMenu>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ── Main Sidebar ── */
export function AppSidebar() {
  console.log("SIDEBAR NOVA CARREGADA");
  const { state } = useSidebar();
  const { can, canMenu } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const collapsed = state === "collapsed";
  const { minhasOs, cronogramasPendentes } = usePendingCounts();
  const { session } = useAuth();

  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) { setUserName(null); return; }

    let cancelled = false;
    supabase
      .from("profiles")
      .select("nome")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setUserName(data?.nome ?? null);
        }
      });

    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const badgeCounts: Record<string, number> = {
    "/minhas-ordens-servico": minhasOs,
    "/cronogramas": cronogramasPendentes,
  };

  // Accordion: only one group open at a time
  const allGroups = [osGroup, preventivaGroup, relatoriosGroup, custosGroup, configGroup, cadastrosGroup];
  const initialOpen = allGroups.find((g) =>
    g.items.some((i) => location.pathname === i.url || location.pathname.startsWith(i.url + "/"))
  )?.id ?? null;

  const [openGroupId, setOpenGroupId] = useState<string | null>(initialOpen);

  const handleToggle = useCallback((id: string) => {
    setOpenGroupId((prev) => (prev === id ? null : id));
  }, []);

const filterItems = useCallback(
  (items: MenuItem[]) =>
    items.filter((item) => {

    if (
  item.requiredPermission &&
  !can(item.requiredPermission)
) return false;

      const menuKey =
        URL_TO_MENU_KEY[item.url];

     if (
  menuKey &&
  !canMenu(menuKey)
) return false;

      return true;
    }),
  [can, canMenu],
);

  const showDashboard = can("dashboard.visualizar") && canMenu("menu.dashboard");

  const handleLogout = async () => {
    logActivity({ actionType: "logout", module: "Autenticação", description: "Logout realizado" });
    await supabase.auth.signOut();
    toast({ title: "Sessão encerrada" });
    navigate("/login");
  };

  const groupProps = (group: MenuGroup) => ({
    group,
    collapsed,
    open: openGroupId === group.id,
    onToggle: handleToggle,
    filterItems,
    badgeCounts,
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="py-2">
        {/* Brand */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {!collapsed && "Atlas Control"}
          </SidebarGroupLabel>
          {!collapsed && userName && (
            <div className="px-3 pb-1 text-xs text-muted-foreground leading-snug">
              <span className="font-medium text-sidebar-foreground">Olá, {userName}.</span>{" "}
              Seja bem-vindo(a).
            </div>
          )}
        </SidebarGroup>

        {/* Dashboard */}
        {showDashboard && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarTopItem item={dashboardItem} collapsed={collapsed} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <Separator className="mx-3 my-1 w-auto" />

        {/* Operacional */}
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Operacional
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              <CollapsibleGroup {...groupProps(osGroup)} />
              <CollapsibleGroup {...groupProps(preventivaGroup)} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="mx-3 my-1 w-auto" />

        {/* Gestão */}
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Gestão
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              <CollapsibleGroup {...groupProps(relatoriosGroup)} />
              <CollapsibleGroup {...groupProps(custosGroup)} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="mx-3 my-1 w-auto" />

        {/* Configurações */}
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Configurações
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              <CollapsibleGroup {...groupProps(configGroup)} />
              <CollapsibleGroup {...groupProps(cadastrosGroup)} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center justify-center py-1">
              <NotificationsPanel />
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} className="hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
              <LogOut className="mr-2 h-4 w-4" strokeWidth={1.75} />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
