/**
 * Fonte única de verdade para ícones da aplicação (Atlas Control).
 *
 * Regras:
 * - Todo componente da aplicação DEVE importar ícones a partir deste arquivo:
 *     import { Camera, ChevronRight } from "@/lib/icons";
 * - NÃO importar diretamente de "lucide-react" em telas/componentes de negócio.
 *   Exceção: arquivos de `src/components/ui/*` (shadcn) podem manter o import original.
 * - Para alterar / substituir / remover um ícone globalmente, edite SOMENTE este arquivo.
 *   A mudança propaga automaticamente para web, PWA, mobile, menus, botões, cards etc.
 *
 * Como substituir um ícone global: re-exporte com alias.
 *   Ex.: trocar todos os "Trash" por "Trash2":
 *     export { Trash2 as Trash } from "lucide-react";
 *
 * Versão dos ícones — usada para invalidar caches/assets antigos quando algo muda.
 */
export const ICONS_VERSION = "1.0.0";

// Re-exporta toda a biblioteca a partir de um único ponto.
// Tree-shaking continua funcionando: apenas os ícones efetivamente importados
// pelos consumidores acabam no bundle final.
export * from "lucide-react";
