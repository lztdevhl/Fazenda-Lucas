import { z } from "zod";
import { centsFromDecimal } from "@/lib/finance/money";

const uuid = z.uuid();
const isoDate = z.iso.date();
const amount = z.string().regex(/^\d{1,16}\.\d{2}$/).refine((value) => centsFromDecimal(value) > 0n, "O valor deve ser maior que zero.");
const signedAmount = z.string().regex(/^-?\d{1,16}\.\d{2}$/);

export const accountInputSchema = z.object({
  id: uuid.nullable(),
  name: z.string().trim().min(2).max(100),
  accountType: z.enum(["bank", "cash"]),
  openingBalance: signedAmount,
  openingDate: isoDate,
  active: z.boolean(),
});

export const categoryInputSchema = z.object({
  id: uuid.nullable(),
  categoryType: z.enum(["income", "expense"]),
  name: z.string().trim().min(2).max(100),
  active: z.boolean(),
});

export const transactionInputSchema = z.object({
  id: uuid.nullable(),
  kind: z.enum(["income", "expense"]),
  description: z.string().trim().min(2).max(200),
  amount,
  categoryId: uuid,
  accountId: uuid.nullable(),
  farmUnitId: uuid.nullable(),
  competencyDate: isoDate,
  dueDate: isoDate,
  counterparty: z.string().trim().max(160).nullable(),
  notes: z.string().trim().max(2000).nullable(),
  idempotencyKey: uuid,
});

export const settleInputSchema = z.object({ id: uuid, accountId: uuid.nullable().default(null), settledOn: isoDate });
export const cancelInputSchema = z.object({ id: uuid });
export const deleteTransactionSchema = z.object({ id: uuid });
export const reverseInputSchema = z.object({ id: uuid, settledOn: isoDate, idempotencyKey: uuid });

export const accountRowSchema = z.object({
  id: uuid, name: z.string(), account_type: z.enum(["bank", "cash"]),
  opening_balance_text: signedAmount, opening_date: isoDate, active: z.boolean(),
  balance_text: signedAmount, settled_count: z.number().int().nonnegative(),
});

export const categoryRowSchema = z.object({
  id: uuid, name: z.string(), category_type: z.enum(["income", "expense"]),
  active: z.boolean(), is_system: z.boolean(),
});

export const transactionRowSchema = z.object({
  id: uuid, kind: z.enum(["income", "expense"]), description: z.string(), amount_text: amount,
  category_id: uuid, category_name: z.string().nullable(), account_id: uuid.nullable(),
  account_name: z.string().nullable(), competency_date: isoDate, due_date: isoDate.nullable(),
  farm_unit_id: uuid.nullable(), farm_unit_name: z.string().nullable(),
  settled_on: isoDate.nullable(), status: z.enum(["pending", "settled", "cancelled"]),
  counterparty: z.string().nullable(), notes: z.string().nullable(), created_at: z.string(),
  reversal_id: uuid.nullable(),
});
