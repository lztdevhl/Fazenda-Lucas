export type TransactionKind = "income" | "expense";
export type TransactionStatus = "pending" | "settled" | "cancelled";

export type FinancialAccount = {
  id: string;
  name: string;
  account_type: "bank" | "cash";
  opening_balance_text: string;
  opening_date: string;
  active: boolean;
  balance_text: string;
  settled_count: number;
};

export type FinancialCategory = {
  id: string;
  name: string;
  category_type: TransactionKind;
  active: boolean;
  is_system: boolean;
};

export type FinancialTransaction = {
  id: string;
  kind: TransactionKind;
  description: string;
  amount_text: string;
  category_id: string;
  category_name: string | null;
  account_id: string | null;
  account_name: string | null;
  farm_unit_id: string | null;
  farm_unit_name: string | null;
  competency_date: string;
  due_date: string | null;
  settled_on: string | null;
  status: TransactionStatus;
  counterparty: string | null;
  notes: string | null;
  created_at: string;
  reversal_id: string | null;
};

export type TransactionFilters = {
  search?: string;
  status?: TransactionStatus;
  category?: string;
  from?: string;
  to?: string;
};
