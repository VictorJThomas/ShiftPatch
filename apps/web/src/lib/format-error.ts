import "@/lib/zod-csp"; // first: api-client pulls in the contracts (zod)
import { ApiError } from "@/lib/api-client";
import { notify } from "@/stores/toasts";

export const FALLBACK_ERROR = "Something went wrong. Try again.";

/** Shared mutation `onError`: toast the API's message, or a generic one for network/unknown failures. */
export const showError = (err: unknown) => notify.error(err instanceof ApiError ? err.message : FALLBACK_ERROR);
