import { z } from "zod";

export const ErrorBody = z.object({ error: z.string() }).strict();
export type ErrorBody = z.infer<typeof ErrorBody>;
