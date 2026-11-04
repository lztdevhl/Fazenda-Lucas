import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn("h-11 w-full rounded-lg border border-border bg-white px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-3 focus:ring-primary/10", className)} {...props} />;
}
