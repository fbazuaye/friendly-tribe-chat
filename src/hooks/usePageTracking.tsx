import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const SESSION_KEY = "pulse_session_id";

function getSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        crypto.randomUUID?.() ??
        Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

export function usePageTracking() {
  const location = useLocation();
  const { user } = useAuth();
  const lastPathRef = useRef<string | null>(null);
  const orgIdRef = useRef<string | null>(null);

  // Resolve org id once we have a user
  useEffect(() => {
    let cancelled = false;
    async function loadOrg() {
      if (!user) {
        orgIdRef.current = null;
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled) orgIdRef.current = data?.organization_id ?? null;
    }
    loadOrg();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    const path = location.pathname + location.search;
    if (lastPathRef.current === path) return;
    lastPathRef.current = path;

    const t = setTimeout(() => {
      supabase.functions
        .invoke("log-visit", {
          body: {
            path,
            referrer: document.referrer || null,
            session_id: getSessionId(),
            user_id: user?.id ?? null,
            organization_id: orgIdRef.current,
          },
        })
        .catch(() => {
          /* swallow — analytics must never break the app */
        });
    }, 400);

    return () => clearTimeout(t);
  }, [location.pathname, location.search, user]);
}
