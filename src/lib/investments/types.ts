export type InvestmentKind = "productive" | "financial";
export type InvestmentStatus = "planned" | "active" | "completed" | "cancelled";
export type InvestmentCategory = {
  id: string; name: string; category_type: "productive_investment" | "financial_investment";
  active: boolean;
};
export type InvestmentRecord = {
  id: string; investment_type: InvestmentKind; category_id: string; category_name: string;
  name: string; description: string | null; initial_value_text: string;
  current_value_text: string | null; principal_text: string | null;
  investment_date: string; valuation_date: string | null;
  institution: string | null; status: InvestmentStatus; payment_transaction_id: string | null;
  payment_account_id: string | null; payment_reversal_id: string | null;
  payment_reversal_date: string | null; notes: string | null; created_at: string;
  farm_unit_id: string | null; farm_unit_name: string | null;
};
export type InvestmentMovement = {
  id: string; investment_id: string;
  movement_type: "contribution" | "withdrawal" | "reversal_contribution" | "reversal_withdrawal";
  amount_text: string; movement_date: string; account_id: string | null; account_name: string | null;
  notes: string | null; reversal_of_id: string | null; reversed_by_id: string | null;
  transaction_id: string;
};
