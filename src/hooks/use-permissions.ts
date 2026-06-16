import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/use-user-role";
import { ALL_MENU_KEYS, getParentMenuKey, ROUTE_TO_MENU_KEY } from "@/lib/menu-permissions";

/**
 * Granular permission keys: screen.action
 * Each screen has its own set of applicable actions.
 */
export const PERMISSION_SCREENS = [
  {
    screen: "dashboard",
    label: "Dashboard",
    actions: ["visualizar"],
  },
  {
    screen: "painel_os",
    label: "Painel de O.S.",
    actions: ["visualizar", "criar", "editar", "excluir", "exportar", "baixar", "anexar", "iniciar_cronometro", "pausar_cronometro", "finalizar_cronometro", "visualizar_atividades", "editar_atividades", "visualizar_historico"],
  },
  {
    screen: "minhas_os",
    label: "Minhas Ordens de Serviço",
    actions: ["visualizar", "editar", "anexar", "iniciar_cronometro", "pausar_cronometro", "finalizar_cronometro", "visualizar_atividades", "editar_atividades", "visualizar_historico", "baixar"],
  },
  {
    screen: "cronogramas",
    label: "Cronogramas",
    actions: ["visualizar", "criar", "editar", "excluir", "exportar"],
  },
{
  screen: "preventivas",
  label: "Preventivas",
  actions: ["visualizar", "criar", "editar", "excluir"],
},

{
  screen: "ordens_preventivas",
  label: "Ordens Preventivas",
  actions: ["visualizar", "criar", "editar", "excluir"],
},
  {
    screen: "relatorios",
    label: "Relatórios",
    actions: ["visualizar", "exportar", "baixar"],
  },
  {
    screen: "relatorio_hh",
    label: "Relatório Homem-Hora",
    actions: ["visualizar", "exportar", "baixar"],
  },
  {
    screen: "gastos",
    label: "Gastos",
    actions: ["visualizar", "criar", "editar", "excluir", "exportar"],
  },
  {
    screen: "relatorio_mensal",
    label: "Relatório Mensal",
    actions: ["visualizar", "exportar", "baixar"],
  },
  {
    screen: "tipos_gasto",
    label: "Tipos de Gasto",
    actions: ["visualizar", "criar", "editar", "excluir"],
  },
  {
    screen: "blocos",
    label: "Unidades de Manutenção",
    actions: ["visualizar", "criar", "editar", "excluir"],
  },
  {
    screen: "ativos",
    label: "Ativos",
    actions: ["visualizar", "criar", "editar", "excluir", "exportar"],
  },
  {
    screen: "controle_acesso",
    label: "Controle de Acesso",
    actions: ["visualizar", "criar", "editar", "excluir"],
  },
  {
    screen: "perfis_acesso",
    label: "Perfis de Acesso",
    actions: ["visualizar", "criar", "editar", "excluir"],
  },
  {
    screen: "sla",
    label: "Definições de SLA",
    actions: ["visualizar", "criar", "editar", "excluir"],
  },

  {
    screen: "chamados_os",
    label: "Chamados (O.S.)",
    actions: ["visualizar", "criar"],
  },
  {
    screen: "chamados_externos",
    label: "Chamados Externos",
    actions: ["visualizar", "analisar"],
  },
  {
    screen: "materiais",
    label: "Almoxarifado — Materiais",
    actions: ["visualizar", "criar", "editar", "excluir", "exportar"],
  },
  {
    screen: "estoque",
    label: "Almoxarifado — Estoque",
    actions: ["visualizar", "criar", "editar", "excluir", "exportar"],
  },
  {
    screen: "pedidos_compra",
    label: "Almoxarifado — Pedidos de Compra",
    actions: ["visualizar", "criar", "editar", "excluir"],
  },
] as const;

/** All possible permission keys derived from screens */
export const ALL_PERMISSIONS: string[] = PERMISSION_SCREENS.flatMap((s) =>
  s.actions.map((a) => `${s.screen}.${a}`)
);

/** Human-readable labels for actions */
export const ACTION_LABELS: Record<string, string> = {
  visualizar: "Visualizar",
  criar: "Criar",
  editar: "Editar",
  excluir: "Excluir",
  exportar: "Exportar",
  baixar: "Baixar",
  anexar: "Anexar arquivos",
  iniciar_cronometro: "Iniciar cronômetro",
  pausar_cronometro: "Pausar cronômetro",
  finalizar_cronometro: "Finalizar cronômetro",
  visualizar_atividades: "Visualizar atividades",
  editar_atividades: "Editar atividades",
  visualizar_historico: "Visualizar histórico",
  analisar: "Analisar",
};

export type PermissionKey = string;

/** Map route → the screen prefix used in permissions */
export const ROUTE_TO_SCREEN: Record<string, string> = {
  "/dashboard": "dashboard",
  "/ordens-servico": "painel_os",
  "/minhas-ordens-servico": "minhas_os",
  "/cronogramas": "cronogramas",
  "/preventivas": "preventivas",
  "/ordens-preventivas": "ordens_preventivas",
  "/chamados": "chamados_os",
  "/tipos-atividade": "sla",
  "/relatorios": "relatorios",
  "/relatorio-homem-hora": "relatorio_hh",
  "/gastos": "gastos",
  "/relatorio-mensal": "relatorio_mensal",
  "/tipos-gasto": "tipos_gasto",
  "/blocos": "blocos",
  "/ativos": "ativos",
  "/controle-acesso": "controle_acesso",
  "/perfis-acesso": "perfis_acesso",
  "/sla": "sla",
  "/historico-atividades": "sla",
  "/chamados-os": "chamados_os",
  "/chamados-externos": "chamados_externos",
  "/materiais": "materiais",
  "/estoque": "estoque",
  "/pedidos-compra": "pedidos_compra",
  "/pedidos-recebidos": "pedidos_compra",
};

export const ROUTE_PRIORITY: string[] = [
  "/dashboard",
  "/ordens-servico",
  "/minhas-ordens-servico",
  "/cronogramas",
  "/chamados-os",
  "/chamados-externos",
  "/preventivas",
  "/ordens-preventivas",
  "/chamados",
  "/relatorios",
  "/relatorio-homem-hora",
  "/historico-atividades",
  "/gastos",
  "/relatorio-mensal",
  "/tipos-gasto",
  "/blocos",
  "/ativos",
  "/controle-acesso",
  "/perfis-acesso",
  "/sla",
  "/checklist-templates",
  "/tipos-atividade",
];

function expandMenuKeys(menuKeys: Iterable<string>) {
  const expanded = new Set<string>();
  for (const menuKey of menuKeys) {
    expanded.add(menuKey);
    const parent = getParentMenuKey(menuKey);
    if (parent) expanded.add(parent);
  }
  return expanded;
}

function buildDerivedMenuPermissions(permissions: Set<string>) {
  const derived = new Set<string>();

  for (const route of ROUTE_PRIORITY) {
    const screen = ROUTE_TO_SCREEN[route];
    const menuKey = ROUTE_TO_MENU_KEY[route];

    if (!screen || !menuKey) continue;
    if (!permissions.has(`${screen}.visualizar`)) continue;

    derived.add(menuKey);
    const parent = getParentMenuKey(menuKey);
    if (parent) derived.add(parent);
  }

  return derived;
}

export function getFirstAccessibleRoute(permissions: Set<string>, menuPermissions: Set<string>): string | null {
  for (const route of ROUTE_PRIORITY) {
    const screen = ROUTE_TO_SCREEN[route];
    if (!screen || !permissions.has(`${screen}.visualizar`)) continue;

    const menuKey = ROUTE_TO_MENU_KEY[route];
    if (!menuKey) return route;
    if (menuPermissions.size === 0 || menuPermissions.has(menuKey)) return route;
  }

  return null;
}

interface UsePermissions {
  permissions: Set<string>;
  menuPermissions: Set<string>;
  loading: boolean;
  /** Check if user has a specific permission key like "painel_os.criar" */
  can: (key: string) => boolean;
  /** Check if user can see a menu item */
  canMenu: (menuKey: string) => boolean;
  /** Force re-fetch permissions */
  refetch: () => void;
}

export function usePermissions(): UsePermissions {
  const { session } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [menuPermissions, setMenuPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const fetchIdRef = useRef(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
    console.log("[Permissions] Manual refetch triggered");
    setLoading(true);
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
  if (roleLoading) return;

if (isAdmin) {

  console.log(
    "[Permissions] Admin — granting all"
  );

  setPermissions(
    new Set(ALL_PERMISSIONS)
  );

  setMenuPermissions(
    new Set(ALL_MENU_KEYS)
  );

  setLoading(false);

  return;
}

    if (!session?.user) {
      setPermissions(new Set());
      setMenuPermissions(new Set());
      setLoading(false);
      return;
    }

    const currentFetch = ++fetchIdRef.current;
    let settled = false;
    setLoading(true);

    const fetchPermissions = async () => {
      try {
        console.log("[Permissions] Fetching for", session.user.email);
        const { data: profile }: any = await supabase
  .from("profiles")
  .select("perfil_acesso_id, company_id")
  .eq("user_id", session.user.id)
  .maybeSingle();

        if (currentFetch !== fetchIdRef.current) return;

       if (isAdmin) {

  console.log(
    "[Permissions] Admin bypass"
  );

  setPermissions(
    new Set(ALL_PERMISSIONS)
  );

  setMenuPermissions(
    new Set(ALL_MENU_KEYS)
  );

  setLoading(false);

  return;
}

if (!profile?.perfil_acesso_id) {

  console.log(
    "[Permissions] No perfil_acesso_id found"
  );

  setPermissions(new Set());

  setMenuPermissions(new Set());

  return;
}

        const [permsRes, menuPermsRes] = await Promise.all([
          supabase
            .from("permissoes_perfil")
            .select("permissao")
            .eq("perfil_acesso_id", profile.perfil_acesso_id),
          supabase
            .from("permissoes_menu_perfil")
            .select("menu_key")
            .eq("perfil_acesso_id", profile.perfil_acesso_id),
        ]);

        if (currentFetch !== fetchIdRef.current) return;

      const permSet = new Set<string>((permsRes.data || []).map((p) => p.permissao));

setPermissions(permSet);

console.log("[Permissions] Loaded", permSet.size, "permissions");

console.log("PERMISSIONS:", [...permSet]);

     const explicitMenuSet = expandMenuKeys(
  (menuPermsRes.data || []).map((p) => p.menu_key)
);

const derivedMenuSet = buildDerivedMenuPermissions(permSet);

const finalMenuSet = new Set([
  ...explicitMenuSet,
  ...derivedMenuSet,
]);

        setMenuPermissions(finalMenuSet);
        console.log(
          "[Permissions] Loaded",
          finalMenuSet.size,
          explicitMenuSet.size > 0 ? "explicit menu permissions" : "derived menu permissions"
        );
      } catch (err) {
        if (currentFetch !== fetchIdRef.current) return;
        console.error("[Permissions] Error:", err);
        setPermissions(new Set());
        setMenuPermissions(new Set());
      } finally {
        if (currentFetch === fetchIdRef.current && !settled) {
          settled = true;
          setLoading(false);
        }
      }
    };

    const timeout = setTimeout(() => {
      if (currentFetch === fetchIdRef.current && !settled) {
        settled = true;
        console.warn("[Permissions] Timeout — forcing loading=false");
        setLoading(false);
      }
    }, 10000);

    fetchPermissions();

    return () => {
      settled = true;
      clearTimeout(timeout);
    };
  }, [isAdmin, roleLoading, session?.user?.id, refreshKey]);

 const can = (key: string) => {
  if (isAdmin) return true;

  return permissions.has(key);
};
  const canMenu = (menuKey: string) => {

  if (isAdmin) return true;

  if (menuPermissions.size === 0)
  return false;

  return menuPermissions.has(menuKey);
};

  return { permissions, menuPermissions, loading, can, canMenu, refetch };
}
