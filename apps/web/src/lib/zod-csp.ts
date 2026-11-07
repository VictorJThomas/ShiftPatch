import { z } from "zod";

// The production CSP has no 'unsafe-eval' (next.config.ts). zod 4 otherwise probes `new Function` for its JIT object
// parser; the throw is caught but the browser still reports a CSP violation. zod reads the flag when a schema is
// CONSTRUCTED, so this module must be evaluated before any schema module (@shiftpatch/contracts): import it first.
z.config({ jitless: true });
