"use client";

import { Input } from "@/components/ui/input";
import { maskBRLInput } from "@/lib/finance/money";

export function CurrencyInput({ value, onChange, allowNegative = false, ...props }: Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & { value: string; onChange: (value: string) => void; allowNegative?: boolean }) {
  return <Input inputMode="numeric" value={value} onChange={(event) => onChange(maskBRLInput(allowNegative ? event.target.value : event.target.value.replace(/-/g, "")))} {...props} />;
}
