import { PageIntro } from "@/components/page-intro";
import { TransactionManager } from "@/components/transaction-manager";
import { parseTransactionFilters } from "@/lib/finance/filters";
import { listCategories, listTransactions } from "@/lib/finance/repository";
import { listFarmUnits, selectedFarmUnitId } from "@/lib/farm-units/repository";

export default async function SaidasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const filters = parseTransactionFilters(params);
  const units = await listFarmUnits();
  const selectedUnitId = selectedFarmUnitId(params.unit, units);
  const [categories, transactions] = await Promise.all([
    listCategories("expense"), listTransactions("expense", filters, selectedUnitId),
  ]);
  return <><PageIntro eyebrow="Financeiro" title="Saídas" description="Registre manualmente os gastos da fazenda e acompanhe pagamentos pendentes ou vencidos." /><TransactionManager kind="expense" categories={categories} transactions={transactions} farmUnits={units} selectedUnitId={selectedUnitId} filters={filters} initialNew={params.novo === "1"} /></>;
}
