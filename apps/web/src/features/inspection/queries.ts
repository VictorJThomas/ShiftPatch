import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built
import {
  type CreateInspectionPackageRequest, InspectionDocumentLinkResponse, InspectionNursesResponse, InspectionPackageDetailResponse, InspectionPackageResponse, InspectionPackagesResponse,
} from "@shiftpatch/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { showError } from "@/lib/format-error";
import { useSessionStore } from "@/stores/session";
import { notify } from "@/stores/toasts";

// Agency users are keyed by the active agency: the cache never mixes two agencies' packages.
const scope = () => useSessionStore.getState().activeAgencyId ?? "network";
export const inspectionKeys = {
  all: ["inspection"] as const,
  candidates: (from: string, to: string, s: string) => ["inspection", "candidates", s, from, to] as const,
  list: (s: string) => ["inspection", "list", s] as const,
  detail: (id: string, s: string) => ["inspection", "detail", s, id] as const,
};

export function useCandidates(from: string, to: string, enabled: boolean) {
  const s = useSessionStore((st) => st.activeAgencyId) ?? "network";
  return useQuery({
    queryKey: inspectionKeys.candidates(from, to, s),
    enabled,
    queryFn: ({ signal }) => apiFetch(`/api/inspection/nurses?${new URLSearchParams({ from, to })}`, { schema: InspectionNursesResponse, signal }).then((r) => r.nurses),
    gcTime: 60_000, // personal data: not kept around for long
  });
}

export function usePackages() {
  const s = useSessionStore((st) => st.activeAgencyId) ?? "network";
  return useQuery({
    queryKey: inspectionKeys.list(s),
    queryFn: ({ signal }) => apiFetch("/api/inspection-packages", { schema: InspectionPackagesResponse, signal }).then((r) => r.packages),
    refetchInterval: 60_000, // the "expires in" label stays honest
  });
}

/** One package. Retry is off: a 404 / 410 is an answer, not a glitch. gcTime 0: the summary (names, license numbers) is dropped when the page closes. */
export function usePackage(id: string) {
  const s = useSessionStore((st) => st.activeAgencyId) ?? "network";
  return useQuery({
    queryKey: inspectionKeys.detail(id, s),
    queryFn: ({ signal }) => apiFetch(`/api/inspection-packages/${encodeURIComponent(id)}`, { schema: InspectionPackageDetailResponse, signal }),
    retry: false,
    gcTime: 0,
    staleTime: Infinity, // each fetch is one audit row ("viewed"): never refetch on focus
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useGeneratePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInspectionPackageRequest) => apiFetch("/api/inspection-packages", { method: "POST", body, schema: InspectionPackageResponse }),
    onSuccess: () => notify.success("Inspection package created", "It expires in 24 hours."),
    onError: showError,
    onSettled: () => qc.invalidateQueries({ queryKey: inspectionKeys.list(scope()) }),
  });
}

export function useRevokePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/inspection-packages/${encodeURIComponent(id)}/revoke`, { method: "POST", schema: InspectionPackageResponse }),
    onSuccess: () => notify.success("Package revoked"),
    onError: showError,
    onSettled: () => qc.invalidateQueries({ queryKey: inspectionKeys.all }),
  });
}

/** Signed link fetched on click (never in advance: it expires in 5 minutes and each fetch is one audit row), opened by navigation (the object is an attachment). */
export function useOpenDocument(packageId: string) {
  return useMutation({
    mutationFn: (credentialId: string) =>
      apiFetch(`/api/inspection-packages/${encodeURIComponent(packageId)}/documents/${encodeURIComponent(credentialId)}/link`, { method: "POST", schema: InspectionDocumentLinkResponse }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: showError,
  });
}
