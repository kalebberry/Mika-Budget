<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { companionMessage, companionPortraits } from "./companion";
import {
  type State,
  type Bill,
  colors,
  today,
  demo,
  resetWorkspace,
  uid,
  cents,
  spent,
  totals,
  paid,
  isBillPaid,
  dueDate,
  nextDueDate,
} from "./model";
import {
  isWebGPUSupported,
  fetchInBrowserAdvice,
  AVAILABLE_WEB_MODELS,
  DEFAULT_WEB_MODEL,
  type WebLLMAdvice,
} from "./webllm";

const resetChoice = ref<"keep" | "all">("keep"),
  resetConfirmed = ref(false);
const key = "budget-companion-v1";
const companionKey = "budget-companion-mika-visible";
const webModelKey = "budget-companion-webllm-model";

let savedVisibility = true;
try {
  savedVisibility = localStorage.getItem(companionKey) !== "false";
} catch {}
const showCompanion = ref(savedVisibility);
watch(showCompanion, (visible) => {
  try {
    localStorage.setItem(companionKey, String(visible));
  } catch {
    toast("Your companion preference could not be saved in this browser.");
  }
});

const webGpuAvailable = ref(false);

let savedWebModel = DEFAULT_WEB_MODEL;
try {
  savedWebModel = localStorage.getItem(webModelKey) || DEFAULT_WEB_MODEL;
} catch {}
const selectedWebModel = ref(savedWebModel);
watch(selectedWebModel, (m) => {
  try {
    localStorage.setItem(webModelKey, m);
  } catch {}
});

const aiAdvice = ref<WebLLMAdvice | null>(null);
const isAiLoading = ref(false);
const aiProgressText = ref("");
const aiProgressPercent = ref(0);
const aiError = ref("");

async function askMika() {
  if (isAiLoading.value) return;
  isAiLoading.value = true;
  aiError.value = "";
  aiProgressPercent.value = 0;
  aiProgressText.value = "Preparing Mika...";

  try {
    const hasGpu = await isWebGPUSupported();
    if (!hasGpu) {
      webGpuAvailable.value = false;
      aiError.value =
        'WebGPU is unavailable. Check that "Graphics acceleration" is enabled in browser settings, or continue with Mika’s built-in guidance.';
      toast("WebGPU is not active in this browser.");
      return;
    }
    webGpuAvailable.value = true;
    aiProgressText.value = "Loading on-device model...";
    const advice = await fetchInBrowserAdvice(
      state.value,
      selectedWebModel.value,
      (progress, text) => {
        aiProgressPercent.value = Math.round(progress * 100);
        aiProgressText.value =
          text || `Loading on-device model (${Math.round(progress * 100)}%)...`;
      },
    );
    aiAdvice.value = advice;
    toast(`Mika: Advice generated on-device (${advice.modelUsed})!`);
  } catch (err: any) {
    console.error("Mika AI Error:", err);
    aiError.value =
      err?.message ||
      "Could not generate AI advice. Mika is using standard guidance.";
    toast("Could not generate AI advice. Using standard companion guidance.");
  } finally {
    isAiLoading.value = false;
    aiProgressPercent.value = 0;
    aiProgressText.value = "";
  }
}

function resetToStandardAdvice() {
  aiAdvice.value = null;
  aiError.value = "";
  toast("Returned to standard companion tip.");
}

let initial = demo();
let loadWarning = "";
try {
  const raw = localStorage.getItem(key);
  if (raw) {
    const p = JSON.parse(raw);
    if (
      p.version !== 1 ||
      !Array.isArray(p.transactions) ||
      !Array.isArray(p.pots) ||
      !Array.isArray(p.bills) ||
      !Array.isArray(p.budgets) ||
      !Number.isFinite(p.opening)
    )
      throw Error();
    initial = p;
  }
} catch {
  loadWarning =
    "Your saved data could not be loaded. Demo data is shown; the previous browser data has not been overwritten.";
}
const state = ref<State>(initial),
  storageBlocked = ref(!!loadWarning),
  notice = ref(loadWarning),
  page = ref("Overview"),
  collapsed = ref(false),
  search = ref(""),
  category = ref("All"),
  sort = ref("Latest"),
  dialog = ref<HTMLDialogElement>(),
  mode = ref(""),
  error = ref(""),
  selected = ref(""),
  focusBefore = ref<HTMLElement | null>(null);
const mika = computed(() => companionMessage(state.value));
const activeCompanion = computed(() => aiAdvice.value || mika.value);

function companionAction(targetDest?: string) {
  const destination = targetDest || activeCompanion.value.destination;
  if (destination === "Add transaction") open(destination);
  else page.value = destination;
}
const form = ref({
  name: "",
  amount: "",
  category: "Groceries",
  date: today(),
  type: "Expense",
  target: "",
  day: 1,
  color: colors[0]!,
  opening: "",
  payday: "",
});
const nav = [
  ["Overview", "⌂"],
  ["Transactions", "↕"],
  ["Budgets", "◔"],
  ["Pots", "▣"],
  ["Recurring Bills", "▤"],
  ["Settings", "⚙"],
];
const money = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    v / 100,
  );
const date = (v: string) =>
  new Date(v + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const formatNextDue = (v: string) => {
  const dt = new Date(v + "T12:00:00");
  const isDiffYear = dt.getFullYear() !== new Date().getFullYear();
  const formatted = dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(isDiffYear ? { year: "numeric" } : {}),
  });
  return `Next due ${formatted}`;
};
const sum = computed(() => totals(state.value)),
  month = computed(() => today().slice(0, 7)),
  monthly = computed(() =>
    state.value.transactions.filter((t) => t.date.startsWith(month.value)),
  );

const settingsBalance = ref(String(sum.value.balance / 100));
const settingsPayday = ref(state.value.payday);
const settingsSaved = ref(false);

watch(
  () => sum.value.balance,
  (newVal) => {
    if (page.value !== "Settings") {
      settingsBalance.value = String(newVal / 100);
    }
  },
);
watch(
  () => state.value.payday,
  (val) => {
    if (page.value !== "Settings") {
      settingsPayday.value = val;
    }
  },
);

function saveSettings() {
  const balance = cents(Number(settingsBalance.value));
  if (
    !Number.isFinite(balance) ||
    !settingsPayday.value ||
    settingsPayday.value < today() ||
    settingsPayday.value >
      String(Number(today().slice(0, 4)) + 1) + today().slice(4)
  ) {
    toast("Enter a valid balance and a payday within the next year.");
    return;
  }
  state.value.opening =
    balance - state.value.transactions.reduce((n, t) => n + t.amount, 0);
  state.value.payday = settingsPayday.value;
  settingsSaved.value = true;
  setTimeout(() => {
    settingsSaved.value = false;
  }, 3000);
  toast("Financial baseline saved.");
}

function importBackup(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target?.result as string);
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray(parsed.transactions) &&
        Array.isArray(parsed.budgets) &&
        Array.isArray(parsed.pots) &&
        Array.isArray(parsed.bills)
      ) {
        state.value = parsed;
        settingsBalance.value = String(totals(parsed).balance / 100);
        settingsPayday.value = parsed.payday || today();
        toast("Backup restored successfully.");
      } else {
        toast("File does not match budget backup format.");
      }
    } catch {
      toast("Failed to read or parse backup file.");
    }
  };
  reader.readAsText(file);
}
const income = computed(() =>
    monthly.value.filter((t) => t.amount > 0).reduce((n, t) => n + t.amount, 0),
  ),
  expenses = computed(
    () =>
      -monthly.value
        .filter((t) => t.amount < 0)
        .reduce((n, t) => n + t.amount, 0),
  );
const categories = computed(() =>
  Array.from(
    new Set([
      "Groceries",
      "Dining Out",
      "Entertainment",
      "Personal Care",
      "Transport",
      "General",
      "Bills",
      "Income",
      ...state.value.budgets.map((b) => b.category),
      ...state.value.transactions.map((t) => t.category),
    ]),
  ),
);
const list = computed(() =>
  state.value.transactions
    .filter(
      (t) =>
        t.name.toLowerCase().includes(search.value.toLowerCase()) &&
        (category.value === "All" || t.category === category.value),
    )
    .sort((a, b) =>
      sort.value === "Latest"
        ? b.date.localeCompare(a.date)
        : sort.value === "Oldest"
          ? a.date.localeCompare(b.date)
          : Math.abs(b.amount) - Math.abs(a.amount),
    ),
);
const latest = computed(() =>
  [...state.value.transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5),
);
const budgetTotal = computed(() =>
    state.value.budgets.reduce((n, b) => n + b.limit, 0),
  ),
  budgetSpent = computed(() =>
    state.value.budgets.reduce((n, b) => n + spent(state.value, b.category), 0),
  );
const ring = computed(() => {
  let p = 0;
  const total = budgetTotal.value || 1;
  return (
    "conic-gradient(" +
    state.value.budgets
      .map((b) => {
        const start = p;
        p += (b.limit / total) * 100;
        return `${b.color} ${start}% ${p}%`;
      })
      .concat(state.value.budgets.length ? [] : ["#eee 0% 100%"])
      .join(",") +
    ")"
  );
});
const days = computed(() =>
  Math.max(
    1,
    Math.ceil(
      (new Date(state.value.payday + "T12:00:00").getTime() -
        new Date(today() + "T12:00:00").getTime()) /
        86400000,
    ),
  ),
);
const pct = (a: number, b: number) =>
  Math.min(100, b ? Math.max(0, (a / b) * 100) : 0);
const categoryRecent = (c: string) =>
  [...monthly.value]
    .filter((t) => t.category === c && t.amount < 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
watch(
  state,
  () => {
    if (storageBlocked.value) return;
    try {
      localStorage.setItem(key, JSON.stringify(state.value));
    } catch {
      notice.value =
        "Changes could not be saved in this browser. Export a backup before closing.";
    }
  },
  { deep: true },
);
function toast(message: string) {
  notice.value = message;
  setTimeout(() => {
    if (notice.value === message) notice.value = "";
  }, 4500);
}
function open(m: string, id = "") {
  if (m === "Settings") {
    page.value = "Settings";
    return;
  }
  if (m === "Start fresh") {
    resetChoice.value = state.value.demo ? "all" : "keep";
    resetConfirmed.value = false;
  }
  mode.value = m;
  selected.value = id;
  error.value = "";
  focusBefore.value = document.activeElement as HTMLElement;
  form.value = {
    name: "",
    amount: "",
    category: "Groceries",
    date: today(),
    type: "Expense",
    target: "",
    day: 1,
    color: colors[state.value.pots.length % colors.length]!,
    opening: String(sum.value.balance / 100),
    payday: state.value.payday,
  };
  if (m === "Edit budget") {
    const b = state.value.budgets.find((b) => b.id === id)!;
    form.value = {
      ...form.value,
      name: b.name || b.category,
      category: b.category,
      amount: String(b.limit / 100),
      color: b.color,
    };
  }
  dialog.value?.showModal();
}
function close() {
  dialog.value?.close();
  focusBefore.value?.focus();
}
function submit() {
  error.value = "";
  const f = form.value;
  const amount = cents(Number(f.amount));
  const target = cents(Number(f.target));
  const name = f.name.trim();
  if (
    [
      "Add transaction",
      "Add budget",
      "Edit budget",
      "Add bill",
      "Add money",
      "Withdraw",
    ].includes(mode.value) &&
    (!Number.isFinite(amount) || amount <= 0 || amount > 10000000000)
  ) {
    error.value = "Enter an amount greater than zero.";
    return;
  }
  if (
    ["Add transaction", "Add pot", "Add bill"].includes(mode.value) &&
    !name
  ) {
    error.value = "Enter a name.";
    return;
  }
  if (mode.value === "Add transaction") {
    if (f.date > today()) {
      error.value = "Use today or an earlier date for a recorded transaction.";
      return;
    }
    state.value.transactions.unshift({
      id: uid(),
      name,
      amount: f.type === "Income" ? amount : -amount,
      category: f.type === "Income" ? "Income" : f.category,
      date: f.date,
    });
  } else if (mode.value === "Add budget" || mode.value === "Edit budget") {
    if (f.category === "Bills" || f.category === "Income") {
      error.value =
        "Use Recurring Bills for bill reserves. Choose a spending category.";
      return;
    }
    if (
      state.value.budgets.some(
        (b) => b.category === f.category && b.id !== selected.value,
      )
    ) {
      error.value = "This category already has a budget.";
      return;
    }
    const budgetName = name || f.category;
    if (mode.value === "Edit budget") {
      Object.assign(state.value.budgets.find((b) => b.id === selected.value)!, {
        name: budgetName,
        limit: amount,
        category: f.category,
        color: f.color,
      });
    } else
      state.value.budgets.push({
        id: uid(),
        name: budgetName,
        category: f.category,
        limit: amount,
        color: f.color,
      });
  } else if (mode.value === "Add pot") {
    if (!Number.isFinite(target) || target <= 0 || target > 10000000000) {
      error.value = "Enter a valid target greater than zero.";
      return;
    }
    state.value.pots.push({
      id: uid(),
      name,
      saved: 0,
      target,
      color: f.color,
    });
  } else if (mode.value === "Add money" || mode.value === "Withdraw") {
    const p = state.value.pots.find((p) => p.id === selected.value)!;
    if (mode.value === "Withdraw" && amount > p.saved) {
      error.value = "You cannot withdraw more than this pot contains.";
      return;
    }
    if (mode.value === "Add money" && amount > Math.max(0, sum.value.safe)) {
      error.value = "This amount exceeds your available safe-to-spend money.";
      return;
    }
    p.saved += mode.value === "Add money" ? amount : -amount;
  } else if (mode.value === "Add bill") {
    if (
      !Number.isInteger(Number(f.day)) ||
      Number(f.day) < 1 ||
      Number(f.day) > 31
    ) {
      error.value = "Choose a day from 1 to 31.";
      return;
    }
    state.value.bills.push({ id: uid(), name, amount, day: Number(f.day) });
  } else if (mode.value === "Start fresh") {
    if (!resetConfirmed.value) {
      error.value = "Confirm that you understand what will be cleared.";
      return;
    }
    storageBlocked.value = false;
    state.value = resetWorkspace(state.value, resetChoice.value === "keep");
    page.value = "Overview";
    search.value = "";
    category.value = "All";
    sort.value = "Latest";
  } else if (mode.value === "Delete transaction") {
    state.value.transactions = state.value.transactions.filter(
      (t) => t.id !== selected.value,
    );
  } else if (mode.value === "Delete budget") {
    state.value.budgets = state.value.budgets.filter(
      (b) => b.id !== selected.value,
    );
  } else if (mode.value === "Delete pot") {
    state.value.pots = state.value.pots.filter((p) => p.id !== selected.value);
  } else if (mode.value === "Delete bill") {
    state.value.bills = state.value.bills.filter(
      (b) => b.id !== selected.value,
    );
  } else if (mode.value === "Pay bill") {
    const b = state.value.bills.find((b) => b.id === selected.value)!;
    const due = nextDueDate(b);
    if (!isBillPaid(state.value, b, due))
      state.value.transactions.unshift({
        id: uid(),
        name: b.name,
        amount: -b.amount,
        category: "Bills",
        date: today(),
        billId: b.id,
        billDueDate: due,
      });
  }
  close();
  toast(
    mode.value === "Start fresh"
      ? "Ready for your numbers. Set your balance to begin."
      : mode.value === "Add transaction" && showCompanion.value
        ? "Mika: Logged. One less thing to remember."
        : "Saved. You’re up to date.",
  );
}
function backup() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(state.value, null, 2)], {
      type: "application/json",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `budget-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Backup downloaded.");
}
function billStatus(b: Bill) {
  const next = nextDueDate(b);
  return isBillPaid(state.value, b, next)
    ? "Paid"
    : next === today()
      ? "Due today"
      : "Upcoming";
}
onMounted(() => {
  isWebGPUSupported()
    .then((val) => {
      webGpuAvailable.value = val;
    })
    .catch(() => {
      webGpuAvailable.value = false;
    });
  const context = (document as any).modelContext;
  if (context?.registerTool) {
    try {
      Promise.resolve(
        context.registerTool({
          name: "get_budget_summary",
          description:
            "Read the current balance, reserves and safe-to-spend in integer US cents.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: () => ({
            ...sum.value,
            demo: state.value.demo,
            payday: state.value.payday,
          }),
        }),
      ).catch(() => {});
    } catch {}
  }
});
</script>
<template>
  <div class="app" :class="{ collapsed }">
    <aside class="sidebar">
      <a class="brand" href="#" @click.prevent="page = 'Overview'"
        ><span class="brand-mark">b.</span
        ><span class="brand-name"
          >budget<span class="brand-dot">.</span></span
        ></a
      >
      <nav aria-label="Main navigation">
        <button
          v-for="[label, icon] in nav"
          :key="label"
          :class="{ active: page === label }"
          @click="page = label!"
          :aria-current="page === label ? 'page' : undefined"
          :title="label"
        >
          <span class="nav-icon">{{ icon }}</span
          ><span class="nav-label">{{ label }}</span>
        </button>
      </nav>
      <div class="sidebar-bottom">
        <div class="local-note" v-if="!collapsed">
          <span class="small-icon">✓</span> A little clarity, every day.
        </div>
        <button
          @click="collapsed = !collapsed"
          :aria-label="collapsed ? 'Expand menu' : 'Minimize menu'"
        >
          <span class="nav-icon">{{ collapsed ? "›" : "‹" }}</span
          ><span class="nav-label">Minimize menu</span>
        </button>
      </div>
    </aside>
    <main>
      <header class="page-header">
        <div>
          <div class="eyebrow">
            {{
              page === "Settings"
                ? "MANAGE YOUR WORKSPACE"
                : "YOUR MONEY, AT A GLANCE"
            }}
          </div>
          <h1>{{ page }}</h1>
        </div>
        <div class="header-actions">
          <button
            class="icon-button"
            :class="{ active: page === 'Settings' }"
            @click="page = 'Settings'"
            aria-label="Account settings"
            title="Settings"
          >
            ⚙</button
          ><button
            v-if="page !== 'Settings'"
            class="primary"
            @click="
              open(
                page === 'Budgets'
                  ? 'Add budget'
                  : page === 'Pots'
                    ? 'Add pot'
                    : page === 'Recurring Bills'
                      ? 'Add bill'
                      : 'Add transaction',
              )
            "
          >
            ＋
            <span>{{
              page === "Budgets"
                ? "Add budget"
                : page === "Pots"
                  ? "Add pot"
                  : page === "Recurring Bills"
                    ? "Add bill"
                    : "Add transaction"
            }}</span>
          </button>
        </div>
      </header>
      <div v-if="state.demo" class="demo-banner">
        <span
          ><strong>Make yourself at home.</strong> You’re exploring demo
          data.</span
        ><button @click="open('Start fresh')">
          Use my own numbers <span>→</span>
        </button>
      </div>
      <template v-if="page === 'Overview'">
        <section
          v-if="showCompanion"
          class="companion-card"
          aria-labelledby="mika-title"
        >
          <div class="companion-portrait">
            <img
              :src="companionPortraits[activeCompanion.expression]"
              :alt="
                'Mika, your budgeting companion — ' + activeCompanion.expression
              "
              width="1254"
              height="1254"
            />
          </div>
          <div class="companion-copy">
            <div class="companion-header-meta">
              <span class="companion-name">MIKA · YOUR BUDGET COMPANION</span
              ><span v-if="aiAdvice" class="ai-pill active"
                >✦ On-Device AI ({{ aiAdvice.modelUsed }})</span
              ><span
                v-else-if="webGpuAvailable"
                class="ai-pill ready"
                title="WebGPU active — 100% private in-browser AI"
                >● On-Device AI ready</span
              ><span
                v-else
                class="ai-pill offline"
                title="WebGPU not available in this browser"
                >● Built-in Guidance</span
              >
            </div>
            <h2 id="mika-title">{{ activeCompanion.title }}</h2>
            <p v-if="!isAiLoading">{{ activeCompanion.text }}</p>
            <div v-else class="ai-thinking">
              <div class="ai-thinking-row">
                <span class="ai-spinner"></span
                ><em>{{
                  aiProgressText ||
                  "Mika is analyzing your finances on-device (100% private)..."
                }}</em>
              </div>
              <div v-if="aiProgressPercent > 0" class="ai-progress-track">
                <div
                  class="ai-progress-bar"
                  :style="{ width: aiProgressPercent + '%' }"
                ></div>
              </div>
            </div>
            <div class="companion-actions-bar">
              <button
                class="text-link companion-action"
                @click="companionAction(activeCompanion.destination)"
                :disabled="isAiLoading"
              >
                {{ activeCompanion.action }} <span aria-hidden="true">›</span>
              </button>
              <div class="companion-ai-controls">
                <button
                  class="ai-sparkle-btn"
                  @click="askMika"
                  :disabled="isAiLoading"
                  title="Get smart suggestions from private on-device AI"
                >
                  <span class="sparkle-icon">✨</span
                  ><span>{{
                    isAiLoading
                      ? aiProgressPercent > 0
                        ? `Loading ${aiProgressPercent}%`
                        : "Thinking..."
                      : aiAdvice
                        ? "Ask Mika Again"
                        : "✨ Ask Mika"
                  }}</span></button
                ><button
                  v-if="aiAdvice"
                  class="ai-reset-btn"
                  @click="resetToStandardAdvice"
                  title="Show standard rule-based tip"
                >
                  Standard tip
                </button>
              </div>
            </div>
            <div v-if="aiError" class="ai-error-banner">
              <span>{{ aiError }}</span
              ><button
                type="button"
                class="text-link"
                @click="page = 'Settings'"
              >
                AI Settings ↗
              </button>
            </div>
          </div>
          <button
            class="companion-hide"
            @click="showCompanion = false"
            aria-label="Hide Mika companion"
            title="Hide Mika · show again in Settings"
          >
            ×
          </button>
        </section>
        <section class="safe-card">
          <div class="safe-main">
            <div class="safe-label">
              <span class="spark">✦</span> Safe to spend
            </div>
            <div class="safe-number" :class="{ negative: sum.safe < 0 }">
              {{ money(sum.safe) }}
            </div>
            <p v-if="state.payday < today()">
              Your payday has passed. Update it to refresh your spending plan.
            </p>
            <p v-else-if="sum.safe >= 0">
              About
              <strong>{{ money(Math.floor(sum.safe / days)) }} a day</strong>
              until your next payday.
            </p>
            <p v-else>
              Your current reserves exceed your balance. Adjust your plan before
              spending.
            </p>
            <button class="text-link light" @click="page = 'Settings'">
              Next payday: {{ date(state.payday) }} <span>↗</span>
            </button>
          </div>
          <div class="safe-breakdown">
            <div>
              <span>Current balance</span
              ><strong>{{ money(sum.balance) }}</strong>
            </div>
            <div>
              <span>Saved in pots</span><span>− {{ money(sum.pots) }}</span>
            </div>
            <div>
              <span>Remaining monthly budgets</span
              ><span>− {{ money(sum.budgets) }}</span>
            </div>
            <div>
              <span>Bills reserved through payday</span
              ><span>− {{ money(sum.bills) }}</span>
            </div>
            <div class="safe-total">
              <span>Yours to work with</span
              ><strong>{{ money(sum.safe) }}</strong>
            </div>
          </div>
        </section>
        <div class="stat-grid">
          <article class="stat dark">
            <span>Current balance</span><strong>{{ money(sum.balance) }}</strong
            ><button @click="page = 'Settings'">Update balance ↗</button>
          </article>
          <article class="stat">
            <span>Income <small>this month</small></span
            ><strong>{{ money(income) }}</strong
            ><span class="stat-caption">Money coming in</span>
          </article>
          <article class="stat">
            <span>Expenses <small>this month</small></span
            ><strong>{{ money(expenses) }}</strong
            ><span class="stat-caption">Money going out</span>
          </article>
        </div>
        <div class="overview-grid">
          <div class="column">
            <section class="card">
              <div class="section-heading">
                <h2>Pots</h2>
                <button class="text-link" @click="page = 'Pots'">
                  See details <span>›</span>
                </button>
              </div>
              <div class="pots-summary">
                <div class="saved-total">
                  <span class="pot-symbol">▣</span>
                  <div>
                    <span>Total saved</span
                    ><strong>{{ money(sum.pots) }}</strong>
                  </div>
                </div>
                <div class="mini-pots">
                  <div
                    v-for="p in state.pots.slice(0, 4)"
                    :key="p.id"
                    class="legend-item"
                    :style="{ '--accent': p.color }"
                  >
                    <span>{{ p.name }}</span
                    ><strong>{{ money(p.saved) }}</strong>
                  </div>
                  <p v-if="!state.pots.length" class="muted">
                    Give your next goal a home.
                  </p>
                </div>
              </div>
            </section>
            <section class="card">
              <div class="section-heading">
                <h2>Transactions</h2>
                <button class="text-link" @click="page = 'Transactions'">
                  View all <span>›</span>
                </button>
              </div>
              <div v-for="t in latest" :key="t.id" class="transaction-row">
                <span
                  class="avatar"
                  :style="{
                    background:
                      colors[categories.indexOf(t.category) % colors.length],
                  }"
                  >{{ t.name.slice(0, 1).toUpperCase() }}</span
                ><strong class="transaction-name">{{ t.name }}</strong>
                <div class="transaction-amount">
                  <strong :class="{ positive: t.amount > 0 }"
                    >{{ t.amount > 0 ? "+" : "" }}{{ money(t.amount) }}</strong
                  ><span>{{ date(t.date) }}</span>
                </div>
              </div>
              <div class="empty" v-if="!latest.length">
                <h3>Your fresh start.</h3>
                <p>Add your first transaction when you’re ready.</p>
                <button class="secondary" @click="open('Add transaction')">
                  Add transaction
                </button>
              </div>
            </section>
          </div>
          <div class="column">
            <section class="card">
              <div class="section-heading">
                <h2>Budgets</h2>
                <button class="text-link" @click="page = 'Budgets'">
                  See details <span>›</span>
                </button>
              </div>
              <div class="budget-overview">
                <div class="donut" :style="{ background: ring }">
                  <div>
                    <strong>{{ money(budgetSpent) }}</strong
                    ><span>of {{ money(budgetTotal) }} limit</span>
                  </div>
                </div>
                <div class="budget-legend">
                  <div
                    v-for="b in state.budgets"
                    :key="b.id"
                    class="legend-item"
                    :style="{ '--accent': b.color }"
                  >
                    <span>{{ b.name || b.category }}</span
                    ><strong>{{ money(b.limit) }}</strong>
                  </div>
                </div>
              </div>
              <p v-if="!state.budgets.length" class="muted">
                Choose a few categories to give your spending structure.
              </p>
            </section>
            <section class="card">
              <div class="section-heading">
                <h2>Recurring Bills</h2>
                <button class="text-link" @click="page = 'Recurring Bills'">
                  See details <span>›</span>
                </button>
              </div>
              <div class="bill-summary">
                <span>Paid this month</span
                ><strong>{{
                  money(
                    state.bills
                      .filter((b) => paid(state, b))
                      .reduce((n, b) => n + b.amount, 0),
                  )
                }}</strong>
              </div>
              <div class="bill-summary peach">
                <span>Unpaid this month</span
                ><strong>{{
                  money(
                    state.bills
                      .filter((b) => !paid(state, b))
                      .reduce((n, b) => n + b.amount, 0),
                  )
                }}</strong>
              </div>
              <div class="bill-summary blue">
                <span>Reserved through payday</span
                ><strong>{{ money(sum.bills) }}</strong>
              </div>
            </section>
          </div>
        </div>
      </template>
      <template v-if="page === 'Transactions'"
        ><section class="card">
          <div class="filters">
            <label class="search"
              ><span class="sr-only">Search transactions</span
              ><input v-model="search" placeholder="Search transactions" /><span
                >⌕</span
              ></label
            ><label
              >Sort by
              <select v-model="sort">
                <option>Latest</option>
                <option>Oldest</option>
                <option>Largest amount</option>
              </select></label
            ><label
              >Category
              <select v-model="category">
                <option>All</option>
                <option v-for="c in categories">{{ c }}</option>
              </select></label
            >
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Recipient / Sender</th>
                  <th>Category</th>
                  <th>Transaction date</th>
                  <th class="align-right">Amount</th>
                  <th><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in list" :key="t.id">
                  <td>
                    <div class="person">
                      <span
                        class="avatar"
                        :style="{
                          background:
                            colors[
                              categories.indexOf(t.category) % colors.length
                            ],
                        }"
                        >{{ t.name.slice(0, 1).toUpperCase() }}</span
                      ><strong>{{ t.name }}</strong>
                    </div>
                  </td>
                  <td>{{ t.category }}</td>
                  <td>{{ date(t.date) }}</td>
                  <td
                    class="align-right amount"
                    :class="{ positive: t.amount > 0 }"
                  >
                    {{ t.amount > 0 ? "+" : "" }}{{ money(t.amount) }}
                  </td>
                  <td>
                    <button
                      class="delete-icon"
                      @click="open('Delete transaction', t.id)"
                      :aria-label="'Delete ' + t.name"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="empty" v-if="!list.length">
            <h3>No transactions here yet.</h3>
            <p>
              {{
                state.transactions.length
                  ? "Try a different search or category."
                  : "Your next small step: record one expense."
              }}
            </p>
          </div>
          <div class="table-footer">
            {{ list.length }} transaction{{ list.length === 1 ? "" : "s" }}
          </div>
        </section></template
      >
      <template v-if="page === 'Budgets'"
        ><div class="budgets-layout">
          <section class="card budget-summary">
            <div class="donut large" :style="{ background: ring }">
              <div>
                <strong>{{ money(budgetSpent) }}</strong
                ><span>of {{ money(budgetTotal) }} limit</span>
              </div>
            </div>
            <h2>Spending summary</h2>
            <div
              v-for="b in state.budgets"
              class="summary-line"
              :style="{ '--accent': b.color }"
            >
              <span>{{ b.name || b.category }}</span
              ><span
                ><strong>{{ money(spent(state, b.category)) }}</strong>
                <small>of {{ money(b.limit) }}</small></span
              >
            </div>
            <p class="muted help">
              Budgets reset each calendar month. Unspent amounts are reserved in
              safe-to-spend.
            </p>
          </section>
          <div class="column">
            <section v-for="b in state.budgets" :key="b.id" class="card">
              <div class="section-heading">
                <h2>
                  <i class="color-dot" :style="{ background: b.color }"></i
                  >{{ b.name || b.category }}
                </h2>
                <div>
                  <button class="text-link" @click="open('Edit budget', b.id)">
                    Edit</button
                  ><button
                    class="delete-icon"
                    @click="open('Delete budget', b.id)"
                    :aria-label="'Delete ' + (b.name || b.category) + ' budget'"
                  >
                    ×
                  </button>
                </div>
              </div>
              <p class="muted">
                <template v-if="b.name && b.name !== b.category">
                  {{ b.category }} ·
                </template>
                Maximum of {{ money(b.limit) }}
              </p>
              <div
                class="progress"
                role="progressbar"
                :aria-label="(b.name || b.category) + ' spending'"
                :aria-valuenow="
                  Math.round(pct(spent(state, b.category), b.limit))
                "
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <span
                  :style="{
                    width: pct(spent(state, b.category), b.limit) + '%',
                    background: b.color,
                  }"
                ></span>
              </div>
              <div class="split-stats">
                <div class="legend-item" :style="{ '--accent': b.color }">
                  <span>Spent</span
                  ><strong>{{ money(spent(state, b.category)) }}</strong>
                </div>
                <div class="legend-item">
                  <span>{{
                    spent(state, b.category) > b.limit
                      ? "Over budget"
                      : "Remaining"
                  }}</span
                  ><strong
                    :class="{ negative: spent(state, b.category) > b.limit }"
                    >{{
                      money(Math.abs(b.limit - spent(state, b.category)))
                    }}</strong
                  >
                </div>
              </div>
              <div class="latest-spending">
                <div class="section-heading">
                  <h3>Latest spending</h3>
                  <button
                    class="text-link"
                    @click="
                      category = b.category;
                      page = 'Transactions';
                    "
                  >
                    See all ›
                  </button>
                </div>
                <div
                  v-for="t in categoryRecent(b.category)"
                  class="small-transaction"
                >
                  <span>{{ t.name }}</span
                  ><strong>{{ money(t.amount) }}</strong>
                </div>
                <p v-if="!categoryRecent(b.category).length" class="muted">
                  A clean slate this month.
                </p>
              </div>
            </section>
            <div v-if="!state.budgets.length" class="card empty">
              <h3>A little structure goes a long way.</h3>
              <p>Start with groceries or dining out.</p>
              <button class="primary" @click="open('Add budget')">
                Add your first budget
              </button>
            </div>
          </div>
        </div></template
      >
      <template v-if="page === 'Pots'"
        ><p class="page-intro">
          Set money aside for what matters. Moving money into a pot reserves it
          without changing your account balance.
        </p>
        <div class="pot-grid">
          <section v-for="p in state.pots" :key="p.id" class="card pot-card">
            <div class="section-heading">
              <h2>
                <i class="color-dot" :style="{ background: p.color }"></i
                >{{ p.name }}
              </h2>
              <button
                class="delete-icon"
                @click="open('Delete pot', p.id)"
                :aria-label="'Delete ' + p.name + ' pot'"
              >
                ×
              </button>
            </div>
            <div class="pot-amount">
              <span>Total saved</span><strong>{{ money(p.saved) }}</strong>
            </div>
            <div
              class="progress slim"
              role="progressbar"
              :aria-label="p.name + ' progress'"
              :aria-valuenow="Math.round(pct(p.saved, p.target))"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <span
                :style="{
                  width: pct(p.saved, p.target) + '%',
                  background: p.color,
                }"
              ></span>
            </div>
            <div class="progress-label">
              <strong>{{ ((p.saved / p.target) * 100).toFixed(1) }}%</strong
              ><span>Target of {{ money(p.target) }}</span>
            </div>
            <div class="pot-actions">
              <button class="secondary" @click="open('Add money', p.id)">
                ＋ Add money</button
              ><button
                class="secondary"
                @click="open('Withdraw', p.id)"
                :disabled="!p.saved"
              >
                Withdraw
              </button>
            </div>
          </section>
          <section v-if="!state.pots.length" class="card empty">
            <h3>Something to look forward to.</h3>
            <p>A trip, a rainy day, or your next big idea.</p>
            <button class="primary" @click="open('Add pot')">
              Create your first pot
            </button>
          </section>
        </div></template
      >
      <template v-if="page === 'Recurring Bills'"
        ><p class="page-intro">
          Monthly bills are reserved through your next payday, including
          anything still unpaid this month. Mark a bill paid once to record its
          expense.
        </p>
        <div class="bills-layout">
          <section class="stat dark bill-total">
            <span>Monthly commitments</span
            ><strong>{{
              money(state.bills.reduce((n, b) => n + b.amount, 0))
            }}</strong
            ><span>{{ state.bills.length }} recurring bills</span>
          </section>
          <section class="card">
            <div v-for="b in state.bills" :key="b.id" class="bill-row">
              <div>
                <h3>{{ b.name }}</h3>
                <span class="muted">{{ formatNextDue(nextDueDate(b)) }}</span>
              </div>
              <span class="badge" :class="billStatus(b).toLowerCase().replace(/\s+/g, '-')">{{
                billStatus(b)
              }}</span
              ><strong>{{ money(b.amount) }}</strong
              ><button
                class="secondary"
                @click="open('Pay bill', b.id)"
                :disabled="isBillPaid(state, b)"
              >
                {{ isBillPaid(state, b) ? "Paid ✓" : "Mark paid" }}</button
              ><button
                class="delete-icon"
                @click="open('Delete bill', b.id)"
                :aria-label="'Delete ' + b.name"
              >
                ×
              </button>
            </div>
            <div v-if="!state.bills.length" class="empty">
              <h3>Make room for the essentials.</h3>
              <p>Add rent, utilities, and subscriptions here.</p>
              <button class="primary" @click="open('Add bill')">
                Add a recurring bill
              </button>
            </div>
          </section>
        </div></template
      >
      <template v-if="page === 'Settings'">
        <div class="settings-layout">
          <div class="settings-col">
            <section class="card settings-card">
              <div class="section-heading">
                <h2>
                  <span class="settings-heading-icon">💰</span> Financial
                  Baseline
                </h2>
              </div>
              <p class="muted settings-desc">
                Update your starting balance and regular payday schedule so your
                Safe-to-Spend calculations remain accurate.
              </p>
              <form @submit.prevent="saveSettings" class="settings-form">
                <label
                  ><span>Current account balance ($)</span
                  ><input
                    v-model="settingsBalance"
                    type="number"
                    step="0.01"
                    required
                    inputmode="decimal"
                    placeholder="0.00"
                  /><small
                    >Total cash available, including any money designated for
                    savings pots.</small
                  ></label
                >
                <label
                  ><span>Next payday</span
                  ><input
                    v-model="settingsPayday"
                    type="date"
                    :min="today()"
                    required
                  /><small
                    >Used to calculate daily safe-to-spend allowance until your
                    next income.</small
                  ></label
                >
                <div class="formula-note">
                  <strong>Formula:</strong> Safe to spend = balance − pots −
                  remaining monthly budgets − unpaid bills through payday.
                </div>
                <div class="settings-action-row">
                  <button class="primary" type="submit">Save baseline</button
                  ><span v-if="settingsSaved" class="saved-badge"
                    >✓ Changes saved</span
                  >
                </div>
              </form>
            </section>
            <section class="card settings-card">
              <div class="section-heading">
                <h2>
                  <span class="settings-heading-icon">💾</span> Data Storage &
                  Privacy
                </h2>
              </div>
              <p class="muted settings-desc">
                Your financial details are stored 100% locally in your browser
                storage. Zero tracking and no external servers.
              </p>
              <div class="settings-data-actions">
                <div class="data-action-item">
                  <div>
                    <strong>Export Backup</strong>
                    <p class="muted">
                      Download a complete JSON file of all your transactions,
                      budgets, pots, and bills.
                    </p>
                  </div>
                  <button type="button" class="secondary" @click="backup">
                    Download backup ↓
                  </button>
                </div>
                <div class="data-action-item">
                  <div>
                    <strong>Import Backup</strong>
                    <p class="muted">
                      Restore your budget data from an exported JSON file.
                    </p>
                  </div>
                  <label class="secondary file-upload-btn"
                    ><span>Choose file ↑</span
                    ><input
                      type="file"
                      accept=".json"
                      @change="importBackup"
                      class="sr-only"
                  /></label>
                </div>
              </div>
              <div class="reset-settings">
                <div>
                  <h3>Need a fresh start?</h3>
                  <p class="muted">
                    Restart anytime. You can keep your budgets and recurring
                    bills or clear everything.
                  </p>
                </div>
                <button
                  class="secondary"
                  type="button"
                  @click="open('Start fresh')"
                >
                  Start fresh ›
                </button>
              </div>
            </section>
          </div>
          <div class="settings-col">
            <section class="card settings-card">
              <div class="section-heading">
                <h2>
                  <span class="settings-heading-icon">✨</span> Budget Companion
                </h2>
                <span class="companion-tag">Mika</span>
              </div>
              <div class="companion-settings-banner">
                <div class="companion-preview-avatar">
                  <img
                    :src="companionPortraits.welcome"
                    alt="Mika avatar"
                    width="56"
                    height="56"
                  />
                </div>
                <div class="companion-preview-info">
                  <strong>Mika</strong>
                  <p class="muted">
                    Your mindful financial companion who offers encouraging tips
                    and payday reminders.
                  </p>
                </div>
              </div>
              <div class="toggle-card">
                <label
                  ><input type="checkbox" v-model="showCompanion" />
                  <div>
                    <strong>Show Mika on Overview</strong
                    ><small
                      >Display gentle spending prompts, goal milestones, and
                      on-device AI advice.</small
                    >
                  </div></label
                >
              </div>
            </section>
            <section class="card settings-card">
              <div class="section-heading">
                <h2>
                  <span class="settings-heading-icon">⚡</span> On-Device AI
                  (WebGPU)
                </h2>
                <span
                  class="ai-status-tag"
                  :class="{ online: webGpuAvailable }"
                  >{{
                    webGpuAvailable ? "● WebGPU Active" : "○ WebGPU Inactive"
                  }}</span
                >
              </div>
              <p class="muted settings-desc">
                Mika can use private in-browser neural models to analyze your
                budget. 100% free, runs entirely on your device GPU, with zero
                token costs and zero telemetry.
              </p>
              <div class="ai-settings-form">
                <label
                  ><span>On-Device Model</span
                  ><select v-model="selectedWebModel">
                    <option
                      v-for="m in AVAILABLE_WEB_MODELS"
                      :key="m.id"
                      :value="m.id"
                    >
                      {{ m.name }} — {{ m.sizeDesc }}
                    </option>
                  </select></label
                >
                <div v-if="webGpuAvailable" class="formula-note success-note">
                  ✓ <strong>Hardware acceleration active!</strong> The model
                  downloads once directly into browser cache on your first "Ask
                  Mika" click and executes locally via WebGPU.
                </div>
                <div v-else class="formula-note warning">
                  ⚠ <strong>Hardware acceleration not active.</strong> Ensure
                  "Use graphics acceleration when available" is turned on in
                  browser settings (Chrome/Edge/Brave). In the meantime, Mika
                  uses smart built-in rule guidance.
                </div>
                <div class="ai-features-list">
                  <div class="feature-item">
                    <span class="check-icon">✓</span
                    ><span
                      ><strong>100% Private:</strong> Financial amounts and
                      transaction history never leave your computer</span
                    >
                  </div>
                  <div class="feature-item">
                    <span class="check-icon">✓</span
                    ><span
                      ><strong>Zero Subscription Costs:</strong> No API keys or
                      token fees required</span
                    >
                  </div>
                  <div class="feature-item">
                    <span class="check-icon">✓</span
                    ><span
                      ><strong>Offline Capable:</strong> Once downloaded, models
                      run without needing an internet connection</span
                    >
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </template>
      <footer>
        <span
          >Stored in this browser ·
          {{ state.demo ? "Demo workspace" : "Personal workspace" }}</span
        ><button class="text-link" @click="backup">Export backup ↓</button>
      </footer>
    </main>
    <dialog
      aria-labelledby="dialog-title"
      ref="dialog"
      @click="
        (e) => {
          if (e.target === dialog) close();
        }
      "
      @cancel="close"
    >
      <form @submit.prevent="submit">
        <div class="section-heading">
          <h2 id="dialog-title">{{ mode }}</h2>
          <button
            type="button"
            class="close"
            @click="close"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <template v-if="mode === 'Start fresh'"
          ><p class="muted">
            A fresh start is always here when you need it. Choose what to keep.
          </p>
          <fieldset class="reset-options">
            <legend>Reset options</legend>
            <label class="reset-option"
              ><input type="radio" v-model="resetChoice" value="keep" /><span
                ><strong>Keep my budgets and bills</strong
                ><small
                  >Keep category limits and recurring bill details. Clear
                  transactions, pots, balance, and payday.</small
                ></span
              ></label
            ><label class="reset-option"
              ><input type="radio" v-model="resetChoice" value="all" /><span
                ><strong>Clear everything</strong
                ><small
                  >Remove all entries and plans, including any demo data.</small
                ></span
              ></label
            >
          </fieldset>
          <p class="formula-note">
            Your balance will reset to $0 and your payday to two weeks from
            today. Set both again in Settings. Kept bills will be marked unpaid;
            review this month’s payments before relying on safe-to-spend.
          </p>
          <button class="secondary" type="button" @click="backup">
            Download a backup first</button
          ><label class="reset-confirm"
            ><input type="checkbox" v-model="resetConfirmed" /><span
              >I understand this reset cannot be undone in the app.</span
            ></label
          ><button
            type="button"
            class="text-link"
            @click="
              close();
              page = 'Settings';
            "
          >
            Cancel and return to Settings
          </button></template
        >
        <p v-if="mode.startsWith('Delete')" class="muted">
          Remove this {{ mode.replace("Delete ", "") }}?
          {{
            mode === "Delete pot"
              ? "Money reserved in this pot will become available again."
              : mode === "Delete transaction"
                ? "Your balance and budget totals will update."
                : "Existing transactions will be kept."
          }}
        </p>
        <p v-if="mode === 'Pay bill'" class="muted">
          This records one expense today and marks this bill paid. Only
          continue if you have actually paid it.
        </p>
        <p v-if="mode === 'Add money' || mode === 'Withdraw'" class="muted">
          {{
            mode === "Add money"
              ? "Reserve money for this goal."
              : "Release money back into your spending plan."
          }}
          Your total account balance stays the same.
        </p>
        <label v-if="['Add transaction', 'Add pot', 'Add bill', 'Add budget', 'Edit budget'].includes(mode)"
          >Name<input
            v-model="form.name"
            :required="!['Add budget', 'Edit budget'].includes(mode)"
            maxlength="80"
            :placeholder="mode.includes('budget') ? 'e.g. Work Lunches or Groceries' : 'e.g. Weekly groceries'"
        /></label>
        <label v-if="mode === 'Add transaction'"
          >Type<select v-model="form.type">
            <option>Expense</option>
            <option>Income</option>
          </select></label
        >
        <label
          v-if="
            [
              'Add transaction',
              'Add budget',
              'Edit budget',
              'Add bill',
              'Add money',
              'Withdraw',
            ].includes(mode)
          "
          >Amount ($)<input
            v-model="form.amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            inputmode="decimal"
            placeholder="0.00"
        /></label>
        <label
          v-if="
            (mode === 'Add transaction' && form.type === 'Expense') ||
            mode === 'Add budget' ||
            mode === 'Edit budget'
          "
          >Category<select v-model="form.category">
            <option
              v-for="c in categories.filter(
                (c) =>
                  c !== 'Income' &&
                  (!(mode === 'Add budget' || mode === 'Edit budget') ||
                    c !== 'Bills'),
              )"
            >
              {{ c }}
            </option>
          </select></label
        >
        <label v-if="mode === 'Add transaction'"
          >Date<input type="date" v-model="form.date" :max="today()" required
        /></label>
        <label v-if="mode === 'Add pot'"
          >Savings target ($)<input
            type="number"
            v-model="form.target"
            min="0.01"
            step="0.01"
            required
        /></label>
        <label v-if="mode === 'Add bill'"
          >Day of each month<input
            type="number"
            v-model="form.day"
            min="1"
            max="31"
            required
          /><small>For shorter months, we use the last day.</small></label
        >
        <label v-if="['Add budget', 'Edit budget', 'Add pot'].includes(mode)"
          >Color<select v-model="form.color">
            <option v-for="(c, i) in colors" :value="c">
              {{ ["Teal", "Sky", "Slate", "Peach", "Lavender"][i] }}
            </option>
          </select></label
        >
        <p class="form-error" v-if="error" role="alert">{{ error }}</p>
        <button
          class="primary full"
          :class="{
            danger: mode.startsWith('Delete') || mode === 'Start fresh',
          }"
          type="submit"
        >
          {{
            mode === "Start fresh"
              ? "Confirm and start fresh"
              : mode.startsWith("Delete")
                ? "Confirm removal"
                : mode === "Pay bill"
                  ? "Confirm payment"
                  : "Save"
          }}
        </button>
      </form>
    </dialog>
    <div v-if="notice" class="toast" role="status">
      {{ notice
      }}<button @click="notice = ''" aria-label="Dismiss notification">
        ×
      </button>
    </div>
  </div>
</template>
