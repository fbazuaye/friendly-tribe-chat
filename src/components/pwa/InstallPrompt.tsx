import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Download, Share, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    setIsStandalone(standalone);

    // Check if iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Check if dismissed recently
    const dismissed = localStorage.getItem("pwa-prompt-dismissed");
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      // Don't show for 7 days after dismissal
      if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) {
        return;
      }
    }

    // Listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Show iOS prompt after delay
    if (iOS && !standalone) {
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", handler);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("pwa-prompt-dismissed", Date.now().toString());
    setShowPrompt(false);
  };

  if (!showPrompt || isStandalone) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 animate-slide-up">
      <div className="glass-strong rounded-2xl p-4 shadow-glow max-w-md mx-auto">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center flex-shrink-0">
            <Download className="w-6 h-6 text-white" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground mb-1">
              Install Pulse
            </h3>
            <p className="text-sm text-muted-foreground">
              {isIOS
                ? "Tap Share, then 'Add to Home Screen' for the best experience"
                : "Add to your home screen for quick access"}
            </p>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={handleDismiss}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {isIOS ? (
          <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                <Share className="w-4 h-4" />
              </span>
              <span>Tap Share</span>
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </span>
              <span>Add to Home</span>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 mt-4 pt-4 border-t border-border">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleDismiss}
            >
              Not now
            </Button>
            <Button
              className="flex-1 bg-gradient-primary hover:opacity-90"
              onClick={handleInstall}
            >
              Install
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
