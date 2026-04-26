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
EXPO_PUBLIC_GEMINI_API_KEY=...
EXPO_PUBLIC_ANTHROPIC_API_KEY=...
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
4. `supabase/migrations/20240422_onboarding_completed.sql` — ADD COLUMN `onboarding_completed BOOLEAN DEFAULT false`; UPDATE existentes com pote como `true`

Note: `supabase/migrations/20240421_pots_display_order.sql` exists but the feature was reverted — do not apply.

**OCR prerequisites (manual setup in Supabase):**
- Create bucket `receipts` (Storage → New bucket, public: false)
- `supabase secrets set GOOGLE_VISION_KEY=<chave>`

## Features

**Auth** — login, register, session restore, logout. Invalid token recovery: stale tokens are wiped and user is redirected to login without looping.

**Onboarding** — 3-step wizard (balance/currency → cycle/income sources → first pot). Runs once when `!user.onboarding_completed` or `users` row is missing. **Never use `initial_balance === 0` as the onboarding guard** — saldo zero is a valid input and would cause an infinite loop back to step1. Step 3 upsert includes `onboarding_completed: true`; "Limpar dados" in profile resets it to `false`. Migration: `supabase/migrations/20240422_onboarding_completed.sql` — **must be run in Supabase SQL Editor before deploying**. Step 1: saldo inicial é **opcional** (pode ser zero ou negativo). Step 3: após o upsert do usuário, se `draft.balance !== 0`, cria uma `transaction` no ciclo atual (`type: 'income'` se positivo, `'expense'` se negativo, `description: 'Saldo inicial'`, `payment_method: 'transfer'`, `date: cycleStart`). Isso faz o saldo inicial aparecer automaticamente em Mensal, Projeção e Perfil sem lógica especial.

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

**Projection** (`app/(tabs)/projection.tsx`) — Always 13 rows. Past months are dynamic: probes up to 6 months back (`.limit(1)` each), takes at most 3 consecutive months with real expense data (stops at first gap). Month labels: "Abr/26" (52px column). Reloads on every focus via `useFocusEffect`. Summary cards: "Receita base mensal" and "Gasto médio" (mês atual + 2 anteriores, offsets 0/-1/-2). **Expense calculation per month**: past and current months fetch real transactions (credit by `billing_date`, others + `goal_deposit` by `date`); future months use `totalBudgeted` (sum of active pot limits) + **excedente de parcelas de crédito**: parcelas sem `pot_id` somam integralmente; parcelas com `pot_id` somam apenas o excedente acima do `limit_amount` do pote (se cabe no orçamento → já está em `totalBudgeted`, não soma duas vezes). `activePotsList` (com `id` + `limit_amount`) fica em escopo para o cálculo futuro. No prorating for the current month. Rows with credit installments get amber left border + 💳 indicator; tapping opens credit installments modal. FAB (+) opens "Receita futura" / "Despesa futura" → `ProjectionEntryModal`. Months with `projection_entries` show `+N` badge → entries list modal with edit/delete. All credit transactions fetched once into `creditInstallments` state and filtered client-side per month. `ProjectionEntry` type exported from `components/ProjectionEntryModal.tsx`.

**Goals** (`app/(tabs)/goals.tsx`) — long-term goals with compound interest simulation. `horizon_years` stored as decimal (1.5 = 1 year 6 months). `GoalDepositModal` accepts pot or "free balance" as source. Top 3 cards show the most urgent goal (earliest `target_date >= today`): planned amount, already allocated, and progress with a JarPot image (`getPotImage(percent)` using `POT_IMAGES` static map). Timeline is dynamic: built from `target_date` years of loaded goals; hidden if no goal has a `target_date`. "Nova meta" button is fixed at the bottom (absolute position with `useSafeAreaInsets`).

**Profile** (`app/(tabs)/profile.tsx`) — cycle edit, income sources, credit cards, IR CSV export (`handleExportarIR()` via `expo-file-system/legacy` + `expo-sharing`), data clear, logout. Summary cards: current cycle balance (via `calculateCycleSummary`), active goals count, priority goal progress.

**NFC-e states** (`lib/nfce-states.ts`) — multi-state support: RJ (33), SP (35), MG (31). `extractStateCode(qrData)` reads the first 2 digits of the 44-digit access key embedded in the QR Code URL (`?p=KEY|...`), with domain-based and raw-key fallbacks. `getStateByCode` / `isStateSupported` / `STATE_NAMES` (all 27 states). Each `NFCeState` entry has `isFinalUrl()` and `isRedirectUrl()` functions used by `NFCeWebView` for URL-aware injection. To add a new state: add an entry to `NFCE_STATES` with its code, portal URL, and URL detection functions.

**OCR / NFC-e** (`app/ocr.tsx`) — menu-first flow with two paths:
1. **QR Code → SEFAZ** (recommended): `QRCameraScanner` reads QR Code → `extractStateCode()` detects state from access key → unsupported states show Alert with OCR fallback → `sanitizeNFCeUrl()` fixes double-protocol and encodes `|` → `nfceUrl` + `nfceState` stored in state → `NFCeWebView` renders with state-aware URL detection. Menu shows "Suporta cupons de RJ, SP e MG".
2. **OCR** (fallback): photograph via `expo-image-picker` → base64 → Edge Function `process-receipt` → Google Vision. Also auto-triggered if QR fails (step `ocr_camera` opens camera via `useEffect`).
Both paths converge at `review` step. Entry points: monthly FAB (`cycleDate`), pot detail (`defaultPotId`, `defaultPotName`, `cycleDate`). `imageToBase64` uses `expo-file-system/legacy`.

**Review step — seletor de pote global**: no modo detalhado (não simplificado), há um card azul antes da lista de itens com chips horizontais de potes. Selecionar um pote aplica imediatamente em todos os itens (`setReviewItems` inline + `useEffect` no `globalPotId`). Estado: `globalPotId`, `globalPotName`. "Individual" desmarca o pote global (itens mantêm seus valores individuais). Cada item ainda pode ter seu pote alterado individualmente após aplicar o global.

**Review step** — `ReviewItem` type: `{ id, name, valueCents: number, quantity, unit, potId }`. Value stored as integer cents; `formatCents(cents)` formats for display; `digitsOnly` strips non-numeric for the mask. Payment method selector (`paymentMethod` state, default `'debit'`) is pre-filled from `result.payment_method` (NFCe path) and editable via chip buttons (debit/credit/pix/cash/transfer). `handleSave` uses `paymentMethod` for all transactions (both simplified and per-item). `updateItem(id, changes)` is id-based (not index-based). `addItem` uses `Date.now()` as id.

**NFCeWebView** (`components/NFCeWebView.tsx`) — accepts optional `state?: NFCeState` prop; uses `state.isRedirectUrl()` / `state.isFinalUrl()` when provided, falls back to generic functions for unknown states. Injection guard pattern:
- `scriptInjectedRef` — prevents duplicate injections; reset when `onNavigationStateChange` detects transition from redirect → result URL
- `loadEndTimerRef` — 1s delay after `onLoadEnd` to let jQuery Mobile start rendering before polling begins
- `finalUrlRef` — tracks current URL after redirects via `onNavigationStateChange`
- `sawRedirectRef` — records whether the redirect URL was seen, so the result-page transition can be detected and `scriptInjectedRef` reset correctly
- `onLoadEnd` skips injection if still on redirect URL; only injects on the final result page
- Loading overlay shows `Consultando SEFAZ-{UF}...` when state is known
- Global 35s timeout uses `setLoading(prev => ...)` functional form to avoid stale closure
- EXTRACT_SCRIPT uses **internal polling** (`tryExtract(attempt)`, up to 15 attempts × 1s) — necessary because SEFAZ-RJ page uses jQuery Mobile which renders the body *after* the native `onload` event. Checks `blocked` (IP block keywords) before polling; reports `timeout` if body stays empty after 15s. Items extracted from `tabResult` table rows (fallback: first `table` on page). Payment detection uses `payText.includes()` (lowercase) covering full phrases like "cartão de débito"; also detects `transfer`/`transferência`.

**Analisador de Preços** (`app/analisador-precos.tsx`) — compara preços de produtos por estabelecimento usando Claude Haiku, exibindo relatório em texto livre (mesmo estilo do Mentor Financeiro):
- Quiz 3 perguntas (pote dinâmico carregado do Supabase, preocupação, foco) com animação slide+fade e campo de texto livre complementar. Opção "Todos os potes" disponível na primeira pergunta.
- `lib/analisador-precos.ts`: `buscarDadosParaAnalise(userId, potId, cycleStart)` — busca transactions apenas de ciclos fechados + mês atual (via `getMesesValidos`) com `merchant` não-nulo. `analisarPrecos(transactions, questionario)` — agrupa por descrição (só itens com 3+ ocorrências, máx 15), faz **uma única chamada** ao `claude-haiku-4-5-20251001` via `https://api.anthropic.com/v1/messages` com `max_tokens: 4096`; retorna **string de texto** (não JSON) com seções: 🔍 Resumo Geral, 📊 Análise por Item, 🏪 Estabelecimentos, 💡 Oportunidades de Economia, 🎯 Recomendação Principal. `apiKey` lida de `process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY` internamente.
- Tela de resultado: card branco com `Text` exibindo o relatório, botão "🔄 Nova análise". Sem JSON parse, sem `TabelaItem`, sem tabelas horizontais.
- Rota `analisador-precos` no Stack e guard em `_layout.tsx`. Entrada: card verde "Analisador de Preços IA" no perfil, abaixo do Mentor Financeiro.

**Mentor Financeiro** (`app/mentor.tsx`) — 5-question animated quiz + Gemini 2.5 Flash analysis + PDF report:
- Intro screen → quiz (fade transition) → generating overlay → result with "Salvar PDF" + "Compartilhar PDF"
- Quiz: option chips (tap to highlight) + optional free TextInput per question; "Próxima" button advances (no auto-advance). `metaPrincipal` question loads user goals dynamically from Supabase. `QuestionarioRespostas`: `{ objetivo, dificuldade, metaPrincipal, prazo, tom, comentarios: Record<string, string> }`.
- `lib/mentor-financeiro.ts`: `coletarContextoFinanceiro()` fetches pots + income_sources + transactions + goals; merchant data spans apenas ciclos fechados + mês atual (via `getMesesValidos`); `ContextoFinanceiro` inclui `periodoAnalise` string; `gerarRelatorioMentor()` calls Gemini 2.5 Flash via `EXPO_PUBLIC_GEMINI_API_KEY`; `maxOutputTokens: 8192`; prompt includes real values + free-text comentarios
- `lib/gerar-pdf.ts`: `markdownToHtml()` — order ### before ## before # to avoid partial match; `gerarPDF()` → `expo-print`; `compartilharPDF()` → `expo-sharing`. "Salvar PDF" uses `MediaLibrary.createAssetAsync` + `createAlbumAsync('Download')` to save visibly in Android Downloads folder (requests `MEDIA_LIBRARY` permission at runtime; copies to `cacheDirectory` first, then deletes temp file). **Do not use `documentDirectory` for PDF saving** — it writes to app-private storage not visible in Downloads.
- Route registered in `_layout.tsx` as `name="mentor"`; guard allows `segments[0] === 'mentor'`
- Entry point: blue "Mentor Financeiro IA" card in profile screen above settings groups

**Gamification** — `lib/badges.ts`: 10 badges, `checkAndGrantBadges(userId, cycleStart)`, `getEarnedBadgeKeys(userId)`. `BadgeToast`: slide-in + fadeOut queue (3s per badge). `app/achievements.tsx`: stack screen (not tab) with badge grid. Auto-checked in: `_layout.tsx` (startup), `NewPotModal`, `NewGoalModal`, `ocr.tsx`, `monthly.tsx` (after closing cycle).

**Excel import** (`components/ImportFileModal.tsx`) — Steps: pick → preview → card_select (if any credit row) → assign → saving → done. Auto-detects columns: tipo, descrição, data, valor, pagamento, estabelecimento, parcelas, **pote** (also: categoria/category). Valid `payment_method` values: `cash/debit/credit/pix/transfer` — **never use `'other'`** (not valid in DB); fallback is `'cash'`. `parseDateISO` + `formatDateISO` always produce zero-padded `YYYY-MM-DD` (handles Excel serial, DD/MM/YYYY, DD/MM/YY, YYYY-M-D). **`saveAll` uses `supabase.auth.getUser()` exclusively for `user_id`** — the prop may be stale; never use it for the insert. Pre-insert loop auto-fixes invalid date/type/payment_method. Credit items trigger `card_select` step; `saveAll` uses explicit `if (isCredit) { N installment rows only } else { 1 row, no billing_date }` — **never insert the total row for credit**. `calcBillingDate` (same as `NewExpenseModal`) computes per-installment `billing_date` when a card is selected; `calcBillingDateNoCard` handles credit rows without a card (offsets months from purchase date). `ImportRow.poteName` stores the raw name from the spreadsheet; `potId` is resolved case-insensitively from the `pots` prop after `parseSheet`. Assign step shows a card per item with merchant badge, `poteName` hint ("não encontrado" / "✓ encontrado"), and colored dot next to each pot chip.

**Notifications** — Completely disabled. `lib/notifications.ts` exports only empty async functions: `registerForPushNotifications`, `sendLocalNotification`, `checkCriticalPots`, `scheduleCycleEndReminder`, `sendEncouragementNotification`. No imports, no side effects. Do not add `expo-notifications` imports anywhere.

## Architecture

### Routing — Expo Router (file-based)

| Group | Purpose |
|---|---|
| `app/(auth)/` | Unauthenticated screens: login, register |
| `app/(tabs)/` | Bottom-tab navigator: 🫙 Potes, 📅 Mensal, 📈 Projeção, 🎯 Metas, 👤 Perfil |
| `app/onboarding/` | First-run wizard: step1, step2, step3 |
| `app/pot/[id].tsx` | Dynamic route — registered as `name="pot/[id]"` in root Stack |
| `app/ocr.tsx`, `app/achievements.tsx`, `app/mentor.tsx` | Stack screens (not tabs) |

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

**Dashboard data loading** — `app/(tabs)/index.tsx` uses `useEffect` + `useState`. Income total from `income_sources.amount` (NOT transactions). Expenses from `transactions` filtered by pot + cycle dates. Refetches on `user?.id` or `cycleOffset` change.

**Cycle sync across tabs** — `stores/useCycleStore.ts` (`useCycleStore`) holds `cycleOffset: number`, `viewMode`, and `alertsExpanded: boolean` shared globally. Both Potes and Mensal tabs read/write `cycleOffset` so changing the month in either tab updates the other automatically. Clicking the month label (▾) in both tabs opens `MonthPickerModal` for direct month selection (up to 24 months back); the ‹/› arrows still work for sequential navigation. `pot/[id].tsx` receives `cycleOffset` as a route param. `alertsExpanded` controls whether the collapsible warning card in Mensal is open (persists across tab switches). Monthly pot-table rows are touchable and navigate to the pot's detail in the same cycle.

**MonthPickerModal** (`components/MonthPickerModal.tsx`) — Modal overlay with months grouped by year (up to 24 months back). Selected month highlighted in primary color. Props: `visible`, `currentOffset`, `cycleStart`, `onSelect(offset)`, `onClose`.

### Cycle logic (`lib/cycle.ts`)

- `getCycle(cycleStart, offset)` — returns cycle bounds; `end` = day before cycleStart in next month
- `getCycleDates(cycleStart)` — returns `{ start, end }` as ISO strings for current cycle
- `isCurrentCycle(cycleStart, offset)` — boolean
- `formatDateShort(date)` — "Hoje" / "Ontem" / "DD MMM"

### Cycle close (`lib/cycleClose.ts`)

- `calculateCycleSummary(userId, cycle)` — computes income, expenses, balance for a cycle
- `processCycleClose(userId, cycle, surplusAction, surplusGoalId)` — closes cycle, creates `cycle_rollovers` row
- `recalculateRollover(userId, cycleStart, offset)` — recalculates an already-closed cycle preserving `surplus_action`/`surplus_goal_id`; used in retroactive cascade

### Valid cycles helper (`lib/getMesesValidos.ts`)

- `getMesesValidos(userId, cycleStart): Promise<MesValido[]>` — returns `{ start, end }[]` covering only the current cycle + past cycles with `processed=true` rollover (up to 6 months back). Rollover key = `getCycle(cycleStart, offset + 1).startISO` (next cycle's start). Used by Mentor Financeiro and Analisador de Preços to avoid including months with no closed data.

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

**Step3 Supabase sequence** — (1) upsert `users`, (2) insert `transactions` saldo inicial if `draft.balance !== 0`, (3) insert `income_sources`, (4) insert `pots`. Double-tap guarded with `if (loading) return`. Pots INSERT: `user_id, name, color, limit_amount, limit_type, is_emergency` only.

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

**TransactionGroup** (`components/TransactionGroup.tsx`) — renderiza um grupo de transações do mesmo estabelecimento na mesma data. Regras: sem merchant ou 1 item → linha simples; 2+ itens com mesmo merchant + data → header colapsável com total + botão [+/−] à esquerda acima da bolinha. Quando expandido, mostra barra de ações em lote com botão "Excluir todos". Props: `transactions: TxItem[]` (campos flat `potName?`/`potColor?`), `onEdit?: (t) => void`, `onDeleteGroup?: (txs) => void`. `onDeleteGroup` é passado por `monthly.tsx` e `pot/[id].tsx` com Alert de confirmação + delete por `ids` via Supabase.

**`lib/group-transactions.ts`** — helpers de agrupamento:
- `groupTransactionsByMerchantAndDate(txs)` — usa display date (billing_date para crédito), agrupa por merchant + date; sem merchant = grupo individual
- `groupByDate(groups)` — indexa por data para headers
- `formatDateHeader(dateStr)` — "Hoje" / "Ontem" / "DD Mmm"

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
