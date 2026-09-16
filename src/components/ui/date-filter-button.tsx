import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// Filtro de data em botao + calendario (Popover), sempre exibindo dd/MM/yyyy.
// Existe porque <input type="date"> nativo mostra o formato do sistema
// operacional do usuario (as vezes mm/dd/yyyy, americano), nao o da pagina --
// esse componente sempre mostra no formato brasileiro, independente disso.
export function DateFilterButton({
  value,
  onChange,
  placeholder = "Selecione",
  className,
}: {
  value: string; // yyyy-MM-dd ou ""
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const selected = value ? new Date(value + "T00:00:00") : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("w-36 h-9 justify-start text-left font-normal text-sm", !value && "text-muted-foreground", className)}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
          {selected ? format(selected, "dd/MM/yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => onChange(d ? format(d, "yyyy-MM-dd") : "")}
          initialFocus
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}
