# Budget Companion

A working Vue 3 + TypeScript personal budgeting app based on the supplied finance mockups.

## Run locally

Requires Node.js 22.12+ (tested on Node 24).

```sh
npm ci
npm run dev
```

```sh
npm run build
npm run preview
```

## Included

- Responsive overview, transactions, budgets, pots, and recurring bills views.
- Manual income and expense entry, search, sorting, category filtering, deletion.
- Create and edit monthly budgets, with progress and recent expenses.
- Create savings pots, allocate funds, withdraw funds, and remove pots.
- Monthly recurring bills and a one-click payment recording flow with confirmation.
- Account balance reconciliation and next-payday settings.
- Safe-to-spend calculation and daily estimate with visible reserve breakdown.
- Browser-local persistence, demo data, empty states, validation, export backup.
- Optional read-only WebMCP budget summary when supported by the browser.

## First use

1. Explore the labeled demo workspace.
2. Choose **Use my own numbers** and confirm.
3. Open the gear button to set your current balance and next payday.
4. Add your monthly bills, spending budgets, and savings pots.
5. Record new transactions as they happen.

All monetary values are stored as integer US cents. The current balance includes funds assigned to pots. A transfer to a pot changes the reserve, never the account balance.

Safe to spend = current balance − pot allocations − unspent current-month budgets − unpaid recurring bills through payday.

The bill reserve includes unpaid bills in the current calendar month, plus future occurrences through payday. Paying a bill creates one linked expense and releases that occurrence's reserve. The Bills category is excluded from budgets to avoid overlap. Use **Mark paid** on a recurring bill instead of also recording it manually.

Budgets cover the current calendar month; future-month category budgets are not forecast. Review the plan at month boundaries. Historic unpaid bill occurrences from before the current month are not tracked automatically. Reserve those separately in a pot if needed. Income not yet received is not included.

## Storage and scope

Data stays in localStorage in the current browser and origin. This version has no bank connection, multi-device synchronization, custom account login, CSV import, or backup restore UI. Exported JSON can be retained as a data backup. The deployed Site is private through the hosting access gate.

Do not enter historic transactions already reflected in the initial balance unless you reconcile the balance again in Settings.

## Structure

- `src/App.vue` — views, accessible native dialogs, entry and editing flows.
- `src/model.ts` — typed data and integer-cent calculation functions.
- `src/style.css` — responsive visual system matching the supplied references.

No external UI or chart library is required. Vue reactivity provides the small app's shared state. The donut is a CSS visualization of category budget allocations.

## Start fresh whenever you need

Open **Settings (gear) → Start fresh**. Choose **Keep my budgets and bills** or **Clear everything**. Both options clear transactions, savings pots, and the account balance, and reset the payday. Keeping your plan preserves category limits and recurring bill details, but bill payment status starts unpaid. You must check the confirmation box and press **Confirm and start fresh**. Download a backup first if desired; reset has no undo or restore UI.

After resetting, review already-paid bills, then set your current bank balance and next payday in Settings. The Start fresh button remains available after every reset.

## Mika companion

Mika appears only on Overview with one context-aware message at a time: initial setup, an expired payday, reserves above balance, a completed savings pot, activity recorded today, or a welcoming check-in. Her button opens the relevant action. Saving a transaction also gives brief encouragement when she is enabled.

Hide her with the × button or toggle **Settings → Show Mika on Overview**. This preference is saved separately from finances and survives a workspace reset. The current version uses four portraits with responsive CSS framing; it has no animation, chatbot, external AI calls, or paid API requirement.

The original generated image is bundled at `public/images/mika.png`; the message rules are in `src/companion.ts`.

### Expressions

Mika’s portrait follows her message automatically: welcoming for setup and everyday check-ins, focused when payday needs updating, gently concerned when reserves exceed the balance, and celebrating when a savings pot reaches its target. Setup and payday reminders take priority over reserve concerns, which take priority over celebrations. Her expression does not change or reset financial records.

## Run this download

Extract the ZIP, open a terminal in budget-companion, and run npm ci then npm run dev. Requires Node.js 22.12+ (Node 24 works). Open the local URL printed in your terminal. All four Mika images are bundled. Personal financial records and private hosting configuration are not included.
