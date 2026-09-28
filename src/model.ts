export type Transaction = {
  id: string;
  name: string;
  amount: number;
  category: string;
  date: string;
  billId?: string;
  billDueDate?: string;
};
export type Budget = {
  id: string;
  name?: string;
  category: string;
  limit: number;
  color: string;
};
export type Pot = {
  id: string;
  name: string;
  saved: number;
  target: number;
  color: string;
};
export type Bill = { id: string; name: string; amount: number; day: number };
export type State = {
  version: 1;
  demo: boolean;
  opening: number;
  payday: string;
  transactions: Transaction[];
  budgets: Budget[];
  pots: Pot[];
  bills: Bill[];
};
export const colors = ["#277c78", "#82c9d7", "#626070", "#f2cdac", "#826cb0"];
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const cents = (v: number) => Math.round(v * 100);
export const uid = () => crypto.randomUUID();
export function nextPayday() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function blank(): State {
  return {
    version: 1,
    demo: false,
    opening: 0,
    payday: nextPayday(),
    transactions: [],
    budgets: [],
    pots: [],
    bills: [],
  };
}
export function demo(): State {
  const d = today();
  return {
    version: 1,
    demo: true,
    opening: 285675,
    payday: nextPayday(),
    transactions: [
      {
        id: "t1",
        name: "Paycheck",
        amount: 240000,
        category: "Income",
        date: d,
      },
      {
        id: "t2",
        name: "Weekly groceries",
        amount: -8635,
        category: "Groceries",
        date: d,
      },
      {
        id: "t3",
        name: "Savory Bites Bistro",
        amount: -5550,
        category: "Dining Out",
        date: d,
      },
      {
        id: "t4",
        name: "Internet",
        amount: -10000,
        category: "Bills",
        date: d,
        billId: "b2",
      },
      {
        id: "t5",
        name: "Game night",
        amount: -1500,
        category: "Entertainment",
        date: d,
      },
      {
        id: "t6",
        name: "Coffee stop",
        amount: -690,
        category: "Dining Out",
        date: d,
      },
    ],
    budgets: [
      {
        id: "u1",
        name: "Groceries",
        category: "Groceries",
        limit: 40000,
        color: colors[0]!,
      },
      {
        id: "u2",
        name: "Dining Out",
        category: "Dining Out",
        limit: 15000,
        color: colors[1]!,
      },
      {
        id: "u3",
        name: "Entertainment",
        category: "Entertainment",
        limit: 10000,
        color: colors[2]!,
      },
    ],
    pots: [
      {
        id: "p1",
        name: "Rainy day",
        saved: 50000,
        target: 200000,
        color: colors[0]!,
      },
      {
        id: "p2",
        name: "Next adventure",
        saved: 25000,
        target: 150000,
        color: colors[2]!,
      },
      {
        id: "p3",
        name: "Gifts",
        saved: 10000,
        target: 30000,
        color: colors[1]!,
      },
    ],
    bills: [
      { id: "b1", name: "Rent", amount: 130000, day: 1 },
      { id: "b2", name: "Internet", amount: 10000, day: new Date().getDate() },
      { id: "b3", name: "Phone", amount: 5500, day: 12 },
    ],
  };
}
export const spent = (
  s: State,
  category: string,
  month = today().slice(0, 7),
) =>
  -s.transactions
    .filter(
      (t) =>
        t.amount < 0 && t.category === category && t.date.startsWith(month),
    )
    .reduce((n, t) => n + t.amount, 0);
export function dueDate(b: Bill, month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(Math.min(b.day, new Date(y!, m!, 0).getDate())).padStart(2, "0")}`;
}
export const paid = (s: State, b: Bill, month = today().slice(0, 7)) =>
  s.transactions.some((t) => t.billId === b.id && t.date.startsWith(month));

export function nextDueDate(b: Bill, fromDate = today()): string {
  const [y, m] = fromDate.split("-").map(Number);
  const daysInCurrentMonth = new Date(y!, m!, 0).getDate();
  const clampedDayCurrent = Math.min(
    Math.max(1, b.day || 1),
    daysInCurrentMonth,
  );
  const currentMonthDue = `${y}-${String(m).padStart(2, "0")}-${String(clampedDayCurrent).padStart(2, "0")}`;

  if (currentMonthDue >= fromDate) {
    return currentMonthDue;
  }

  const nextY = m === 12 ? y! + 1 : y!;
  const nextM = m === 12 ? 1 : m! + 1;
  const daysInNextMonth = new Date(nextY, nextM, 0).getDate();
  const clampedDayNext = Math.min(Math.max(1, b.day || 1), daysInNextMonth);
  return `${nextY}-${String(nextM).padStart(2, "0")}-${String(clampedDayNext).padStart(2, "0")}`;
}

export function isBillPaid(
  s: State,
  b: Bill,
  occurrenceDate = nextDueDate(b, today()),
): boolean {
  return s.transactions.some(
    (t) =>
      t.billId === b.id &&
      (t.billDueDate === occurrenceDate ||
        (!t.billDueDate && t.date.startsWith(occurrenceDate.slice(0, 7)))),
  );
}

export function reserveBills(s: State, now = today()): number {
  const end = s.payday >= now ? s.payday : now;
  let total = 0;
  for (const b of s.bills) {
    const next = nextDueDate(b, now);
    if (next >= now && next <= end && !isBillPaid(s, b, next)) {
      total += b.amount;
    }
  }
  return total;
}

export function totals(s: State, now = today()) {
  const balance = s.opening + s.transactions.reduce((n, t) => n + t.amount, 0);
  const pots = s.pots.reduce((n, p) => n + p.saved, 0);
  const budgets = s.budgets.reduce(
    (n, b) => n + Math.max(0, b.limit - spent(s, b.category, now.slice(0, 7))),
    0,
  );
  const bills = reserveBills(s, now);
  return {
    balance,
    pots,
    budgets,
    bills,
    safe: balance - pots - budgets - bills,
  };
}

export function resetWorkspace(current: State, keepPlan: boolean): State {
  const fresh = blank();
  if (keepPlan) {
    fresh.budgets = current.budgets.map((b) => ({ ...b }));
    fresh.bills = current.bills.map((b) => ({ ...b }));
  }
  return fresh;
}
