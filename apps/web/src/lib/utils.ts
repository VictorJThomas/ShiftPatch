import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Shadcn's class merger: clsx + tailwind-merge (later Tailwind classes win over earlier conflicting ones). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
