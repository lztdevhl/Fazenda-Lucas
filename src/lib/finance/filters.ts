import { z } from "zod";
import type { TransactionFilters } from "@/lib/finance/types";

const date = z.iso.date();
const uuid = z.uuid();

export function parseTransactionFilters(params: Record<string, string | string[] | undefined>): TransactionFilters {
  const scalar = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const status = scalar("status");
  const category = scalar("category");
  const from = scalar("from");
  const to = scalar("to");
  return {
    search: scalar("search").trim().slice(0, 100),
    status: status === "pending" || status === "settled" || status === "cancelled" ? status : undefined,
    category: uuid.safeParse(category).success ? category : undefined,
    from: date.safeParse(from).success ? from : undefined,
    to: date.safeParse(to).success ? to : undefined,
  };
}
