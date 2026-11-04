import { differenceInCalendarDays, eachDayOfInterval, eachMonthOfInterval, format, parseISO } from "date-fns";
import { centsFromDecimal, decimalFromCents } from "../finance/money";
import type { ReportData, ReportFilters, ReportLine, ReportModel, ReportTransaction } from "./types";

type SignedEvent = { transaction: ReportTransaction; amount: bigint; date: string };

const INCOME_KINDS = new Set(["income", "reversal_income"]);
const EXPENSE_KINDS = new Set(["expense", "reversal_expense"]);
const PRODUCTIVE_KINDS = new Set(["capital_expenditure", "reversal_capital_expenditure"]);
const CONTRIBUTION_KINDS = new Set(["investment_contribution", "reversal_investment_contribution"]);
const WITHDRAWAL_KINDS = new Set(["investment_withdrawal", "reversal_investment_withdrawal"]);
const REVERSAL_KINDS = new Set(["reversal_income", "reversal_expense", "reversal_capital_expenditure", "reversal_investment_contribution", "reversal_investment_withdrawal"]);

function signedAmount(transaction: ReportTransaction): bigint {
  const amount = centsFromDecimal(transaction.amount_text);
  return REVERSAL_KINDS.has(transaction.kind) ? -amount : amount;
}

function isOperationalIncome(transaction: ReportTransaction) { return INCOME_KINDS.has(transaction.kind); }
function isOperationalExpense(transaction: ReportTransaction) { return EXPENSE_KINDS.has(transaction.kind); }
function isSettledInPeriod(transaction: ReportTransaction, from: string, to: string) {
  return transaction.status === "settled" && !!transaction.settled_on && transaction.settled_on >= from && transaction.settled_on <= to;
}
function isDueInPeriod(transaction: ReportTransaction, from: string, to: string) {
  return transaction.status === "pending" && !!transaction.due_date && transaction.due_date >= from && transaction.due_date <= to;
}

function transactionCategory(transaction: ReportTransaction, byId: Map<string, ReportTransaction>, data: ReportData) {
  if (transaction.category_name) return transaction.category_name;
  if (transaction.reversal_of_id) {
    const original = byId.get(transaction.reversal_of_id);
    if (original?.category_name) return original.category_name;
    const categoryId = original?.category_id;
    if (categoryId) return data.categories.find((category) => category.id === categoryId)?.name ?? "Sem categoria";
  }
  return "Sem categoria";
}

function accountMatches(transaction: ReportTransaction, accountId: string | null) {
  if (!accountId) return true;
  return transaction.account_id === accountId || transaction.destination_account_id === accountId;
}

function categoryMatches(transaction: ReportTransaction, categoryId: string | null, byId: Map<string, ReportTransaction>) {
  if (!categoryId) return true;
  if (transaction.category_id === categoryId) return true;
  return !!transaction.reversal_of_id && byId.get(transaction.reversal_of_id)?.category_id === categoryId;
}

function selectedTransactions(data: ReportData, filters: ReportFilters) {
  const byId = new Map(data.transactions.map((transaction) => [transaction.id, transaction]));
  return data.transactions.filter((transaction) => transaction.status !== "cancelled"
    && accountMatches(transaction, filters.accountId)
    && categoryMatches(transaction, filters.categoryId, byId));
}

function cashDelta(transaction: ReportTransaction, accountId: string | null): bigint {
  const amount = signedAmount(transaction);
  if (transaction.kind === "transfer") {
    if (!accountId) return 0n;
    if (transaction.account_id === accountId) return -centsFromDecimal(transaction.amount_text);
    if (transaction.destination_account_id === accountId) return centsFromDecimal(transaction.amount_text);
    return 0n;
  }
  if (INCOME_KINDS.has(transaction.kind) || WITHDRAWAL_KINDS.has(transaction.kind)) return amount;
  if (EXPENSE_KINDS.has(transaction.kind) || PRODUCTIVE_KINDS.has(transaction.kind) || CONTRIBUTION_KINDS.has(transaction.kind)) return -amount;
  return 0n;
}

function cashEvents(transactions: ReportTransaction[], filters: ReportFilters): SignedEvent[] {
  return transactions.filter((transaction) => transaction.status === "settled" && transaction.settled_on)
    .map((transaction) => ({ transaction, date: transaction.settled_on as string, amount: cashDelta(transaction, filters.accountId) }))
    .filter((event) => event.amount !== 0n);
}

function competenceEvents(transactions: ReportTransaction[]): SignedEvent[] {
  return transactions.filter((transaction) => transaction.status !== "cancelled")
    .map((transaction) => ({ transaction, date: transaction.competency_date, amount: signedAmount(transaction) }));
}

function metric(label: string, value: bigint, tone: "default" | "positive" | "negative" | "warning" = "default") {
  return { label, value: decimalFromCents(value), tone };
}

function moneyLine(transaction: ReportTransaction, byId: Map<string, ReportTransaction>, data: ReportData, amount = signedAmount(transaction)): ReportLine {
  return { id: transaction.id, date: transaction.settled_on ?? transaction.competency_date, description: transaction.description,
    category: transactionCategory(transaction, byId, data), account: transaction.account_name ?? "Sem conta", farmUnit: transaction.farm_unit_name ?? "Geral da fazenda", amount: decimalFromCents(amount),
    status: transaction.status === "settled" ? "Liquidado" : "Pendente", counterparty: transaction.counterparty ?? undefined, kind: transaction.kind };
}

function aggregate(points: SignedEvent[], from: string, to: string, grouping: ReportFilters["grouping"]): ReportModel["chart"] {
  const values = new Map<string, bigint>();
  const keys = grouping === "day" ? eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).map((date) => format(date, "yyyy-MM-dd"))
    : grouping === "month" ? eachMonthOfInterval({ start: parseISO(from), end: parseISO(to) }).map((date) => format(date, "yyyy-MM")) : ["period"];
  for (const key of keys) values.set(key, 0n);
  for (const point of points) {
    const key = grouping === "day" ? point.date : grouping === "month" ? point.date.slice(0, 7) : "period";
    if (values.has(key)) values.set(key, (values.get(key) ?? 0n) + point.amount);
  }
  const pointsForChart = [...values].map(([label, value]) => ({ label: grouping === "month" && label !== "period" ? label.slice(5) + "/" + label.slice(0, 4) : label, value: decimalFromCents(value), plot: Number(decimalFromCents(value)) }));
  return { title: grouping === "day" ? "Movimentação por dia" : grouping === "month" ? "Movimentação por mês" : "Total do período", points: pointsForChart };
}

function operationalModel(data: ReportData, filters: ReportFilters, transactions: ReportTransaction[], byId: Map<string, ReportTransaction>): ReportModel {
  const basis = filters.regime === "cash" ? cashEvents(transactions, filters) : competenceEvents(transactions);
  const events = basis.filter((event) => event.date >= filters.period.from && event.date <= filters.period.to);
  const revenues = events.filter((event) => isOperationalIncome(event.transaction));
  const expenses = events.filter((event) => isOperationalExpense(event.transaction));
  const revenue = revenues.reduce((sum, event) => sum + event.amount, 0n);
  const expense = expenses.reduce((sum, event) => sum + (filters.regime === "cash" ? -event.amount : event.amount), 0n);
  const result = revenue - expense;
  const margin = revenue === 0n ? "0,00%" : `${(Number(result) / Number(revenue) * 100).toFixed(2).replace(".", ",")}%`;
  return { title: `Resultado operacional · Regime de ${filters.regime === "cash" ? "caixa" : "competência"}`,
    subtitle: filters.regime === "cash" ? "Receitas recebidas menos despesas pagas; pendências ficam fora do resultado." : "Receitas e despesas pela data de competência; pendências são incluídas.",
    metrics: [metric("Receitas operacionais", revenue, "positive"), metric("Despesas operacionais", expense, "negative"), metric("Resultado operacional", result, result >= 0n ? "positive" : "negative"), { label: "Margem operacional", value: margin }],
    lines: [...revenues, ...expenses].sort((a, b) => b.date.localeCompare(a.date)).map((event) => moneyLine(event.transaction, byId, data, event.amount)),
    chart: aggregate([...revenues, ...expenses.map((event) => ({ ...event, amount: filters.regime === "cash" ? event.amount : -event.amount }))], filters.period.from, filters.period.to, filters.grouping),
    notes: ["Este relatório não é lucro líquido contábil.", "Aportes, resgates, investimentos produtivos e transferências internas não são receitas ou despesas operacionais."],
    exportSheets: { "Resultado": [...revenues, ...expenses].map((event) => ({ Data: event.date, Descrição: event.transaction.description, Categoria: transactionCategory(event.transaction, byId, data), Regime: filters.regime, Valor: Number(event.amount) / 100 })) } };
}

function incomeExpenseModel(data: ReportData, filters: ReportFilters, transactions: ReportTransaction[], byId: Map<string, ReportTransaction>, kind: "income" | "expense"): ReportModel {
  const matcher = kind === "income" ? isOperationalIncome : isOperationalExpense;
  const relevant = transactions.filter(matcher);
  const received = relevant.filter((transaction) => isSettledInPeriod(transaction, filters.period.from, filters.period.to)).reduce((sum, transaction) => sum + signedAmount(transaction), 0n);
  const pendingTransactions = relevant.filter((transaction) => isDueInPeriod(transaction, filters.period.from, filters.period.to));
  const pending = pendingTransactions.reduce((sum, transaction) => sum + centsFromDecimal(transaction.amount_text), 0n);
  const overdue = pendingTransactions.filter((transaction) => transaction.due_date && transaction.due_date < todayIso()).reduce((sum, transaction) => sum + centsFromDecimal(transaction.amount_text), 0n);
  const periodLines = [...relevant.filter((transaction) => isSettledInPeriod(transaction, filters.period.from, filters.period.to) || isDueInPeriod(transaction, filters.period.from, filters.period.to))]
    .sort((a, b) => (b.settled_on ?? b.due_date ?? "").localeCompare(a.settled_on ?? a.due_date ?? ""));
  const chartEvents = periodLines.map((transaction) => ({ transaction, date: transaction.settled_on ?? transaction.due_date as string, amount: transaction.status === "pending" ? centsFromDecimal(transaction.amount_text) : signedAmount(transaction) }));
  const label = kind === "income" ? "Receitas" : "Despesas";
  return { title: `Relatório de ${label.toLowerCase()}`, subtitle: kind === "income" ? "Recebidos e previstos por categoria e período." : "Despesas operacionais pagas, pendentes e vencidas; investimentos produtivos ficam separados.",
    metrics: [metric(`Total ${filters.regime === "cash" ? "recebido" : "liquidado"}`, received, "positive"), metric("Pendente", pending, "warning"), metric("Vencido", overdue, overdue > 0n ? "negative" : "default")],
    lines: periodLines.map((transaction) => ({ ...moneyLine(transaction, byId, data, transaction.status === "pending" ? centsFromDecimal(transaction.amount_text) : signedAmount(transaction)), dueDate: transaction.due_date ?? undefined })),
    chart: aggregate(chartEvents, filters.period.from, filters.period.to, filters.grouping),
    notes: kind === "expense" ? ["Investimentos produtivos não entram neste total e aparecem no relatório de investimentos.", "Estornos são apresentados com sinal oposto e não duplicam o pagamento original."] : ["Receitas de suinocultura e demais categorias operacionais são mantidas no mesmo relatório.", "Valores recebidos e previstos permanecem separados."],
    exportSheets: { [label]: periodLines.map((transaction) => ({ Data: transaction.settled_on ?? transaction.due_date ?? transaction.competency_date, Descrição: transaction.description, Categoria: transactionCategory(transaction, byId, data), Status: transaction.status === "settled" ? "Liquidado" : "Pendente", Valor: Number(transaction.status === "pending" ? centsFromDecimal(transaction.amount_text) : signedAmount(transaction)) / 100 })) } };
}

function payablesReceivablesModel(data: ReportData, filters: ReportFilters, transactions: ReportTransaction[], byId: Map<string, ReportTransaction>, kind: "income" | "expense"): ReportModel {
  const relevant = transactions.filter((transaction) => transaction.kind === kind && transaction.status === "pending" && transaction.due_date && transaction.due_date >= filters.period.from && transaction.due_date <= filters.period.to);
  const total = relevant.reduce((sum, transaction) => sum + centsFromDecimal(transaction.amount_text), 0n);
  const overdue = relevant.filter((transaction) => transaction.due_date! < todayIso()).reduce((sum, transaction) => sum + centsFromDecimal(transaction.amount_text), 0n);
  const toCome = total - overdue;
  const lines = relevant.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")).map((transaction) => ({ ...moneyLine(transaction, byId, data, centsFromDecimal(transaction.amount_text)), date: transaction.due_date!, dueDate: transaction.due_date!, daysOverdue: Math.max(0, differenceInCalendarDays(parseISO(todayIso()), parseISO(transaction.due_date!))) }));
  const label = kind === "income" ? "receber" : "pagar";
  return { title: `Contas a ${label}`, subtitle: "Somente valores pendentes; cancelamentos não entram nos totais.", metrics: [metric("Total pendente", total, "warning"), metric("Total vencido", overdue, overdue > 0n ? "negative" : "default"), metric("Total a vencer", toCome, "default")], lines,
    chart: null, notes: ["Dias em atraso são calculados em relação à data atual da fazenda."], exportSheets: { [label === "pagar" ? "Contas a pagar" : "Contas a receber"]: lines.map((line) => ({ Descrição: line.description, Categoria: line.category, Valor: Number(centsFromDecimal(line.amount)) / 100, Vencimento: line.dueDate ?? "", Status: line.status, "Dias em atraso": line.daysOverdue ?? 0 })) } };
}

function cashflowModel(data: ReportData, filters: ReportFilters, transactions: ReportTransaction[], byId: Map<string, ReportTransaction>): ReportModel {
  const events = cashEvents(transactions, filters);
  const from = filters.period.from;
  const before = events.filter((event) => event.date < from).reduce((sum, event) => sum + event.amount, 0n);
  const openingFromAccounts = data.accounts.filter((account) => account.opening_date <= from && (!filters.accountId || account.id === filters.accountId))
    .reduce((sum, account) => sum + centsFromDecimal(account.opening_balance_text), 0n);
  const opening = openingFromAccounts + before;
  const periodEvents = events.filter((event) => event.date >= from && event.date <= filters.period.to);
  const total = periodEvents.reduce((sum, event) => sum + event.amount, 0n);
  const income = periodEvents.filter((event) => isOperationalIncome(event.transaction)).reduce((sum, event) => sum + event.amount, 0n);
  const expense = periodEvents.filter((event) => isOperationalExpense(event.transaction)).reduce((sum, event) => sum - event.amount, 0n);
  const productive = periodEvents.filter((event) => PRODUCTIVE_KINDS.has(event.transaction.kind)).reduce((sum, event) => sum - event.amount, 0n);
  const contribution = periodEvents.filter((event) => CONTRIBUTION_KINDS.has(event.transaction.kind)).reduce((sum, event) => sum - event.amount, 0n);
  const withdrawal = periodEvents.filter((event) => WITHDRAWAL_KINDS.has(event.transaction.kind)).reduce((sum, event) => sum + event.amount, 0n);
  const other = total - income + expense + productive + contribution - withdrawal;
  const rows = periodEvents.sort((a, b) => b.date.localeCompare(a.date)).map((event) => moneyLine(event.transaction, byId, data, event.amount));
  return { title: "Fluxo de caixa", subtitle: "Movimentações efetivamente liquidadas; transferências entre contas selecionadas não inflacionam o consolidado.", metrics: [metric("Saldo inicial", opening), metric("Entradas recebidas", income, "positive"), metric("Saídas operacionais", expense, "negative"), metric("Investimentos produtivos", productive, "negative"), metric("Aportes financeiros", contribution, "negative"), metric("Resgates financeiros", withdrawal, "positive"), metric("Outras movimentações", other), metric("Saldo final", opening + total, "positive")], lines: rows, chart: aggregate(periodEvents, filters.period.from, filters.period.to, filters.grouping), notes: ["O saldo final é reconciliado a partir dos saldos iniciais e dos eventos liquidados.", "Pendências aparecem nos relatórios de receitas, despesas e contas a pagar/receber, não no caixa realizado."], exportSheets: { "Fluxo de caixa": rows.map((line) => ({ Data: line.date, Descrição: line.description, Categoria: line.category, Conta: line.account, Tipo: line.kind ?? "", Valor: Number(centsFromDecimal(line.amount)) / 100 })) } };
}

function investmentsModel(data: ReportData, filters: ReportFilters): ReportModel {
  const selectedAccount = filters.accountId;
  const productive = data.investments.filter((record) => record.investment_type === "productive" && record.payment_transaction_id && record.status !== "planned"
    && (!filters.categoryId || record.category_id === filters.categoryId) && (!selectedAccount || record.payment_account_id === selectedAccount)
    && record.investment_date >= filters.period.from && record.investment_date <= filters.period.to);
  const productiveTotal = productive.reduce((sum, record) => sum + centsFromDecimal(record.initial_value_text), 0n);
  const chosenIds = new Set(data.investments.filter((record) => record.investment_type === "financial" && (!filters.categoryId || record.category_id === filters.categoryId)).map((record) => record.id));
  const movements = data.investmentMovements.filter((movement) => chosenIds.has(movement.investment_id) && movement.movement_date >= filters.period.from && movement.movement_date <= filters.period.to && (!selectedAccount || movement.account_id === selectedAccount));
  const contributions = movements.reduce((sum, movement) => sum + (movement.movement_type === "contribution" ? centsFromDecimal(movement.amount_text) : movement.movement_type === "reversal_contribution" ? -centsFromDecimal(movement.amount_text) : 0n), 0n);
  const withdrawals = movements.reduce((sum, movement) => sum + (movement.movement_type === "withdrawal" ? centsFromDecimal(movement.amount_text) : movement.movement_type === "reversal_withdrawal" ? -centsFromDecimal(movement.amount_text) : 0n), 0n);
  const currentValue = data.investments.filter((record) => record.investment_type === "financial" && record.status !== "cancelled").reduce((sum, record) => sum + centsFromDecimal(record.current_value_text ?? "0.00"), 0n);
  const lines: ReportLine[] = [...productive.map((record) => ({ id: record.id, date: record.investment_date, description: record.name, category: record.category_name, account: "Conta do pagamento", amount: record.initial_value_text, status: "Pago", kind: "Investimento produtivo" })), ...movements.map((movement) => ({ id: movement.id, date: movement.movement_date, description: movement.notes ?? (movement.movement_type.includes("withdrawal") ? "Resgate financeiro" : "Aporte financeiro"), category: "Aplicação financeira", account: movement.account_name ?? "Sem conta", amount: decimalFromCents((movement.movement_type === "withdrawal" || movement.movement_type === "reversal_contribution") ? -centsFromDecimal(movement.amount_text) : centsFromDecimal(movement.amount_text)), status: movement.movement_type.startsWith("reversal") ? "Estornado" : "Liquidado", kind: movement.movement_type }))].sort((a, b) => b.date.localeCompare(a.date));
  return { title: "Relatório de investimentos", subtitle: "Investimentos produtivos, aportes, resgates e valor de mercado informado em medidas separadas.", metrics: [metric("Total investido em produção", productiveTotal, "negative"), metric("Aportes no período", contributions, "negative"), metric("Resgates no período", withdrawals, "positive"), metric("Valor de mercado informado", currentValue)], lines, chart: null, notes: ["Valor aplicado, valor atual e fluxo de caixa não são somados como uma mesma medida.", "Investimentos produtivos aparecem separados das despesas operacionais."], exportSheets: { "Investimentos": lines.map((line) => ({ Data: line.date, Descrição: line.description, Categoria: line.category, Conta: line.account, Status: line.status, Valor: Number(centsFromDecimal(line.amount)) / 100 })) } };
}

function todayIso() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function summarizeReport(data: ReportData, filters: ReportFilters): ReportModel {
  const transactions = selectedTransactions(data, filters);
  const byId = new Map(data.transactions.map((transaction) => [transaction.id, transaction]));
  if (filters.kind === "cashflow") return cashflowModel(data, filters, transactions, byId);
  if (filters.kind === "income") return incomeExpenseModel(data, filters, transactions, byId, "income");
  if (filters.kind === "expense") return incomeExpenseModel(data, filters, transactions, byId, "expense");
  if (filters.kind === "operational") return operationalModel(data, filters, transactions, byId);
  if (filters.kind === "payables") return payablesReceivablesModel(data, filters, transactions, byId, "expense");
  if (filters.kind === "receivables") return payablesReceivablesModel(data, filters, transactions, byId, "income");
  return investmentsModel(data, filters);
}
