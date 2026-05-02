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

- **Routing**: file-based via Expo Router. Guard em `app/_layout.tsx`: não-autenticado → login; autenticado sem perfil → onboarding; perfil OK → tabs.
- **Data flow**: React Query (fetch/cache) → Supabase → `onSuccess` atualiza Zustand store. Componentes leem do store. Nunca chamar `supabase` diretamente de componentes (exceto `useAuthStore`, `onboarding/step3.tsx`, `app/(tabs)/index.tsx`).
- **Cycle sync**: `useCycleStore` sincroniza `cycleOffset` e `viewMode` entre Potes e Mensal. Range −24 a +12.
- **AI**: `callAI(provider, prompt)` em `lib/ai-provider.ts`. Modelos: `claude-haiku-4-5-20251001`, Gemini 2.5 Flash, Llama 3.3 70B (Groq). Provider padrão: `'claude'`. Limite de tokens por usuário — ver `supabase/scripts/grant_ai_tokens.sql`.
- **Offline**: `expo-sqlite` (`snapgestao.db`) — sync não implementado.

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

## Roadmap

- [ ] Glossário financeiro
- [ ] Testes e validações finais
- [ ] Build de produção (EAS)
- [ ] Push notifications (requer build de produção)
