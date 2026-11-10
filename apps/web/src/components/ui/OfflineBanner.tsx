"use client";

import { useSyncExternalStore } from "react";
import { Alert } from "@/components/shadcn/alert";
import { Icon } from "./Icon";

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/** `navigator.onLine`, live. Assumes online during SSR. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

/** Warning banner shown only while the browser is offline. */
export function OfflineBanner({ message = "Showing the last loaded data. Actions will work again when you reconnect." }: { message?: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <Alert variant="warning" role="status">
      <Icon name="wifi-off" size="lg" />
      <div>
        <b>You are offline</b>
        {message}
      </div>
    </Alert>
  );
}
