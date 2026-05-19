import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Search, ClipboardList, Box } from "@/lib/icons";
import { getStatusColor } from "@/lib/os-status";

type SearchResult = {
  id: string;
  type: "os" | "ativo";
  title: string;
  subtitle: string;
  status?: string | null;
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const search = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const like = `%${term.trim()}%`;
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
   const [osRes, ativosRes] = await Promise.all([
  (supabase as any)
    .from("ordens_servico")
    .select(
      "id, codigo_os, status, equipamentos, observacoes, sala, andar, bloco_id"
    )
    .eq("company_id", companyId)
    .or(
      `codigo_os.ilike.${like},equipamentos.ilike.${like},observacoes.ilike.${like},sala.ilike.${like},andar.ilike.${like}`
    )
    .limit(15),

  (supabase as any)
    .from("ativos")
    .select(
      "id, nome, codigo_identificacao, patrimonio, sala, responsavel_tecnico, status"
    )
    .eq("company_id", companyId)
    .or(
      `nome.ilike.${like},codigo_identificacao.ilike.${like},patrimonio.ilike.${like},sala.ilike.${like},responsavel_tecnico.ilike.${like}`
    )
    .limit(10),
]);

    const items: SearchResult[] = [];

    if (osRes.data) {
      for (const os of osRes.data) {
        const parts: string[] = [];
        if (os.equipamentos) parts.push(os.equipamentos.substring(0, 60));
        if (os.sala) parts.push(`Sala: ${os.sala}`);
        if (os.andar) parts.push(`Andar: ${os.andar}`);
        items.push({
          id: os.id,
          type: "os",
          title: `O.S. ${os.codigo_os || "s/n"}`,
          subtitle: parts.join(" · ") || "Sem detalhes",
          status: os.status,
        });
      }
    }

    if (ativosRes.data) {
      for (const a of ativosRes.data) {
        const parts: string[] = [];
        if (a.codigo_identificacao) parts.push(a.codigo_identificacao);
        if (a.patrimonio) parts.push(`Pat: ${a.patrimonio}`);
        if (a.sala) parts.push(`Sala: ${a.sala}`);
        if (a.responsavel_tecnico) parts.push(a.responsavel_tecnico);
        items.push({
          id: a.id,
          type: "ativo",
          title: a.nome,
          subtitle: parts.join(" · ") || "Sem detalhes",
          status: a.status,
        });
      }
    }

    setResults(items);
    setLoading(false);
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  const handleSelect = (item: SearchResult) => {
    setOpen(false);
    setQuery("");
    if (item.type === "os") {
      navigate(`/ordens-servico?search=${encodeURIComponent(item.title)}`);
    } else {
      navigate(`/ativos/${item.id}`);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-muted/50 text-muted-foreground text-sm hover:bg-muted transition-colors"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Buscar...</span>
        <kbd className="hidden md:inline-flex h-5 items-center gap-1 rounded border border-border bg-background px-1.5 text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Buscar O.S., equipamento, patrimônio, sala, responsável..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {query.trim().length < 2 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Digite ao menos 2 caracteres para buscar
            </div>
          ) : loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Buscando...
            </div>
          ) : (
            <>
              <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
              {results.filter((r) => r.type === "os").length > 0 && (
                <CommandGroup heading="Ordens de Serviço">
                  {results
                    .filter((r) => r.type === "os")
                    .map((item) => (
                      <CommandItem
                        key={item.id}
                        value={`${item.title} ${item.subtitle}`}
                        onSelect={() => handleSelect(item)}
                        className="cursor-pointer"
                      >
                        <ClipboardList className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{item.title}</span>
                            {item.status && (
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor(item.status)}`}>
                                {item.status}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                        </div>
                      </CommandItem>
                    ))}
                </CommandGroup>
              )}
              {results.filter((r) => r.type === "ativo").length > 0 && (
                <CommandGroup heading="Ativos">
                  {results
                    .filter((r) => r.type === "ativo")
                    .map((item) => (
                      <CommandItem
                        key={item.id}
                        value={`${item.title} ${item.subtitle}`}
                        onSelect={() => handleSelect(item)}
                        className="cursor-pointer"
                      >
                        <Box className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{item.title}</span>
                          <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                        </div>
                      </CommandItem>
                    ))}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
