# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**SnapGestão** — personal finance control app (controle financeiro pessoal).  
Supabase project: `https://cvyissbkfwphtmvvcvop.supabase.co`

## Commands

```bash
# Start Metro Bundler
npm start

# Run on specific platform
npm run android
npm run ios

# Type-check without emitting
npx tsc --noEmit

# Install dependencies (peer-dep conflicts are expected — always use --legacy-peer-deps)
npm install <package> --legacy-peer-deps
```

No test suite or linter configured yet.

## Environment

`.env` at project root (gitignored — never commit):
```
EXPO_PUBLIC_SUPABASE_URL=https://cvyissbkfwphtmvvcvop.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

`EXPO_PUBLIC_*` vars are inlined at Metro build time. Backend secrets must never use this prefix.

## Supabase Schema

Tables: `users`, `income_sources`, `pots`, `credit_cards`, `receipts`, `transactions`, `goals`, `smart_merchants`, `user_badges`, `cycle_rollovers`, `pot_limit_history`, `projection_entries`.  
RLS enabled on all tables. Trigger `on_auth_user_created` active.

**`projection_entries`** — lançamentos avulsos em meses futuros. Fields: `id`, `user_id`, `type` (`'income'|'expense'`), `description`, `amount`, `entry_date`, `cycle_start_date` (ISO, used to match the cycle), `is_recurring`, `created_at`. Must be created manually in Supabase SQL Editor (see `projection_entries` migration in Tarefa 3a). Policy: `auth.uid() = user_id`.

**Migrations that must be run manually in Supabase** (in order):
1. `supabase/migrations/20240418_cycle_rollovers.sql`
2. `supabase/migrations/20240419_pot_soft_delete_and_history.sql`
3. `supabase/migrations/20240420_pots_physical_delete.sql` — alters FK `transactions.pot_id` to `ON DELETE SET NULL`

Note: `supabase/migrations/20240421_pots_display_order.sql` exists but the feature was reverted — do not apply.

**OCR prerequisites (manual setup in Supabase):**
- Create bucket `receipts` (Storage → New bucket, public: false)
- `supabase secrets set GOOGLE_VISION_KEY=<chave>`

## Features

**Auth** — login, register, session restore, logout. Invalid token recovery: stale tokens are wiped and user is redirected to login without looping.

**Onboarding** — 3-step wizard (balance/currency → cycle/income sources → first pot). Runs once when `user.initial_balance === 0` or `users` row is missing.

**Pots dashboard** (`app/(tabs)/index.tsx`) — grid of pots filtered by `created_at <= cycle.end`, ordered by `created_at`. Emergency pot shown as separate footer card. Pull-to-refresh.

**Pot detail** (`app/pot/[id].tsx`) — JarPot 150px + expense/income buttons + grouped transaction list with edit (✏️). Deletion is soft delete via `deleted_at`. Transaction list uses **two parallel queries**: non-credit by `date`, credit by `billing_date` — merged and sorted by display date so installments from prior months appear in the current cycle. Transactions grouped by display date (billing_date for credit, date for others). Previous-month installments show a 🛍️ badge with purchase date and installment number. `spent` calculation uses same split (credit by billing_date, others by date).

**JarPot** (`components/JarPot.tsx`) — PNG-based fill visualization using `assets/potes/` images (`Pote_vazio.png`, `Pote_10/30/50/70/90/100.png`). Image chosen by percent band. Export: `export function JarPot` (named) + `export default JarPot` — always import as named: `import { JarPot } from '...'`. Prop `limit: number | null` accepted without type error.

**NewPotModal** (`components/NewPotModal.tsx`) — create and edit pots.
- Quick-suggestion chips; limit by fixed value or % of income
- `POT_COLORS` (12 colors) exported from here — import from here to stay in sync
- Emergency pot toggle (purple `#534AB7`; disabled if one already exists)
- Edit mode: receives `editPot?: Pot`, does `UPDATE` instead of `INSERT`
- Retroactive creation: `cycleStartDate?: Date` + `isRetroactive?: boolean` — saves `created_at` as cycle start date instead of `now()`
- Prop `onBadges?: (badges: Badge[]) => void` to return newly granted badges to parent
- **Duplicate prevention**: `onBlur` on name field runs `ilike` query; shows amber border + warning text if duplicate. On save, checks again — if duplicate found, shows Alert offering "Atualizar limite" (UPDATE + `pot_limit_history` insert) instead of INSERT. When `isRetroactive=true` and the existing pot's `created_at` is later than `cycleStartDate`, the Alert instead offers "Sim, criar desde este mês" and includes `created_at=cycleStartDate` in the UPDATE so the pot becomes visible in that earlier month.
- **Never include `icon` or `mesada_active` in pots INSERT/UPDATE** — these columns do not exist in the schema

**Pot deletion** — **soft DELETE** via `deleted_at`. On delete: expense transactions from `cycle.startISO` onwards are hard-deleted, then the pot gets `deleted_at = cycle.start.toISOString()`. The pot remains in the DB so past-cycle views still show it.

**Pot queries by context:**
- `index.tsx` (current cycle dashboard): `.is('deleted_at', null)` — only active pots.
- `monthly.tsx` and `calculateCycleSummary`: use `fetchPotsForCycle(userId, cycleStartISO, cycleEndISO)` from `lib/pots.ts` — returns active pots + pots deleted AFTER the cycle end (`.gt('deleted_at', cycleEndISO)`). A pot deleted at the start of cycle N does NOT appear in cycle N, but does appear in earlier cycles.
- Do **not** use `.or('deleted_at.is.null,...')` — that pattern was removed.

**Pot limit history** — `pot_limit_history` table records limit changes with `valid_from` per cycle. Has `ON DELETE CASCADE` on `pot_id`.

**Transactions** — `NewExpenseModal`: pote is mandatory (inline error if missing, "Criar pote →" button if list empty); credit payment shows installment toggle (2–24x), creates N rows with shared `installment_group_id` and per-month `billing_date`. `EditTransactionModal`: for installments, asks "Só esta" vs "Todas as restantes" (batch delete with `.gte('installment_number', current)`).

**Cycle filtering for transactions** — credit uses `billing_date`, all others (including `goal_deposit`) use `date`. Non-credit queries use `.in('type', ['expense', 'goal_deposit'])` everywhere: `calculateCycleSummary`, `index.tsx` pot spent, `pot/[id].tsx` pot spent. The pot detail transaction LIST is fetched by `date` (so user sees when they registered), but the `spent` calculation uses two parallel queries (credit by `billing_date`, others by `date`). `TransactionItem` and transaction rows in `monthly.tsx` show "Vence DD Mon YYYY" (amber) for credit transactions that have `billing_date`.

**Monthly control** (`app/(tabs)/monthly.tsx`) — cycle navigation with `offset` + `getCycle(cycleStart, offset)`. Summary card: base income + extra income + prior rollover − expenses = balance. Two separate alerts: red card if `cycleSaldo < 0` (deficit value); amber card if `cycleSaldo >= 0` and any pot exceeded limit (lists pots + amounts). "Encerrar ciclo" available for any non-closed cycle; after closing a past cycle, cascades `recalculateRollover` from `offset+1` up to `0`. **Transaction query**: two parallel queries (non-credit by `date`, credit by `billing_date`) — **never use `.or()` PostgREST compound filter**, it is fragile and has been removed. `groupTransactions` groups by billing_date for credit so prior-month installments appear under the correct date header.

**Projection** (`app/(tabs)/projection.tsx`) — Always 13 rows. Past months are dynamic: probes up to 6 months back (`.limit(1)` each), takes at most 3 consecutive months with real expense data (stops at first gap). Month labels: "Abr/26" (52px column). Reloads on every focus via `useFocusEffect`. Summary cards: "Receita base mensal" and "Gasto médio" (mês atual + 2 anteriores, offsets 0/-1/-2). **Expense calculation per month**: past and current months fetch real transactions (credit by `billing_date`, others + `goal_deposit` by `date`); future months use `totalBudgeted` (sum of active pot limits) + credit installments from `allCredit` (already fetched — no extra query per future month). No prorating for the current month. Rows with credit installments get amber left border + 💳 indicator; tapping opens credit installments modal. FAB (+) opens "Receita futura" / "Despesa futura" → `ProjectionEntryModal`. Months with `projection_entries` show `+N` badge → entries list modal with edit/delete. All credit transactions fetched once into `creditInstallments` state and filtered client-side per month. `ProjectionEntry` type exported from `components/ProjectionEntryModal.tsx`.

**Goals** (`app/(tabs)/goals.tsx`) — long-term goals with compound interest simulation. `horizon_years` stored as decimal (1.5 = 1 year 6 months). `GoalDepositModal` accepts pot or "free balance" as source. Top 3 cards show the most urgent goal (earliest `target_date >= today`): planned amount, already allocated, and progress with a JarPot image (`getPotImage(percent)` using `POT_IMAGES` static map). Timeline is dynamic: built from `target_date` years of loaded goals; hidden if no goal has a `target_date`. "Nova meta" button is fixed at the bottom (absolute position with `useSafeAreaInsets`).

**Profile** (`app/(tabs)/profile.tsx`) — cycle edit, income sources, credit cards, IR CSV export (`handleExportarIR()` via `expo-file-system/legacy` + `expo-sharing`), data clear, logout. Summary cards: current cycle balance (via `calculateCycleSummary`), active goals count, priority goal progress.

**OCR / NFC-e** (`app/ocr.tsx`) — menu-first flow with two paths:
1. **QR Code → SEFAZ** (recommended): `QRCameraScanner` reads QR Code → URL opened in `NFCeWebView` (react-native-webview). WebView loads the SEFAZ-RJ page using the device's real browser engine (bypasses all IP blocks). After load + 1.5s settle time, `EXTRACT_SCRIPT` is injected via `injectJavaScript()` to parse the DOM: merchant (h4 or first all-caps div), items (table#tblItens rows; fallback: span/td/div text line-by-line), total ("Valor a pagar" regex), payment method (keyword). Result posted back via `window.ReactNativeWebView.postMessage`. WebView is hidden (opacity 0) — user sees only the loading overlay.
2. **OCR** (fallback): photograph via `expo-image-picker` → base64 → Edge Function `process-receipt` → Google Vision. Also auto-triggered if QR fails (step `ocr_camera` opens camera via `useEffect`).
Both paths converge at `review` step. Entry points: monthly FAB (`cycleDate`), pot detail (`defaultPotId`, `defaultPotName`, `cycleDate`). `imageToBase64` uses `expo-file-system/legacy`.

**Gamification** — `lib/badges.ts`: 10 badges, `checkAndGrantBadges(userId, cycleStart)`, `getEarnedBadgeKeys(userId)`. `BadgeToast`: slide-in + fadeOut queue (3s per badge). `app/achievements.tsx`: stack screen (not tab) with badge grid. Auto-checked in: `_layout.tsx` (startup), `NewPotModal`, `NewGoalModal`, `ocr.tsx`, `monthly.tsx` (after closing cycle).

**Excel import** (`components/ImportFileModal.tsx`) — Steps: pick → preview → card_select (if any credit row) → assign → saving → done. Auto-detects columns: tipo, descrição, data, valor, pagamento, estabelecimento, parcelas. Valid `payment_method` values: `cash/debit/credit/pix/transfer` — **never use `'other'`** (not valid in DB); fallback is `'cash'`. `parseDateISO` + `formatDateISO` always produce zero-padded `YYYY-MM-DD` (handles Excel serial, DD/MM/YYYY, DD/MM/YY, YYYY-M-D). **`saveAll` uses `supabase.auth.getUser()` exclusively for `user_id`** — the prop may be stale; never use it for the insert. Pre-insert loop auto-fixes invalid date/type/payment_method. Credit items trigger `card_select` step; `calcBillingDate` (same as `NewExpenseModal`) computes per-installment `billing_date`.

**Notifications** — Completely disabled. `lib/notifications.ts` exports only empty async functions: `registerForPushNotifications`, `sendLocalNotification`, `checkCriticalPots`, `scheduleCycleEndReminder`, `sendEncouragementNotification`. No imports, no side effects. Do not add `expo-notifications` imports anywhere.

## Architecture

### Routing — Expo Router (file-based)

| Group | Purpose |
|---|---|
| `app/(auth)/` | Unauthenticated screens: login, register |
| `app/(tabs)/` | Bottom-tab navigator: 🫙 Potes, 📅 Mensal, 📈 Projeção, 🎯 Metas, 👤 Perfil |
| `app/onboarding/` | First-run wizard: step1, step2, step3 |
| `app/pot/[id].tsx` | Dynamic route — registered as `name="pot/[id]"` in root Stack |
| `app/ocr.tsx`, `app/achievements.tsx` | Stack screens (not tabs) |

`app/_layout.tsx` root — on mount: opens SQLite DB, restores Supabase session, fetches `users` row into `useAuthStore`, wraps in `QueryClientProvider` (staleTime: 5 min, retry: 2), calls `checkAndGrantBadges`.

**Route guard logic:**
1. Loading → `ActivityIndicator` (Stack not mounted)
2. Not authenticated + not in `(auth)` → `/(auth)/login`
3. Authenticated + `user` null or `initial_balance === 0` + not in `onboarding` → `/onboarding/step1`
4. Authenticated + valid profile + not in `(tabs)` → `/(tabs)/`

Uses `useSegments()` before redirecting; guard also allows `segments[0] === 'pot'` and `'ocr'`/`'achievements'`.

### Data flow

```
useQuery / useMutation  (React Query — server state, cache, loading/error)
  └─ calls supabase.*
  └─ onSuccess → writes into Zustand store

Zustand store  (stores/ — synchronous in-memory working set)
  └─ components read from here for instant access without suspense
```

**Hooks** (`hooks/`):
- `usePots` — fetches pots for current user, writes to `usePotsStore`
- `useTransactions` — fetches transactions with cycle filtering, writes to `useTransactionStore`
- `useIncomeSources` — fetches income sources for current user

Never call `supabase` directly from a component. Exceptions:
- `useAuthStore` — all auth operations
- `onboarding/step3.tsx` — 3-step wizard save sequence
- `app/(tabs)/index.tsx` — direct `useEffect` calls for reliability after onboarding

**Dashboard data loading** — `app/(tabs)/index.tsx` uses `useEffect` + `useState`. Income total from `income_sources.amount` (NOT transactions). Expenses from `transactions` filtered by pot + cycle dates. Refetches on `user?.id` change.

### Cycle logic (`lib/cycle.ts`)

- `getCycle(cycleStart, offset)` — returns cycle bounds; `end` = day before cycleStart in next month
- `getCycleDates(cycleStart)` — returns `{ start, end }` as ISO strings for current cycle
- `isCurrentCycle(cycleStart, offset)` — boolean
- `formatDateShort(date)` — "Hoje" / "Ontem" / "DD MMM"

### Cycle close (`lib/cycleClose.ts`)

- `calculateCycleSummary(userId, cycle)` — computes income, expenses, balance for a cycle
- `processCycleClose(userId, cycle, surplusAction, surplusGoalId)` — closes cycle, creates `cycle_rollovers` row
- `recalculateRollover(userId, cycleStart, offset)` — recalculates an already-closed cycle preserving `surplus_action`/`surplus_goal_id`; used in retroactive cascade

### Auth (`stores/useAuthStore.ts`)

- `signIn` / `signUp` — return Portuguese error string or `null` on success
- `signOut` — clears store; calling screen handles navigation
- `init()` — called once in root layout; starts `onAuthStateChange`; returns unsubscribe
- `setUser(user)` — called by onboarding/step3 after save, so guard sees completed profile

Do NOT add `onAuthStateChange` inside `lib/supabase.ts` — circular import with `useAuthStore`.

### Onboarding state (`lib/onboardingDraft.ts`)

Module-level singleton shared across steps (not router params — income sources are an array):
- `onboardingDraft.set/get/clear` — balance, currency, cycleStart
- `onboardingDraft.addSource/removeSource` — income source array

Currency mask helpers: `formatCents("15000")` → `"R$ 150,00"`, `digitsOnly`, `centsToFloat`.

**Step3 Supabase sequence** — pots INSERT only: `user_id, name, color, limit_amount, limit_type, is_emergency`. Double-tap guarded with `if (loading) return`.

### Onboarding modal structure (Android-safe)

`KeyboardAvoidingView` (`justifyContent: 'flex-end'`) wraps two **siblings**: (1) `absoluteFillObject` `TouchableOpacity` as dismiss overlay, (2) `View` as bottom sheet. Never nest the sheet inside the overlay — causes Android layout corruption. Type chips in horizontal `ScrollView` (not `flexWrap`).

### Edge Function: fetch-nfce (`supabase/functions/fetch-nfce/index.ts`)

**Tombstoned (HTTP 410)** — SEFAZ-RJ blocks datacenter IPs. NFC-e parsing now happens client-side in `lib/ocr.ts` via `fetchNFCeFromDevice()` + `parseNFCeHTML()`. The function is kept deployed as a stub so the `fetchNFCeFromURL()` export doesn't break anything.

### OCR Edge Function (`supabase/functions/process-receipt/index.ts`)

Deno. Calls Google Cloud Vision (`TEXT_DETECTION` + `DOCUMENT_TEXT_DETECTION`). Extracts: merchant (first line), total (keyword regex), date (DD/MM/YYYY → ISO), CNPJ, line items. Saves image to `receipts` bucket and record to `public.receipts`. `tsconfig.json` excludes `supabase/functions` to avoid Deno import errors.

### Offline layer (`lib/database.ts`)

Singleton `getDatabase()` — opens `snapgestao.db` via `expo-sqlite`, creates `pots`, `transactions`, `goals` tables with `synced_at TEXT`. Sync not yet implemented. Initialized once in root layout.

### Types (`types/index.ts`)

`User`, `Pot`, `Transaction` (with `installment_total`, `installment_number`, `installment_group_id`), `Goal`, `CreditCard`, `IncomeSource`, `PotLimitHistory`.

### Styling

`StyleSheet.create` inline per file — no framework. Always import colors from `constants/colors.ts`:

| Token | Value | Use |
|---|---|---|
| `primary` | `#0F5EA8` | Buttons, active states |
| `primaryDark` | `#0A3D6B` | Headers, pressed states |
| `accent` | `#1EB87A` | Income, progress fills |
| `danger` | `#E24B4A` | Expenses, over-budget |
| `warning` | `#BA7517` | Alerts |
| `success` | `#1D9E75` | Positive balance |
| `background` | `#F4F6F9` | Screen backgrounds |
| `textDark` | `#1A2030` | Body text |
| `textMuted` | `#7A8499` | Secondary text, placeholders |

**PotCard** (`components/PotCard.tsx`) — flat props: `name, color, limit_amount?, spent, remaining, onPress?, onLongPress?`. Parent calculates `spent`/`remaining` — never pass a `Pot` object. Progress bar: pot color < 50%, amber 50–80%, red > 80%. `onLongPress` opens parent action sheet (edit / filter / delete). Safe to render without handlers (`disabled={!onPress}`).

**JarPot preview pattern** — render `PotCard` with `spent=0, remaining=centsToFloat(limitDigits)` for real-time preview as user types. Used in `onboarding/step3.tsx` and `NewPotModal`.

**Pot icon mapping** (`lib/potIcons.ts`) — `getPotIcon(name)`: exact match → partial match → `'💰'` fallback. ~80 categories.

**Goal icon mapping** (`lib/goalIcons.ts`) — `getGoalIcon(name)`: ~40 categories.

**Finance utils** (`lib/finance.ts`) — `calcFV(monthlyDeposit, annualRatePct, years)`, `brl(value)`.

## Known Android bugs (fixed — do not reintroduce)

- **Button bounce**: `KeyboardAvoidingView behavior="height"` at screen level causes layout animation before keyboard opens. Fix: remove KAV from screens; use `<SafeAreaView edges={['top']}>` as root. KAV only inside `Modal`.
- **Modal layout corruption**: nesting bottom sheet inside overlay `TouchableOpacity` with `justifyContent: 'flex-end'` causes element overlap. Fix: siblings, not parent-child (see Onboarding modal structure above).
- **`storage.removeItem is not a function`**: `expo-secure-store` exposes `getItemAsync/setItemAsync/deleteItemAsync` but Supabase SDK expects `getItem/setItem/removeItem`. Fix: `ExpoSecureStoreAdapter` in `lib/supabase.ts`.

## Key constraints

- `expo-router` pinned at `~6.0.23` for Expo 54 — do not upgrade without upgrading `expo` together.
- New Architecture enabled (`newArchEnabled: true`) — avoid libraries incompatible with it.
- Use `expo-router` APIs (`router`, `Link`, `useLocalSearchParams`) — never import from `@react-navigation` directly.
- `babel.config.js` does not exist — do not create one unless adding a plugin that requires it.

## Roadmap

- [ ] Glossário financeiro
- [ ] Testes e validações finais
- [ ] Build de produção (EAS)
- [ ] Push notifications (expo-notifications, requires production build)
