import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Instagram, Youtube, Sparkles, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const PROTECTED_ROUTES = ["/courses", "/practice", "/ai-tutor"];
const STORAGE_KEY = "o2i_subscribed";

const INSTAGRAM_URL = "https://www.instagram.com/o2iinstitute/";
const YOUTUBE_URL = "https://www.youtube.com/@O2IEducation";

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

const SubscriptionGuard = ({ children }: SubscriptionGuardProps) => {
  const location = useLocation();
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    const subscribed = localStorage.getItem(STORAGE_KEY) === "true";
    setIsSubscribed(subscribed);
  }, []);

  useEffect(() => {
    if (isSubscribed === null) return;
    
    const isProtectedRoute = PROTECTED_ROUTES.some(route => 
      location.pathname.startsWith(route)
    );
    
    setShowOverlay(isProtectedRoute && !isSubscribed);
  }, [location.pathname, isSubscribed]);

  const handleUnlock = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsSubscribed(true);
    setShowOverlay(false);
  };

  if (isSubscribed === null) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      
      {showOverlay && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Blurred backdrop */}
          <div className="absolute inset-0 bg-background/60 backdrop-blur-xl" />
          
          {/* Modal content */}
          <div className="relative z-10 mx-4 w-full max-w-lg">
            <div className="rounded-2xl border border-white/20 bg-white/10 p-8 shadow-2xl backdrop-blur-2xl dark:bg-black/20">
              {/* Header */}
              <div className="mb-6 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <h2 className="mb-2 text-2xl font-bold text-foreground">
                  Subscribe to Unlock Premium Access 🚀
                </h2>
                <p className="text-muted-foreground">
                  Join our community to access all expert courses, practice problems, and AI tools for free.
                </p>
              </div>

              {/* Social Links */}
              <div className="mb-6 space-y-3">
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 px-6 py-4 text-white transition-all hover:scale-[1.02] hover:shadow-lg"
                >
                  <Instagram className="h-6 w-6" />
                  <span className="font-semibold">Follow us on Instagram (O2I Institute)</span>
                </a>

                <a
                  href={YOUTUBE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-red-600 to-red-500 px-6 py-4 text-white transition-all hover:scale-[1.02] hover:shadow-lg"
                >
                  <Youtube className="h-6 w-6" />
                  <span className="font-semibold">Subscribe to O2I Education</span>
                </a>
              </div>

              {/* Unlock Button */}
              <Button
                onClick={handleUnlock}
                className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 py-6 text-lg font-semibold text-white hover:from-emerald-600 hover:to-teal-600"
              >
                <CheckCircle className="h-5 w-5" />
                I have subscribed, let me in!
              </Button>

              {/* Footer note */}
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Your support helps us create more free educational content ❤️
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SubscriptionGuard;
