import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { X, ChevronsUpDown, Search } from "@/lib/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type UserOption = {
  id: string;
  nome: string;
  job_title?: string | null;
};

interface MultiUserSelectProps {
  label: string;
  options: UserOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** IDs to exclude from the dropdown (e.g. users already selected in another field) */
  excludeIds?: string[];
}

export default function MultiUserSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "Selecionar...",
  disabled = false,
  excludeIds = [],
}: MultiUserSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [open]);

  const available = options.filter(
    (o) =>
      !selected.includes(o.id) &&
      !excludeIds.includes(o.id) &&
      (search === "" ||
        o.nome.toLowerCase().includes(search.toLowerCase()) ||
        (o.job_title || "").toLowerCase().includes(search.toLowerCase()))
  );

  const handleSelect = (id: string) => {
    onChange([...selected, id]);
  };

  const handleRemove = (id: string) => {
    onChange(selected.filter((s) => s !== id));
  };

  const selectedNames = selected.map((id) => {
    const opt = options.find((o) => o.id === id);
    return { id, nome: opt?.nome || id };
  });

  return (
    <div>
      <label className="text-sm font-medium mb-1 block">{label}</label>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedNames.map((u) => (
            <Badge key={u.id} variant="secondary" className="gap-1 pr-1">
              {u.nome}
              {!disabled && (
                <button
                  onClick={() => handleRemove(u.id)}
                  className="ml-0.5 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
              disabled={disabled}
            >
              <span className="text-muted-foreground">{placeholder}</span>
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <div className="flex items-center border-b px-3 py-2">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar usuário..."
                className="flex h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-[200px] overflow-y-auto p-1">
              {available.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nenhum usuário disponível
                </p>
              ) : (
                available.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                    onClick={() => {
                      handleSelect(o.id);
                      setSearch("");
                    }}
                  >
                    {o.nome}
                    {o.job_title && (
                      <span className="ml-1 text-muted-foreground">— {o.job_title}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
