import { z } from "zod";
import { centsFromDecimal } from "@/lib/finance/money";

const uuid = z.uuid();
const date = z.iso.date();
const text = z.string().trim().max(2000).nullable();
const money = z.string().regex(/^\d{1,16}\.\d{2}$/);
const positiveMoney = money.refine((value) => centsFromDecimal(value) > 0n, "Informe um valor maior que zero.");

export const productiveInputSchema = z.object({
  id: uuid.nullable(), name: z.string().trim().min(2).max(160), categoryId: uuid,
  description: text, amount: positiveMoney, date, accountId: uuid.nullable(),
  farmUnitId: uuid.nullable(),
  status: z.enum(["planned", "active", "completed"]), notes: text, idempotencyKey: uuid,
});
export const applicationInputSchema = z.object({
  name: z.string().trim().min(2).max(160), categoryId: uuid,
  institution: z.string().trim().min(2).max(160), date, amount: positiveMoney,
  accountId: uuid.nullable(), currentValue: money, valuationDate: date, notes: text, idempotencyKey: uuid,
});
export const applicationEditSchema = z.object({
  id: uuid, name: z.string().trim().min(2).max(160), categoryId: uuid,
  institution: z.string().trim().min(2).max(160), description: text,
  currentValue: money, valuationDate: date,
  status: z.enum(["active", "completed", "cancelled"]), notes: text,
});
export const movementInputSchema = z.object({
  investmentId: uuid, movementType: z.enum(["contribution", "withdrawal"]),
  amount: positiveMoney, date, accountId: uuid.nullable(), notes: text, idempotencyKey: uuid,
});
export const investmentIdSchema = z.object({ id: uuid });
export const investmentReverseSchema = z.object({ id: uuid, date, idempotencyKey: uuid });

export const investmentRecordSchema = z.object({
  id: uuid, investment_type: z.enum(["productive", "financial"]), category_id: uuid,
  category_name: z.string(), name: z.string(), description: z.string().nullable(),
  initial_value_text: money, current_value_text: money.nullable(),
  principal_text: z.string().regex(/^-?\d{1,18}\.\d{2}$/).nullable(),
  investment_date: date, valuation_date: date.nullable(), institution: z.string().nullable(),
  status: z.enum(["planned", "active", "completed", "cancelled"]),
  payment_transaction_id: uuid.nullable(), payment_account_id: uuid.nullable(),
  payment_reversal_id: uuid.nullable(), payment_reversal_date: date.nullable(),
  notes: z.string().nullable(), created_at: z.string(), farm_unit_id: uuid.nullable(), farm_unit_name: z.string().nullable(),
});
export const investmentMovementSchema = z.object({
  id: uuid, investment_id: uuid,
  movement_type: z.enum(["contribution", "withdrawal", "reversal_contribution", "reversal_withdrawal"]),
  amount_text: money, movement_date: date, account_id: uuid.nullable(),
  account_name: z.string().nullable(), notes: z.string().nullable(),
  reversal_of_id: uuid.nullable(), reversed_by_id: uuid.nullable(), transaction_id: uuid,
});
export const investmentCategorySchema = z.object({
  id: uuid, name: z.string(), category_type: z.enum(["productive_investment", "financial_investment"]),
  active: z.boolean(),
});
