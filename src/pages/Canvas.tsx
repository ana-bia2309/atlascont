import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, RefreshCw, ChevronLeft, Download, Square, Circle, Minus, Type, StickyNote, MousePointer, PenLine } from "@/lib/icons";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type Board = {
  id: string;
  nome: string;
  created_at: string;
  updated_at: string;
};

type Elemento = {
  id: string;
  board_id: string;
  tipo: "retangulo" | "circulo" | "texto" | "sticky" | "linha" | "seta" | "desenho";
  x: number;
  y: number;
  largura: number;
  altura: number;
  conteudo: string | null;
  cor: string;
  cor_fundo: string;
  tamanho_fonte: number;
  ordem: number;
  pontos?: string; // para desenho livre
};

type Tool = "select" | "retangulo" | "circulo" | "texto" | "sticky" | "linha" | "seta" | "desenho";

const CORES = ["#6366F1", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#000000", "#6B7280"];
const CORES_FUNDO = ["#EEF2FF", "#EFF6FF", "#ECFDF5", "#FFFBEB", "#FEF2F2", "#F5F3FF", "#FDF2F8", "#F0FDFA", "#FFFFFF", "#F3F4F6"];

export default function Canvas() {
  const { companyId } = useCompany();
  const [userId, setUserId] = useState<string | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardAtivo, setBoardAtivo] = useState<Board | null>(null);
  const [elementos, setElementos] = useState<Elemento[]>([]);
  const [loading, setLoading] = useState(true);

  // Canvas state
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [cor, setCor] = useState("#6366F1");
  const [corFundo, setCorFundo] = useState("#EEF2FF");
  const [fontSize, setFontSize] = useState(14);
  const [editingText, setEditingText] = useState<string | null>(null);

  // Drag state
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragEl, setDragEl] = useState<Elemento | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [drawPoints, setDrawPoints] = useState<{ x: number; y: number }[]>([]);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // New board dialog
  const [boardDialog, setBoardDialog] = useState(false);
  const [boardNome, setBoardNome] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const fetchBoards = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("canvas_boards").select("*").eq("company_id", companyId).order("updated_at", { ascending: false });
    setBoards(data || []);
    setLoading(false);
  }, [companyId]);

  const fetchElementos = useCallback(async (boardId: string) => {
    const { data } = await (supabase as any)
      .from("canvas_elementos").select("*").eq("board_id", boardId).order("ordem");
    setElementos((data || []).map((e: any) => ({ ...e, pontos: e.conteudo?.startsWith("PONTOS:") ? e.conteudo : undefined })));
  }, []);

  useEffect(() => { fetchBoards(); }, [fetchBoards]);
  useEffect(() => { if (boardAtivo) fetchElementos(boardAtivo.id); }, [boardAtivo, fetchElementos]);

  const createBoard = async () => {
    if (!boardNome.trim()) return;
    const { data } = await (supabase as any).from("canvas_boards").insert({
      nome: boardNome.trim(), company_id: companyId, user_id: userId,
    }).select().single();
    setBoardDialog(false); setBoardNome("");
    fetchBoards();
    if (data) setBoardAtivo(data);
  };

  const deleteBoard = async (id: string) => {
    await (supabase as any).from("canvas_boards").delete().eq("id", id);
    if (boardAtivo?.id === id) setBoardAtivo(null);
    fetchBoards();
    toast({ title: "Canvas excluído" });
  };

  const getSvgPoint = (e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
  };

  const saveElemento = async (el: Partial<Elemento> & { board_id: string }) => {
    const { data } = await (supabase as any).from("canvas_elementos").insert({
      ...el, ordem: elementos.length,
    }).select().single();
    if (data) setElementos(prev => [...prev, data]);
    // Update board timestamp
    await (supabase as any).from("canvas_boards").update({ updated_at: new Date().toISOString() }).eq("id", boardAtivo!.id);
  };

  const updateElemento = async (id: string, updates: Partial<Elemento>) => {
    await (supabase as any).from("canvas_elementos").update(updates).eq("id", id);
    setElementos(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const deleteElemento = async (id: string) => {
    await (supabase as any).from("canvas_elementos").delete().eq("id", id);
    setElementos(prev => prev.filter(e => e.id !== id));
    setSelected(null);
  };

  const handleSvgMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    const pt = getSvgPoint(e);

    if (tool === "select") return;

    if (tool === "desenho") {
      setDrawing(true);
      setDrawPoints([pt]);
      return;
    }

    if (tool === "linha" || tool === "seta") {
      setDrawStart(pt);
      setDrawing(true);
      return;
    }

    // Shapes & text
    if (["retangulo", "circulo", "texto", "sticky"].includes(tool)) {
      setDrawStart(pt);
      setDrawing(true);
    }
  };

  const handleSvgMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }
    if (dragging && dragEl) {
      const pt = getSvgPoint(e);
      const dx = pt.x - dragStart.x;
      const dy = pt.y - dragStart.y;
      setElementos(prev => prev.map(el => el.id === dragEl.id
        ? { ...el, x: dragEl.x + dx, y: dragEl.y + dy } : el));
    }
    if (drawing && tool === "desenho") {
      const pt = getSvgPoint(e);
      setDrawPoints(prev => [...prev, pt]);
    }
  };

  const handleSvgMouseUp = async (e: React.MouseEvent) => {
    if (isPanning) { setIsPanning(false); return; }

    if (dragging && dragEl) {
      const pt = getSvgPoint(e);
      const dx = pt.x - dragStart.x;
      const dy = pt.y - dragStart.y;
      await updateElemento(dragEl.id, { x: dragEl.x + dx, y: dragEl.y + dy });
      setDragging(false); setDragEl(null);
      return;
    }

    if (!drawing) return;
    setDrawing(false);

    const pt = getSvgPoint(e);

    if (tool === "desenho" && drawPoints.length > 1) {
      const pontos = drawPoints.map(p => `${p.x},${p.y}`).join(" ");
      await saveElemento({
        board_id: boardAtivo!.id, tipo: "desenho",
        x: 0, y: 0, largura: 0, altura: 0,
        conteudo: `PONTOS:${pontos}`, cor, cor_fundo: "none", tamanho_fonte: fontSize,
      });
      setDrawPoints([]);
      return;
    }

    const x = Math.min(drawStart.x, pt.x);
    const y = Math.min(drawStart.y, pt.y);
    const w = Math.abs(pt.x - drawStart.x);
    const h = Math.abs(pt.y - drawStart.y);

    if (tool === "linha" || tool === "seta") {
      if (w < 5 && h < 5) return;
      await saveElemento({
        board_id: boardAtivo!.id, tipo: tool === "seta" ? "seta" : "linha",
        x: drawStart.x, y: drawStart.y, largura: pt.x, altura: pt.y,
        conteudo: null, cor, cor_fundo: "none", tamanho_fonte: fontSize,
      });
      return;
    }

    if (w < 10 && h < 10 && tool === "texto") {
      await saveElemento({
        board_id: boardAtivo!.id, tipo: "texto",
        x: drawStart.x, y: drawStart.y, largura: 200, altura: 40,
        conteudo: "Texto", cor, cor_fundo: "none", tamanho_fonte: fontSize,
      });
      return;
    }

    if (w < 10 && h < 10) return;

    const tipo = tool as Elemento["tipo"];
    await saveElemento({
      board_id: boardAtivo!.id, tipo,
      x, y, largura: w || 120, altura: h || 80,
      conteudo: tool === "sticky" ? "Nota..." : tool === "texto" ? "Texto" : null,
      cor, cor_fundo: tool === "sticky" ? "#FEF9C3" : corFundo, tamanho_fonte: fontSize,
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(Math.max(z * delta, 0.2), 3));
  };

  const exportPNG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${boardAtivo?.nome || "canvas"}.svg`;
    a.click(); URL.revokeObjectURL(url);
  };

  const renderElemento = (el: Elemento) => {
    const isSelected = selected === el.id;
    const selStyle = isSelected ? { outline: "2px solid #6366F1", outlineOffset: "2px" } : {};

    const onMouseDown = (e: React.MouseEvent) => {
      if (tool !== "select") return;
      e.stopPropagation();
      setSelected(el.id);
      setDragging(true);
      setDragEl(el);
      setDragStart(getSvgPoint(e));
    };

    if (el.tipo === "desenho" && el.conteudo?.startsWith("PONTOS:")) {
      const pts = el.conteudo.replace("PONTOS:", "");
      return (
        <polyline key={el.id} points={pts} fill="none" stroke={el.cor} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ cursor: "pointer" }} onMouseDown={onMouseDown} />
      );
    }

    if (el.tipo === "linha" || el.tipo === "seta") {
      return (
        <g key={el.id} onMouseDown={onMouseDown} style={{ cursor: "pointer" }}>
          <line x1={el.x} y1={el.y} x2={el.largura} y2={el.altura}
            stroke={el.cor} strokeWidth="2" markerEnd={el.tipo === "seta" ? "url(#arrow)" : undefined} />
          {isSelected && (
            <line x1={el.x} y1={el.y} x2={el.largura} y2={el.altura}
              stroke="#6366F1" strokeWidth="4" strokeOpacity="0.3" />
          )}
        </g>
      );
    }

    if (el.tipo === "retangulo") {
      return (
        <g key={el.id} onMouseDown={onMouseDown} style={{ cursor: tool === "select" ? "move" : "default" }}>
          <rect x={el.x} y={el.y} width={el.largura} height={el.altura}
            fill={el.cor_fundo} stroke={el.cor} strokeWidth={isSelected ? 2 : 1.5} rx="6" />
          {isSelected && <rect x={el.x - 2} y={el.y - 2} width={el.largura + 4} height={el.altura + 4}
            fill="none" stroke="#6366F1" strokeWidth="1.5" strokeDasharray="4" rx="8" />}
        </g>
      );
    }

    if (el.tipo === "circulo") {
      const cx = el.x + el.largura / 2;
      const cy = el.y + el.altura / 2;
      return (
        <g key={el.id} onMouseDown={onMouseDown} style={{ cursor: tool === "select" ? "move" : "default" }}>
          <ellipse cx={cx} cy={cy} rx={el.largura / 2} ry={el.altura / 2}
            fill={el.cor_fundo} stroke={el.cor} strokeWidth={isSelected ? 2 : 1.5} />
        </g>
      );
    }

    if (el.tipo === "sticky") {
      return (
        <g key={el.id} onMouseDown={onMouseDown} style={{ cursor: tool === "select" ? "move" : "default" }}>
          <rect x={el.x} y={el.y} width={el.largura} height={el.altura}
            fill={el.cor_fundo || "#FEF9C3"} stroke="#F59E0B" strokeWidth={isSelected ? 2 : 1} rx="4" />
          <rect x={el.x} y={el.y} width={el.largura} height={20}
            fill="#FDE68A" rx="4" />
          <foreignObject x={el.x + 4} y={el.y + 24} width={el.largura - 8} height={el.altura - 28}>
            {editingText === el.id ? (
              <textarea
                style={{ width: "100%", height: "100%", border: "none", background: "transparent", fontSize: el.tamanho_fonte, resize: "none", outline: "none" }}
                value={el.conteudo || ""}
                onChange={e => setElementos(prev => prev.map(x => x.id === el.id ? { ...x, conteudo: e.target.value } : x))}
                onBlur={() => { updateElemento(el.id, { conteudo: el.conteudo }); setEditingText(null); }}
                autoFocus
              />
            ) : (
              <div style={{ fontSize: el.tamanho_fonte, wordBreak: "break-word", whiteSpace: "pre-wrap" }}
                onDoubleClick={() => setEditingText(el.id)}>
                {el.conteudo}
              </div>
            )}
          </foreignObject>
        </g>
      );
    }

    if (el.tipo === "texto") {
      return (
        <g key={el.id} onMouseDown={onMouseDown} style={{ cursor: tool === "select" ? "move" : "default" }}>
          {editingText === el.id ? (
            <foreignObject x={el.x} y={el.y} width={Math.max(el.largura, 200)} height={Math.max(el.altura, 40)}>
              <input
                style={{ fontSize: el.tamanho_fonte, color: el.cor, border: "1px solid #6366F1", borderRadius: 4, padding: "2px 6px", width: "100%", background: "white" }}
                value={el.conteudo || ""}
                onChange={e => setElementos(prev => prev.map(x => x.id === el.id ? { ...x, conteudo: e.target.value } : x))}
                onBlur={() => { updateElemento(el.id, { conteudo: el.conteudo }); setEditingText(null); }}
                autoFocus
              />
            </foreignObject>
          ) : (
            <text x={el.x} y={el.y + el.tamanho_fonte} fontSize={el.tamanho_fonte}
              fill={el.cor} style={{ userSelect: "none" }}
              onDoubleClick={() => setEditingText(el.id)}>
              {el.conteudo || "Texto"}
            </text>
          )}
          {isSelected && <rect x={el.x - 4} y={el.y - 4} width={el.largura + 8} height={el.tamanho_fonte + 12}
            fill="none" stroke="#6366F1" strokeWidth="1" strokeDasharray="4" />}
        </g>
      );
    }

    return null;
  };

  // ── Lista de Boards ──
  if (!boardAtivo) return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Canvas / Whiteboard</h1>
          <p className="text-sm text-muted-foreground">Quadros visuais para brainstorm e fluxogramas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchBoards}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={() => setBoardDialog(true)}><Plus className="h-4 w-4 mr-2" /> Novo Canvas</Button>
        </div>
      </div>

      {loading ? <p className="text-muted-foreground">Carregando...</p> :
        boards.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-muted-foreground border rounded-lg">
            <PenLine className="h-12 w-12 mb-3 opacity-20" />
            <p>Nenhum canvas criado.</p>
            <Button variant="outline" className="mt-4" onClick={() => setBoardDialog(true)}>
              <Plus className="h-4 w-4 mr-2" /> Criar primeiro canvas
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map(b => (
              <div key={b.id}
                className="group rounded-xl border bg-card hover:shadow-md transition-all cursor-pointer overflow-hidden"
                onClick={() => setBoardAtivo(b)}>
                <div className="h-32 bg-gradient-to-br from-primary/5 to-primary/20 flex items-center justify-center border-b">
                  <PenLine className="h-10 w-10 text-primary/30" />
                </div>
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{b.nome}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(b.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteBoard(b.id); }}
                    className="opacity-0 group-hover:opacity-100 h-7 w-7 flex items-center justify-center rounded hover:bg-destructive/10 transition-opacity">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      }

      <Dialog open={boardDialog} onOpenChange={o => { if (!o) setBoardDialog(false); }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle>Novo Canvas</DialogTitle></DialogHeader>
          <Input value={boardNome} onChange={e => setBoardNome(e.target.value)} placeholder="Nome do canvas..." onKeyDown={e => e.key === "Enter" && createBoard()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBoardDialog(false)}>Cancelar</Button>
            <Button onClick={createBoard} disabled={!boardNome.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  // ── Editor Canvas ──
  const TOOLS: { id: Tool; icon: any; label: string }[] = [
    { id: "select", icon: MousePointer, label: "Selecionar" },
    { id: "retangulo", icon: Square, label: "Retângulo" },
    { id: "circulo", icon: Circle, label: "Círculo" },
    { id: "linha", icon: Minus, label: "Linha" },
    { id: "texto", icon: Type, label: "Texto" },
    { id: "sticky", icon: StickyNote, label: "Sticky Note" },
    { id: "desenho", icon: PenLine, label: "Desenho livre" },
  ];

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 80px)" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-card flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => setBoardAtivo(null)}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="font-semibold text-sm mr-2">{boardAtivo.nome}</span>

        <div className="flex gap-1 border rounded-lg p-1">
          {TOOLS.map(t => (
            <button key={t.id} onClick={() => setTool(t.id)} title={t.label}
              className={cn("h-8 w-8 flex items-center justify-center rounded transition-colors",
                tool === t.id ? "bg-primary text-white" : "hover:bg-accent")}>
              <t.icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        {/* Cores */}
        <div className="flex gap-1 items-center border rounded-lg px-2 py-1">
          <span className="text-xs text-muted-foreground">Borda:</span>
          <div className="flex gap-1">
            {CORES.map(c => (
              <button key={c} onClick={() => setCor(c)}
                className={cn("w-5 h-5 rounded-full border-2 transition-all", cor === c ? "border-foreground scale-110" : "border-transparent")}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>

        <div className="flex gap-1 items-center border rounded-lg px-2 py-1">
          <span className="text-xs text-muted-foreground">Fundo:</span>
          <div className="flex gap-1">
            {CORES_FUNDO.map(c => (
              <button key={c} onClick={() => setCorFundo(c)}
                className={cn("w-5 h-5 rounded-full border-2 transition-all", corFundo === c ? "border-foreground scale-110" : "border-transparent")}
                style={{ backgroundColor: c, border: c === "#FFFFFF" ? "1px solid #e2e8f0" : undefined }} />
            ))}
          </div>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1 border rounded-lg px-2 py-1 ml-auto">
          <button onClick={() => setZoom(z => Math.max(z - 0.1, 0.2))} className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-sm font-bold">−</button>
          <span className="text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(z + 0.1, 3))} className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-sm font-bold">+</button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="text-xs px-2 py-0.5 rounded hover:bg-accent">Reset</button>
        </div>

        {selected && (
          <button onClick={() => deleteElemento(selected)}
            className="h-8 w-8 flex items-center justify-center rounded hover:bg-destructive/10 text-destructive border">
            <Trash2 className="h-4 w-4" />
          </button>
        )}

        <Button variant="outline" size="sm" onClick={exportPNG}>
          <Download className="h-4 w-4 mr-1" /> Exportar SVG
        </Button>
      </div>

      {/* Canvas area */}
      <div ref={canvasRef} className="flex-1 overflow-hidden bg-[radial-gradient(circle,#e2e8f0_1px,transparent_1px)] bg-[size:20px_20px]"
        onWheel={handleWheel} style={{ cursor: isPanning ? "grabbing" : tool === "select" ? "default" : "crosshair" }}>
        <svg ref={svgRef} width="100%" height="100%"
          onMouseDown={handleSvgMouseDown}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={() => { setDrawing(false); setDragging(false); setIsPanning(false); }}>
          <defs>
            <marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill={cor} />
            </marker>
          </defs>
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {elementos.map(renderElemento)}
            {/* Preview while drawing */}
            {drawing && tool === "desenho" && drawPoints.length > 1 && (
              <polyline points={drawPoints.map(p => `${p.x},${p.y}`).join(" ")}
                fill="none" stroke={cor} strokeWidth="2" strokeOpacity="0.6" strokeLinecap="round" />
            )}
          </g>
        </svg>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-t bg-muted/30 text-xs text-muted-foreground">
        <span>{elementos.length} elementos</span>
        <span>Ferramenta: {TOOLS.find(t => t.id === tool)?.label}</span>
        <span>Zoom: {Math.round(zoom * 100)}%</span>
        <span className="ml-auto">Alt + arrastar para mover o canvas · Scroll para zoom · Duplo clique para editar texto</span>
      </div>
    </div>
  );
}