# Banco de Dados (Supabase)

Supabase: `https://cvyissbkfwphtmvvcvop.supabase.co`  
RLS habilitado em todas as tabelas. Trigger `on_auth_user_created` ativo.

## Tabelas

`users`, `income_sources`, `pots`, `credit_cards`, `credit_card_cycle_overrides`, `receipts`, `transactions`, `goals`, `smart_merchants`, `user_badges`, `cycle_rollovers`, `pot_limit_history`, `pot_history`

**`projection_entries` — REMOVIDA**. Dropar se existir: `DROP TABLE IF EXISTS public.projection_entries;`

## Migrations (rodar manualmente no Supabase SQL Editor, em ordem)

1. `supabase/migrations/20240418_cycle_rollovers.sql`
2. `supabase/migrations/20240419_pot_soft_delete_and_history.sql`
3. `supabase/migrations/20240420_pots_physical_delete.sql` — altera FK `transactions.pot_id` para `ON DELETE SET NULL`
4. `supabase/migrations/20240422_onboarding_completed.sql` — ADD COLUMN `onboarding_completed BOOLEAN DEFAULT false`

> `20240421_pots_display_order.sql` existe mas feature foi revertida — **não aplicar**.

## OCR (setup manual)

- Criar bucket `receipts` (Storage → New bucket, public: false)
- `supabase secrets set GOOGLE_VISION_KEY=<chave>`

## Potes — histórico e queries

### Regras críticas

- **Nunca** usar `.is('deleted_at', null)` sozinho para dashboard/mensal — perde potes soft-deleted para mês futuro.
- **Nunca** usar `.or('deleted_at.is.null,...')` — padrão removido.
- **Nunca** ler `name`/`limit_amount` direto de `pots` para views de meses passados — usar `lib/pot-history.ts`.
- **Nunca** incluir `icon` ou `mesada_active` em INSERT/UPDATE de potes — colunas não existem.

### `lib/pot-history.ts` — funções centralizadas

| Função | Uso |
|---|---|
| `fetchPotsForCycleWithHistory(userId, cycleStartISO, cycleEndISO)` | Dashboard, Mensal, cycleClose |
| `getPotAtMonth(potId, cycleStart, offset)` | Detalhe do pote — overlay de nome/limite |
| `getPotsForMonth(userId, cycleStart, offset)` | Wrapper conveniente |
| `getPotsHistoryBatch(userId, cycleStart, offsets)` | Projeção — 2 queries para todos os offsets |
| `upsertPotHistory(potId, userId, name, limitAmount, cycleStart, cycleOffset)` | NewPotModal (create/edit/reativar/update-limit) |
| `ensureHistoryBaseline(potId, userId, cycleStart, cycleOffset)` | NewPotModal (3 sites) + `updatePot` — proteção de meses passados |
| `createPot(...)` | INSERT pote + pot_history inicial |
| `updatePot(...)` | UPDATE pot_history do mês visualizado |
| `deletePot(...)` | Soft delete — `deleted_at = início do mês visualizado` |

**Nunca** usar `fetchPotsForCycle` de `lib/pots.ts` para código novo — não lê histórico.

### Lógica de soft delete

- Deleção: hard-delete transactions de `cycle.startISO`, depois `deleted_at = cycle.start.toISOString()`
- Deletando de mês futuro (cycleOffset > 0): `deleted_at` = início daquele mês futuro — mês atual não é afetado
- Pote permanece no DB para views de ciclos passados

### `pot_history` — source of truth para estado histórico

Schema: `pot_id, user_id, name, limit_amount, valid_from`. Query de estado num mês: `SELECT ... WHERE pot_id = X AND valid_from <= cycleStart ORDER BY valid_from DESC LIMIT 1`. Colunas `name`/`limit_amount` em `pots` espelham o último entry de `pot_history` e servem de **fallback** quando não há entry válido para o mês.

**Baseline de meses passados** (`ensureHistoryBaseline`): editar o limite/nome de um pote **legado** (criado antes do `pot_history`, ou sem nenhum entry anterior ao mês editado) sobrescrevia a linha `pots` (o fallback), fazendo **meses passados** — que caíam no fallback por não terem entry histórico — passarem a mostrar o valor NOVO. `ensureHistoryBaseline` corrige na origem: **antes** de a linha `pots` ser sobrescrita, se não existir nenhum `pot_history` com `valid_from < início do mês editado`, insere uma entrada **baseline** com os valores ANTIGOS (`name`/`limit_amount` lidos de `pots`) em `valid_from = created_at` do pote. Assim meses passados resolvem para o valor antigo em vez do fallback já alterado. **Deve rodar antes do `UPDATE pots`** (por isso é uma função separada chamada nos call sites, não embutida em `upsertPotHistory` — os 3 sites do NewPotModal atualizam `pots` antes de chamar `upsertPotHistory`, quando o valor antigo já não existiria mais).

### `pot_limit_history` — **código morto (write-only)**

Tabela **antiga** (só `limit_amount`, sem `name`), predecessora de `pot_history`. Migration `20240419_pot_soft_delete_and_history.sql`. Hoje é **apenas escrita** (`NewPotModal` insere no site "atualizar limite"; `profile.tsx` deleta na exclusão de conta) e **nunca lida** em lugar nenhum — `pot_history` a substituiu por completo. Mantida por ora (não removida) para evitar mexer em migration/exclusão de conta sem necessidade; o INSERT em `NewPotModal:222` é redundante.

## Transações

### Cycle filtering

- Crédito: usa `billing_date`
- Todos os outros (incluindo `goal_deposit`): usa `date`
- Non-credit queries: `.in('type', ['expense', 'goal_deposit'])`

### payment_method válidos

`cash` | `debit` | `credit` | `pix` | `transfer` | `voucher_alimentacao` | `voucher_refeicao`  
**Nunca usar `'other'`** — não é válido no DB. Fallback: `'cash'`.

### Parcelamento (crédito)

N rows com `installment_group_id` compartilhado + `billing_date` por mês. `EditTransactionModal` oferece: "Só esta parcela" / "Esta e as seguintes" (`.gte('installment_number', current)`).

No **import de fatura** (`ImportFileModal`), quando a IA detecta "N/T" na linha, as parcelas futuras N+1..T são criadas automaticamente com o mesmo `installment_group_id` (ver `docs/FEATURES.md` → import de extrato).

### `credit_card_cycle_overrides` — exceção pontual de ciclo

Migration `20240509_credit_card_cycle_overrides.sql` (**aplicar manualmente**). Schema: `card_id, user_id, cycle_start (DATE, 1º dia do mês YYYY-MM-01), closing_day (INT null), due_day (INT null)`. `UNIQUE(card_id, cycle_start)`. RLS por `user_id`. `null` num dia = usa o padrão do cartão.

Sobrescreve fechamento/vencimento **só naquele mês**, sem virar o padrão do cartão (fluxo do botão 🗓️ no `CreditCardModal`, separado do "editar" permanente). Lido por `getCardOverridesMap(cardId)` → `Record<YYYY-MM-01, {closing_day?, due_day?}>` e aplicado em `calcBillingDate(..., overrides?)`: `closing_day` do **mês nominal** da compra, `due_day` do **mês final** da fatura. `recalculateInstallmentsForCycle` recalcula (UPDATE) só as parcelas cujo `billing_date` cai no mês afetado.

### `smart_merchants` — aprendizado estabelecimento→pote

Schema: `user_id, name (lowercase), pot_id`. `UNIQUE(user_id, name)`. Alimentada por `upsert` ao salvar gastos com Estabelecimento (`NewExpenseModal` e agora também `EditTransactionModal`). **Lida** por `lib/smart-merchants.ts` (`suggestPotForMerchant`, `getMerchantPotMap`) para pré-selecionar o pote habitual nos modais e no import (ver `docs/FEATURES.md` → Sugestão automática de pote). Antes era write-only.

## Cycle rollovers (`cycle_rollovers`)

Fechamento de ciclo cria um row. `recalculateRollover` recalcula preservando `surplus_action`/`surplus_goal_id`. Rollover key = `getCycle(cycleStart, offset + 1).startISO` (início do próximo ciclo).

## AI tokens (limite por usuário)

Ver `supabase/scripts/grant_ai_tokens.sql` para concessão manual.
