function snapshot(code?: string | null, description?: string | null) {
  return [code, description].filter(Boolean).join(" · ");
}

export function filterByDateRange<T extends Record<string, unknown>>(rows: T[], fromDate: string, toDate: string, dateKey = "payment_date") {
  return rows.filter((row) => {
    const value = String(row[dateKey] ?? "").slice(0, 10);
    return (!fromDate || value >= fromDate) && (!toDate || value <= toDate);
  });
}

export function mapRentReport(row: Record<string, unknown>) {
  return { id: String(row.id), date: String(row.payment_date), tenantName: String(row.tenant_name), unitSnapshot: snapshot(String(row.unit_code_snapshot ?? ""), row.unit_description_snapshot as string | null), rentPeriod: `${row.rent_month}/${row.rent_year}`, amount: Number(row.total_rent_settled), advanceAdjusted: Number(row.advance_adjusted) };
}

export function mapAdvanceReport(row: Record<string, unknown>) {
  return { id: String(row.id), date: String(row.payment_date), tenantName: String(row.tenant_name), unitSnapshot: snapshot(String(row.unit_code_snapshot ?? ""), row.unit_description_snapshot as string | null), amount: Number(row.amount) };
}

export function mapAllocationReport(row: Record<string, unknown>) {
  return { id: String(row.id), date: String(row.created_at ?? "").slice(0, 10), ownerName: String(row.owner_name ?? ""), sourceType: String(row.source_type), sourceId: String(row.source_id), ownershipPercentage: Number(row.ownership_percentage_snapshot), amount: Number(row.allocated_amount) };
}

export function buildMurshidaSummary(input: { activeUnits: number; activeTenants: number; rents: Record<string, unknown>[]; advances: Record<string, unknown>[]; expenses: Record<string, unknown>[]; allocations: Record<string, unknown>[] }) {
  const rentReceived = input.rents.reduce((sum, row) => sum + Number(row.total_rent_settled ?? 0), 0);
  const standaloneAdvanceReceived = input.advances.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const expenses = input.expenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const allocatedAmount = input.allocations.reduce((sum, row) => sum + Number(row.allocated_amount ?? 0), 0);
  return { activeUnits: input.activeUnits, activeTenants: input.activeTenants, rentReceived, standaloneAdvanceReceived, expenses, distributableAmount: rentReceived - expenses, allocatedAmount };
}

export function buildMonthlyOwnerIncomeReport(input: { rents: Record<string, unknown>[]; expenses: Record<string, unknown>[]; allocations: Record<string, unknown>[] }) {
  const months = new Map<string, { rentIncome: number; expenses: number; payments: number; owners: Map<string, { name: string; percentage: number; amount: number }> }>();
  const monthOf = (value: unknown) => String(value ?? "").slice(0, 7);
  const getMonth = (key: string) => months.get(key) ?? (() => { const value = { rentIncome: 0, expenses: 0, payments: 0, owners: new Map<string, { name: string; percentage: number; amount: number }>() }; months.set(key, value); return value; })();
  for (const rent of input.rents) { const month = getMonth(monthOf(rent.payment_date)); month.rentIncome += Number(rent.total_rent_settled ?? 0); month.payments += 1; }
  for (const expense of input.expenses) getMonth(monthOf(expense.expense_date)).expenses += Number(expense.amount ?? 0);
  for (const allocation of input.allocations) {
    const month = getMonth(monthOf(allocation.created_at));
    const ownerId = String(allocation.owner_id);
    const existing = month.owners.get(ownerId) ?? { name: String(allocation.owner_name ?? ""), percentage: Number(allocation.ownership_percentage_snapshot ?? 0), amount: 0 };
    existing.amount += Number(allocation.allocated_amount ?? 0);
    month.owners.set(ownerId, existing);
  }
  const monthly = Array.from(months.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, rentIncome: value.rentIncome, distributableIncome: value.rentIncome - value.expenses, payments: value.payments, owners: Array.from(value.owners.entries()).map(([ownerId, owner]) => ({ ownerId, ...owner })), ownerTotal: Array.from(value.owners.values()).reduce((sum, owner) => sum + owner.amount, 0) }));
  const ownerTotals = new Map<string, { ownerId: string; name: string; percentage: number; amount: number }>();
  for (const row of monthly) for (const owner of row.owners) { const current = ownerTotals.get(owner.ownerId) ?? { ownerId: owner.ownerId, name: owner.name, percentage: owner.percentage, amount: 0 }; current.amount += owner.amount; ownerTotals.set(owner.ownerId, current); }
  return { monthly, ownerTotals: Array.from(ownerTotals.values()), totalRentIncome: monthly.reduce((sum, row) => sum + row.rentIncome, 0), totalDistributableIncome: monthly.reduce((sum, row) => sum + row.distributableIncome, 0), totalAllocated: monthly.reduce((sum, row) => sum + row.ownerTotal, 0), paymentCount: monthly.reduce((sum, row) => sum + row.payments, 0) };
}

export function buildOwnerRentAccountReport(input: {
  owner: { id: string; name: string; phone_number?: string | null; is_active: boolean; ownership_percentage: number };
  allocations: Record<string, unknown>[];
  rents: Record<string, unknown>[];
  expenses?: Record<string, unknown>[];
  from?: string;
  to?: string;
}) {
  const rentsById = new Map(input.rents.map((rent) => [String(rent.id), rent]));
  const expensesById = new Map((input.expenses ?? []).map((expense) => [String(expense.id), expense]));
  const inRange = (date: string) => (!input.from || date >= input.from) && (!input.to || date <= input.to);
  const toTransaction = (allocation: Record<string, unknown>, applyRange = true) => {
    const rent = rentsById.get(String(allocation.source_id));
    if (!rent) return null;
    const date = String(rent.payment_date ?? "").slice(0, 10);
    if (!date || (applyRange && !inRange(date))) return null;
    return {
      id: String(rent.id),
      date,
      tenantName: String(rent.tenant_name ?? ""),
      unitSnapshot: [rent.unit_code_snapshot, rent.unit_description_snapshot].filter(Boolean).join(" · "),
      rentMonth: Number(rent.rent_month ?? 0),
      rentYear: Number(rent.rent_year ?? 0),
      eligibleRentIncome: Number(rent.total_rent_settled ?? 0),
      ownerPercentage: Number(allocation.ownership_percentage_snapshot ?? 0),
      ownerShare: Number(allocation.allocated_amount ?? 0),
    };
  };
  const rentAllocations = input.allocations.filter((allocation) => !allocation.source_type || allocation.source_type === "rent_income");
  const expenseAllocations = input.allocations.filter((allocation) => allocation.source_type === "expense");
  const uniqueAllocations = rentAllocations.filter((allocation, index, rows) => rows.findIndex((candidate) => String(candidate.source_id) === String(allocation.source_id)) === index);
  const allTransactions = uniqueAllocations.map((allocation) => toTransaction(allocation, false)).filter((row): row is NonNullable<ReturnType<typeof toTransaction>> => Boolean(row));
  const transactions = uniqueAllocations.map((allocation) => toTransaction(allocation)).filter((row): row is NonNullable<ReturnType<typeof toTransaction>> => Boolean(row));
  const toExpense = (allocation: Record<string, unknown>, applyRange = true) => {
    const expense = expensesById.get(String(allocation.source_id));
    if (!expense) return null;
    const date = String(expense.expense_date ?? "").slice(0, 10);
    if (!date || (applyRange && !inRange(date))) return null;
    return { id: String(expense.id), date, description: String(expense.description ?? ""), category: String(expense.category ?? ""), totalExpense: Number(expense.amount ?? 0), ownerPercentage: Number(allocation.ownership_percentage_snapshot ?? 0), ownerExpenseShare: Number(allocation.allocated_amount ?? 0) };
  };
  const allExpenses = expenseAllocations.map((allocation) => toExpense(allocation, false)).filter((row): row is NonNullable<ReturnType<typeof toExpense>> => Boolean(row));
  const selectedExpenses = expenseAllocations.map((allocation) => toExpense(allocation)).filter((row): row is NonNullable<ReturnType<typeof toExpense>> => Boolean(row));
  const months = new Map<string, { eligibleRentIncome: number; ownerShare: number; expenseShare: number; percentages: Set<number>; transactions: typeof transactions; expenses: typeof selectedExpenses }>();
  for (const transaction of transactions) {
    const key = transaction.date.slice(0, 7);
    const month = months.get(key) ?? { eligibleRentIncome: 0, ownerShare: 0, expenseShare: 0, percentages: new Set<number>(), transactions: [], expenses: [] };
    month.eligibleRentIncome += transaction.eligibleRentIncome;
    month.ownerShare += transaction.ownerShare;
    month.percentages.add(transaction.ownerPercentage);
    month.transactions.push(transaction);
    months.set(key, month);
  }
  for (const expense of selectedExpenses) {
    const key = expense.date.slice(0, 7);
    const month = months.get(key) ?? { eligibleRentIncome: 0, ownerShare: 0, expenseShare: 0, percentages: new Set<number>(), transactions: [], expenses: [] };
    month.expenseShare += expense.ownerExpenseShare;
    month.expenses.push(expense);
    months.set(key, month);
  }
  const monthly = Array.from(months.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, eligibleRentIncome: value.eligibleRentIncome, ownerShare: value.ownerShare, expenseShare: value.expenseShare, netBalance: value.ownerShare - value.expenseShare, ownerPercentage: value.percentages.size === 1 ? [...value.percentages][0] : null, transactions: value.transactions, expenses: value.expenses }));
  const selectedPeriodGrossRentShare = monthly.reduce((sum, row) => sum + row.ownerShare, 0);
  const selectedPeriodExpenseShare = monthly.reduce((sum, row) => sum + row.expenseShare, 0);
  const fromBeginningGrossRentShare = allTransactions.reduce((sum, row) => sum + row.ownerShare, 0);
  const fromBeginningExpenseShare = allExpenses.reduce((sum, row) => sum + row.ownerExpenseShare, 0);
  return {
    owner: input.owner,
    monthly,
    expenseDetails: selectedExpenses,
    selectedPeriodTotal: selectedPeriodGrossRentShare,
    fromBeginningTotal: fromBeginningGrossRentShare,
    selectedPeriodGrossRentShare,
    selectedPeriodExpenseShare,
    selectedPeriodNetBalance: selectedPeriodGrossRentShare - selectedPeriodExpenseShare,
    fromBeginningGrossRentShare,
    fromBeginningExpenseShare,
    fromBeginningNetBalance: fromBeginningGrossRentShare - fromBeginningExpenseShare,
  };
}
