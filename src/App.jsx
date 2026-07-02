import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { useState, useEffect } from 'react';
import OrderStatus from './pages/OrderStatus';
import MemberBenefits from './pages/MemberBenefits';
import MemberLogin from './pages/MemberLogin';
import CollectionTracker from './pages/CollectionTracker';
import PriceAlerts from './pages/PriceAlerts';
import CardComparison from './pages/CardComparison';
import MobileHome from './pages/mobile/MobileHome';
import MobileMember from './pages/mobile/MobileMember';
import CommunityDecks from './pages/CommunityDecks';
import CommanderDetail from './pages/CommanderDetail';
import CommanderHub from './pages/CommanderHub';
import MobileForum from './pages/mobile/MobileForum';
import MobileCommunityDecks from './pages/mobile/MobileCommunityDecks';
import Forum from './pages/Forum';
import ForumThread from './pages/ForumThread';
import RulesReference from './pages/RulesReference';
import AdminDashboard from './pages/AdminDashboard';
import AdminInventory from './pages/AdminInventory';
import AdminOperations from './pages/AdminOperations';
import AdvancedDeckBuilderBackup from './pages/AdvancedDeckBuilderBackup';
import MobileShop from './pages/mobile/MobileShop';
import MobileDeckBuilder from './pages/mobile/MobileDeckBuilder';
import MobileBrowse from './pages/mobile/MobileBrowse';
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AppAuthProvider, useAppAuth } from '@/lib/AppAuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAppAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') { navigateToLogin(); return null; }
  }

  // ── MOBILE ── only mobile components load, zero desktop code executes
  if (isMobile) {
    return (
      <Routes>
        <Route path="/" element={<MobileHome />} />
        <Route path="/MobileHome" element={<MobileHome />} />
        <Route path="/MemberLogin" element={<MemberLogin />} />
        <Route path="/MobileShop" element={<MobileShop />} />
        <Route path="/MobileDeckBuilder" element={<MobileDeckBuilder />} />
        <Route path="/MobileBrowse" element={<MobileBrowse />} />
        <Route path="/MobileMember" element={<MobileMember />} />
        <Route path="/MobileForum" element={<MobileForum />} />
        <Route path="/MobileCommunityDecks" element={<MobileCommunityDecks />} />
        <Route path="/ForumThread" element={<ForumThread />} />
        <Route path="/MobileRules" element={<RulesReference />} />
        <Route path="/AdminInventory" element={<AdminInventory />} />
        {/* Redirect all other paths to mobile home */}
        <Route path="*" element={<MobileHome />} />
      </Routes>
    );
  }

  // ── DESKTOP ── only desktop components load, zero mobile code executes
  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/OrderStatus" element={<LayoutWrapper currentPageName="OrderStatus"><OrderStatus /></LayoutWrapper>} />
      <Route path="/MemberLogin" element={<MemberLogin />} />
      <Route path="/MemberBenefits" element={<LayoutWrapper currentPageName="MemberBenefits"><MemberBenefits /></LayoutWrapper>} />
      <Route path="/CommunityDecks" element={<LayoutWrapper currentPageName="CommunityDecks"><CommunityDecks /></LayoutWrapper>} />
      <Route path="/CommanderHub" element={<LayoutWrapper currentPageName="CommanderHub"><CommanderHub /></LayoutWrapper>} />
      <Route path="/commanders/:oracleId" element={<LayoutWrapper currentPageName="CommanderDetail"><CommanderDetail /></LayoutWrapper>} />
      <Route path="/CollectionTracker" element={<LayoutWrapper currentPageName="CollectionTracker"><CollectionTracker /></LayoutWrapper>} />
      <Route path="/PriceAlerts" element={<LayoutWrapper currentPageName="PriceAlerts"><PriceAlerts /></LayoutWrapper>} />
      <Route path="/CardComparison" element={<LayoutWrapper currentPageName="CardComparison"><CardComparison /></LayoutWrapper>} />
      <Route path="/AdvancedDeckBuilderBackup" element={<LayoutWrapper currentPageName="AdvancedDeckBuilderBackup"><AdvancedDeckBuilderBackup /></LayoutWrapper>} />
      <Route path="/AdminDashboard" element={<AdminDashboard />} />
      <Route path="/AdminOperations" element={<AdminOperations />} />
      <Route path="/Forum" element={<LayoutWrapper currentPageName="Forum"><Forum /></LayoutWrapper>} />
      <Route path="/ForumThread" element={<LayoutWrapper currentPageName="ForumThread"><ForumThread /></LayoutWrapper>} />
      <Route path="/RulesReference" element={<LayoutWrapper currentPageName="RulesReference"><RulesReference /></LayoutWrapper>} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AppAuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <SonnerToaster richColors position="top-right" />
      </QueryClientProvider>
    </AppAuthProvider>
  )
}

export default App
