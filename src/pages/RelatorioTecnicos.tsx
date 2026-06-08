import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Users, RefreshCw, TrendingUp, Clock, CheckCircle2, AlertTriangle, Star } from "@/lib/icons";
import { format, subMonths, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

type TecnicoStats = {
  id: string;
  nome: string;
  total_os: number;
  concluidas: number;
  em_aberto: number;
  atrasadas: number;
  tempo_medio_dias: number | null;
  taxa_conclusao: number;
  custo_total: number;
  nota_media: number | null;
};

const PERIODOS = [
  { value: "1", label: "Último mês" },
  { value: "3", label: "Últimos 3 meses" },
  { value: "6", label: "Últimos 6 meses" },
  { value: "12", label: "Último ano" },
];

export default function RelatorioTecnicos() {
  const { companyId } = useCompany();
  const [tecnicos, setTecnicos] = useState<TecnicoStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState("3");
  const [ordenar, setOrdenar] = useState("concluidas");

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const dataInicio = format(subMonths(new Date(), parseInt(periodo)), "yyyy-MM-dd");
      const hoje = new Date().toISOString().slice(0, 10);

      // Buscar responsáveis e suas OS
      const { data: responsaveisData } = await (supabase as any)
        .from("os_responsaveis")
        .select(`
          profile_id,
          profiles(id, nome),
          ordens_servico!inner(
            id, status, prazo, data_inicio, finalizado_em, created_at, custo_total, company_id
          )
        `)
        .eq("ordens_servico.company_id", companyId)
        .gte("ordens_servico.created_at", dataInicio + "T00:00:00");

      if (!responsaveisData?.length) { setTecnicos([]); setLoading(false); return; }

      // Buscar avaliações dos chamados
      const { data: avaliacoesData } = await (supabase as any)
        .from("chamados")
        .select("os_id, avaliacao")
        .eq("company_id", companyId)
        .not("avaliacao", "is", null);

      const avaliacoesPorOS: Record<string, number> = {};
      (avaliacoesData || []).forEach((a: any) => { if (a.os_id) avaliacoesPorOS[a.os_id] = a.avaliacao; });

      // Agrupar por técnico
      const porTecnico: Record<string, { nome: string; osList: any[] }> = {};
      responsaveisData.forEach((r: any) => {
        const profileId = r.profile_id;
        const nome = (r.profiles as any)?.nome || "Desconhecido";
        const os = r.ordens_servico;
        if (!porTecnico[profileId]) porTecnico[profileId] = { nome, osList: [] };
        porTecnico[profileId].osList.push(os);
      });

      const result: TecnicoStats[] = Object.entries(porTecnico).map(([id, { nome, osList }]) => {
        const concluidas = osList.filter(os => ["Concluída", "concluida"].includes((os.status || "").toLowerCase()));
        const emAberto = osList.filter(os => !["Concluída", "Cancelada", "Encerrado"].includes(os.status || ""));
        const atrasadas = emAberto.filter(os => os.prazo && os.prazo < hoje);

        const temposMedios = concluidas
          .filter(os => os.data_inicio && os.finalizado_em)
          .map(os => differenceInDays(new Date(os.finalizado_em), new Date(os.data_inicio)));
        const tempoMedio = temposMedios.length > 0
          ? Math.round(temposMedios.reduce((a, b) => a + b, 0) / temposMedios.length)
          : null;

        const custoTotal = osList.reduce((sum, os) => sum + (os.custo_total || 0), 0);
        const taxaConclusao = osList.length > 0 ? Math.round((concluidas.length / osList.length) * 100) : 0;

        const avaliacoes = osList.map(os => avaliacoesPorOS[os.id]).filter(Boolean);
        const notaMedia = avaliacoes.length > 0
          ? Math.round((avaliacoes.reduce((a, b) => a + b, 0) / avaliacoes.length) * 10) / 10
          : null;

        return {
          id, nome,
          total_os: osList.length,
          concluidas: concluidas.length,
          em_aberto: emAberto.length,
          atrasadas: atrasadas.length,
          tempo_medio_dias: tempoMedio,
          taxa_conclusao: taxaConclusao,
          custo_total: custoTotal,
          nota_media: notaMedia,
        };
      });

      // Ordenar
      result.sort((a, b) => {
        if (ordenar === "concluidas") return b.concluidas - a.concluidas;
        if (ordenar === "taxa") return b.taxa_conclusao - a.taxa_conclusao;
        if (ordenar === "tempo") return (a.tempo_medio_dias || 999) - (b.tempo_medio_dias || 999);
        if (ordenar === "nota") return (b.nota_media || 0) - (a.nota_media || 0);
        return b.total_os - a.total_os;
      });

      setTecnicos(result);
    } finally {
      setLoading(false);
    }
  }, [companyId, periodo, ordenar]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const melhorTecnico = tecnicos[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Desempenho por Técnico</h1>
            <p className="text-sm text-muted-foreground">Análise de performance da equipe</p>
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Período</label>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODOS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Ordenar por</label>
          <Select value={ordenar} onValueChange={setOrdenar}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="concluidas">Mais concluídas</SelectItem>
              <SelectItem value="taxa">Maior taxa de conclusão</SelectItem>
              <SelectItem value="tempo">Menor tempo médio</SelectItem>
              <SelectItem value="nota">Melhor avaliação</SelectItem>
              <SelectItem value="total">Total de OS</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? <p className="text-muted-foreground">Carregando...</p> : tecnicos.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Nenhum dado encontrado para o período selecionado.</p>
        </CardContent></Card>
      ) : (
        <>
          {/* Cards de destaque */}
          {melhorTecnico && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="border-amber-200 bg-amber-50/30">
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-amber-600 font-medium flex items-center gap-1"><Star className="h-3 w-3" /> Mais produtivo</p>
                  <p className="text-lg font-bold mt-1">{[...tecnicos].sort((a,b) => b.concluidas - a.concluidas)[0]?.nome}</p>
                  <p className="text-xs text-muted-foreground">{[...tecnicos].sort((a,b) => b.concluidas - a.concluidas)[0]?.concluidas} OS concluídas</p>
                </CardContent>
              </Card>
              <Card className="border-emerald-200 bg-emerald-50/30">
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-emerald-600 font-medium flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Maior taxa de conclusão</p>
                  <p className="text-lg font-bold mt-1">{[...tecnicos].sort((a,b) => b.taxa_conclusao - a.taxa_conclusao)[0]?.nome}</p>
                  <p className="text-xs text-muted-foreground">{[...tecnicos].sort((a,b) => b.taxa_conclusao - a.taxa_conclusao)[0]?.taxa_conclusao}% de conclusão</p>
                </CardContent>
              </Card>
              <Card className="border-blue-200 bg-blue-50/30">
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-blue-600 font-medium flex items-center gap-1"><Clock className="h-3 w-3" /> Mais rápido</p>
                  <p className="text-lg font-bold mt-1">{[...tecnicos].filter(t => t.tempo_medio_dias !== null).sort((a,b) => (a.tempo_medio_dias||999) - (b.tempo_medio_dias||999))[0]?.nome || "—"}</p>
                  <p className="text-xs text-muted-foreground">{[...tecnicos].filter(t => t.tempo_medio_dias !== null).sort((a,b) => (a.tempo_medio_dias||999) - (b.tempo_medio_dias||999))[0]?.tempo_medio_dias ?? "—"} dias em média</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tabela */}
          <Card>
            <CardContent className="pt-5">
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-bold">#</TableHead>
                      <TableHead className="font-bold">Técnico</TableHead>
                      <TableHead className="font-bold text-center">Total OS</TableHead>
                      <TableHead className="font-bold text-center">Concluídas</TableHead>
                      <TableHead className="font-bold text-center">Em Aberto</TableHead>
                      <TableHead className="font-bold text-center">Atrasadas</TableHead>
                      <TableHead className="font-bold text-center">Taxa Conclusão</TableHead>
                      <TableHead className="font-bold text-center">Tempo Médio</TableHead>
                      <TableHead className="font-bold text-center">Avaliação</TableHead>
                      <TableHead className="font-bold text-right">Custo Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tecnicos.map((t, idx) => (
                      <TableRow key={t.id} className={cn(idx === 0 && "bg-amber-50/30")}>
                        <TableCell className="font-bold text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                              {t.nome.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium">{t.nome}</span>
                            {idx === 0 && <span className="text-amber-500 text-sm">⭐</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-semibold">{t.total_os}</TableCell>
                        <TableCell className="text-center">
                          <span className="text-emerald-700 font-semibold">{t.concluidas}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-blue-700 font-semibold">{t.em_aberto}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          {t.atrasadas > 0
                            ? <span className="text-red-600 font-semibold">{t.atrasadas}</span>
                            : <span className="text-emerald-600">0</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                              <div className={cn("h-full rounded-full",
                                t.taxa_conclusao >= 80 ? "bg-emerald-500" :
                                t.taxa_conclusao >= 50 ? "bg-amber-500" : "bg-red-500"
                              )} style={{ width: `${t.taxa_conclusao}%` }} />
                            </div>
                            <span className="text-xs font-semibold">{t.taxa_conclusao}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {t.tempo_medio_dias !== null
                            ? <span className={cn("font-semibold", t.tempo_medio_dias <= 3 ? "text-emerald-600" : t.tempo_medio_dias <= 7 ? "text-amber-600" : "text-red-600")}>
                                {t.tempo_medio_dias}d
                              </span>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {t.nota_media !== null
                            ? <span className="font-semibold text-amber-600">{"★".repeat(Math.round(t.nota_media))} {t.nota_media}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          {t.custo_total > 0 ? `R$ ${t.custo_total.toFixed(2)}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}