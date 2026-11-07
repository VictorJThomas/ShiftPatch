import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";

/** TanStack Query owns SERVER state only. Zustand never caches server data. */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // 4xx are answers, not glitches: never retry them (the client already did its one 401 retry).
        retry: (failureCount, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1,
      },
    },
  });
}

let browserClient: QueryClient | undefined;

/** One client per browser tab (the lifecycle module clears it on logout); a fresh one per server render. */
export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return createQueryClient();
  browserClient ??= createQueryClient();
  return browserClient;
}

/** Agency-scoped server state always lives under `["agency", activeAgencyId, ...]`. */
export const agencyKey = (agencyId: string | null, ...rest: readonly unknown[]) => ["agency", agencyId, ...rest] as const;
