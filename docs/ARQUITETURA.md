# Arquitetura

## Stack

React Native + Expo 54 · Expo Router ~6.0.23 · TypeScript · Supabase (Postgres + RLS + Edge Functions) · Zustand · React Query · expo-sqlite (offline)

## Routing (Expo Router — file-based)

| Grupo | Uso |
|---|---|
| `app/(auth)/` | Login, register |
| `app/(tabs)/` | Tabs: Potes, Mensal, Projeção, Metas, Perfil |
| `app/onboarding/` | Wizard: step1, step2, step3 |
| `app/pot/[id].tsx` | Detalhe do pote (Stack, `name="pot/[id]"`) |
| `app/ocr.tsx`, `app/achievements.tsx`, `app/mentor.tsx`, `app/analisador-precos.tsx` | Stack screens |

### Route guard (`app/_layout.tsx`)
1. Loading → `ActivityIndicator`
2. Não autenticado → `/(auth)/login`
3. Autenticado + `user` null + não em `onboarding` → `/onboarding/step1`
4. Autenticado + perfil válido → `/(tabs)/`

Guard permite `segments[0] === 'pot' | 'ocr' | 'achievements' | 'mentor' | 'analisador-precos'`.

**Nunca** adicionar `supabase.auth.getSession()` separado em `_layout.tsx` — `init()` já chama `loadSession()`.

## Data flow

```
useQuery / useMutation  (React Query — cache, loading, error)
  └─ calls supabase.*
  └─ onSuccess → Zustand store

Zustand (stores/)  — working set síncrono
  └─ componentes leem daqui sem suspense
```

**Hooks** (`hooks/`): `usePots`, `useTransactions`, `useIncomeSources`.  
**Nunca** chamar `supabase` direto de componente. Exceções: `useAuthStore`, `onboarding/step3.tsx`, `app/(tabs)/index.tsx`.

## Cycle sync entre tabs

`useCycleStore` (Zustand) → `cycleOffset`, `viewMode`, `alertsExpanded`. Potes e Mensal leem/escrevem `cycleOffset` sincronizadamente. Range: **−24 a +12 meses**. `MonthPickerModal` para seleção direta.

## Lib helpers principais

| Arquivo | Responsabilidade |
|---|---|
| `lib/cycle.ts` | `getCycle`, `getCycleDates`, `isCurrentCycle`, `formatDateShort` |
| `lib/cycleClose.ts` | `calculateCycleSummary`, `processCycleClose`, `recalculateRollover` |
| `lib/pot-history.ts` | Todas as queries de pote com histórico (ver docs/BANCO_DE_DADOS.md) |
| `lib/getMesesValidos.ts` | Ciclos fechados + atual para IA (evita meses sem dados) |
| `lib/ai-provider.ts` | `callAI(provider, prompt)` — Claude/Gemini/Groq |
| `lib/finance.ts` | `calcFV`, `brl` |
| `lib/group-transactions.ts` | `groupTransactionsByMerchantAndDate`, `groupByDate` |

## Auth (`stores/useAuthStore.ts`)

- `signIn` / `signUp` → string de erro PT-BR ou `null`
- `signOut` → limpa store; tela cuida da navegação
- `init()` → chamado uma vez em `_layout.tsx`; inicia `onAuthStateChange`
- `setUser(user)` → chamado por `onboarding/step3` após salvar

**Nunca** adicionar `onAuthStateChange` dentro de `lib/supabase.ts` — import circular com `useAuthStore`.

## Onboarding (`lib/onboardingDraft.ts`)

Singleton módulo-nível compartilhado entre steps. `onboardingDraft.set/get/clear`, `addSource/removeSource`.

**Step3 Supabase sequence**: (1) upsert `users`, (2) insert `transactions` saldo inicial se `draft.balance !== 0`, (3) insert `income_sources`, (4) insert `pots`.

**Guard**: nunca usar `initial_balance === 0` como guard — saldo zero é válido e causaria loop infinito.

## Offline layer (`lib/database.ts`)

`getDatabase()` — abre `snapgestao.db` via `expo-sqlite`. Tabelas: `pots`, `transactions`, `goals` com `synced_at TEXT`. Sync não implementado. Iniciado uma vez em `_layout.tsx`.

## Styling

`StyleSheet.create` inline por arquivo. Cores sempre de `constants/colors.ts`:

| Token | Valor | Uso |
|---|---|---|
| `primary` | `#0F5EA8` | Botões, estados ativos |
| `primaryDark` | `#0A3D6B` | Headers |
| `accent` | `#1EB87A` | Receitas, progresso |
| `danger` | `#E24B4A` | Despesas, over-budget |
| `warning` | `#BA7517` | Alertas |
| `success` | `#1D9E75` | Saldo positivo |
| `background` | `#F4F6F9` | Fundo de telas |
| `textDark` | `#1A2030` | Texto principal |
| `textMuted` | `#7A8499` | Texto secundário |

## Onboarding modal structure (Android-safe)

`KeyboardAvoidingView` (`justifyContent: 'flex-end'`) envolve dois **siblings**: (1) `absoluteFillObject TouchableOpacity` como overlay, (2) `View` como bottom sheet. **Nunca** aninhar o sheet dentro do overlay — causa corrupção de layout no Android.

## Edge Functions (Supabase Deno)

- `supabase/functions/process-receipt/` — Google Cloud Vision OCR. Extrai merchant, total, data, CNPJ, itens. Salva em bucket `receipts`.
- `supabase/functions/fetch-nfce/` — **Tombstoned (HTTP 410)**. SEFAZ-RJ bloqueia IPs de datacenter. Parsing agora é client-side via `lib/ocr.ts`.

## Tipos (`types/index.ts`)

`User`, `Pot`, `Transaction` (com `installment_total`, `installment_number`, `installment_group_id`), `Goal`, `CreditCard`, `IncomeSource`, `PotLimitHistory`.
