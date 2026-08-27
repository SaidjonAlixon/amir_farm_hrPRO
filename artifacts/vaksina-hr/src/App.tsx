import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from './components/ui/toaster';
import { TooltipProvider } from './components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AuthProvider } from './contexts/AuthContext';
import { Layout } from './components/layout/Layout';
import { RealtimeSync } from './lib/realtime-sync';

// Pages
import Login from './pages/login';
import Dashboard from './pages/dashboard';
import RequestsList from './pages/requests/index';
import NewRequest from './pages/requests/new';
import RequestDetails from './pages/requests/show';
import VacanciesList from './pages/vacancies/index';
import NewVacancy from './pages/vacancies/new';
import VacancyDetails from './pages/vacancies/show';
import CandidatesList from './pages/candidates/index';
import NewCandidate from './pages/candidates/new';
import CandidateProfile from './pages/candidates/show';
import OnlineInterviewPage from './pages/candidates/online-interview';
import PhoneInterviewPage from './pages/candidates/phone-interview';
import PreboardingPage from './pages/candidates/preboarding';
import OfflineInterviewPage from './pages/candidates/offline-interview';
import FinalDecisionPage from './pages/candidates/final-decision';
import OfferPage from './pages/candidates/offer';
import DocumentsPage from './pages/candidates/documents';
import InternshipPage from './pages/candidates/internship';
import InterviewsList from './pages/interviews/index';
import PharmacyNetworkPage from './pages/pharmacy-network/index';
import TashkiliyTuzilmaPage from './pages/tashkiliy-tuzilma/index';
import PipelineBoardPage from './pages/pipeline/index';
import VazifalarPage from './pages/vazifalar/index';
import EslatmalarPage from './pages/eslatmalar/index';
import ChatPage from './pages/chat/index';
import KirishPage from './pages/kirish/index';
import EhtiyojPage from './pages/ehtiyoj/index';
import ChecklistPage from './pages/checklist/index';
import ChecklistHolatiPage from './pages/checklist-holati/index';
import OylikPage from './pages/oylik/index';
import HisobkitobPage from './pages/hisobkitob/index';
import ReytingPage from './pages/reyting/index';
import AdminHolatPage from './pages/admin/holat';
import AdminUsersPage from './pages/admin/users';
import AdminDepartmentsPage from './pages/admin/departments';
import AdminKirishVideosPage from './pages/admin/kirish-videos';
import AdminFacesPage from './pages/admin/faces';
import EmployeesPage from './pages/employees/index';
import EmployeeDuplicatesPage from './pages/employees/duplicates';
import DavomatPage from './pages/davomat/index';
import DavomatFacePage from './pages/davomat/face';
import DavomatFarOfficePage from './pages/davomat/far-office';
import SmenaFilialPage from './pages/smena-filial/index';
import NotificationsPage from './pages/notifications/index';
import TgEntryPage from './pages/tg-entry';
import NotFound from './pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => {
        const status = (err as { status?: number } | undefined)?.status;
        if (status === 401 || status === 403 || status === 404 || status === 204) return false;
        return count < 1;
      },
      staleTime: 45_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

function ProtectedRoute({ component: Component, ...rest }: any) {
  return (
    <Route {...rest}>
      {params => (
        <Layout>
          <Component params={params} />
        </Layout>
      )}
    </Route>
  );
}

// Simple placeholders for missing pages
function InternshipsPlaceholder() { return <div className="p-8 text-center text-gray-500">Stajirovkalar ro'yxati (Ishlanmoqda)</div>; }

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/tg" component={TgEntryPage} />
      <Route path="/davomat-face" component={DavomatFacePage} />
      <Route path="/" component={() => {
        window.location.replace('/dashboard');
        return null;
      }} />
      
      <ProtectedRoute path="/dashboard" component={Dashboard} />
      
      <ProtectedRoute path="/requests" component={RequestsList} />
      <ProtectedRoute path="/requests/new" component={NewRequest} />
      <ProtectedRoute path="/requests/:id" component={RequestDetails} />

      <Route path="/nazorat">
        {() => {
          window.location.replace('/requests');
          return null;
        }}
      </Route>
      <ProtectedRoute path="/vacancies" component={VacanciesList} />
      <ProtectedRoute path="/vacancies/new" component={NewVacancy} />
      <ProtectedRoute path="/vacancies/:id" component={VacancyDetails} />
      
      <ProtectedRoute path="/candidates" component={CandidatesList} />
      <ProtectedRoute path="/candidates/new" component={NewCandidate} />
      <ProtectedRoute path="/candidates/:id/phone-interview" component={PhoneInterviewPage} />
      <ProtectedRoute path="/candidates/:id/online-interview" component={OnlineInterviewPage} />
      <ProtectedRoute path="/candidates/:id/preboarding" component={PreboardingPage} />
      <ProtectedRoute path="/candidates/:id/offline-interview" component={OfflineInterviewPage} />
      <ProtectedRoute path="/candidates/:id/final-decision" component={FinalDecisionPage} />
      <ProtectedRoute path="/candidates/:id/offer" component={OfferPage} />
      <ProtectedRoute path="/candidates/:id/documents" component={DocumentsPage} />
      <ProtectedRoute path="/candidates/:id/internship" component={InternshipPage} />
      <ProtectedRoute path="/candidates/:id" component={CandidateProfile} />
      
      <ProtectedRoute path="/interviews" component={InterviewsList} />
      <ProtectedRoute path="/pipeline" component={PipelineBoardPage} />
      <ProtectedRoute path="/vazifalar" component={VazifalarPage} />
      <ProtectedRoute path="/eslatmalar" component={EslatmalarPage} />
      <ProtectedRoute path="/chat" component={ChatPage} />
      <ProtectedRoute path="/kirish" component={KirishPage} />
      <ProtectedRoute path="/ehtiyoj" component={EhtiyojPage} />
      <ProtectedRoute path="/checklist" component={ChecklistPage} />
      <ProtectedRoute path="/checklist-holati" component={ChecklistHolatiPage} />
      <ProtectedRoute path="/oylik" component={OylikPage} />
      <ProtectedRoute path="/hisobkitob" component={HisobkitobPage} />
      <ProtectedRoute path="/reyting" component={ReytingPage} />
      
      <ProtectedRoute path="/employees/duplicates" component={EmployeeDuplicatesPage} />
      <ProtectedRoute path="/employees" component={EmployeesPage} />
      <ProtectedRoute path="/davomat" component={DavomatPage} />
      <ProtectedRoute path="/davomat-uzoq" component={DavomatFarOfficePage} />
      <ProtectedRoute path="/smena-filial" component={SmenaFilialPage} />
      <ProtectedRoute path="/pharmacy-network" component={PharmacyNetworkPage} />
      <ProtectedRoute path="/tashkiliy-tuzilma" component={TashkiliyTuzilmaPage} />
      <ProtectedRoute path="/internships" component={InternshipsPlaceholder} />
      <ProtectedRoute path="/notifications" component={NotificationsPage} />
      <ProtectedRoute path="/admin/users" component={AdminUsersPage} />
      <ProtectedRoute path="/admin/holat" component={AdminHolatPage} />
      <ProtectedRoute path="/admin/departments" component={AdminDepartmentsPage} />
      <ProtectedRoute path="/admin/kirish-videolar" component={AdminKirishVideosPage} />
      <ProtectedRoute path="/admin/faces" component={AdminFacesPage} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeSync />
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, '') || ''}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
