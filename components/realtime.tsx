"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Keeps every phone in the pit in sync: refreshes server data when the DB
 * broadcasts a change, when the tab regains focus, and on a slow fallback timer.
 */
export function Realtime() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        // A refresh with no network just errors; the offline poller refreshes on reconnect.
        if (navigator.onLine) router.refresh();
      }, 250);
    };

    const sb = supabaseBrowser();
    const channel = sb
      ?.channel("board")
      .on("broadcast", { event: "changed" }, refresh)
      .subscribe();

    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", refresh);
    const interval = setInterval(refresh, 60_000);

    return () => {
      if (channel) sb?.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", refresh);
      clearInterval(interval);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);

  return null;
}
