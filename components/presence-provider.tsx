"use client";

import React, { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

function sendOfflineBeacon() {
  try {
    const data = JSON.stringify({ offline: true });
    const blob = new Blob([data], { type: "application/json" });
    navigator.sendBeacon("/api/presence", blob);
  } catch {}
}

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const email = (session?.user as any)?.email as string | undefined;
  const tabKey = email ? `presence:tabs:${email}` : undefined;

  // Helper to read/write tab counts
  const getTabCount = () => {
    if (!tabKey) return 0;
    try {
      return parseInt(localStorage.getItem(tabKey) || "0", 10) || 0;
    } catch {
      return 0;
    }
  };
  const setTabCount = (n: number) => {
    if (!tabKey) return;
    try {
      if (n <= 0) localStorage.removeItem(tabKey);
      else localStorage.setItem(tabKey, String(n));
    } catch {}
  };

  // Start/stop heartbeat
  const startHeartbeat = () => {
    if (intervalRef.current) return;
    const sendHeartbeat = async () => {
      try {
        await fetch("/api/presence", { method: "POST" });
      } catch {}
    };
    // initial beat
    sendHeartbeat();
    intervalRef.current = setInterval(sendHeartbeat, 10000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") sendHeartbeat();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  };
  const stopHeartbeat = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Manage tab count and offline on last tab close
  useEffect(() => {
    if (status !== "authenticated" || !email) return;

    // Increment tab count
    const current = getTabCount();
    setTabCount(current + 1);

    // Start heartbeats
    const removeVis = startHeartbeat();

    const onBeforeUnload = () => {
      const c = getTabCount();
      const next = Math.max(0, c - 1);
      setTabCount(next);
      if (next === 0) {
        sendOfflineBeacon();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Decrement on unmount
      const c2 = getTabCount();
      const next2 = Math.max(0, c2 - 1);
      setTabCount(next2);
      if (next2 === 0) {
        sendOfflineBeacon();
      }
      stopHeartbeat();
      if (removeVis) removeVis();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, email]);

  // If session becomes unauthenticated, send offline and stop
  useEffect(() => {
    if (status === "unauthenticated") {
      sendOfflineBeacon();
      stopHeartbeat();
    }
  }, [status]);

  return <>{children}</>;
}
