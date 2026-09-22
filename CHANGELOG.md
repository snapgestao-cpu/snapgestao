# Changelog

Histórico resumido de releases. Notas completas por build (com APK) ficam nas
[Releases do GitHub](https://github.com/snapgestao-cpu/snapgestao/releases).
Builds ≤ 33 estão documentados apenas nas Releases do GitHub.

## v1.1.5 (build 37) — prerelease

**IA**
- **Nova aba 🤖 IA** (hub): reúne o resumo semanal ("check-in do CFO"), o chat "Fale com seu CFO" e atalhos para o Mentor Financeiro e o Analisador de Preços.
- **Chat "Fale com seu CFO"** (somente leitura): pergunte sobre seus gastos, potes e preços — o assistente responde com base **nos seus dados** (nunca de outros usuários). Free e Premium, com limite diário de mensagens próprio (não consome a cota dos relatórios de IA).
- **Busca na internet no chat (Premium)**: com limite diário **próprio e separado** (5/dia) — perguntas sobre seus dados não gastam essa cota; ao esgotar, o chat continua respondendo normalmente sem internet. Conteúdo de páginas buscadas é tratado só como referência, nunca como instrução.
- **Check-in da semana** também aparece no topo da sub-aba 🤖 IA de Gráficos; some quando não há dado da semana.

**Nota técnica**: sem migration nova nesta versão.

## v1.1.4 (build 36) — prerelease

**Correções**
- **Sugestão automática de pote** (`smart_merchants`): o código usava nomes de coluna inexistentes no banco real (`name`/`pot_id` em vez de `merchant_name`/`default_pot_id`) — a sugestão **nunca funcionou**, falhando em silêncio desde que foi escrita. Corrigido, agora com tratamento de erro visível (`console.warn`) em todos os pontos e um **limiar de 2 usos** antes de sugerir (evita "engessar" um pote escolhido por engano num único lançamento).

**IA**
- **Novo: resumo semanal automático ("check-in do CFO")** — card no topo da aba Gráficos → sub-aba 🤖 IA. Gerado 1x por semana (segunda a domingo) com o gasto da semana, principais potes/estabelecimentos e comparação com a semana anterior. Disponível nos dois planos (Free e Premium), **sem** consumir a cota mensal de relatórios de IA.

**Nota técnica**: nova tabela `weekly_insights` (migration `20260922`) — cacheia o resumo (1x/semana/usuário). Enquanto não aplicada no banco, o card cai em estado vazio graciosamente.

## v1.1.3 (build 35) — prerelease

**Correções**
- Import de extrato por IA: mensagem de timeout/limite mais clara, sugerindo exportar um período menor (1–2 meses) e importar separadamente.
- Import de extrato: "pagamento de fatura de cartão" marcado como "não incluir" agora é de fato excluído — era ambiguidade de UX no Alert (botões diretos sobre a ação), não bug de filtro.
- Potes: editar o limite passa a valer só do mês vigente em diante — meses passados de potes legados não mudam mais (baseline de histórico).
- Tela Mensal: gastos sem pote agora aparecem reconciliados na grade "Tabela"/Cards (linha "Sem pote"), inclusive quando não há nenhum pote cadastrado; o TOTAL bate com as linhas visíveis.
- Gráficos: atualizam ao voltar para a aba (refetch do tópico ativo no foco), sem quebrar o lazy-load por sub-aba.

**Cartão de crédito**
- Fechamento/vencimento variável por ciclo: exceção pontual por mês (botão 🗓️ na lista de cartões), sem alterar o padrão do cartão.
- Importação de fatura: detecção automática de parcelamento ("N/T"), com criação das parcelas futuras restantes e proteção contra duplicidade.

**IA**
- Sugestão automática de pote pelo histórico de estabelecimentos — no lançamento manual, na edição e na importação de extrato.
- Alerta reativo quando um lançamento é notável (pote perto/estourando o limite, ou valor fora do padrão): checagem determinística grátis e, só quando notável, uma frase curta gerada por IA (guard de 5/dia, sem consumir a cota de relatórios).

**Nota técnica**: nova tabela `credit_card_cycle_overrides` (migration `20240509`) — necessária para a exceção de ciclo do cartão.

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
