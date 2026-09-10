# Changelog

Histórico resumido de releases. Notas completas por build (com APK) ficam nas
[Releases do GitHub](https://github.com/snapgestao-cpu/snapgestao/releases).
Builds ≤ 33 estão documentados apenas nas Releases do GitHub.

## v1.1.2 (build 34) — prerelease

**Importação de extrato bancário em PDF via IA (Premium)** — novo modo no
`ImportFileModal`, ao lado do Excel. O PDF (extrato de débito ou fatura de
crédito) é enviado ao Gemini, que extrai os lançamentos; sem parser por banco.
- Chunking por página (`pdf-lib`): PDFs > 3 páginas são divididos em blocos e
  processados em paralelo — resolve timeout/perda de linhas em extratos grandes.
- Conferência de total: soma dos lançamentos vs. total declarado (avisa, não bloqueia).
- Detecção de pagamento de fatura de cartão (evita lançar o gasto em dobro).
- Gating Premium (paywall para o plano Free).

**Mentor Financeiro** — mesmo prompt para Claude e Groq; tom dinâmico conforme a
preferência (direto/detalhado/motivador); tom empático quando saldo negativo ou
foco em dívidas; trava anti-alucinação de valores; nota educativa ao final.

**IA do plano gratuito (Groq)** — modelo migrado de `llama-3.3-70b-versatile`
(descontinuado pela Groq em 16/08/2026) para `openai/gpt-oss-120b`; corrige o
Mentor Financeiro e o Analisador de Preços no plano Free.
