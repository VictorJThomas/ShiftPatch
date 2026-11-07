import { configureApiClient } from "@/lib/api-client";
import { getQueryClient } from "@/lib/query-client";
import { LOGIN_PATH } from "@/lib/routes";
import { onSignedOutElsewhere } from "@/lib/session-channel";
import { notify } from "@/stores/toasts";
import { endSessionLocally } from "./session-flow";

/**
 * Wires the api-client's escape hatches to the app. Imported once by `Providers`.
 * Registering is idempotent and touches no browser API, so it is safe during SSR evaluation.
 */
configureApiClient({
  onSessionLost: () => {
    endSessionLocally();
    // Hard navigation: also drops every in-memory leftover (query cache, component state).
    if (typeof window !== "undefined" && window.location.pathname !== LOGIN_PATH) window.location.replace(LOGIN_PATH);
  },
  onAgencyRejected: (message) => {
    getQueryClient().removeQueries({ queryKey: ["agency"] });
    notify.error(message, "Pick an agency again to continue.");
  },
});

// Another tab signed out: end this tab session too (no re-broadcast).
if (typeof window !== "undefined") {
  onSignedOutElsewhere(() => {
    endSessionLocally({ broadcast: false });
    if (window.location.pathname !== LOGIN_PATH) window.location.replace(LOGIN_PATH);
  });
}
