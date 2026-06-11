import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Tags, CheckSquare, LayoutGrid, Filter, X } from "@/lib/icons";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";

const PUBLISHED_URL = "https://atlascontrol.systems";

type Bloco = { id: string; nome: string | null };

type Ativo = {
  id: string;
  nome: string;
  codigo_identificacao: string | null;
  bloco_id: string | null;
  sistema: string | null;
  categoria: string | null;
};

type LayoutPreset = {
  label: string;
  cols: number;
  qrSize: number;
  printQrSize: number;
  fontSize: string;
  codeSize: string;
  padding: string;
  gap: string;
  previewCols: string;
};

const LAYOUTS: Record<string, LayoutPreset> = {
  "2x1": {
    label: "Grande (2 por linha)",
    cols: 2, qrSize: 110, printQrSize: 140,
    fontSize: "14px", codeSize: "12px", padding: "24px", gap: "16px",
    previewCols: "grid-cols-2",
  },
  "3x3": {
    label: "Médio (3 por linha)",
    cols: 3, qrSize: 80, printQrSize: 96,
    fontSize: "11px", codeSize: "10px", padding: "16px", gap: "12px",
    previewCols: "grid-cols-2 sm:grid-cols-3",
  },
  "4x4": {
    label: "Pequeno (4 por linha)",
    cols: 4, qrSize: 60, printQrSize: 72,
    fontSize: "9px", codeSize: "8px", padding: "10px", gap: "8px",
    previewCols: "grid-cols-3 sm:grid-cols-4",
  },
  "5x5": {
    label: "Mini (5 por linha)",
    cols: 5, qrSize: 48, printQrSize: 56,
    fontSize: "8px", codeSize: "7px", padding: "8px", gap: "6px",
    previewCols: "grid-cols-3 sm:grid-cols-5",
  },
};

export default function AtivoEtiquetas() {
  const [ativos, setAtivos] = useState<Ativo[]>([]);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState("3x3");
  const printRef = useRef<HTMLDivElement>(null);

  // Filters
  const [filterBloco, setFilterBloco] = useState("all");
  const [filterSistema, setFilterSistema] = useState("all");
  const [filterCategoria, setFilterCategoria] = useState("all");

  const preset = LAYOUTS[layout];

 const fetchData = useCallback(async () => {
  setLoading(true);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { setLoading(false); return; }

  const { data: profile }: any = await supabase
    .from("profiles")
    .select("company_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.company_id) { setLoading(false); return; }

  const companyId = profile.company_id;

  const [ativosRes, blocosRes] = await Promise.all([
    (supabase as any)
      .from("ativos")
      .select("id, nome, codigo_identificacao, bloco_id, sistema, categoria")
      .eq("company_id", companyId)
      .eq("status", "ativo")
      .order("nome"),

    (supabase as any)
      .from("blocos")
      .select("id, nome")
      .eq("company_id", companyId)
      .order("nome"),
  ]);

  if (ativosRes.error) {
    toast({ title: "Erro ao carregar ativos", variant: "destructive" });
  } else {
    setAtivos((ativosRes.data as Ativo[]) || []);
  }

  setBlocos(blocosRes.data || []);
  setLoading(false);
}, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Derive unique filter options
  const sistemas = useMemo(() => [...new Set(ativos.map(a => a.sistema).filter(Boolean))].sort() as string[], [ativos]);
  const categorias = useMemo(() => [...new Set(ativos.map(a => a.categoria).filter(Boolean))].sort() as string[], [ativos]);

  // Filtered list
  const filteredAtivos = useMemo(() => {
    return ativos.filter(a => {
      if (filterBloco !== "all" && a.bloco_id !== filterBloco) return false;
      if (filterSistema !== "all" && a.sistema !== filterSistema) return false;
      if (filterCategoria !== "all" && a.categoria !== filterCategoria) return false;
      return true;
    });
  }, [ativos, filterBloco, filterSistema, filterCategoria]);

  const hasFilters = filterBloco !== "all" || filterSistema !== "all" || filterCategoria !== "all";

  const clearFilters = () => {
    setFilterBloco("all");
    setFilterSistema("all");
    setFilterCategoria("all");
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    const filteredIds = filteredAtivos.map(a => a.id);
    const allSelected = filteredIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) {
        filteredIds.forEach(id => next.delete(id));
      } else {
        filteredIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const selectedAtivos = ativos.filter(a => selected.has(a.id));

  const handlePrint = () => {
    if (selectedAtivos.length === 0) {
      toast({ title: "Selecione ao menos um ativo", variant: "destructive" });
      return;
    }
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Etiquetas - Atlas Control</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
            @page { size: A4; margin: 10mm; }
            .grid {
              display: grid;
              grid-template-columns: repeat(${preset.cols}, 1fr);
              gap: ${preset.gap};
            }
            .label {
              border: 1px solid #d4d4d8;
              border-radius: 10px;
              padding: ${preset.padding};
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 8px;
              background: #fafafa;
              break-inside: avoid;
            }
            .label-name {
              font-size: ${preset.fontSize};
              font-weight: 600;
              text-align: center;
              color: #18181b;
              line-height: 1.3;
              max-width: 100%;
              overflow: hidden;
              text-overflow: ellipsis;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
            }
            .label-code {
              font-size: ${preset.codeSize};
              font-family: 'Courier New', monospace;
              color: #52525b;
              letter-spacing: 0.5px;
            }
            .qr-wrap {
              background: white;
              padding: 6px;
              border-radius: 6px;
            }
            @media print {
              .label { border-color: #a1a1aa; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
          <script>window.onload = function(){ window.print(); }<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const blocosMap = useMemo(() => {
    const m: Record<string, string> = {};
    blocos.forEach(b => { if (b.nome) m[b.id] = b.nome; });
    return m;
  }, [blocos]);

  const filteredAllSelected = filteredAtivos.length > 0 && filteredAtivos.every(a => selected.has(a.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Tags className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Etiquetas de Ativos</h1>
            <p className="text-sm text-muted-foreground">Filtre, selecione e imprima etiquetas em lote</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          <Select value={layout} onValueChange={setLayout}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LAYOUTS).map(([key, val]) => (
                <SelectItem key={key} value={key}>{val.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handlePrint} disabled={selected.size === 0} className="gap-2">
            <Printer className="h-4 w-4" />
            Imprimir ({selected.size})
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5" /> Filtros
            </h3>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-xs h-7">
                <X className="h-3 w-3" /> Limpar filtros
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Bloco</label>
              <Select value={filterBloco} onValueChange={setFilterBloco}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {blocos.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.nome || "Sem nome"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Sistema</label>
              <Select value={filterSistema} onValueChange={setFilterSistema}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {sistemas.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Categoria</label>
              <Select value={filterCategoria} onValueChange={setFilterCategoria}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {categorias.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selection list */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">
              Ativos {hasFilters ? "filtrados" : ""} ({filteredAtivos.length})
            </h3>
            <Button variant="ghost" size="sm" onClick={toggleAllFiltered} className="gap-1.5 text-xs">
              <CheckSquare className="h-3.5 w-3.5" />
              {filteredAllSelected ? "Desmarcar todos" : "Selecionar todos"}
            </Button>
          </div>

          {loading ? (
            <p className="text-muted-foreground text-sm py-4">Carregando...</p>
          ) : filteredAtivos.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">
              {hasFilters ? "Nenhum ativo encontrado com os filtros selecionados." : "Nenhum ativo cadastrado."}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1">
              {filteredAtivos.map(a => (
                <label
                  key={a.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                    selected.has(a.id) ? "bg-primary/10 border-primary/30" : "hover:bg-muted/50"
                  )}
                >
                  <Checkbox
                    checked={selected.has(a.id)}
                    onCheckedChange={() => toggleSelect(a.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{a.nome}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {a.codigo_identificacao && (
                        <span className="font-mono">{a.codigo_identificacao}</span>
                      )}
                      {a.bloco_id && blocosMap[a.bloco_id] && (
                        <span>• {blocosMap[a.bloco_id]}</span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Label preview */}
      {selectedAtivos.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-4">
              Pré-visualização — {preset.label} ({selectedAtivos.length} etiquetas)
            </h3>
            <div className={cn("grid gap-3", preset.previewCols)}>
              {selectedAtivos.map(a => (
                <div
                  key={a.id}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/30 p-3"
                >
                  <div className="bg-white p-1.5 rounded-md">
                    <QRCodeSVG value={`${PUBLISHED_URL}/ativo/${a.id}`} size={preset.qrSize} level="H" />
                  </div>
                  <p className="text-xs font-semibold text-center leading-tight line-clamp-2">{a.nome}</p>
                  {a.codigo_identificacao && (
                    <span className="text-[10px] font-mono text-muted-foreground tracking-wide">{a.codigo_identificacao}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hidden print content */}
      <div className="hidden">
        <div ref={printRef}>
          <div className="grid">
            {selectedAtivos.map(a => (
              <div key={a.id} className="label">
                <div className="qr-wrap">
                  <QRCodeSVG value={`${PUBLISHED_URL}/ativo/${a.id}`} size={preset.printQrSize} level="H" />
                </div>
                <div className="label-name">{a.nome}</div>
                {a.codigo_identificacao && (
                  <div className="label-code">{a.codigo_identificacao}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
