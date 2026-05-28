# Relatório de Auditoria de Código — SnapGestão
**Data:** 28/05/2026  
**Versão:** 1.1.0 (versionCode 19)  
**Auditor:** Claude Code (Sonnet 4.6)

---

## Resumo Executivo

| Categoria | Status |
|---|---|
| TypeScript (--noEmit) | ✅ 0 erros |
| Testes automatizados | ✅ 61/61 passando |
| Secrets hardcoded | ✅ Nenhum |
| Variáveis de ambiente | ✅ Corretas |
| Guard de rota | ✅ Correto |
| Segurança (OWASP) | ✅ OK para mobile |
| **Migração de dívidas ausente** | ❌ **Bloqueador** |
| GRANTs ausentes em migrations | ⚠️ Atenção |
| expo-notifications | ✅ Não usado |

**Veredicto:** **Apto para Play Store com uma ação obrigatória** — criar a migration das tabelas `debts` e `debt_transactions` antes de publicar.

---

## 1. TypeScript

```
npx tsc --noEmit → 0 erros
```

Compilação limpa. Nenhum erro de tipos no código de produção.

---

## 2. Testes Automatizados

**61 testes, 6 arquivos — 100% passando**

| Arquivo | Testes | Cobertura |
|---|---|---|
| `__tests__/billing-date.test.ts` | 8 | `calcBillingDate`, `calcBillingDateNoCard` |
| `__tests__/finance.test.ts` | 14 | `brl`, `fmtShort`, `fmtSigned`, `calcFV` |
| `__tests__/plans.test.ts` | 12 | `PLAN_LIMITS`, `isPremium`, `getLimit` |
| `__tests__/ir.test.ts` | 13 | `groupByCategory`, `IR_LIMITS`, `IR_CATEGORY_LABELS` |
| `__tests__/debts.test.ts` | 8 | `calcDebtMonthsRemaining` |
| `__tests__/cycle.test.ts` | 6 | `getCycle`, `isCurrentCycle`, `formatDateShort` |

**Executar:** `npm test`

---

## 3. Auditoria de Fluxos Críticos

### 3.1 Guard de Rota (`app/_layout.tsx`) ✅

Ordem de verificação correta:
1. `!isAuthenticated` → `/login`
2. `!user` (perfil carregando) → aguarda (sem redirect prematuro)
3. `terms_accepted_at IS NULL || terms_version != '1.0'` → `/terms`
4. `!onboarding_completed` → `/onboarding/step1`
5. OK → `/(tabs)/monthly`

**Regra crítica preservada:** `if (!user) return null` antes da verificação de onboarding — evita redirect falso quando `isAuthenticated=true` mas perfil ainda está carregando.

### 3.2 Onboarding — Saldo Inicial (`app/onboarding/step3.tsx`) ✅

- `initialBalance === 0` → **não cria transação** (correto — zero é válido)
- `initialBalance > 0` → `type: 'income'`
- `initialBalance < 0` → `type: 'expense'`, `amount: Math.abs(initialBalance)`
- `onboarding_completed: true` salvo no Supabase

### 3.3 Datas de Crédito — `calcBillingDate` ✅

Única fonte de verdade em `lib/billing-date.ts`. Verificado em:
- `components/NewExpenseModal.tsx` — usa `calcBillingDate`
- `components/EditTransactionModal.tsx` — usa `calcBillingDate`
- `components/TransactionGroup.tsx` — exibe `billing_date` (não recalcula)

**Nenhum recálculo inline de billing_date em outros arquivos.** ✅

### 3.4 Resumo do Ciclo — `computeCycleSummaryFromData` ✅

Única função usada em `monthly.tsx` para calcular saldo do ciclo. `calculateCycleSummary` (async) não é chamada em nenhum lugar do componente Mensal.

### 3.5 `payment_method: 'other'` ✅

Busca por `'other'` no contexto de `payment_method`:
- Encontrado apenas em `income_sources.type` (categoria de receita) — correto
- Nenhum uso como valor de `payment_method` — correto

### 3.6 `canUseIR` — Verificação de Plano ✅

```ts
const canUseIR = user.plan === 'premium' && user.ir_module_enabled
```
- Exige `plan === 'premium'` E `ir_module_enabled === true`
- Usuários free sem `ir_module_enabled` não acessam o módulo

### 3.7 `sanitizeNFCeUrl` ✅

Chamada **apenas** em `app/ocr.tsx`, antes de abrir o WebView. `NFCeWebView` recebe a URL já sanitizada — regra preservada.

### 3.8 Salvamento de PDF ✅

- `lib/gerar-pdf.ts` usa `expo-print` → HTML → `expo-sharing`
- **Nenhum** uso de `documentDirectory` para salvar
- `expo-media-library` usado apenas para assets/fotos — não para PDFs

### 3.9 Provider de IA — `getAIProvider` ✅

```ts
export function getAIProvider(plan: Plan): AIProvider {
  return plan === 'premium' ? 'claude' : 'groq'
}
```
- Free → Groq (Llama 3.3 70B)
- Premium → Claude (Haiku 4.5)
- Gemini desativado no roteamento ativo

### 3.10 IR — Caminho do Recibo ✅

Upload em `${userId}/ir/${transactionId}.jpg` — caminho correto, sem colisão entre usuários.

### 3.11 expo-notifications ✅

Nenhum import de `expo-notifications` encontrado no codebase.

---

## 4. Auditoria de Banco de Dados

### 4.1 ❌ CRÍTICO — Migration de Dívidas Ausente

`lib/debts.ts` usa as tabelas `debts` e `debt_transactions`, mas **nenhuma migration SQL** existe para criá-las.

**Impacto:** Se o banco de dados for recriado ou migrado para outro ambiente, as tabelas não serão criadas automaticamente. O módulo de dívidas falhará silenciosamente (queries retornam vazio em vez de erro em alguns casos).

**Ação obrigatória:** Criar `supabase/migrations/20240508_debts.sql`:

```sql
-- Tabela de dívidas
CREATE TABLE IF NOT EXISTS public.debts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly_payment NUMERIC(12,2),
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "debts: users see own" ON public.debts
  FOR ALL USING (auth.uid() = user_id);

GRANT ALL ON public.debts TO anon, authenticated;

-- Tabela de transações de dívidas
CREATE TABLE IF NOT EXISTS public.debt_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  debt_id UUID NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('payment_external', 'payment_from_cycle')),
  amount NUMERIC(12,2) NOT NULL,
  description TEXT,
  cycle_year INTEGER,
  cycle_month INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.debt_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "debt_transactions: users see own" ON public.debt_transactions
  FOR ALL USING (auth.uid() = user_id);

GRANT ALL ON public.debt_transactions TO anon, authenticated;
```

### 4.2 ⚠️ GRANTs Ausentes em Migrations

As migrations a seguir têm RLS e políticas mas **não têm** `GRANT ALL ON ... TO anon, authenticated`:

| Migration | Tabelas |
|---|---|
| `20240501_scheduled_transactions.sql` | `scheduled_transactions`, `scheduled_transaction_months` |
| `20240503_income_source_history.sql` | `income_source_history` |
| `20240504_emergency_reserve.sql` | `emergency_reserve`, `emergency_reserve_transactions` |
| `20240505_goal_transactions.sql` | `goal_transactions` |

**Impacto atual:** As tabelas provavelmente já estão funcionando porque foram criadas com GRANT ou através de um projeto Supabase que aplica GRANTs implicitamente. O risco é numa recriação do banco — as políticas existem mas as permissões de acesso podem não estar explícitas.

**Ação recomendada:** Adicionar GRANTs nas migrations citadas ou criar uma migration de fixup:

```sql
GRANT ALL ON public.scheduled_transactions TO anon, authenticated;
GRANT ALL ON public.scheduled_transaction_months TO anon, authenticated;
GRANT ALL ON public.income_source_history TO anon, authenticated;
GRANT ALL ON public.emergency_reserve TO anon, authenticated;
GRANT ALL ON public.emergency_reserve_transactions TO anon, authenticated;
GRANT ALL ON public.goal_transactions TO anon, authenticated;
```

### 4.3 Verificação de Índices

Índices críticos confirmados ou implícitos por chave primária/FK:
- `transactions(user_id, date)` — queries de ciclo
- `transactions(user_id, billing_date)` — crédito
- `pot_history(pot_id, valid_from)` — histórico de potes
- `income_source_history(income_source_id, valid_from)` — histórico de receita

Não foi encontrada uma migration explícita de índices compostos. Para produção com volume alto, considerar:

```sql
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_user_billing ON transactions(user_id, billing_date);
```

### 4.4 Coluna `users.plan` ✅

Coluna existente no tipo `User` do TypeScript (`plan: 'free' | 'premium'`). O CLAUDE.md documenta que para promover usuários basta:
```sql
UPDATE public.users SET plan = 'premium' WHERE id = '...';
```

---

## 5. Chamadas Diretas ao Supabase fora de `lib/`

### 5.1 Exceções documentadas (corretas) ✅

Conforme CLAUDE.md, os seguintes arquivos podem chamar `supabase` diretamente:
- `lib/supabase.ts`
- `lib/ai-provider.ts`
- `stores/useAuthStore.ts`
- `app/onboarding/step3.tsx`
- `app/(tabs)/index.tsx`

### 5.2 Chamadas não documentadas (aceitáveis em analytics) ⚠️

Arquivos que consultam `supabase` diretamente sem passar por `lib/`:

| Arquivo | Contexto | Risco |
|---|---|---|
| `app/(tabs)/goals.tsx` | Carrega goals, debts, reserve | Baixo — UI de alto nível |
| `app/(tabs)/monthly.tsx` | Histórico de rollovers | Baixo |
| `app/(tabs)/profile.tsx` | Exclusão de conta, avatar | Baixo |
| `app/(tabs)/projection.tsx` | Dados de projeção | Baixo |
| `app/achievements.tsx` | Badges/conquistas | Baixo |
| `app/mentor.tsx` | Mentor financeiro | Baixo |
| `app/analisador-precos.tsx` | Análise de preços | Baixo |
| `app/ocr.tsx` | Salva transações do cupom | Baixo |
| `app/pot/[id].tsx` | Detalhes do pote | Baixo |
| `components/CreditCardModal.tsx` | CRUD de cartões | Baixo |
| `components/EditTransactionModal.tsx` | Edição de transação | Baixo |
| `components/IncomeSourcesModal.tsx` | CRUD de fontes | Baixo |
| `components/NewExpenseModal.tsx` | Nova despesa | Baixo |
| `components/NewGoalModal.tsx` | Nova meta | Baixo |
| `components/NewIncomeModal.tsx` | Nova receita | Baixo |
| `components/NewPotModal.tsx` | Novo pote | Baixo |
| `components/ImportFileModal.tsx` | Importação | Baixo |
| `components/TransactionGroup.tsx` | Delete de transação | Baixo |
| `components/GoalDepositModal.tsx` | Depósito de meta | Baixo |

**Impacto:** Nenhum risco de segurança — RLS garante que cada usuário acessa apenas seus dados. A fragmentação das queries dificulta manutenção mas não impede a publicação.

### 5.3 Potes sem `lib/pot-history.ts` em analytics ⚠️

Três arquivos usam `.is('deleted_at', null)` sem passar por `lib/pot-history.ts`:
- `lib/charts-data.ts`
- `lib/badges.ts`
- `lib/mentor-financeiro.ts`

**Contexto:** São consultas de analytics/relatórios que não exibem potes na UI — não afetam a navegação do usuário. Aceitável, mas deve ser documentado.

---

## 6. Segurança

### 6.1 Secrets ✅

| Verificação | Resultado |
|---|---|
| `sk-ant-*` hardcoded | ✅ Nenhum |
| `anon_key` hardcoded | ✅ Nenhuma |
| JWT tokens hardcoded | ✅ Nenhum |
| `process.env` exposto | ✅ Apenas `EXPO_PUBLIC_*` via Metro |

### 6.2 Injeção de SQL ✅

Todas as queries usam o cliente Supabase com parâmetros — sem concatenação de strings SQL.

### 6.3 XSS ✅

NFCeWebView renderiza apenas URLs de NFC-e sanitizadas via `sanitizeNFCeUrl`. Sem `dangerouslySetInnerHTML` ou injection de HTML arbitrário.

### 6.4 LGPD ✅

- Termos de Uso e Política de Privacidade implementados
- Aceite registrado com timestamp e versão
- Exclusão de conta apaga todos os dados em cascata

---

## 7. Checklist Play Store

| Item | Status | Detalhe |
|---|---|---|
| `versionCode` monotônico | ✅ | 19 (anterior: 18) |
| `version` semântica | ✅ | 1.1.0 |
| `package` único | ✅ | `com.snapgestao.app` |
| Permissões declaradas | ✅ | Câmera, mídia, vibração |
| Sem `expo-notifications` | ✅ | Desabilitado conforme decisão |
| Sem debug logs vazados | ✅ | Build de release sem `__DEV__` |
| Sem URLs http:// hardcoded | ✅ | Supabase usa https |
| Migration de dívidas | ❌ | **Criar antes de publicar** |
| Testes passando | ✅ | 61/61 |
| TypeScript sem erros | ✅ | `tsc --noEmit` limpo |

---

## 8. Ações por Prioridade

### 🔴 Obrigatória antes da publicação

1. **Criar migration de dívidas** — `supabase/migrations/20240508_debts.sql`  
   Schema em §4.1. Aplicar via `supabase db push` ou MCP.

### 🟡 Recomendadas antes da publicação

2. **Aplicar GRANTs faltantes** — migrations 20240501, 20240503, 20240504, 20240505  
   Adicionar `GRANT ALL ON ... TO anon, authenticated` em cada uma.

3. **Criar índices compostos** — `idx_transactions_user_date`, `idx_transactions_user_billing`  
   Importante para usuários com histórico longo (>200 transações).

### 🟢 Pós-publicação (não bloqueiam)

4. **Mover queries de componentes para `lib/`** — reduz duplicação, facilita manutenção.

5. **Documentar exceção de `.is('deleted_at', null)` em analytics** — clareza no CLAUDE.md.

6. **Aumentar cobertura de testes** — adicionar testes para `lib/goal-transactions.ts`, `lib/emergency-reserve.ts`, `lib/scheduled-transactions.ts`.
