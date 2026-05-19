import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Fonte única de ícones: proibir import direto de "lucide-react" fora de
      // src/lib/icons.ts e dos componentes shadcn (src/components/ui/*).
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "lucide-react",
              message:
                "Importe ícones de '@/lib/icons' (fonte única). Apenas src/lib/icons.ts e src/components/ui/* podem usar 'lucide-react' diretamente.",
            },
          ],
        },
      ],
    },
  },
  {
    // Permitir o uso direto de lucide-react onde faz sentido.
    files: ["src/lib/icons.ts", "src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
);
