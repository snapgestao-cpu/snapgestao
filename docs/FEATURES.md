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

`AIProvider = 'claude' | 'gemini' | 'groq'`. `callAI(provider, prompt, systemPrompt?)`. Modelos: Claude Haiku (`claude-haiku-4-5-20251001`), Gemini 2.5 Flash, Llama 3.3 70B via Groq. Provider persiste em `useCycleStore.aiProvider` (default `'claude'`). `AIProviderSelector` (`components/AIProviderSelector.tsx`) — 3 radio buttons.

## Mentor Financeiro — `app/mentor.tsx`

Quiz 5 perguntas animado + análise IA + relatório PDF. Intro → quiz → overlay gerando → resultado com "Salvar PDF" / "Compartilhar PDF". `lib/mentor-financeiro.ts`: `coletarContextoFinanceiro()`, `gerarRelatorioMentor()`. PDF via `expo-print` + `expo-sharing`. "Salvar PDF" usa `MediaLibrary.createAssetAsync` + `createAlbumAsync('Download')` — **nunca** `documentDirectory` para salvar PDF.

## Analisador de Preços — `app/analisador-precos.tsx`

Quiz 3 perguntas + análise IA comparando preços por estabelecimento. `lib/analisador-precos.ts`: `buscarDadosParaAnalise()` (só ciclos fechados + atual via `getMesesValidos`), `analisarPrecos()` (itens com 3+ ocorrências, max 15, retorna **string**, não JSON).

## Gamification

`lib/badges.ts`: 10 badges. `checkAndGrantBadgesOnStartup` (startup — cooldown 1h via AsyncStorage `badge_check_{userId}`). `checkAndGrantBadges` (ações explícitas do usuário). `BadgeToast`: fila de slide-in + fadeOut (3s). `app/achievements.tsx`: grid de badges.

## Excel export (`lib/export-excel.ts` + `components/ExportExcelModal.tsx`)

3 queries paralelas (não-crédito, crédito, potes). 1 aba por mês + aba "Resumo". 5 presets: Últimos 3/6 meses, Ano atual/anterior, Personalizado.

## Excel import (`components/ImportFileModal.tsx`)

Steps: pick → preview → card_select → assign → saving → done. Auto-detecta colunas. `saveAll` usa `supabase.auth.getUser()` exclusivamente para `user_id` — prop pode estar stale. **Nunca** inserir a row total para crédito — apenas N rows de parcelas.

## Notificações

Completamente desabilitadas. `lib/notifications.ts` exporta apenas funções async vazias. **Não** adicionar imports de `expo-notifications`.
