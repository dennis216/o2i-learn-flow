import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import Index from "./pages/Index";

// Lazy-loaded pages for code-splitting
const Auth = lazy(() => import("./pages/Auth"));
const Profile = lazy(() => import("./pages/Profile"));
const Courses = lazy(() => import("./pages/Courses"));
const Roadmaps = lazy(() => import("./pages/Roadmaps"));
const SolutionRequests = lazy(() => import("./pages/SolutionRequests"));
const Forum = lazy(() => import("./pages/Forum"));
const Discussion = lazy(() => import("./pages/Discussion"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Admin = lazy(() => import("./pages/Admin"));
const Practice = lazy(() => import("./pages/Practice"));
const PracticeQuestion = lazy(() => import("./pages/PracticeQuestion"));
const AITutor = lazy(() => import("./pages/AITutor"));
const Team = lazy(() => import("./pages/Team"));
const Playground = lazy(() => import("./pages/Playground"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Loading component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="space-y-4 text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
      <p className="text-sm text-muted-foreground">Loading page...</p>
    </div>
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Navbar />
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
              <Route path="/roadmaps" element={<Roadmaps />} />
              <Route path="/solution-requests" element={<SolutionRequests />} />
              <Route path="/forum" element={<Forum />} />
              <Route path="/forum/:postId" element={<Discussion />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/team" element={<Team />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
