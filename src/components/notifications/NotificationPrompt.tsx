import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const HIDDEN_ROUTES = ["/", "/auth", "/join-organization"];

export function NotificationPrompt() {
  const { supported, permission, requestPermission } = usePushNotifications();
  const { user } = useAuth();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const wasDismissed = localStorage.getItem("notification-prompt-dismissed");
    if (wasDismissed) {
      setDismissed(true);
      return;
    }
    if (supported && permission !== "granted") {
      const timer = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [supported, permission]);

  const handleEnable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await requestPermission();
      if (result.granted) {
        toast.success("Notifications enabled");
        setShow(false);
      } else if (result.reason === "denied") {
        toast.error(
          "Notifications are blocked. Enable them in your browser's site settings, then reload."
        );
        localStorage.setItem("notification-prompt-dismissed", "true");
        setDismissed(true);
        setShow(false);
      } else if (result.reason === "blocked") {
        toast.message("Open in a new tab to enable notifications", {
          description:
            "The in-app preview blocks permission prompts. Open the published app in a browser tab.",
          action: {
            label: "Open",
            onClick: () => window.open(window.location.href, "_blank"),
          },
        });
      } else if (result.reason === "unsupported") {
        toast.error("Your browser doesn't support push notifications.");
        localStorage.setItem("notification-prompt-dismissed", "true");
        setDismissed(true);
        setShow(false);
      } else {
        toast.error("Could not enable notifications. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("notification-prompt-dismissed", "true");
    setDismissed(true);
    setShow(false);
  };

  if (
    !show ||
    dismissed ||
    !supported ||
    permission === "granted" ||
    !user ||
    HIDDEN_ROUTES.includes(location.pathname)
  ) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-20 left-4 right-4 z-50 animate-slide-up",
        "bg-card border border-border rounded-xl p-4 shadow-lg"
      )}
    >
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Bell className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm mb-1">Enable notifications</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Get notified when you receive new messages, even when the app is in
            the background.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleEnable} disabled={busy}>
              {busy ? "Enabling..." : "Enable"}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDismiss}>
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
