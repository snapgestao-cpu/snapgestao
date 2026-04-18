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

## Current status

### Concluído

**Infraestrutura**
- Node, VS Code, Expo CLI, Git configurados
- Contas GitHub, Supabase e Expo criadas
- Projeto em `C:\snapgestao\snapgestao`
- Todas as bibliotecas instaladas (`--legacy-peer-deps` obrigatório)

**Backend (Supabase)**
- Schema completo: tabelas `users`, `income_sources`, `pots`, `credit_cards`, `receipts`, `transactions`, `goals`, `smart_merchants`, `user_badges`
- RLS habilitado em todas as tabelas
- Trigger `on_auth_user_created` ativo

**Autenticação**
- Login, cadastro, restauração de sessão, logout
- Guard de rotas em `_layout.tsx` (auth → onboarding → tabs)
- Recuperação de token inválido (usuário deletado do Supabase)

**Onboarding (3 telas)**
- Step 1: saldo inicial + moeda
- Step 2: ciclo mensal + fontes de receita (modal bottom-sheet)
- Step 3: primeiro pote + cor + preview em tempo real
- Salva em `users`, `income_sources` e `pots` no Supabase

**Dashboard**
- Cards de receita (soma de `income_sources`) e despesa (ciclo atual)
- Lista de potes com `PotCard` + botão "+ Novo pote"
- Pull-to-refresh
- FAB animado (Animated.spring) com menu "Registrar gasto" / "Registrar receita"
- Seção "Lançamentos recentes" (últimos 10 do ciclo) filtrável por pote
- Toast de feedback após ações (cores: danger=gasto, success=receita, primary=pote)

**PotCard**
- Ícone automático por categoria (`lib/potIcons.ts`, ~80 mapeamentos)
- Borda lateral esquerda colorida com a cor do pote
- Barra de progresso tricolor (verde/âmbar/vermelho)
- `onLongPress` abre action sheet (editar / ver lançamentos / excluir)

**Módulo de Lançamentos**
- `components/NewExpenseModal.tsx` — gasto com seleção de pote, data, forma de pagamento, cartão de crédito, estabelecimento, `is_need`
- `components/NewIncomeModal.tsx` — receita com fonte, data, forma de recebimento
- `components/TransactionItem.tsx` — Hoje/Ontem/DD/MM, badge do pote, `brl()` formatter
- `components/Toast.tsx` — fade animado posicionado abaixo do safe-area top

**Gestão de Potes**
- `components/NewPotModal.tsx` — criar e editar potes
  - Sugestões rápidas em chips (Alimentação, Moradia, Transporte…)
  - Limite por valor fixo ou % da renda (calcula valor com base em `income_sources`)
  - Paleta de 12 cores exportada como `POT_COLORS` (importar de `NewPotModal` onde necessário)
  - Toggle "Pote de emergência 🛡️" — cor roxa `#534AB7` por padrão; desabilitado se já existir um
  - Preview em tempo real com `PotCard`
  - Modo edição: recebe `editPot?: Pot`, faz `UPDATE` em vez de `INSERT`
- Action sheet (Modal fade) ao toque longo no PotCard: editar / ver lançamentos / excluir
- Exclusão com `Alert.alert` de confirmação; lançamentos vinculados são mantidos

**Tela de Projeção** (`app/(tabs)/projection.tsx`)
- Tabela 12 meses: 6 passados (dados reais) + 6 futuros (receita base de `income_sources`, gasto zero)
- Receita = `income_sources` (base) + transações `income` do ciclo
- Linha futura marcada com `*` e estilo itálico/muted

**Metas de longo prazo** (`app/(tabs)/goals.tsx`)
- Tela com summary cards (total alocado, total projetado com juros compostos)
- Timeline visual horizontal: Hoje → 5 anos → 10 anos → 30 anos com marcadores coloridos
- `GoalCard`: ícone + badge colorido por horizonte (🌴5y=verde, 🏠10y=âmbar, 🏆30y=roxo), barra de progresso, aporte e projeção, botão "Transferir valor"
- `NewGoalModal`: nome, valor alvo, horizonte (chips), aporte mensal, taxa de juros (default 8%), simulador em tempo real com FV = PMT × ((1+r)^n - 1) / r
- `GoalDepositModal`: valor, seletor de pote ou "Saldo livre", insere `goal_deposit` transaction + atualiza `current_amount`
- Toque longo no GoalCard abre action sheet (editar / depositar / excluir)
- `lib/finance.ts`: `calcFV(monthlyDeposit, annualRatePct, years)` + `brl(value)` compartilhados

**Perfil e configurações** (`app/(tabs)/profile.tsx`)
- Header: avatar com iniciais, nome, email (de `supabase.auth.getUser()`), badge do ciclo
- Summary: saldo inicial, potes ativos, total em metas
- Configurações em grupos: Conta, Potes e Cartões, Notificações, Dados, Sobre
- Edição inline do ciclo mensal (dialog com TextInput centrado) → `UPDATE users`
- Toggles de notificação (estado local por ora)
- Limpar dados de teste: `DELETE transactions WHERE user_id`
- Logout com `Alert` de confirmação

**Gestão de cartões** (`components/CreditCardModal.tsx`)
- Lista cartões com nome, últimos 4 dígitos, fechamento/vencimento, limite
- Formulário add/edit: nome, last_four, closing_day, due_day, credit_limit (opcional)
- DELETE com Alert de confirmação

**Fontes de receita** (`components/IncomeSourcesModal.tsx`)
- Lista fontes com badge "Principal" na fonte primária, total mensal em destaque
- Formulário add/edit: nome, tipo (chips), valor, dia de recebimento, checkbox "Fonte principal"
- DELETE com Alert, callback `onChanged` para recarregar dashboard após alterações

**Bugs corrigidos**
- `storage.removeItem is not a function` (SecureStore adapter)
- Botão de confirmar saltando no Android (KAV removido das telas)
- Modal step2 corrompendo layout no Android (overlay/sheet como irmãos)
- Token inválido travando em loop de loading
- Potes duplicando ao tocar duas vezes no botão
- Campos inexistentes (`icon`, `mesada_active`) no insert de potes — **nunca incluir no INSERT/UPDATE**

**Controle mensal** (`app/(tabs)/monthly.tsx`)
- Navegação entre ciclos via `←` / `→` com `offset` state e `getCycle(cycleStart, offset)`
- Card escuro de resumo: receita base + receita extra, despesas, saldo, débito/sobra de ciclos anteriores
- Alerta âmbar se gasto > 80% da renda disponível
- Tabela de potes com progresso, gasto e limite por pote
- Lista de transações agrupada por data (Hoje/Ontem/DD MMM) com botão ✏️ por linha
- `EditTransactionModal`: editar ou excluir qualquer lançamento; adapta campos por tipo (expense vs income)
- Seção "Encerrar ciclo": chips de destino da sobra (meta / emergência / renda / descartar), seletor de meta, botão de fechamento
- Seção pote de emergência: saldo acumulado de todas as transações deste pote
- FAB igual ao dashboard (registrar gasto / receita) com `initialDate` do ciclo atual
- `lib/cycle.ts`: `getCycle(cycleStart, offset)` → `CycleInfo` com ISO strings; `formatDateShort(iso)` → Hoje/Ontem/DD MMM
- `lib/cycleClose.ts`: `calculateCycleSummary()` e `processCycleClose()` com upsert em `cycle_rollovers`
- SQL migration: `supabase/migrations/20240418_cycle_rollovers.sql` — criar tabela `cycle_rollovers` manualmente no Supabase SQL editor

### Fase 2 — Pendente

- [ ] Módulo OCR — leitura de cupons fiscais via `lib/ocr.ts` + `components/OCRCamera.tsx` (estrutura existe, Edge Function pendente)
- [ ] Importação via planilha Excel — parse de `.xlsx` e inserção em batch de transações
- [ ] Notificações push reais — alertas de pote próximo do limite, vencimento de fatura (toggles de UI já existem)
- [ ] Exportar dados em CSV/Excel — botão na tela de perfil já existe (mostra "Em breve")
- [ ] Gamificação e badges — tabela `user_badges` já existe no schema
- [ ] Edição do nome do usuário no perfil
- [ ] Fatura consolidada por cartão de crédito

## Architecture

### Routing — Expo Router (file-based)

`app/` is the file-system router. Route groups (parentheses) do not appear in URLs:

| Group | Purpose |
|---|---|
| `app/(auth)/` | Unauthenticated screens: login, register |
| `app/(tabs)/` | Bottom-tab navigator: Potes, Mensal, Projeção, Metas, Perfil |
| `app/onboarding/` | First-run wizard: step1 (balance + currency), step2 (cycle + income), step3 (first pot) |

`app/_layout.tsx` is the root. On mount it:
1. Opens the SQLite database via `lib/database.ts`
2. Restores the Supabase session and subscribes to `onAuthStateChange`
3. Fetches the `users` row from Supabase and writes it into `useAuthStore`
4. Wraps everything in `QueryClientProvider` (staleTime: 5 min, retry: 2)

Navigate between groups with `router.replace('/(tabs)/')` or `router.replace('/(auth)/login')`.  
Onboarding steps share state via the module-level `onboardingDraft` object in `lib/onboardingDraft.ts` (not router params, since income sources are an array). Step3 clears the draft after a successful save.

### Data flow

Hooks in `hooks/` are the **only** place that call Supabase. Pattern used consistently:

```
useQuery / useMutation  (React Query — server state, cache, loading/error)
  └─ calls supabase.*
  └─ onSuccess → writes into Zustand store (setPots, addTransaction, …)

Zustand store  (stores/ — synchronous in-memory working set)
  └─ components read from here for instant access without suspense
```

Never call `supabase` directly from a component. Exceptions:
- `useAuthStore` calls Supabase internally for all auth operations
- `onboarding/step3.tsx` calls Supabase directly for the 3-step wizard save sequence
- `app/(tabs)/index.tsx` (dashboard) calls Supabase directly via `useEffect` for reliability after onboarding

**Dashboard data loading** — `app/(tabs)/index.tsx` uses `useEffect` + `useState` with direct Supabase calls (not hooks). Triggered by `user?.id` change so it refetches automatically after onboarding completes. Supports pull-to-refresh. Income total comes from `income_sources.amount` (NOT transactions). Expenses come from `transactions` filtered by pot + cycle dates.

**Cycle filtering** — `getCycleDates(user.cycle_start)` returns `{ start, end }` as ISO date strings. All per-pot expense queries use `.gte('date', start).lte('date', end)`.

**`PotCard`** receives flat props: `name, color, limit_amount?, spent, remaining, onPress?, onLongPress?`. `spent` and `remaining` are calculated by the parent — never passed as a `Pot` object. Progress bar: green below 50%, amber 50–80%, red above 80%. Values formatted with `toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })`. `onLongPress` triggers the parent's action sheet (edit / filter transactions / delete).

### Offline layer

`lib/database.ts` — singleton `getDatabase()` opens `snapgestao.db` with `expo-sqlite` and runs `CREATE TABLE IF NOT EXISTS` for `pots`, `transactions`, and `goals`. Each table has a `synced_at TEXT` column (sync logic not yet implemented). Initialised once in the root layout.

### Auth

`useAuthStore` (`stores/useAuthStore.ts`) is fully implemented with:
- `signIn(email, password)` / `signUp(name, email, password)` — return a translated Portuguese error string or `null` on success. Components show these inline, not via `Alert`.
- `signOut()` — calls Supabase + clears store. The screen that triggers it handles navigation to `/(auth)/login`.
- `init()` — called once in root layout. Loads the current session and starts `onAuthStateChange`. Returns an unsubscribe function for cleanup.
- `setUser(user)` — used by `onboarding/step3.tsx` after saving the user row, so the `_layout.tsx` guard sees the completed profile and doesn't loop back to onboarding.

**Invalid token recovery** — handles the case where the user is deleted from Supabase but a stale token remains on the device:
- `loadSession()` wraps `getSession()` in try/catch. On error or missing session it calls `supabase.auth.signOut()` to wipe the stored token, then sets `isLoading: false` so the guard redirects to login.
- `onAuthStateChange` in `init()` explicitly handles `SIGNED_OUT` and `!session` events — clears store state immediately. `TOKEN_REFRESHED` / `SIGNED_IN` events also wrap the profile fetch in try/catch with the same signOut fallback.
- `_layout.tsx` fires an additional `supabase.auth.getSession()` on mount as a safety belt — if the token is invalid it calls `signOut()` to unblock the loading spinner.
- Do NOT add an `onAuthStateChange` listener inside `lib/supabase.ts` — that creates a circular import with `useAuthStore`. Handle all auth events inside `init()` where both Supabase and store state are accessible.

`user` is the app-level `User` type from `types/index.ts`, loaded from the `users` Supabase table — distinct from `auth.users`. The `users` row is created at the end of onboarding (step3), not at signup.

**Route guard logic** (`app/_layout.tsx`):
1. While loading → `ActivityIndicator` (Stack not mounted yet)
2. Not authenticated + not in `(auth)` → `router.replace('/(auth)/login')`
3. Authenticated + `user` is null or `initial_balance === 0` + not in `onboarding` → `router.replace('/onboarding/step1')`
4. Authenticated + valid profile + not in `(tabs)` → `router.replace('/(tabs)/')`

Uses `useSegments()` to check current group before redirecting (avoids redirect loops).

### Onboarding

Three-step wizard in `app/onboarding/`. Runs once for new users (guard detects `user.initial_balance === 0` or missing `users` row).

**State sharing between steps** — `lib/onboardingDraft.ts` exports a module-level singleton:
- `onboardingDraft.set({ balance, currency, cycleStart })` — written by step1 and step2
- `onboardingDraft.addSource(source)` / `removeSource(index)` — managed by step2's modal
- `onboardingDraft.get()` — read by step3
- `onboardingDraft.clear()` — called by step3 after successful Supabase write

**Currency mask helpers** (`lib/onboardingDraft.ts`):
- `formatCents(rawDigits)` — converts `"15000"` → `"R$ 150,00"`
- `digitsOnly(text, maxLen?)` — strips non-digits, used in `onChangeText`
- `centsToFloat(rawDigits)` — converts `"15000"` → `150.00`

All three steps share the same visual language: 4px progress bar at top (33/66/100%), icon in a `72×72` rounded square (`Colors.lightBlue` background), title + subtitle, scrollable content, and a fixed bottom button outside the ScrollView.

**Step2 income modal** uses React Native's built-in `Modal` (animationType: "slide", transparent overlay). Income sources are stored as `IncomeSourceDraft[]` in the draft singleton. An empty list is valid — income sources are optional.

Modal structure: `KeyboardAvoidingView` (`justifyContent: 'flex-end'`) wraps two **siblings** — (1) an `absoluteFillObject` `TouchableOpacity` as the dismiss overlay, and (2) a `View` as the bottom sheet. Do NOT nest the sheet inside the overlay `TouchableOpacity`; that causes Android layout corruption. Sheet state is a single `novaFonte` object updated with the functional form `setNovaFonte(f => ({ ...f, field: value }))`. Type chips are in a horizontal `ScrollView` (not `flexWrap`).

**Step3 Supabase sequence** (try/finally, each step returns early on error):
1. Get `userId` from `useAuthStore.getState().session?.user.id` — no network call needed
2. `supabase.from('users').upsert(...)` — creates/updates profile row; per-step `console.error` + `setError` on failure
3. `supabase.from('income_sources').insert([...])` — batch insert if any sources; explicit column mapping (no spread) to avoid sending unexpected fields
4. `supabase.from('pots').insert(...)` — only columns: `user_id, name, color, limit_amount, limit_type, is_emergency` — do NOT add `icon` or `mesada_active` (these columns do not exist in the schema)
5. `setUser(savedUser)` → `onboardingDraft.clear()` → `router.replace('/(tabs)/')`
6. Double-tap protection: guard `if (loading) return` at top of handler

### OCR

`lib/ocr.ts` calls a Supabase Edge Function `ocr-receipt` with a base64 image and returns `{ merchant, amount, date, description }`. `components/OCRCamera.tsx` wraps `expo-camera`'s `CameraView` and drives this flow.

### Types

All shared types in `types/index.ts`: `User`, `Pot`, `Transaction`, `Goal`, `CreditCard`, `IncomeSource`.

### Styling

`StyleSheet.create` inline per file — no styling framework. Always import from `constants/colors.ts`:

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

**PotCard** (`components/PotCard.tsx`) takes flat props: `name, color, limit_amount, spent, remaining, onPress?`. No `Pot` object passed — parent destructures before calling. Uses `getPotIcon(name)` from `lib/potIcons.ts` for the emoji. Colored left border (`borderLeftWidth: 3, borderLeftColor: color`); icon badge background is `color + '26'` (15% opacity). Progress bar: pot color below 50%, amber 50–80%, red above 80%. Values formatted with `toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })`. Always renders `TouchableOpacity` with `disabled={!onPress}` and `activeOpacity={onPress ? 0.8 : 1}` — safe to render in preview without a handler.

**Pot icon mapping** (`lib/potIcons.ts`): `getPotIcon(name)` maps pot names to emojis — exact match first, then partial match (substring in either direction), then `'💰'` fallback. ~80 category mappings covering alimentação, moradia, transporte, saúde, educação, lazer, pets, finanças, beleza, tecnologia, família, etc.

**Real-time PotCard preview** in `onboarding/step3.tsx` and `NewPotModal`: renders a `PotCard` with `spent=0`, `remaining=centsToFloat(limitDigits)` so the user sees the card update as they type the name and pick a color. Use this pattern in any future pot creation/edit screen.

**Pot color palette** — 12 colors exported as `POT_COLORS` from `components/NewPotModal.tsx`. Import from there to stay in sync. Display as a grid of 36px circles with `gap: 10`, `flexWrap: 'wrap'`. Selected circle gets `borderWidth: 3, borderColor: white` + shadow/elevation.

## Known Android bugs (fixed — do not reintroduce)

- **Button bounce on Android**: `KeyboardAvoidingView behavior="height"` at screen level causes layout shift animation before keyboard opens. Fix: remove KAV from all screens; use `<SafeAreaView edges={['top']}>` as root container. KAV is only used inside `Modal`.
- **Modal layout corruption**: Nesting the bottom sheet `TouchableOpacity` inside the overlay `TouchableOpacity` with `justifyContent: 'flex-end'` on the overlay causes element overlap on Android. Fix: see Step2 modal structure above (siblings, not parent-child).
- **`storage.removeItem is not a function`**: `expo-secure-store` exposes `getItemAsync/setItemAsync/deleteItemAsync`, but Supabase JS SDK expects `getItem/setItem/removeItem`. Fix: use `ExpoSecureStoreAdapter` in `lib/supabase.ts`.

## Key constraints

- `expo-router` pinned at `~6.0.23` for Expo 54 — do not upgrade without upgrading `expo` together.
- New Architecture enabled (`newArchEnabled: true`) — avoid libraries incompatible with it.
- `@react-navigation/*` is installed as a peer dep of Expo Router. Use `expo-router` APIs (`router`, `Link`, `useLocalSearchParams`) — never import from `@react-navigation` directly.
