import Materiais from "@/pages/Materiais";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SpeedInsights } from "@vercel/speed-insights/react"
import { AuthProvider } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import TiposSistema from "@/pages/TiposSistema";
import ScrollToTop from "@/components/ScrollToTop";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AtivoPublico from "@/pages/AtivoPublico";
import AtivoDetalhes from "@/pages/AtivoDetalhes";
import AtivoEtiquetas from "@/pages/AtivoEtiquetas";
import Ativos from "@/pages/Ativos";
import Blocos from "@/pages/Blocos";
import Cronogramas from "@/pages/Cronogramas";
import Dashboard from "@/pages/Dashboard";
import Gastos from "@/pages/Gastos";
import NotFound from "@/pages/NotFound";
import OSPublica from "@/pages/OSPublica";
import OrdensServico from "@/pages/OrdensServico";
import MinhasOrdensServico from "@/pages/MinhasOrdensServico";
import RelatorioMensal from "@/pages/RelatorioMensal";
import Relatorios from "@/pages/Relatorios";
import ControleAcesso from "@/pages/ControleAcesso";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";

import HistoricoAtividades from "@/pages/HistoricoAtividades";
import PerfisAcesso from "@/pages/PerfisAcesso";
import SolicitarAcesso from "@/pages/SolicitarAcesso";
import SlaDefinicoes from "@/pages/SlaDefinicoes";
import PlanosManutencao from "@/pages/PlanosManutencao";
import ChecklistTemplates from "@/pages/ChecklistTemplates";
import TiposGasto from "@/pages/TiposGasto";
import TiposAtividade from "@/pages/TiposAtividade";
import RelatorioHomemHora from "@/pages/RelatorioHomemHora";
import OrdensPreventivas from "@/pages/OrdensPreventivas";
import Chamados from "@/pages/Chamados";
import ChamadosOS from "@/pages/ChamadosOS";
import ChamadosExternos from "@/pages/ChamadosExternos";
import AuthCallback from "@/pages/AuthCallback";
import Onboarding from "@/pages/Onboarding";
import Aprovacoes from "@/pages/Aprovacoes";
import RelatorioAtivos from "@/pages/RelatorioAtivos";
import IAAtlas from "@/pages/IAAtlas";
import OsCamposConfig from "@/pages/OsCamposConfig";
import RegrasPrioridade from "@/pages/RegrasPrioridade";
import Estoque from "@/pages/Estoque";
import CentralPlanejamento from "@/pages/CentralPlanejamento";
import Agenda from "@/pages/Agenda";
import Kanban from "@/pages/Kanban";
import Canvas from "@/pages/Canvas";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <AuthProvider>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/blocos" element={<Blocos />} />
            <Route path="/ordens-servico" element={<ErrorBoundary fallbackMessage="Erro ao carregar Ordens de Serviço"><OrdensServico /></ErrorBoundary>} />
            <Route path="/os-campos-config" element={<OsCamposConfig />} />
            <Route path="/minhas-ordens-servico" element={<ErrorBoundary fallbackMessage="Erro ao carregar Minhas O.S."><MinhasOrdensServico /></ErrorBoundary>} />
            <Route path="/gastos" element={<Gastos />} />
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="/relatorio-mensal" element={<RelatorioMensal />} />
            <Route path="/cronogramas" element={<Cronogramas />} />
            <Route path="/ativos" element={<Ativos />} />
            <Route path="/ativos/etiquetas" element={<AtivoEtiquetas />} />
            <Route path="/ativos/:id" element={<AtivoDetalhes />} />
            <Route path="/relatorio-ativos" element={<RelatorioAtivos />} />
            <Route path="/controle-acesso" element={<ControleAcesso />} />
            <Route path="/materiais" element={<Materiais />} />
            <Route path="/historico-atividades" element={<HistoricoAtividades />} />
            <Route path="/perfis-acesso" element={<PerfisAcesso />} />
            <Route path="/sla" element={<SlaDefinicoes />} />
            <Route path="/preventivas" element={<PlanosManutencao />} />
            <Route path="/ordens-preventivas" element={<OrdensPreventivas />} />
            <Route path="/chamados" element={<ErrorBoundary fallbackMessage="Erro ao carregar Chamados"><Chamados /></ErrorBoundary>} />
            <Route path="/chamados-os" element={<ErrorBoundary fallbackMessage="Erro ao carregar Chamados de O.S."><ChamadosOS /></ErrorBoundary>} />
            <Route path="/chamados-externos" element={<ErrorBoundary fallbackMessage="Erro ao carregar Chamados Externos"><ChamadosExternos /></ErrorBoundary>} />
            <Route path="/checklist-templates" element={<ChecklistTemplates />} />
            <Route path="/tipos-gasto" element={<TiposGasto />} />
            <Route path="/tipos-atividade" element={<TiposAtividade />} />
            <Route path="/tipos-sistema" element={<TiposSistema />} />
            <Route path="/aprovacoes" element={<Aprovacoes />} />
            <Route path="/relatorio-homem-hora" element={<RelatorioHomemHora />} />
            <Route path="/ia" element={<IAAtlas />} />
            <Route path="/regras-prioridade" element={<RegrasPrioridade />} />
            <Route path="/estoque" element={<Estoque />} />
            <Route path="/planejamento" element={<CentralPlanejamento />} />
            <Route path="/kanban" element={<Kanban />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/canvas" element={<Canvas />} />
          </Route>
<Route path="/login" element={<Login />} />
<Route path="/onboarding" element={<Onboarding />} />
<Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/solicitar-acesso" element={<SolicitarAcesso />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/ativo/:id" element={<AtivoPublico />} />
          <Route path="/os/:id" element={<OSPublica />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </AuthProvider>
      </BrowserRouter>
        </TooltipProvider>

    <SpeedInsights />
    
  </QueryClientProvider>
);

export default App;
