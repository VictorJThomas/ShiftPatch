"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/Toaster";
import "@/features/auth/lifecycle";
import { bootstrapSession } from "@/features/auth/session-flow";
import { getQueryClient } from "@/lib/query-client";

/** Restores the session once per page load (StrictMode-safe: the flow is a module-level promise). */
function AuthBootstrap() {
  useEffect(() => {
    void bootstrapSession();
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap />
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
