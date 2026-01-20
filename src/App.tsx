import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import Courses from "./pages/Courses";
import Roadmaps from "./pages/Roadmaps";
import SolutionRequests from "./pages/SolutionRequests";
import Forum from "./pages/Forum";
import Discussion from "./pages/Discussion";
import ResetPassword from "./pages/ResetPassword";
import Admin from "./pages/Admin";
import Practice from "./pages/Practice";
import PracticeQuestion from "./pages/PracticeQuestion";
import AITutor from "./pages/AITutor";
import Team from "./pages/Team";
import Playground from "./pages/Playground";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Navbar />
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
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
