import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Star, RefreshCw, Search, Clock, CheckCircle2, XCircle,
  ClipboardCheck, Building2, MapPin, User, Layers, ChevronRight, Filter,
} from "@/lib/icons";
import { format, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type AvaliacaoRow = {
  os_id: string;
  codigo_os: string | null;
  titulo: string | null;
  bloco_nome: string | null;
  local: string;
  empresa_nome: string | null;
  responsavel_nome: string | null;
  fiscal_nome: string | null;
  finalizado_em: string | null;
  dias_aguardando: number | null;
  avaliacao_status: "pendente" | "avaliada";
  nota_geral: number | null;
  decisao: string | null;
  tipo_servico: string | null;
};

const STATUS_FILTER_OPTIONS = [
  { value: "todos", label: "Todos os Status" },
  { value: "pendente", label: "Pendentes" },
  { value: "avaliada", label: "Avaliadas" },
];

function StarsDisplay({ value }: { value: number | null }) {
  if (!value) return <span className="text-slate-300 text-sm">—</span>;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn("h-3.5 w-3.5", n <= value ? "fill-amber-400 text-amber-400" : "text-slate-200")}
        />
      ))}
    </div>
  );
}

export default function Avaliacoes() {
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const [rows, setRows] = useState<AvaliacaoRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterStatus, setFilterStatus] = useState("pendente");
  const [filterSearch, setFilterSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: osList, error } = await (supabase as any)
        .from("ordens_servico")
        .select("id, codigo_os, titulo, andar, sala, bloco_id, company_id, responsible_user_id, finalizado_em, tipo_servico")
        .eq("status", "Concluída")
        .order("finalizado_em", { ascending: false });

      if (error) throw error;

      const osIds = (osList || []).map((o: any) => o.id);
      const blocoIds = [...new Set((osList || []).map((o: any) => o.bloco_id).filter(Boolean))];
      const companyIds = [...new Set((osList || []).map((o: any) => o.company_id).filter(Boolean))];
      const respIds = [...new Set((osList || []).map((o: any) => o.responsible_user_id).filter(Boolean))];

      const [avalRes, blocosRes, companiesRes, profilesRes, notifRes] = await Promise.all([
        osIds.length
          ? (supabase as any).from("avaliacoes_os").select("os_id, status, nota_geral, decisao").in("os_id", osIds)
          : Promise.resolve({ data: [] }),
        blocoIds.length
          ? (supabase as any).from("blocos").select("id, nome").in("id", blocoIds)
          : Promise.resolve({ data: [] }),
        companyIds.length
          ? (supabase as any).from("companies").select("id, name").in("id", companyIds)
          : Promise.resolve({ data: [] }),
        respIds.length
          ? (supabase as any).from("profiles").select("id, nome").in("id", respIds)
          : Promise.resolve({ data: [] }),
        osIds.length
          ? (supabase as any).from("os_fiscais").select("os_id, profile_id, profiles(nome)").in("os_id", osIds)
          : Promise.resolve({ data: [] }),
      ]);

      const avalMap = new Map((avalRes.data || []).map((a: any) => [a.os_id, a]));
      const blocoMap = new Map((blocosRes.data || []).map((b: any) => [b.id, b.nome]));
      const companyMap = new Map((companiesRes.data || []).map((c: any) => [c.id, c.name]));
      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p.nome]));
      const fiscalMap = new Map<string, string[]>();
      (notifRes.data || []).forEach((n: any) => {
        const arr = fiscalMap.get(n.os_id) || [];
        if (n.profiles?.nome) arr.push(n.profiles.nome);
        fiscalMap.set(n.os_id, arr);
      });

      const merged: AvaliacaoRow[] = (osList || []).map((o: any) => {
        const aval: any = avalMap.get(o.id);
        const local = [o.andar, o.sala].filter(Boolean).join(" / ") || "—";
        const dias = o.finalizado_em ? differenceInCalendarDays(new Date(), new Date(o.finalizado_em)) : null;
        return {
          os_id: o.id,
          codigo_os: o.codigo_os,
          titulo: o.titulo,
          bloco_nome: blocoMap.get(o.bloco_id) || null,
          local,
          empresa_nome: companyMap.get(o.company_id) || null,
          responsavel_nome: profileMap.get(o.responsible_user_id) || null,
          fiscal_nome: (fiscalMap.get(o.id) || []).join(", ") || null,
          finalizado_em: o.finalizado_em,
          dias_aguardando: dias,
          avaliacao_status: (aval?.status === "avaliada" ? "avaliada" : "pendente"),
          nota_geral: aval?.nota_geral ?? null,
          decisao: aval?.decisao ?? null,
          tipo_servico: o.tipo_servico,
        };
      });

      setRows(merged);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao carregar avaliações", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterStatus !== "todos" && r.avaliacao_status !== filterStatus) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase();
        if (!(r.codigo_os || "").toLowerCase().includes(q) &&
          !(r.titulo || "").toLowerCase().includes(q) &&
          !(r.bloco_nome || "").toLowerCase().includes(q) &&
          !(r.empresa_nome || "").toLowerCase().includes(q) &&
          !(r.responsavel_nome || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, filterStatus, filterSearch]);

  const stats = useMemo(() => {
    const avaliadas = rows.filter((r) => r.avaliacao_status === "avaliada");
    const pendentes = rows.filter((r) => r.avaliacao_status === "pendente").length;
    const mediaGeral = avaliadas.length
      ? avaliadas.reduce((s, r) => s + (r.nota_geral || 0), 0) / avaliadas.length
      : 0;
    const aprovados = avaliadas.filter((r) => r.decisao === "aprovado" || r.decisao === "aprovado_com_ressalvas").length;
    const reprovados = avaliadas.filter((r) => r.decisao === "reprovado").length;
    const pctAprovados = avaliadas.length ? (aprovados / avaliadas.length) * 100 : 0;
    const pctReprovados = avaliadas.length ? (reprovados / avaliadas.length) * 100 : 0;

    const porEmpresa = new Map<string, { soma: number; qtd: number }>();
    const porTipo = new Map<string, { soma: number; qtd: number }>();
    avaliadas.forEach((r) => {
      if (r.nota_geral == null) return;
      const emp = r.empresa_nome || "—";
      const tipo = r.tipo_servico || "—";
      const e = porEmpresa.get(emp) || { soma: 0, qtd: 0 };
      e.soma += r.nota_geral; e.qtd += 1;
      porEmpresa.set(emp, e);
      const t = porTipo.get(tipo) || { soma: 0, qtd: 0 };
      t.soma += r.nota_geral; t.qtd += 1;
      porTipo.set(tipo, t);
    });
    const rankEmpresa = [...porEmpresa.entries()].map(([nome, v]) => ({ nome, media: v.soma / v.qtd })).sort((a, b) => b.media - a.media);
    const rankTipo = [...porTipo.entries()].map(([nome, v]) => ({ nome, media: v.soma / v.qtd })).sort((a, b) => b.media - a.media);

    return { pendentes, mediaGeral, pctAprovados, pctReprovados, rankEmpresa, rankTipo, totalAvaliadas: avaliadas.length };
  }, [rows]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-indigo-600" /> Avaliações de Serviço
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Ordens de Serviço concluídas aguardando ou já submetidas à avaliação de qualidade.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Atualizar
        </button>
      </div>

      {/* Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">Avaliações Pendentes</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{stats.pendentes}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">Média Geral</p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-2xl font-bold text-slate-900">{stats.mediaGeral.toFixed(1)}</p>
            <StarsDisplay value={Math.round(stats.mediaGeral)} />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">% Serviços Aprovados</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.pctAprovados.toFixed(0)}%</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">% Serviços Reprovados</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">{stats.pctReprovados.toFixed(0)}%</p>
        </div>
      </div>

      {(stats.rankEmpresa.length > 0 || stats.rankTipo.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-slate-400 mb-3">Média por Empresa</p>
            <div className="space-y-2">
              {stats.rankEmpresa.slice(0, 5).map((e) => (
                <div key={e.nome} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 truncate">{e.nome}</span>
                  <StarsDisplay value={Math.round(e.media)} />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-slate-400 mb-3">Média por Tipo de Serviço</p>
            <div className="space-y-2">
              {stats.rankTipo.slice(0, 5).map((t) => (
                <div key={t.nome} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 truncate">{t.nome}</span>
                  <StarsDisplay value={Math.round(t.media)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Buscar por OS, título, bloco, empresa ou responsável..."
            className="pl-9 rounded-xl"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px] rounded-xl">
            <Filter className="h-4 w-4 mr-1 text-slate-400" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">Nenhuma OS encontrada para os filtros selecionados.</div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wide">
                  <th className="px-4 py-3">OS</th>
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3">Bloco</th>
                  <th className="px-4 py-3">Local</th>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">Responsável</th>
                  <th className="px-4 py-3">Fiscal</th>
                  <th className="px-4 py-3">Conclusão</th>
                  <th className="px-4 py-3">Dias aguardando</th>
                  <th className="px-4 py-3">Nota</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr
                    key={r.os_id}
                    className="hover:bg-slate-50/60 cursor-pointer transition-colors"
                    onClick={() => navigate(`/avaliacoes/${r.os_id}`)}
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900">{r.codigo_os || "—"}</td>
                    <td className="px-4 py-3 text-slate-700 max-w-[220px] truncate" title={r.titulo || ""}>{r.titulo || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5 text-slate-400" />{r.bloco_nome || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-slate-400" />{r.local}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5 text-slate-400" />{r.empresa_nome || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5 text-slate-400" />{r.responsavel_nome || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.fiscal_nome || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {r.finalizado_em ? format(new Date(r.finalizado_em), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {r.dias_aguardando != null ? (
                        <span className={cn("inline-flex items-center gap-1 font-semibold",
                          r.avaliacao_status === "pendente" && r.dias_aguardando > 3 ? "text-rose-600" : "text-slate-500")}>
                          <Clock className="h-3.5 w-3.5" />{r.dias_aguardando}d
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3"><StarsDisplay value={r.nota_geral} /></td>
                    <td className="px-4 py-3">
                      {r.avaliacao_status === "avaliada" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Avaliada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <XCircle className="h-3.5 w-3.5" /> Pendente
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300"><ChevronRight className="h-4 w-4" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
