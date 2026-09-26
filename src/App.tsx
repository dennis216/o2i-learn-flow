import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { LearningProvider } from '@/contexts/LearningContext';
import { useMemoryCleanup } from '@/hooks/useMemoryCleanup';
import Navbar from '@/components/Navbar';
import Index from '@/pages/Index';
import Learn from '@/pages/Learn';
import Lesson from '@/pages/Lesson';
import Review from '@/pages/Review';
import Practice from '@/pages/Practice';
import Quiz from '@/pages/Quiz';

const Auth = lazy(() => import('@/pages/Auth'));
const Profile = lazy(() => import('@/pages/Profile'));
const Courses = lazy(() => import('@/pages/Courses'));
const SolutionRequests = lazy(() => import('@/pages/SolutionRequests'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Admin = lazy(() => import('@/pages/Admin'));
const PracticeQuestion = lazy(() => import('@/pages/PracticeQuestion'));
const AITutor = lazy(() => import('@/pages/AITutor'));
const Team = lazy(() => import('@/pages/Team'));
const Playground = lazy(() => import('@/pages/Playground'));
const NotFound = lazy(() => import('@/pages/NotFound'));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-4 text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
        <p className="text-sm text-muted-foreground">Loading page...</p>
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
      <AuthProvider>
        <LearningProvider>
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
                  <Route path="/practice/:videoId" element={<PracticeQuestion />} />
                  <Route path="/ai-tutor" element={<AITutor />} />
                  <Route path="/playground" element={<Playground />} />
                  <Route path="/solution-requests" element={<SolutionRequests />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/team" element={<Team />} />
                  <Route path="/learn" element={<Learn />} />
                  <Route path="/learn/:lessonId" element={<Lesson />} />
                  <Route path="/review" element={<Review />} />
                  <Route path="/quiz" element={<Quiz />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </LearningProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
