import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';
import { useMemoryCleanup } from '@/hooks/useMemoryCleanup';
import Navbar from '@/components/Navbar';
import Index from '@/pages/Index';
import Review from '@/pages/Review';
import Practice from '@/pages/Practice';
import Quiz from '@/pages/Quiz';
import { AI_TUTOR_ENABLED } from '@/lib/aiTutor';

const Auth = lazy(() => import('@/pages/Auth'));
const Profile = lazy(() => import('@/pages/Profile'));
const Courses = lazy(() => import('@/pages/Courses'));
const SolutionRequests = lazy(() => import('@/pages/SolutionRequests'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Admin = lazy(() => import('@/pages/Admin'));
const LegacyVideoRedirect = lazy(() => import('@/components/courses/LegacyVideoRedirect'));
const AITutor = lazy(() => import('@/pages/AITutor'));
const Team = lazy(() => import('@/pages/Team'));
const About = lazy(() => import('@/pages/About'));
const Playground = lazy(() => import('@/pages/Playground'));
const Arena = lazy(() => import('@/pages/Arena'));
const NotFound = lazy(() => import('@/pages/NotFound'));

const queryClient = new QueryClient();

function PageLoader() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-4 text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
        <p className="text-sm text-muted-foreground">{t('Loading page...', '加载中…')}</p>
      </div>
    </div>
  );
}

function AppNavigation() {
  useMemoryCleanup();
  return <Navbar />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
      <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AppNavigation />
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/courses" element={<Courses />} />
                  <Route path="/practice" element={<Practice />} />
                  <Route path="/practice/:videoId" element={<LegacyVideoRedirect />} />
                  <Route path="/ai-tutor" element={AI_TUTOR_ENABLED ? <AITutor /> : <Navigate to="/courses" replace />} />
                  <Route path="/playground" element={<Playground />} />
                  <Route path="/solution-requests" element={<SolutionRequests />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/team" element={<Team />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/learn" element={<Navigate to="/courses" replace />} />
                  <Route path="/learn/:lessonId" element={<Navigate to="/courses" replace />} />
                  <Route path="/review" element={<Review />} />
                  <Route path="/quiz" element={<Quiz />} />
                  <Route path="/arena" element={<Arena />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
      </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
