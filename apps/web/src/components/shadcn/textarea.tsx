import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { inputClass, stripLegacyInp } from "./input";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(inputClass, "min-h-24 resize-none py-3", stripLegacyInp(className))} {...props} />;
}
