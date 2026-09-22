# Features

## Auth

Login, register, session restore, logout. Recovery de token inválido: stale tokens são apagados e usuário é redirecionado ao login sem loop.

## Onboarding (3 steps)

Wizard: saldo/moeda → ciclo/fontes de renda → primeiro pote. Roda quando `!user.onboarding_completed` ou row `users` ausente.

**Nunca** usar `initial_balance === 0` como guard — saldo zero é válido e causaria loop infinito.

Step 1: saldo inicial **opcional** (pode ser zero ou negativo). Step 3: se `draft.balance !== 0`, cria `transaction` no ciclo atual (`type: 'income'/'expense'`, `description: 'Saldo inicial'`, `payment_method: 'transfer'`).

## Potes (dashboard) — `app/(tabs)/index.tsx`

Grid filtrado por `created_at <= cycle.end`, ordenado por `created_at`. Emergency pot como footer card separado. Pull-to-refresh. Income total de `income_sources.amount` (não de transactions).

## Detalhe do pote — `app/pot/[id].tsx`

JarPot 150px + botões despesa/receita + lista agrupada de transações. Duas queries paralelas: não-crédito por `date`, crédito por `billing_date`. Parcelas de meses anteriores mostram badge 🛍️ com data da compra e número da parcela.

## JarPot (`components/JarPot.tsx`)

Visualização PNG de preenchimento: `assets/potes/Pote_vazio.png`, `Pote_10/30/50/70/90/100.png`. Sempre importar como named: `import { JarPot } from '...'`.

## NewPotModal (`components/NewPotModal.tsx`)

Create e edit. `POT_COLORS` (12 cores) exportado daqui. Emergency pot toggle (roxo `#534AB7`). Retroactive: `cycleStartDate?` + `isRetroactive?`. Duplicate prevention com Reativar/Atualizar alerts. `onBadges?: (badges) => void` para retornar badges ao parent.

## Mensal — `app/(tabs)/monthly.tsx`

Navegação por ciclo com `offset`. Summary: base income + extra income + rollover anterior − despesas = saldo. Dois alerts separados: vermelho (déficit) e âmbar (pote excedeu limite). "Encerrar ciclo" cascateia `recalculateRollover`. Duas queries paralelas (não-crédito por `date`, crédito por `billing_date`). `.limit(200)` nas queries de transação.

**Nunca** chamar `calculateCycleSummary` de `monthly.tsx` — usa `computeCycleSummaryFromData` (síncrono, zero queries).

**Despesas "Sem pote"**: `totalExpense` soma TODAS as despesas (inclusive `pot_id` null), mas `potSummaries` só tem entrada por pote existente — logo a linha TOTAL da grade não batia com a soma das linhas visíveis quando havia gasto sem pote. `CycleSummary.unassignedExpense` (calculado em **ambas** `computeCycleSummaryFromData` e `calculateCycleSummary` de `lib/cycleClose.ts`) expõe a soma das despesas com `pot_id` null, garantindo `Σ potSummaries[].spent + unassignedExpense === totalExpense`. A tela Mensal renderiza uma linha/card **"Sem pote"** (Gasto = `unassignedExpense`, Saldo = `−unassignedExpense`, sem Orçado) **só quando `> 0`**, nas duas views (Tabela e Cards), e o TOTAL de Saldo subtrai esse valor para reconciliar. O guard da seção Potes é `potSummaries.length > 0 || unassignedExpense > 0` — assim a grade aparece mesmo com **zero potes** quando há gasto sem pote (única linha/card "Sem pote"; TOTAL = essa linha). Mesmo tratamento em `lib/mentor-financeiro.ts` (`coletarContextoFinanceiro` adiciona "Sem pote" a `potes`) e no donut de `lib/charts-data.ts` (`getExpensesByPot` adiciona fatia "Sem pote"). `export-excel.ts` (potName vazio por linha) e o grid de potes do Dashboard (sem linha TOTAL) **não** têm a lacuna — não alterados.

## Projeção — `app/(tabs)/projection.tsx`

Sempre 13 rows. Meses passados: dinâmico, até 3 consecutivos com dados reais (para no primeiro gap). Recarrega em todo focus via `useFocusEffect`. Meses futuros: `totalBudgeted` (soma dos limites de potes via `potsPorMes[offset]`) + excedente de parcelas de crédito + lançamentos reais já registrados. `potsPorMes` preenchido por `getPotsHistoryBatch` com offsets −6 a +12.

## Metas — `app/(tabs)/goals.tsx`

Metas de longo prazo com simulação de juros compostos. `horizon_years` como decimal (1.5 = 1 ano 6 meses). `GoalDepositModal` aceita pote ou "saldo livre". Top 3 cards mostram meta mais urgente.

## Perfil — `app/(tabs)/profile.tsx`

Edição de ciclo, fontes de renda, cartões de crédito, export Excel, export IR CSV, limpar dados, logout.

## OCR / NFC-e — `app/ocr.tsx`

**Path 1 — QR Code → SEFAZ** (recomendado): `QRCameraScanner` → `extractStateCode()` → `extractChaveAcesso()` → estados não suportados mostram Alert → `sanitizeNFCeUrl()` (chamado **uma vez** aqui, nunca dentro de `NFCeWebView`) → `NFCeWebView`. Suporta RJ (33), SP (35), MG (31).

**Path 2 — OCR** (fallback): foto via `expo-image-picker` → base64 → Edge Function `process-receipt` → Google Vision.

Ambos convergem no step `review`. Entry points: FAB do Mensal (`cycleDate`), detalhe do pote (`defaultPotId`, `defaultPotName`, `cycleDate`).

### Review step

`ReviewItem`: `{ id, name, valueCents: number, quantity, unit, potId }`. Valores em centavos inteiros. Seletor de pote global (card azul aplica pote em todos os itens). Payment method pré-preenchido do resultado NFC-e, editável via chips. Crédito: carrega cartões, seletor de cartão, toggle de parcelamento 2–24x.

### NFCeWebView (`components/NFCeWebView.tsx`)

URL já sanitizada pelo caller. Guards: `scriptInjectedRef`, `loadEndTimerRef` (1s delay), `finalUrlRef`, `sawRedirectRef`. `tentativaAlternativa`: em timeout, tenta `buildChaveAcessoUrl`. EXTRACT_SCRIPT: polling interno (`tryExtract`, até 15 × 1s) — necessário porque SEFAZ-RJ usa jQuery Mobile que renderiza após o `onload` nativo.

### NFC-e states (`lib/nfce-states.ts`)

Para adicionar novo estado: inserir entry em `NFCE_STATES` com `code`, `portalUrl`, `isFinalUrl()`, `isRedirectUrl()`.

## AI Provider (`lib/ai-provider.ts`)

`AIProvider = 'claude' | 'groq'` (Gemini desabilitado). `callAI(provider, prompt, systemPrompt?)`. Modelos: Claude Haiku (`claude-haiku-4-5-20251001`, Premium) e `openai/gpt-oss-120b` via Groq (Free — rotulado "IA Groq"). Provider persiste em `useCycleStore.aiProvider` (default `'claude'`). `AIProviderSelector` (`components/AIProviderSelector.tsx`) renderiza a partir de `AI_PROVIDERS`. **Histórico**: o Groq usava `llama-3.3-70b-versatile`, descontinuado pela Groq em 16/08/2026 → migrado para `openai/gpt-oss-120b` (mesmo contexto de 131k, recomendação oficial da Groq).

## Mentor Financeiro — `app/mentor.tsx`

Quiz 5 perguntas animado + análise IA + relatório PDF. Intro → quiz → overlay gerando → resultado com "Salvar PDF" / "Compartilhar PDF". `lib/mentor-financeiro.ts`: `coletarContextoFinanceiro()`, `gerarRelatorioMentor()`. PDF via `expo-print` + `expo-sharing`. "Salvar PDF" usa `MediaLibrary.createAssetAsync` + `createAlbumAsync('Download')` — **nunca** `documentDirectory` para salvar PDF.

**Prompt (`gerarRelatorioMentor`)**:
- **Mesmo prompt e system prompt para os dois providers** (Claude/Groq) — não há mais divergência (antes só o Groq recebia um bloco extra "INSTRUÇÕES CRÍTICAS" que ainda contradizia o system prompt limitando a "3 itens por seção"). As instruções de estilo (2ª pessoa, tom de consultor pessoal, valores reais em R$, ações concretas, emojis) vivem no `MENTOR_SYSTEM_PROMPT` e valem sempre.
- **Tom dinâmico** (`buildToneInstruction`, injetado no system prompt): deriva de `respostas.tom.opcao` — `direto` → econômico e direto ao ponto; `detalhado` → números e comparações a cada afirmação; `motivador` → encorajador. Muda de fato o texto gerado, não é só um dado no prompt.
- **Empatia em situação delicada**: quando `ctx.totalPoupado <= 0` OU `respostas.objetivo.opcao` é `negativo`/`dividas`, o tom vira empático e prático (reconhece a realidade sem minimizar com "parabéns/continue assim" e sem alarmismo) — sobrepõe o "motivador" pra não soar deslocado pra quem está no vermelho.
- **Anti-alucinação**: o system prompt proíbe inventar/estimar valores em R$ que não estejam nos dados do prompt; se faltar dado, o relatório diz isso em vez de supor um número.
- **Nota educativa** ao final: todo relatório encerra com uma linha em itálico deixando claro que é conteúdo educativo gerado por IA, não aconselhamento financeiro profissional.

## Analisador de Preços — `app/analisador-precos.tsx`

Quiz 3 perguntas + análise IA comparando preços por estabelecimento. `lib/analisador-precos.ts`: `buscarDadosParaAnalise()` (só ciclos fechados + atual via `getMesesValidos`), `analisarPrecos()` (itens com 3+ ocorrências, max 15, retorna **string**, não JSON).

## Sugestão automática de pote (`lib/smart-merchants.ts`)

A tabela `smart_merchants` (colunas reais: `merchant_name`, `default_pot_id`, `usage_count`, `last_used`) é **lida** para pré-selecionar o pote habitual do estabelecimento.

⚠️ **Bug corrigido**: o código usava `name`/`pot_id` (colunas inexistentes) → escrita e leitura falhavam **silenciosamente**; a sugestão nunca funcionou. Corrigido para os nomes reais + tratamento de erro (`console.warn`) em todos os pontos.

- **Limiar de 2 usos**: `suggestPotForMerchant` / `getMerchantPotMap` só retornam sugestão quando `usage_count >= 2`. Um estabelecimento usado uma única vez (typo ou pote escolhido por engano) **não** vira sugestão sozinho — precisa de 2 usos consistentes.
- **Coleta** (`recordMerchantUsage`, ao salvar em `NewExpenseModal` **e** `EditTransactionModal`): SELECT-antes-de-escrever (sem depender de constraint UNIQUE) — insere na 1ª vez (`usage_count=1`), depois incrementa `usage_count`, atualiza `last_used` (hoje) e grava o `default_pot_id` escolhido.
- **`NewExpenseModal`**: debounce 500ms ao digitar o Estabelecimento → se houver sugestão que exista em `pots` e o usuário ainda **não** mexeu no seletor (`potTouchedRef`), pré-seleciona e mostra label "✨ sugerido". Tocar num chip trava a sugestão.
- **`EditTransactionModal`**: mesma lógica, mas só sugere quando o merchant é **trocado** em relação ao original (não sobrescreve o pote já salvo ao abrir).
- **`ImportFileModal` (assign)**: ao entrar no `assign` (`enterAssign`), pré-preenche o pote de cada linha com merchant e **sem** pote via `getMerchantPotMap` (1 query, em memória). Não sobrescreve pote já resolvido (poteName do Excel).

## Alerta reativo por lançamento notável (`lib/transaction-insights.ts`)

Depois de salvar um gasto (`NewExpenseModal`/`EditTransactionModal`, não-bloqueante), avalia se o lançamento é "notável" e, só nesse caso, gera **uma frase** curta via IA.

- **Determinístico primeiro (grátis)**: `detectThresholdCrossing` (o gasto cruzou 80% ou 100% do limite do pote no ciclo — % antes vs. depois, reaproveitando o padrão de gasto por pote de `cycleClose`) e `isAmountOutlier` (> 2,5× a média dos últimos lançamentos do mesmo estabelecimento ou pote, só com **3+** anteriores). Nada notável → retorna `null` **sem chamar IA** (maioria dos casos). Ambos exportados e cobertos por testes.
- **IA só quando notável**: prompt curto com os valores reais em R$ + `systemPrompt` anti-alucinação (mesma trava do Mentor: nunca inventar números fora do prompt). Provider por plano (`getAIProvider`).
- **Guard de custo**: máx **5 chamadas de IA/dia** por usuário (`AsyncStorage` `ai_insight_count_<YYYY-MM-DD>`, reseta ao virar o dia). Estourou → `null` sem IA (a checagem determinística continua). **Não** consome a cota mensal de `ai_tokens` (essa é dos relatórios completos).
- **Exibição**: `<InsightToast>` global no `_layout` alimentado por `useInsightStore` (mesmo padrão do `BadgeToast` global; toque fecha, some em 6s).
- **Fora de escopo**: import em massa (`ImportFileModal.saveAll`) — rodaria por linha, gerando custo/ruído; e parcelamentos (valor dividido em vários meses).

## Resumo semanal — "check-in do CFO" (`lib/weekly-insight.ts`)

Camada 2 da IA: resumo curto (3-5 frases) da semana, exibido num card **"Resumo da Semana"** ACIMA do radar de score na sub-aba **🤖 IA** de Gráficos (`TopicIA` em `charts.tsx`). Disponível para **Free e Premium** na mesma cadência (semanal).

- **`getOrGenerateWeeklyInsight(userId, plan, cycleStart)`**: semana = **segunda a domingo do calendário** (`mondayOfWeek`, independente do `cycle_start`). Primeiro checa cache em `weekly_insights` (`week_start` = segunda desta semana) — se existe, retorna o `content` **sem chamar IA**. Senão, agrega a semana (total gasto, top 3 potes, top 3 estabelecimentos, comparação % com a semana anterior — mesmo padrão de agregação do Mentor), gera via `callAI` (prompt com valores reais em R$ + trava anti-alucinação), **salva** (insert) e retorna.
- **Custo**: o próprio cache (`UNIQUE(user_id, week_start)`) limita a **1 chamada de IA por usuário por semana**; refocus reaproveita o cache. **Não** consome a cota de `ai_tokens` (chama `callAI` direto, como a Camada 1).
- **Robustez**: toda chamada a `weekly_insights` trata `{ error }` com `console.warn` (lição do bug `smart_merchants`). Sem gastos na semana ou falha de IA/banco → retorna `''` e o card mostra estado vazio discreto, sem quebrar a aba. Reaproveita o lazy-load (`isActive`) + `useRefetchOnFocus` do tópico (não cria carregamento paralelo).
- **Puro/testável**: `mondayOfWeek`, `addDaysISO`, `weekRangeFromMonday`, `pctChange`, `formatWeekLabel`, `buildWeeklyPrompt` são exportadas e cobertas por testes.
- **Migration**: `supabase/migrations/20260922_weekly_insights.sql` — **aplicar manualmente no DEV** antes de testar.

## Gamification

`lib/badges.ts`: 10 badges. `checkAndGrantBadgesOnStartup` (startup — cooldown 1h via AsyncStorage `badge_check_{userId}`). `checkAndGrantBadges` (ações explícitas do usuário). `BadgeToast`: fila de slide-in + fadeOut (3s). `app/achievements.tsx`: grid de badges.

## Excel export (`lib/export-excel.ts` + `components/ExportExcelModal.tsx`)

3 queries paralelas (não-crédito, crédito, potes). 1 aba por mês + aba "Resumo". 5 presets: Últimos 3/6 meses, Ano atual/anterior, Personalizado.

## Excel import (`components/ImportFileModal.tsx`)

Steps: pick → preview → card_select → assign → saving → done. Auto-detecta colunas. `saveAll` usa `supabase.auth.getUser()` exclusivamente para `user_id` — prop pode estar stale. **Nunca** inserir a row total para crédito — apenas N rows de parcelas.

O step `pick` tem um segmented control: **Planilha Excel** (padrão) | **Extrato Bancário (PDF)** (`importMode`). No modo PDF o usuário só escolhe o tipo (débito/crédito) e o arquivo; do `preview` em diante o fluxo é 100% reaproveitado do import de Excel.

## Import de extrato bancário (PDF) — via IA

Segundo modo do `ImportFileModal` (**Premium**). Converte um extrato/fatura em PDF em `ImportRow`s, que seguem o mesmo fluxo de preview/atribuição de pote do import de Excel.

**Extração via IA (Gemini)** — `lib/bank-statement-ai.ts` → `extractBankStatementWithGemini(base64Pdf, statementType)`:
- Manda o PDF pro Gemini via `inline_data` (`mime_type: 'application/pdf'`), client-side com `EXPO_PUBLIC_GEMINI_API_KEY` — mesmo padrão de `lib/ocr-gemini.ts`. **Não** usa Edge Function nem biblioteca de extração de texto. `maxOutputTokens: 65536` + `responseMimeType: 'application/json'`. Retry em 503/429 (modelo sobrecarregado).
- **Chunking por página** (`pdf-lib`): mandar o PDF inteiro numa chamada dava timeout e perdia lançamentos em extratos grandes. Documentos com > `CHUNK_SIZE_PAGES` (3) páginas são divididos em blocos de até 3 páginas, uma chamada Gemini por bloco **em paralelo** (`Promise.all`, timeout 90s/bloco), e o resultado é mesclado. Documentos ≤ 3 páginas vão em 1 chamada só (timeout 180s). Merge: `transactions` concatenadas na ordem dos blocos; `bank` = 1º não-nulo; `declaredTotal` = valor do **último bloco** que retornou (saldo/total final aparece perto do fim) — candidatos divergentes são logados. Se **qualquer bloco falhar** (mesmo após retries), a extração inteira falha com erro nomeando o intervalo de páginas (ex: "Falha ao ler páginas 7-9…") — nunca silencia lançamentos faltantes. As mensagens de **timeout** (AbortError) e **MAX_TOKENS** orientam o usuário a **exportar um período menor no banco (1 a 2 meses por vez) e importar cada período separadamente**, em vez de só "tente novamente". A mensagem chega legível no Alert de `pickBankPDF` (`e?.message`).
- Não há seleção nem lógica por banco — o modelo lê qualquer layout. O banco é só **identificado** (campo `bank`, informativo, exibido no preview).
- Retorna `{ bank, declaredTotal, transactions[] }`. Cada txn: `date` (DD/MM/AAAA), `description`/`merchant`, `amount`, `type`, `paymentMethod` (`pix`|`debit`|`credit`|`transfer`|`cash`), `installmentTotal` sempre `1`, e `isCreditCardBillPayment`.
- **Parcelas de crédito**: o prompt anexa `(N/T)` à description e mantém `installmentTotal: 1` (parcela já cobrada no mês — não é compra nova a parcelar no app).
- **Exclusão automática**: linhas de "pagamento da fatura anterior via débito em conta" dentro da própria fatura (ex: `PAGTO POR DEB EM C/C`) nunca entram no retorno.

**Fluxo no `ImportFileModal`**:
- **Gating Premium**: no modo PDF, usuário Free vê `PaywallBanner` (upgrade → `/premium`); só Premium acessa. Mesmo padrão de IR/Export Excel.
- **Conferência de total**: soma os lançamentos (respeitando `type`) e compara com `declaredTotal`. Só para **crédito** (fatura = compras − estornos; no débito o "total" é saldo final, não a soma). Divergência > R$0,05 → Alert de aviso, **sem bloquear** a importação.
- **Pagamento de fatura de cartão** (`isCreditCardBillPayment: true`, ex: `GASTOS CARTAO DE CREDITO` no extrato de débito): antes do preview, Alert com botões **diretos sobre a ação** (não pergunta indireta) — **"Excluir esse valor da importação"** (remove essas linhas, evita duplicar os gastos que já entram pela fatura) ou **"Incluir mesmo assim"** (mantém como `transfer`). A partição usa o helper puro `partitionBillPayments(transactions)` em `lib/bank-statement-ai.ts` (testado em `__tests__/bank-statement-ai.test.ts`); `pickBankPDF` loga as contagens antes/depois do filtro (removido no APK release por `transform-remove-console`).
- **Não é duplicidade** importar o extrato de **débito** (excluindo o pagamento agregado da fatura) e **depois** a **fatura de crédito** correspondente: os itens da fatura são compras individuais que ainda não existiam no app — devem aparecer normalmente. A exclusão evita duplicar apenas a **linha agregada** de pagamento da fatura no extrato de débito, não os gastos detalhados.
- **Parcelamento detectado → cria parcelas futuras** (`lib/installment-expansion.ts`): a IA extrai `installmentNumber`/`installmentTotalDetected` do sufixo "N/T" (ex: "4/12") — conceitos separados de `installmentTotal` (sempre 1). Quando `installmentTotalDetected > installmentNumber` e é crédito, o import expande a compra na parcela atual (âncora) **+ as futuras restantes** (N+1..T), mesmo valor, `installment_group_id` compartilhado, `billing_date` de cada uma calculado via `calcBillingDate` com o offset relativo (a futura *k* fica *k−N* ciclos à frente da atual — independe de a data da linha ser a compra original ou a do período). **Sequência (ponto delicado)**: a expansão só roda **ao entrar no step `assign`** (`enterAssign`), depois do `card_select`, porque precisa do `selectedCard`; a extração/prévia continua antes da escolha do cartão. É **idempotente** (reexpande a partir das âncoras, removendo futuras sintéticas de uma passada anterior — voltar e re-selecionar cartão não duplica). Todas as linhas (atual + futuras) passam pela tela de **assign** para revisão antes de confirmar.
- **Dedup de parcelas futuras**: antes de criar cada futura, checa em `transactions` se já existe lançamento com mesmo `card_id` + `merchant` + `amount` no mesmo mês do `billing_date` (uma query, chaves em memória). Se existir, **pula só aquela parcela** (não para a importação) e acumula aviso "N parcela(s) futura(s) já existiam e não foram duplicadas" na tela de assign. A parcela **atual** (âncora) nunca é deduplicada.

### Override pontual de fechamento/vencimento por ciclo

Para cartões cujo fechamento/vencimento **varia mês a mês** (exceção pontual, sem um novo padrão fixo). Fluxo **separado** do "editar cartão" (que continua sendo mudança **permanente** via `recalculateFutureInstallments`).

- **UI**: botão 🗓️ "Ajustar este ciclo" na listagem do `CreditCardModal`, ao lado de editar/excluir → modal pequeno com seletor de mês + campos fechamento/vencimento (placeholder = padrão do cartão; em branco = mantém o padrão). Salva em `credit_card_cycle_overrides` e recalcula (**UPDATE**, não delete+insert) **só as parcelas do cartão cujo `billing_date` cai no mês afetado** (`recalculateInstallmentsForCycle`), sem tocar no `closing_day`/`due_day` do cartão.
- **`calcBillingDate(txISO, card, offset, overrides?)`**: 4º parâmetro opcional (`CycleOverridesMap` keyed por `YYYY-MM-01`). `closing_day` é lido do override do **mês nominal da compra** (decide em que ciclo a compra cai); `due_day` do override do **mês final da fatura** (só o dia da data final) — são dois lookups em meses possivelmente diferentes. A relação estrutural `due_day < closing_day` continua usando os dias **padrão** do cartão. Sem override para o mês → comportamento idêntico ao original. Carregado via `getCardOverridesMap(cardId)` e passado nos callers que calculam billing de parcelas: `ImportFileModal`, `NewExpenseModal`, `EditTransactionModal`.
- **Migration**: `supabase/migrations/20240509_credit_card_cycle_overrides.sql` — **aplicar manualmente** (migrations não são auto-aplicadas).

**Lição aprendida — por que abandonamos o parser determinístico por banco**: a 1ª versão usava regex por banco numa Edge Function (`parse-bank-statement`) com `unpdf` extraindo texto. Problemas: (1) **manutenção por banco/layout** — cada banco (e cada mudança de layout) exigia novos regexes; (2) **fragilidade de extração** — o parser dependia de o `unpdf` preservar quebras de linha (`\n`), e uma diferença de versão da lib (0.12.1 deployado × 1.8.1 testado) trocou `\n` por espaços, zerando o parsing em produção sem erro visível. A extração via IA elimina os dois: sem código por banco e sem depender de whitespace de biblioteca. Custo: N chamadas de IA por import (1 por bloco, em paralelo — aceitável, é Premium e ação pontual). A Edge Function `parse-bank-statement`, `constants/banks.ts`, `lib/bank-statement-import.ts` e os testes de parser foram **removidos**.

**Validação (PDFs reais Bradesco)**: o chunking resolveu o **timeout do débito** — extrato de 18 páginas / ~245 lançamentos agora completa em ~69s (6 blocos paralelos), antes dava timeout numa chamada única. `declaredTotal` é lido corretamente. **Ressalva de precisão**: a IA ainda não é determinística no nível de linha — a soma dos lançamentos pode divergir do total impresso (na fatura de crédito o `net` fica ~R$500 acima e o estorno pode ser perdido). Por isso a **conferência de total avisa** e o **preview permite revisão manual** antes de salvar. O chunking ajuda documentos grandes (timeout + cobertura), mas não corrige a alucinação do modelo em documentos pequenos.

## Notificações

Completamente desabilitadas. `lib/notifications.ts` exporta apenas funções async vazias. **Não** adicionar imports de `expo-notifications`.
