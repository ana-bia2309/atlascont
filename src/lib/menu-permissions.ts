/**
 * Menu permission keys and hierarchy.
 * Each key maps to a sidebar menu item.
 * Parent keys control visibility of the entire group.
 */

export type MenuTreeItem = {
  key: string;
  label: string;
  children: { key: string; label: string }[];
};

export const MENU_ITEMS_TREE: MenuTreeItem[] = [
  { key: "menu.dashboard", label: "Dashboard", children: [] },
  {
    key: "menu.os",
    label: "Ordens de Serviço",
    children: [
      { key: "menu.os.painel", label: "Painel de O.S." },
      { key: "menu.os.minhas", label: "Minhas Ordens de Serviço" },
      { key: "menu.os.cronogramas", label: "Cronogramas" },
      { key: "menu.os.chamados-os", label: "Chamados (O.S.)" },
      { key: "menu.os.chamados-externos", label: "Chamados Externos" },
      { key: "menu.os.preventivas", label: "Planos de Manutenção" },
      { key: "menu.os.ordens-preventivas", label: "Ordens Preventivas" },
      { key: "menu.os.chamados", label: "Chamados" },
      { key: "menu.os.relatorios", label: "Relatórios" },
      { key: "menu.os.relatorio-homem-hora", label: "Relatório Homem-Hora" },
      { key: "menu.os.historico", label: "Histórico Atividades" },
      { key: "menu.os.sla", label: "Definições de SLA" },
      { key: "menu.os.checklist-templates", label: "Checklist Templates" },
    ],
  },
  {
    key: "menu.custos",
    label: "Gestão de Custos",
    children: [
      { key: "menu.custos.gastos", label: "Gastos" },
      { key: "menu.custos.relatorio-mensal", label: "Relatório Mensal" },
      { key: "menu.custos.tipos-gasto", label: "Tipos de Gasto" },
    ],
  },
  {
    key: "menu.almoxarifado",
    label: "Almoxarifado",
    children: [
      { key: "menu.almoxarifado.materiais", label: "Cadastro de Materiais" },
      { key: "menu.almoxarifado.estoque", label: "Estoque" },
      { key: "menu.almoxarifado.pedidos-compra", label: "Pedidos de Compra" },
      { key: "menu.almoxarifado.pedidos-recebidos", label: "Pedidos Recebidos" },
    ],
  },
  {
    key: "menu.cadastros",
    label: "Cadastros",
    children: [
      { key: "menu.cadastros.blocos", label: "Unidades de Manutenção" },
      { key: "menu.cadastros.ativos", label: "Ativos" },
      { key: "menu.cadastros.controle-acesso", label: "Controle de Acesso" },
      { key: "menu.cadastros.perfis", label: "Perfis de Acesso" },
    ],
  },
  
];

/** Flat list of all menu keys */
export const ALL_MENU_KEYS: string[] = MENU_ITEMS_TREE.flatMap((item) => [
  item.key,
  ...item.children.map((c) => c.key),
]);

/** Map route paths → menu keys */
export const ROUTE_TO_MENU_KEY: Record<string, string> = {
  "/dashboard": "menu.dashboard",
  "/ordens-servico": "menu.os.painel",
  "/minhas-ordens-servico": "menu.os.minhas",
  "/cronogramas": "menu.os.cronogramas",
  "/preventivas": "menu.os.preventivas",
  "/ordens-preventivas": "menu.os.ordens-preventivas",
  "/chamados": "menu.os.chamados",
  "/chamados-os": "menu.os.chamados-os",
  "/chamados-externos": "menu.os.chamados-externos",
  "/relatorios": "menu.os.relatorios",
  "/relatorio-homem-hora": "menu.os.relatorio-homem-hora",
  "/historico-atividades": "menu.os.historico",
  "/gastos": "menu.custos.gastos",
  "/relatorio-mensal": "menu.custos.relatorio-mensal",
  "/tipos-gasto": "menu.custos.tipos-gasto",
  "/blocos": "menu.cadastros.blocos",
  "/ativos": "menu.cadastros.ativos",
  "/controle-acesso": "menu.cadastros.controle-acesso",
  "/perfis-acesso": "menu.cadastros.perfis",
  "/materiais": "menu.almoxarifado.materiais",
  "/estoque": "menu.almoxarifado.estoque",
  "/pedidos-compra": "menu.almoxarifado.pedidos-compra",
  "/pedidos-recebidos": "menu.almoxarifado.pedidos-recebidos",
  "/sla": "menu.os.sla",
  "/checklist-templates": "menu.os.checklist-templates",
};

/** Map sidebar item URLs → menu keys (same as ROUTE_TO_MENU_KEY but keyed for sidebar use) */
export const URL_TO_MENU_KEY = ROUTE_TO_MENU_KEY;

/** Get the parent menu key for a child key */
export function getParentMenuKey(childKey: string): string | null {
  for (const item of MENU_ITEMS_TREE) {
    if (item.children.some((c) => c.key === childKey)) {
      return item.key;
    }
  }
  return null;
}
