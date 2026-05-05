# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

**SnapGestão** — app de controle financeiro pessoal (React Native + Expo 54).  
Supabase: `https://cvyissbkfwphtmvvcvop.supabase.co`

## Documentação detalhada

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — routing, data flow, cycle sync, libs, auth, styling
- [`docs/BANCO_DE_DADOS.md`](docs/BANCO_DE_DADOS.md) — schema, migrations, queries de potes, transações
- [`docs/FEATURES.md`](docs/FEATURES.md) — todas as features: potes, mensal, projeção, OCR/NFC-e, IA, gamification, imports/exports
- [`docs/PERFORMANCE_E_BUGS.md`](docs/PERFORMANCE_E_BUGS.md) — regras de performance, bugs Android conhecidos, constraints

## Stack

React Native · Expo 54 · Expo Router ~6.0.23 · TypeScript · Supabase (Postgres + RLS + Edge Functions) · Zustand · React Query · expo-sqlite

## Comandos

```bash
npm start                    # Metro Bundler
npm run android              # rodar no Android
npx tsc --noEmit             # type-check
npm install <pkg> --legacy-peer-deps   # instalar (sempre --legacy-peer-deps)
npm run build:android        # APK release
npm run build:android:debug  # APK debug
npm run prebuild             # regenerar android/ ios/ (DESTRUTIVO)
```

## Variáveis de ambiente (`.env` — nunca commitar)

```
EXPO_PUBLIC_SUPABASE_URL=https://cvyissbkfwphtmvvcvop.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_GEMINI_API_KEY=...
EXPO_PUBLIC_ANTHROPIC_API_KEY=...
EXPO_PUBLIC_GROQ_API_KEY=...
```

`EXPO_PUBLIC_*` são inlined pelo Metro. Secrets de backend nunca devem usar este prefixo.

## Regras críticas (resumo rápido)

- **Potes**: sempre usar `lib/pot-history.ts` — nunca `.is('deleted_at', null)` sozinho
- **Ciclos**: crédito filtra por `billing_date`; tudo mais por `date`
- **`monthly.tsx`**: usa `computeCycleSummaryFromData` (síncrono) — nunca `calculateCycleSummary`
- **`_layout.tsx`**: nunca adicionar `getSession()` extra — `init()` já cuida disso
- **Onboarding guard**: nunca usar `initial_balance === 0` — saldo zero é válido
- **payment_method**: nunca usar `'other'` — não é válido no DB; fallback: `'cash'`
- **PDF**: nunca usar `documentDirectory` para salvar — usar `MediaLibrary` + Downloads
- **NFCeWebView**: URL já vem sanitizada do caller — nunca chamar `sanitizeNFCeUrl` dentro
- **Notificações**: completamente desabilitadas — não adicionar imports de `expo-notifications`

## Tela inicial

Mensal (`/(tabs)/monthly`) é a tela inicial após login/onboarding. Tabs em ordem: Mensal · Potes · Projeção · Metas · Perfil. Todos os `router.replace('/(tabs)')` devem apontar para `/(tabs)/monthly`.

## Arquitetura (resumo)

- **Routing**: file-based via Expo Router. Guard em `app/_layout.tsx`: não-autenticado → login; autenticado sem perfil → onboarding; perfil OK → tabs. **Regra crítica**: quando `isAuthenticated=true` mas `user=null` (perfil ainda carregando), o guard aguarda — nunca redireciona para onboarding prematuramente.
- **Data flow**: React Query (fetch/cache) → Supabase → `onSuccess` atualiza Zustand store. Componentes leem do store. Nunca chamar `supabase` diretamente de componentes (exceto `useAuthStore`, `onboarding/step3.tsx`, `app/(tabs)/index.tsx`).
- **Cycle sync**: `useCycleStore` sincroniza `cycleOffset` e `viewMode` entre Potes e Mensal. Range −24 a +12.
- **AI**: `callAI(provider, prompt)` em `lib/ai-provider.ts`. Modelos: `claude-haiku-4-5-20251001`, Gemini 2.5 Flash, Llama 3.3 70B (Groq). Provider padrão: `'claude'`. Limite de tokens por usuário — ver `supabase/scripts/grant_ai_tokens.sql`.
- **Offline**: `expo-sqlite` (`snapgestao.db`) — sync não implementado.
- **SecureStore**: `LargeSecureStoreAdapter` em `lib/supabase.ts` tem cache em memória (`memoryCache`) e deduplicação de leituras paralelas (`pendingReads`). Leituras simultâneas da mesma chave reutilizam a mesma Promise — evita contenção e reduz `getSession` de ~8s para <1s.

## Constraints de plataforma

- `expo-router` pinado em `~6.0.23` — não atualizar sem atualizar `expo` junto.
- New Architecture habilitada (`newArchEnabled: true`) — evitar libs incompatíveis.
- Nunca importar de `@react-navigation` diretamente — usar apenas APIs de `expo-router`.
- `babel.config.js` não existe — não criar sem necessidade explícita.

## Arquivos mortos (podem ser deletados)

- `components/ProjectionEntryModal.tsx` — não importado em nenhum lugar
- `components/charts/BarChart.tsx` — não importado em nenhum lugar

## Lançamentos a Confirmar (Scheduled Transactions)

Feature implementada em `lib/scheduled-transactions.ts`.

**Tabelas** (migration: `supabase/migrations/20240501_scheduled_transactions.sql`):
- `scheduled_transactions` — lançamento orçado: descrição, valor, pote, forma de pagamento, `start_date`, `total_months`
- `scheduled_transaction_months` — 1 row por mês; `status`: `pending` | `confirmed` | `cancelled`; `transaction_id` preenchido ao confirmar

**Fluxo**:
1. Botão "📋 Agendar" em `app/pot/[id].tsx` → `NewScheduledModal` → `createScheduledTransaction` (cria N rows mensais)
2. Tela do pote lista pendentes do mês via `getScheduledForMonth(userId, cycleStart, cycleOffset, potId)`
3. Confirmar → `confirmScheduled` cria `transaction` real + marca `status: 'confirmed'`
4. Excluir (mês único) → `cancelScheduledMonth`

**Badge**: `useCycleStore.pendingScheduledCount` — atualizado em `app/(tabs)/index.tsx` (carrega `getScheduledForMonth` para offset 0). Lido em `app/(tabs)/_layout.tsx` via `tabBarBadge` no tab Potes.

**Data**: `NewScheduledModal` usa `DateTimePicker` (`@react-native-community/datetimepicker`) com `minimumDate=start` e `maximumDate=end` do ciclo. Default: hoje se `cycleOffset===0`, primeiro dia do mês caso contrário.

**Regra**: `getScheduledForMonth` aceita `potId?` opcional — sem ele retorna todos os potes (usado para o badge); com ele filtra client-side (usado no detalhe do pote).

## Base de Preços Colaborativa

**Tabelas** (migrations):
- `price_database` — itens de cupons fiscais: `item_name` (normalizado), `item_name_raw`, `price`, `establishment`, `establishment_cnpj`, `city`, `state`, `scanned_at`. Limpo pela Edge Function `cleanup-price-database` (>30 dias).
- `user_preferences` — `share_price_data BOOLEAN NULL` + `share_price_accepted_at`. `NULL` = nunca perguntou.

**Lib**: `lib/price-database.ts`
- `getUserPriceShareOptIn` → `boolean | null` (null = nunca respondeu, true = aceitou, false = recusou)
- `submitPriceData` — coleta apenas de cupons NFC-e. **Nunca inclui user_id ou dados pessoais.** Lotes de 50.
- `getPriceComparison(itemName, city?)` — últimos 30 dias, agrupa por estabelecimento
- `getUserCity` — extrai cidade dos endereços de receipts do usuário

**Fluxo opt-in** (ocr.tsx após salvar):
1. Opted-in → `submitPriceData` fire-and-forget
2. Nunca respondeu → `PriceShareOptInModal` → decisão → navegação
3. Recusou → skip silencioso

**Dados colaborativos no Analisador**: `analisarPrecos` aceita `userId?` (4º parâmetro). Busca comparativos dos top 5 itens e inclui no prompt quando há ≥2 estabelecimentos.

**Preferência de perfil**: toggle "Compartilhar preços anônimos" em `profile.tsx` → grupo Dados.

## Histórico de Fontes de Receita

Feature implementada em `lib/income-history.ts`.

**Tabela** (migration: `supabase/migrations/20240503_income_source_history.sql`):
- `income_source_history` — 1 row por (fonte × mês); `valid_from` = data de início do ciclo; `UNIQUE(income_source_id, valid_from)`. Seed inicial: `valid_from = '2000-01-01'` copiando `income_sources.amount` para todos os usuários existentes.

**Funções**:
- `getIncomeAtMonth(sourceId, cycleStart, offset)` → número: valor da fonte no mês. Usa `lte('valid_from', start)` + `order desc limit 1`.
- `getIncomeSourcesForMonth(userId, cycleStart, offset)` → `{ id, name, amount, type }[]`: todas as fontes com o valor correto para o mês (N queries em paralelo).
- `getIncomeSourcesBatch(userId, cycleStart, offsets)` → `Record<offset, totalReceita>`: otimizado para projeção — 2 queries totais, processamento local.
- `updateIncomeSourceAmount(sourceId, userId, newAmount, cycleStart, fromOffset)` → upsert em `income_source_history` + atualiza `income_sources.amount` para compatibilidade.

**Integrações**:
- **Mensal** (`monthly.tsx`): `getIncomeSourcesForMonth(userId, cycleStart, offset)` substitui a query direta de `income_sources`. Passado para `computeCycleSummaryFromData`.
- **Projeção** (`projection.tsx`): `getIncomeSourcesBatch(userId, cycleStart, fullOffsets)` substitui a query direta. Cada mês usa `receitasPorMes[offset]`.
- **Modal de fontes** (`IncomeSourcesModal.tsx`): ao editar, seletor de mês ("Válido a partir de") com `fromOffset` −24 a +12. Salva via `updateIncomeSourceAmount`. Lista mostra valor histórico do mês atual.

**Regra**: alterações valem apenas do mês escolhido para frente. Meses passados sem entrada no histórico caem no registro mais antigo disponível.

## Metas Melhoradas

Feature implementada em `lib/goal-transactions.ts`.

**Tabelas** (migration: `supabase/migrations/20240505_goal_transactions.sql`):
- `goals` (atualizado): novos campos `status` (`active` | `completed` | `cancelled`), `completed_at`, `completion_type`.
- `goal_transactions` — movimentações por meta: `type` (`deposit_external` | `deposit_from_cycle` | `withdrawal_to_cycle`), `amount`, `description`, `reference_month`. RLS habilitado.

**Funções** (`lib/goal-transactions.ts`):
- `depositExternalToGoal(goalId, userId, amount, description?)` → depósito externo, não impacta ciclo.
- `depositFromCycleToGoal(goalId, userId, amount, cycleStart, cycleOffset, goalName, description?)` → cria `expense` no ciclo + incrementa `current_amount`.
- `withdrawFromGoalToCycle(goalId, userId, amount, cycleStart, cycleOffset, goalName, description?)` → valida saldo, cria `income` + decrementa `current_amount`.
- `completeGoal(goalId, userId)` → `status='completed'`, `completed_at=now()`, `completion_type='manual'`.
- `getGoalTransactions(goalId)` → histórico da meta em ordem decrescente.
- `getCompletedGoals(userId)` → metas com `status != 'active'`.

**UI** (`app/(tabs)/goals.tsx`):
- `GoalCard` inline (substituiu o componente externo): barra de progresso, valores, botões **Depositar** e **Sacar**, badge "Meta atingida!" quando `current >= target`.
- Botão **🏆 Concluídas** no header abre modal com histórico de metas concluídas/canceladas.
- **GoalCard** restaurado ao design original: imagem JarPot por percentual, borderLeft colorido por prazo, badge de horizonte, aporte e projeção; botão histórico 📋 no header.
- Botões inline no GoalCard: **+ Depositar** (primary), **− Sacar** (branco/borda), **✅ Concluir** (verde, só quando `current >= target`). Botão Concluir dispara Alert diretamente no card.
- **Modal de Depósito da meta**: tela de seleção (externo vs do ciclo) → formulário com valor, descrição e seletor de mês (se do ciclo).
- **Modal de Saque da meta**: tela de seleção (para o mês vs concluir meta) → formulário de saque com seletor de mês, ou Alert de confirmação de conclusão.
- **Card Reserva**: substituídos os 3 botões antigos pelos mesmos 2 botões (Depositar/Sacar) do estilo GoalCard.
- **Modal de Depósito da Reserva**: mesmo fluxo 2 etapas (externo ou do ciclo).
- **Modal de Saque da Reserva**: formulário direto com valor, descrição e seletor de mês.
- **Validação de saldo** antes de confirmar saque: `Alert.alert` se `valor > saldo` (meta e reserva).
- **Modal de Histórico da Meta** (botão 📋 no card): lista movimentações com tipo, data e valor.
- **Modal de Metas Concluídas**: FlatList com badge de status, valor acumulado e data de conclusão.
- `loadGoals` filtra por `status = 'active'`, ordena por `created_at`.
- `GoalDepositModal` externo removido — substituído pelos novos modais inline.

**Regras**:
- `monthly_deposit` é opcional na criação — salvo como `null` se não preenchido.
- `withdrawFromGoalToCycle` lança erro se `current_amount < amount` (validação também na UI antes da chamada).
- `completeGoal` não cria transação financeira — apenas muda o status.
- `payment_method` das transactions geradas é `'transfer'`.

## Reserva de Emergência

Feature implementada em `lib/emergency-reserve.ts`.

**Tabelas** (migration: `supabase/migrations/20240504_emergency_reserve.sql`):
- `emergency_reserve` — 1 row por usuário: `current_amount`, `target_amount` (opcional). `UNIQUE(user_id)`.
- `emergency_reserve_transactions` — histórico de movimentações: `type` (`deposit_external` | `deposit_from_cycle` | `withdrawal_to_cycle`), `amount`, `description`, `reference_month`.

**Funções** (`lib/emergency-reserve.ts`):
- `getOrCreateReserve(userId)` → cria a row se não existir; retorna sempre o registro atualizado.
- `getReserveTransactions(userId)` → últimas 50 transações em ordem decrescente.
- `depositExternal(userId, amount, description?)` → depósito de dinheiro externo (não afeta ciclo).
- `depositFromCycle(userId, amount, cycleStart, cycleOffset, description?)` → cria `expense` na tabela `transactions` + incrementa reserva.
- `withdrawToCycle(userId, amount, cycleStart, cycleOffset, description?)` → valida saldo, cria `income` na tabela `transactions` + decrementa reserva.
- `updateReserveTarget(userId, targetAmount)` → define ou remove meta de valor.

**UI** (`app/(tabs)/goals.tsx`):
- Card de Reserva de Emergência exibido no topo da tela de Metas.
- Modal de ação (`showReserveModal`) com 3 tipos: depósito externo, transferência do ciclo, saque para ciclo.
- Histórico de movimentações via `FlatList` (`showReserveHistory`).
- Carregado junto com as metas em `loadGoals` via `Promise.all`.

**Regras**:
- `NewPotModal` não tem mais o toggle `is_emergency` — a reserva agora é gerenciada pela tela de Metas.
- `withdrawToCycle` lança erro se `current_amount < amount` — validar antes de chamar.
- `payment_method` das transactions geradas é `'transfer'`.

## Roadmap

- [ ] Glossário financeiro
- [ ] Testes e validações finais
- [ ] Build de produção (EAS)
- [ ] Push notifications (requer build de produção)
