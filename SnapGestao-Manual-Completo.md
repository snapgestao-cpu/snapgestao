# SNAPGESTÃO
## Manual Completo de Utilização
### Versão 1.0 — Documento de Apresentação ao Investidor

---

> **SnapGestão** é um aplicativo de controle financeiro pessoal desenvolvido em React Native (Expo), com backend em Supabase. O app cobre toda a jornada financeira do usuário: desde o primeiro cadastro até o planejamento de longo prazo, passando por orçamento mensal por potes, parcelamentos em cartão de crédito, metas, reserva de emergência, inteligência artificial e declaração de Imposto de Renda.

---

## SUMÁRIO

1. [Visão Geral do Produto](#1-visão-geral-do-produto)
2. [Cadastro e Autenticação](#2-cadastro-e-autenticação)
3. [Confirmação de E-mail](#3-confirmação-de-e-mail)
4. [Termos de Uso e LGPD](#4-termos-de-uso-e-lgpd)
5. [Onboarding — Configuração Inicial](#5-onboarding--configuração-inicial)
6. [Tela Mensal — Painel Principal](#6-tela-mensal--painel-principal)
7. [Tela de Potes](#7-tela-de-potes)
8. [Detalhe do Pote](#8-detalhe-do-pote)
9. [Lançamento de Despesa](#9-lançamento-de-despesa)
10. [Lançamento de Receita](#10-lançamento-de-receita)
11. [Edição de Lançamento](#11-edição-de-lançamento)
12. [Lançamentos a Confirmar (Agendados)](#12-lançamentos-a-confirmar-agendados)
13. [Escaneamento de Cupom Fiscal (OCR / NFC-e)](#13-escaneamento-de-cupom-fiscal-ocr--nfc-e)
14. [Tela de Projeção Financeira](#14-tela-de-projeção-financeira)
15. [Tela de Metas e Reserva de Emergência](#15-tela-de-metas-e-reserva-de-emergência)
16. [Módulo IR — Deduções de Imposto de Renda](#16-módulo-ir--deduções-de-imposto-de-renda)
17. [Mentor Financeiro (IA)](#17-mentor-financeiro-ia)
18. [Analisador de Preços (IA)](#18-analisador-de-preços-ia)
19. [Tela de Perfil e Configurações](#19-tela-de-perfil-e-configurações)
20. [Cartões de Crédito](#20-cartões-de-crédito)
21. [Fontes de Receita](#21-fontes-de-receita)
22. [Gamificação — Conquistas e Badges](#22-gamificação--conquistas-e-badges)
23. [Exportação de Dados](#23-exportação-de-dados)
24. [Exclusão de Conta](#24-exclusão-de-conta)
25. [Jornadas Completas do Usuário](#25-jornadas-completas-do-usuário)

---

## 1. VISÃO GERAL DO PRODUTO

### O que é o SnapGestão?

O SnapGestão é um aplicativo mobile de gestão financeira pessoal com foco em **controle por potes orçamentários**, permitindo que o usuário divida sua renda mensal em categorias (chamadas de "potes"), registre gastos, acompanhe parcelamentos no cartão de crédito, projete o futuro financeiro e declare corretamente as despesas dedutíveis no Imposto de Renda.

### Diferenciais

| Funcionalidade | Descrição |
|---|---|
| **Ciclo Personalizado** | O mês financeiro pode começar em qualquer dia (ex: dia 5 para quem recebe salário nesta data) |
| **Potes Visuais** | Visualização por potes com indicador de preenchimento tipo "jarra" |
| **OCR de Cupom Fiscal** | Escaneamento de cupons NFC-e com extração automática de itens, valores e CNPJ |
| **Cartão de Crédito** | Lançamento parcelado com cálculo automático de datas de vencimento |
| **Projeção de 18 meses** | 6 meses para trás + 12 meses à frente com dados reais e projetados |
| **Metas de Longo Prazo** | Metas com depósito externo, depósito do ciclo e projeção de rendimento |
| **Reserva de Emergência** | Separada das metas, com histórico de movimentações |
| **Módulo IR Premium** | Registro e exportação PDF de despesas dedutíveis no IRPF |
| **IA Integrada** | Mentor financeiro e analisador de preços com Claude, Gemini e Llama |
| **Base de Preços Colaborativa** | Dados anônimos de preços de cupons fiscais para comparação |
| **Gamificação** | Sistema de badges/conquistas para engajamento do usuário |
| **LGPD Compliant** | Aceite de termos, opt-in de dados e exclusão completa de conta |

### Arquitetura de Navegação

```
Login / Cadastro
    └─► Confirmação de E-mail
        └─► Termos de Uso (LGPD)
            └─► Onboarding (3 etapas)
                └─► Tabs principais:
                    ├─ Mensal (tela inicial)
                    ├─ Potes
                    ├─ Projeção
                    ├─ Metas
                    └─ Perfil
```

---

## 2. CADASTRO E AUTENTICAÇÃO

### 2.1 Tela de Login

A tela de login é a porta de entrada do aplicativo para usuários já cadastrados.

```
[SCREENSHOT: Tela de login com logo do SnapGestão, campo e-mail, campo senha e botões]
```

**Elementos da tela:**

- **Logo do aplicativo** — centralizado no topo
- **Campo E-mail** — teclado de e-mail, texto convertido automaticamente para minúsculas
- **Campo Senha** — oculta por padrão, com botão de olho para visualizar/ocultar
- **Botão "Entrar"** — executa autenticação com estado de carregamento (spinner)
- **Link "Criar conta"** — navega para a tela de cadastro
- **Caixa de erro** — fundo vermelho, exibe mensagens de erro em português (ex: "E-mail ou senha incorretos")

**Fluxo:**

1. Usuário preenche e-mail e senha
2. Toca em "Entrar"
3. Sistema valida os campos (não pode ser vazios)
4. Supabase Auth autentica o usuário
5. Se autenticado com sucesso → verifica termos aceitos → verifica onboarding → direciona para tela Mensal
6. Se erro → exibe mensagem de erro na caixa vermelha

**Regras de negócio:**
- Mensagem de erro é limpada automaticamente quando o usuário começa a digitar em qualquer campo
- A sessão é persistida no dispositivo via SecureStore (o usuário permanece logado mesmo fechando o app)
- Leituras paralelas do SecureStore são deduplicadas para performance (reduz tempo de carregamento de ~8s para <1s)

---

### 2.2 Tela de Cadastro

```
[SCREENSHOT: Tela de cadastro com campo nome, e-mail e senha]
```

**Elementos da tela:**

- **Campo Nome** — nome completo do usuário
- **Campo E-mail** — endereço de e-mail
- **Campo Senha** — com validação de força mínima
- **Campo Confirmar Senha** — confirmação de senha
- **Botão "Criar conta"** — com estado de carregamento
- **Link "Já tenho conta"** — retorna para login
- **Caixa de erro** — para exibição de mensagens de erro

**Fluxo:**

1. Usuário preenche nome, e-mail e senha
2. Sistema valida que os campos estão corretos
3. Supabase Auth cria a conta
4. E-mail de confirmação é enviado automaticamente
5. Usuário é direcionado para tela de espera de confirmação

---

## 3. CONFIRMAÇÃO DE E-MAIL

### 3.1 Tela de Aguardo

Após o cadastro, o sistema aguarda que o usuário confirme seu e-mail antes de liberar acesso.

```
[SCREENSHOT: Tela de confirmação de e-mail pendente]
```

**Elementos da tela:**

- **Ícone de envelope** — animado
- **Título** — "Confirme seu e-mail"
- **Subtítulo** — "Enviamos um link para [email]. Clique nele para ativar sua conta."
- **Botão "Reenviar e-mail"** — envia novo e-mail de confirmação com cooldown de 60 segundos
- **Botão "Já confirmei"** — verifica o status da sessão

### 3.2 Página Web de Confirmação

Ao clicar no link no e-mail, o usuário é direcionado para uma página HTML hospedada no GitHub Pages com a identidade visual do SnapGestão.

```
[SCREENSHOT: Página de confirmação de e-mail no navegador]
```

**Elementos:**
- Logo do SnapGestão
- Mensagem de boas-vindas: "E-mail confirmado com sucesso!"
- Instrução: "Volte para o aplicativo para continuar"
- Link para download do app (quando disponível nas lojas)

**Tecnicamente:** O link de confirmação usa deep link que redireciona de volta para o app com token de sessão.

---

## 4. TERMOS DE USO E LGPD

### 4.1 Tela de Aceite de Termos

Esta tela é exibida obrigatoriamente para todo novo usuário e também quando os termos são atualizados para uma nova versão. **Não pode ser dispensada** (gesto de swipe desabilitado).

```
[SCREENSHOT: Tela de aceite de Termos de Uso e Política de Privacidade com dois checkboxes]
```

**Elementos da tela:**

- **Logo do SnapGestão** — no topo
- **Título** — "Antes de começar"
- **Subtítulo** — breve explicação sobre LGPD e proteção de dados

**Card de Documentos:**
- 📋 **Termos de Uso** — card clicável que abre o documento completo no navegador
- 🔒 **Política de Privacidade** — card clicável que abre o documento completo no navegador

**Checkboxes (independentes):**
- ☐ "Li e aceito os Termos de Uso"
- ☐ "Li e aceito a Política de Privacidade"

**Botão "Aceitar e Continuar":**
- Desabilitado (cinza) enquanto qualquer checkbox estiver desmarcado
- Habilitado (azul) somente quando **ambos** os checkboxes estiverem marcados
- Exibe spinner durante salvamento

**Card informativo LGPD:**
- Informa que os dados são protegidos conforme a Lei 13.709/2018 (LGPD)
- Informa que o usuário pode solicitar exclusão de dados a qualquer momento

**Fluxo:**

1. Usuário lê os documentos (links externos)
2. Marca ambos os checkboxes
3. Toca em "Aceitar e Continuar"
4. Sistema salva `terms_accepted_at = now()` e `terms_version = '1.0'` no banco de dados
5. Se onboarding não concluído → vai para Onboarding Etapa 1
6. Se onboarding já concluído → vai para tela Mensal

**Regras de negócio:**
- Versão atual dos termos: `1.0`
- Se o app for atualizado com nova versão dos termos, usuários existentes verão esta tela novamente
- Registro de aceite inclui data/hora exata para fins de auditoria LGPD

---

## 5. ONBOARDING — CONFIGURAÇÃO INICIAL

O onboarding guia o usuário pela configuração inicial do app em **3 etapas**. Uma barra de progresso no topo indica o avanço (33% → 66% → 100%).

### 5.1 Etapa 1 — Saldo Inicial e Moeda

```
[SCREENSHOT: Onboarding Etapa 1 com input de saldo inicial e seletor de moeda]
```

**Elementos da tela:**

- **Barra de progresso** — 33% completo
- **Ícone de carteira** — ilustração visual
- **Título** — "Qual é o seu saldo atual?"
- **Subtítulo** — "Informe quanto você tem disponível hoje"
- **Campo de Saldo** — grande, centralizado
  - Formato: R$ X.XXX,XX
  - Teclado numérico
  - Pode ser deixado em R$ 0,00 (saldo zero é válido — não implica onboarding incompleto)
- **Seletor de Moeda** — 3 botões tipo chip:
  - 🇧🇷 BRL (Real Brasileiro) — padrão
  - 🇺🇸 USD (Dólar Americano)
  - 🇪🇺 EUR (Euro)
- **Botão "Continuar"** — avança para Etapa 2

**Regras de negócio:**
- Saldo inicial zero é aceito (não bloqueia o onboarding)
- Saldo positivo gera uma transação de receita no ciclo atual
- Saldo negativo gera uma transação de despesa no ciclo atual
- A moeda selecionada é salva no perfil do usuário

---

### 5.2 Etapa 2 — Ciclo Financeiro e Fontes de Receita

```
[SCREENSHOT: Onboarding Etapa 2 com seletor de ciclo e lista de fontes de receita]
```

**Elementos da tela:**

- **Barra de progresso** — 66% completo
- **Título** — "Configure seu ciclo e sua renda"

**Seção: Ciclo Mensal**
- Explicação: "O ciclo define quando começa e termina seu mês financeiro"
- **Botão "Padrão (Dia 1)"** — ciclo começa no dia 1 de cada mês
- **Botão "Personalizado"** — habilita campo para digitar o dia (1 a 28)
- **Campo dia** (quando personalizado) — teclado numérico, validação 1-28

**Seção: Fontes de Receita**
- Lista de fontes já adicionadas (cartões removíveis com X)
- **Botão "+ Adicionar fonte"** — abre modal de nova fonte

**Modal de Nova Fonte de Receita:**
- Campo **Nome** (ex: Salário, Freelance, Aluguel)
- Seletor de **Tipo:**
  - 💼 Salário
  - 💻 Freelance
  - 🏠 Aluguel
  - 📈 Dividendos
  - 🔄 Outros
- Campo **Valor mensal** (numérico, formato R$)
- Campo **Dia de recebimento** (1 a 31)
- Toggle **Principal** (fonte primária de renda)
- Botão "Adicionar"

**Regras de negócio:**
- Ao menos uma fonte de receita é recomendada (não obrigatória)
- Dia do ciclo entre 1 e 28 para garantir que todos os meses tenham esse dia
- O dia de recebimento da fonte é independente do dia do ciclo

**Botão "Continuar"** — avança para Etapa 3

---

### 5.3 Etapa 3 — Primeiro Pote e Finalização

```
[SCREENSHOT: Onboarding Etapa 3 com criação do primeiro pote e seletor de cores]
```

**Elementos da tela:**

- **Barra de progresso** — 100% completo
- **Título** — "Crie seu primeiro pote!"
- **Subtítulo** — "Potes são categorias de gastos com limite mensal"

**Sugestões rápidas** (chips clicáveis):
- 🍽️ Alimentação
- 🏠 Moradia
- 🚗 Transporte
- 💊 Saúde
- 🎮 Lazer
- 📚 Educação

**Campos:**
- **Nome do pote** — preenchido automaticamente ao tocar em sugestão
- **Limite mensal** — valor em R$, numérico
- **Seletor de Cor** — 12 cores predefinidas em chips coloridos (verde, azul, amarelo, roxo, laranja, vermelho, rosa, turquesa, etc.)

**Botão "Começar!"**:

**Ações executadas ao finalizar:**
1. Salva perfil do usuário (nome, moeda, ciclo, saldo inicial)
2. Se saldo inicial ≠ 0 → cria transação de ajuste de saldo
3. Insere fontes de receita na tabela `income_sources`
4. Registra histórico inicial em `income_source_history`
5. Cria o primeiro pote
6. Marca `onboarding_completed = true`
7. Redireciona para tela Mensal

**Regras de negócio:**
- O pote criado é o primeiro pote real do usuário
- A cor do pote influencia a visualização na tela de potes e em gráficos
- Pode ser editado/excluído posteriormente

---

## 6. TELA MENSAL — PAINEL PRINCIPAL

A tela Mensal é a **tela inicial após o login** e o painel central do SnapGestão. Ela oferece uma visão completa do ciclo financeiro atual com possibilidade de navegar para ciclos passados e futuros.

```
[SCREENSHOT: Tela Mensal completa com resumo do ciclo, alertas e seção de potes]
```

### 6.1 Navegação de Ciclo

**Barra superior:**
- **Seta esquerda ‹** — recua um mês (disponível até 24 meses atrás)
- **Nome do ciclo** — ex: "Maio 2026 · Dia 1 a 31" (toque abre seletor de mês)
- **Seta direita ›** — avança um mês (disponível até 12 meses à frente)
- **Botão "+ Pote"** — abre modal de criação de pote

**Seletor de Mês (Modal):**
- Lista de meses navegáveis
- Destaque no mês atual
- Toque direciona diretamente para o mês selecionado

---

### 6.2 Card de Resumo Financeiro

```
[SCREENSHOT: Card de resumo com receitas, despesas e saldo do ciclo]
```

O card de resumo apresenta o balanço completo do ciclo selecionado:

| Linha | Descrição |
|---|---|
| 📅 Receita prevista | Total das fontes de receita configuradas |
| + Receitas recebidas | Receitas lançadas no ciclo |
| − Débito do ciclo anterior | Saldo negativo arrastado do mês anterior |
| + Sobra do ciclo anterior | Saldo positivo trazido do mês anterior |
| = **Renda disponível** | Base de cálculo |
| − Total gasto | Soma de todas as despesas do ciclo |
| = **Saldo do ciclo** | Verde se positivo, vermelho se negativo |

**Regras visuais:**
- Saldo positivo → texto e card em verde
- Saldo negativo → texto e card em vermelho
- Valores formatados em R$ com separadores de milhar

---

### 6.3 Alertas do Ciclo (Colapsável)

```
[SCREENSHOT: Seção de alertas expandida mostrando potes no vermelho]
```

**Comportamento:**
- Recolhido por padrão se não há alertas críticos
- Expandido automaticamente quando há pendências
- Toque no cabeçalho expande/recolhe

**Tipos de alerta:**
- 🔴 **Saldo negativo** — "Seu ciclo está no vermelho em R$ X,XX"
- ⚠️ **Pote estourado** — "Alimentação: R$ 50,00 acima do limite" (por pote)
- 📋 **Lançamentos pendentes** — itens agendados aguardando confirmação

---

### 6.4 Seção de Potes — Visão em Tabela

```
[SCREENSHOT: Tabela de potes com colunas Nome, Orçado, Gasto, Saldo]
```

Alternância entre dois modos de visualização via abas:

**📊 Tabela:**
- Coluna **Pote** — ícone de cor + nome
- Coluna **Orçado** — limite do pote naquele mês
- Coluna **Gasto** — total de despesas no ciclo
- Coluna **Saldo** — Orçado − Gasto (verde se positivo, vermelho se negativo)
- **Linha de total** — soma de todas as colunas
- Toque em qualquer linha → abre Detalhe do Pote

---

### 6.5 Seção de Potes — Visão em Cards

```
[SCREENSHOT: Cards de potes no formato jarra com barra de progresso]
```

**🫙 Potes:**
- Cada pote é um card com:
  - Ícone de pote colorido (cor configurada)
  - Nome do pote
  - "R$ [gasto]" em destaque
  - "de R$ [orçado]" abaixo
  - Barra de progresso colorida:
    - 🟢 Verde: até 70% do limite
    - 🟡 Amarelo: 70% a 100%
    - 🔴 Vermelho: acima de 100%
  - Badge "!" se há lançamentos pendentes
- **Card de total** ao final
- Toque em qualquer card → abre Detalhe do Pote

---

### 6.6 Seção de Lançamentos

```
[SCREENSHOT: Lista de lançamentos agrupados por estabelecimento com busca]
```

**Barra de busca:**
- Pesquisa em tempo real por descrição ou estabelecimento
- Ícone de lupa, campo de texto expansível

**Agrupamento por Estabelecimento:**
- Lançamentos são agrupados por merchant (estabelecimento)
- Cabeçalho do grupo: nome do merchant + total + quantidade
- Dentro do grupo: ordenados por data decrescente
- **Cabeçalho de data** — ex: "Terça-feira, 7 de maio de 2026"

**Cada lançamento exibe:**
- Descrição
- Valor (vermelho para despesa, verde para receita)
- Pote vinculado (ícone colorido)
- Ícone de forma de pagamento
- Se parcelado: "2/6" (parcela atual/total)
- Toque → abre modal de edição

**Ações no lançamento (swipe ou long press):**
- ✏️ Editar → abre EditTransactionModal
- 🗑️ Excluir → confirmação com opções para parcelados

---

### 6.7 Fechamento de Ciclo

```
[SCREENSHOT: Card de fechamento de ciclo com saldo positivo e opções de destino da sobra]
```

**Quando o ciclo ainda não foi fechado:**

**Se saldo ≥ 0 (ciclo positivo):**
- Mensagem de parabéns: "🎉 Mês no azul! Sobra de R$ X,XX"
- **Seletor de destino da sobra:**
  - 🎯 Investir em meta → dropdown para selecionar a meta
  - 🛡️ Reserva de emergência
  - ➡️ Próximo mês (como receita)
  - 🚫 Ignorar
- **Botão "Fechar ciclo"** — habilitado somente após escolher o destino
- Spinner durante processamento

**Se saldo < 0 (ciclo negativo):**
- Mensagem de alerta: "⚠️ Ciclo fechando no vermelho"
- "R$ X,XX será debitado do próximo ciclo"
- **Botão "Fechar mesmo assim"** — com confirmação

**Quando o ciclo já foi fechado:**

```
[SCREENSHOT: Card de ciclo fechado com botão de reabertura]
```

- ✅ "Ciclo encerrado"
- Data de fechamento
- **Botão "Reabrir ciclo"** — desfaz o fechamento para correções

**Regras de negócio do fechamento:**
- Cria registro em `cycle_rollovers` com tipo (sobra/déficit) e valor
- Sobra → pode ser transferida para meta, reserva ou próximo mês
- Após fechar, ciclos subsequentes recalculam automaticamente o impacto
- Reabertura permite corrigir lançamentos e fechar novamente

---

### 6.8 Botão de Ação Flutuante (FAB)

```
[SCREENSHOT: FAB expandido mostrando 4 opções de ação]
```

O FAB fica fixo no canto inferior direito. Ao tocar, expande com animação spring mostrando 4 opções:

| Ação | Ícone | Função |
|---|---|---|
| Escanear cupom | 📷 | Abre câmera OCR |
| Importar arquivo | 📂 | Importa CSV/OFX |
| Registrar receita | ↑ | Abre modal de receita |
| Registrar despesa | ↓ | Abre modal de despesa |

- O FAB fecha automaticamente ao rolar a tela
- Ícone rotaciona 45° quando expandido
- Fundo com backdrop semi-transparente

---

## 7. TELA DE POTES

A tela de Potes apresenta **todos os potes do usuário em grade visual** para o ciclo selecionado.

```
[SCREENSHOT: Tela de Potes com grade de potes em formato jarra]
```

### 7.1 Header

- **Saudação** — "Olá, [Nome] 👋"
- **Navegação de ciclo** — setas + nome do mês (com seletor ao tocar)
- **Botão "+ Pote"** — cria novo pote

### 7.2 Banner de Ciclo Passado

- Exibido quando o usuário está visualizando um mês anterior
- "📅 Visualizando [mês anterior]"

### 7.3 Grade de Potes (2 colunas)

```
[SCREENSHOT: Card de pote individual com imagem de jarra e dados financeiros]
```

**Cada card de pote:**
- **Imagem de jarra** — preenchimento visual proporcional ao % gasto (0% = vazia, 100% = cheia, acima = transbordando)
- **Nome do pote**
- **Valor gasto** — "R$ 234,50"
- **Limite** — "de R$ 800,00"
- **Badge "!"** — se há lançamentos agendados pendentes neste pote
- Toque → abre Detalhe do Pote

**Legenda visual da jarra:**
- 🟢 Menos de 70% preenchida → jarra azul/verde
- 🟡 70% a 100% → jarra amarela
- 🔴 Acima de 100% → jarra vermelha (transbordando)

### 7.4 Card da Reserva de Emergência

- Exibido ao final da lista
- 🛡️ "Emergência"
- Saldo atual da reserva
- Toque → abre detalhe da reserva

### 7.5 Estado Vazio

- "Nenhum pote criado ainda"
- Botão "Criar meu primeiro pote"

### 7.6 Badge no Tab

- O ícone da aba "Potes" exibe um badge numérico com a quantidade de lançamentos agendados pendentes no mês atual
- Atualizado automaticamente ao confirmar ou cancelar itens

---

## 8. DETALHE DO POTE

A tela de detalhe apresenta toda a movimentação de um pote específico com ações disponíveis.

```
[SCREENSHOT: Tela de detalhe do pote com jarra grande, botões de ação e lista de lançamentos]
```

### 8.1 Header

- **Seta de volta** ‹
- **Nome do pote** (centralizado)
- **Badge de ciclo** (se não é o mês atual)

### 8.2 Visualização da Jarra

- **Imagem grande da jarra** com preenchimento proporcional
- **"R$ [gasto] gastos de R$ [limite]"**
- Se ultrapassou o limite → texto em vermelho + valor excedido

### 8.3 Banner de Pendências

```
[SCREENSHOT: Banner amarelo de lançamentos pendentes]
```

- Exibido se há itens agendados esperando confirmação
- "📋 X lançamento(s) pendente(s)"
- "Confirme ou exclua os itens abaixo"

### 8.4 Grid de Ações (6 botões)

```
[SCREENSHOT: Grid de 6 botões de ação do pote]
```

| Botão | Ação |
|---|---|
| 💸 Gasto | Abre modal de nova despesa (pote pré-selecionado) |
| 💰 Receita | Abre modal de nova receita (pote pré-selecionado) |
| 📷 Cupom | Navega para OCR com este pote como padrão |
| 📋 Agendar | Abre modal de lançamento a confirmar |
| ✏️ Editar | Abre modal de edição do pote (nome, cor, limite) |
| 🗑️ Excluir | Alert de confirmação com aviso sobre histórico |

### 8.5 Lançamentos a Confirmar

```
[SCREENSHOT: Lista de lançamentos agendados com botões Confirmar e Excluir]
```

Lista de itens agendados pendentes para este pote neste ciclo:

**Cada item exibe:**
- Descrição do lançamento
- Valor em R$
- Data de vencimento calculada
- Estabelecimento (se informado)
- Forma de pagamento
- Badge IR se é dedutível

**Botões por item:**
- ✅ **Confirmar** — gera a transação real + confirma o item
- 🗑️ **Excluir** — cancela apenas este mês (mantém os próximos)

### 8.6 Lançamentos do Pote

- Barra de busca
- Agrupados por estabelecimento e data (igual à tela Mensal)
- Permite editar/excluir cada lançamento

---

## 9. LANÇAMENTO DE DESPESA

O modal de nova despesa pode ser aberto pelo FAB da tela Mensal, pelos botões de ação do pote, ou pelo botão "Gasto" no detalhe do pote.

```
[SCREENSHOT: Modal de nova despesa com campos preenchidos]
```

### 9.1 Campos

**Valor** *(obrigatório)*
- Campo grande centralizado no topo
- Teclado numérico
- Formatação automática: R$ 1.234,56
- Placeholder: "R$ 0,00"

**Descrição** *(opcional)*
- Texto livre
- Placeholder: "Ex: Almoço, Netflix, Academia..."

**Pote** *(obrigatório)*
- Scroll horizontal de chips
- Cada chip: cor + nome do pote
- Chip selecionado: borda na cor do pote + fundo mais claro
- Se nenhum pote selecionado: mensagem de erro ao tentar salvar

**Data**
- Campo de texto no formato DD/MM/AAAA
- Padrão: data de hoje
- Pode ser alterada para qualquer data

**Forma de Pagamento** *(chip selector)*
- 💵 Dinheiro
- 💳 Débito
- 💳 Crédito *(ativa seção de cartão)*
- 📱 Pix
- 🍽️ Vale Alimentação
- 🍴 Vale Refeição

**Cartão de Crédito** *(visível somente quando Crédito selecionado)*

```
[SCREENSHOT: Seção de cartão de crédito com seletor de cartões e toggle de parcelamento]
```

- Seletor de cartão (chips com nome do cartão + últimos 4 dígitos)
- **Toggle "Parcelado"** — habilita parcelamento
  - Se ativado: slider ou campo para número de parcelas (2 a 12)
  - Exibe: "R$ X,XX por parcela"
  - App calcula automaticamente as datas de vencimento de cada parcela com base no `closing_day` e `due_day` do cartão

**Estabelecimento** *(opcional)*
- Campo de texto livre
- Salvo para sugestões futuras

**Necessidade** *(toggle)*
- Classifica o gasto como **Necessidade** ou **Desejo**
- Usado em relatórios e análises de IA

**Seção IR** *(visível somente para usuários com módulo IR habilitado)*

```
[SCREENSHOT: Seção IR com toggle e campos de categoria, prestador e documento]
```

- **Toggle "Dedutível no IR"**
- Se ativado:
  - Seletor de **Categoria IR**:
    - 🏥 Saúde
    - 🎓 Educação
    - 📊 Previdência PGBL
    - 🏛️ Previdência Social (INSS)
    - 🤝 Doação
    - 👨‍👩‍👦 Pensão Alimentícia
    - 📋 Outros
  - Campo **Prestador** (opcional) — nome do médico, escola, etc.
  - Campo **CPF/CNPJ do prestador** (opcional)
  - Campo **Número do recibo** (opcional)
  - Botão **"+ Anexar foto do recibo"** — abre galeria de fotos

### 9.2 Botões

- **"Registrar despesa"** — salva com spinner durante processamento
- **"Cancelar"** — fecha o modal sem salvar

### 9.3 Regras de Negócio

- Para crédito parcelado: cria N registros no banco com `installment_group_id` comum, `installment_number` e `installment_total`
- Data de vencimento calculada por parcela: `billing_date` = data de fechamento + offset por parcela
- Se ultrapassar 70% do limite do pote → alerta crítico ao salvar
- Lançamento de crédito: filtrado por `billing_date` no ciclo, não pela data da compra
- Imagem do recibo IR: comprimida (resize 1200px, JPEG 60%) e enviada para Supabase Storage

---

## 10. LANÇAMENTO DE RECEITA

```
[SCREENSHOT: Modal de nova receita]
```

Similar ao modal de despesa, mas simplificado:

**Campos:**
- **Valor** *(obrigatório)* — numérico, formato R$
- **Descrição** *(opcional)* — ex: "13º salário", "Freelance cliente X"
- **Pote** *(opcional)* — para receitas vinculadas a potes específicos
- **Data** — padrão hoje
- **Forma de Pagamento** — Pix, Transferência, Dinheiro, Vouchers

**Regras de negócio:**
- Receita aumenta o saldo disponível do ciclo
- Se vinculada a um pote, aumenta o orçamento disponível daquele pote
- Não tem parcelamento
- Filtrada por `date` no ciclo (não por billing_date)

---

## 11. EDIÇÃO DE LANÇAMENTO

O modal de edição é acessado tocando em qualquer transação na lista ou pelo gesto de swipe.

```
[SCREENSHOT: Modal de edição de lançamento com todos os campos preenchidos]
```

### 11.1 Campos (igual ao de criação)

Todos os campos do modal de despesa/receita são editáveis:
- Valor, descrição, pote, data, forma de pagamento
- Cartão de crédito e parcelamento (se aplicável)
- Estabelecimento, necessidade
- Campos IR completos (para usuários com módulo ativo)
  - Pode trocar a imagem do recibo existente ou remover

### 11.2 Conversão de Parcelamento

Se o usuário converter um lançamento simples em parcelado:
- O sistema exclui o lançamento original
- Cria N novos lançamentos com IDs de grupo, números de parcela e datas de vencimento calculadas

### 11.3 Exclusão de Lançamento

**Botão "Excluir lançamento"** (vermelho) com lógica contextual:

**Para lançamentos simples:**
- Alert: "Tem certeza?" → confirma exclusão

**Para lançamentos parcelados:**

```
[SCREENSHOT: Alert de exclusão de parcela com opções]
```

- Alert com opções:
  - "Excluir apenas esta parcela"
  - "Excluir esta e as próximas parcelas"
  - "Cancelar"

### 11.4 Regras de Negócio

- Lançamentos de ciclos passados fechados: leitura apenas (não editáveis)
- Alteração do cartão de crédito recalcula `billing_date`
- Alteração da data em crédito recalcula `billing_date`
- Imagem do recibo IR: carregada via URL assinada (válida por 1 hora)

---

## 12. LANÇAMENTOS A CONFIRMAR (AGENDADOS)

O sistema de lançamentos a confirmar permite que o usuário **pré-cadastre despesas recorrentes** que precisam ser confirmadas mês a mês antes de virar transação real. Exemplos: plano de saúde, mensalidade escolar, financiamento.

### 12.1 Criação via Modal

```
[SCREENSHOT: Modal de criação de lançamento agendado com seletor de meses]
```

**Acessado pelo botão "📋 Agendar" no detalhe do pote.**

**Campos:**
- **Pote** — exibido como chip (pré-selecionado)
- **Descrição** *(obrigatório)* — ex: "Plano de Saúde"
- **Estabelecimento** *(opcional)* — ex: "Amil", "Bradesco Saúde"
- **Data do lançamento** — seletor de data (DateTimePicker)
  - Mínimo: início do ciclo atual
  - Máximo: fim do ciclo atual
  - Padrão: hoje (se ciclo atual) ou primeiro dia do mês
- **Valor** *(obrigatório)* — numérico, formato R$
- **Forma de Pagamento** — chips: Débito, Crédito, Pix, Dinheiro, Transferência, Vale Alimentação, Vale Refeição
- **Por quantos meses?** — botões +/− + campo numérico (1 a 60)
  - Exibe: "Apenas este mês" ou "X meses (até [mês/ano])"

**Seção IR** *(se módulo habilitado)*:
- Toggle "Dedutível no IR"
- Seletor de categoria
- Campo de prestador e CPF/CNPJ

**Resumo visual** — card ao final:
- "Descrição · R$ Valor · N meses"
- Data do lançamento

**Botões:**
- "📋 Registrar Agendamento" — salva
- "Cancelar"

### 12.2 Como Funciona

1. Criação gera **1 registro em `scheduled_transactions`** + **N registros em `scheduled_transaction_months`** (um por mês)
2. Cada mês aparece como item pendente no detalhe do pote
3. O usuário confirma mês a mês:
   - **Confirmar** → gera transação real com data calculada automaticamente (mantém o dia do mês original)
   - **Excluir** → cancela apenas aquele mês (os próximos continuam pendentes)

### 12.3 Cálculo de Vencimento

O dia de vencimento de cada parcela é calculado mantendo o dia original:
- Ex: lançamento em 15/01 → 15/02, 15/03, etc.
- Se o dia não existe no mês (ex: 31/02) → último dia do mês

### 12.4 Badge no Tab Potes

- A quantidade de lançamentos pendentes no mês atual é exibida como badge no ícone da aba "Potes"
- Atualizado a cada confirmação ou cancelamento

---

## 13. ESCANEAMENTO DE CUPOM FISCAL (OCR / NFC-e)

O módulo de escaneamento permite capturar dados de cupons fiscais automaticamente, eliminando o trabalho manual de digitação.

```
[SCREENSHOT: Tela inicial do scanner com duas opções: Fotografar e QR Code]
```

### 13.1 Dois Modos de Captura

**📷 Fotografar Cupom (OCR):**
- Abre câmera do dispositivo
- Usuário fotografa o cupom impresso
- Imagem enviada para Google Cloud Vision API
- API extrai texto e SnapGestão interpreta os dados

**🔗 Ler QR Code (NFC-e):**
- Abre leitor de QR code
- Detecta automaticamente o estado da nota (por prefixo da URL)
- Valida se o estado é suportado (SP, RJ, MG e outros)
- Extrai a **chave de acesso** (44 dígitos) da URL
- Abre o WebView da SEFAZ do estado para visualizar a nota completa

### 13.2 Processamento da NFC-e

```
[SCREENSHOT: WebView da SEFAZ mostrando nota fiscal com dados de itens]
```

- Exibe a nota fiscal completa no WebView da SEFAZ
- Extrai automaticamente:
  - Lista de itens (nome, quantidade, valor unitário, valor total)
  - CNPJ do estabelecimento
  - Nome do estabelecimento
  - Total da nota
  - Data de emissão
- Preenche automaticamente os campos de revisão

### 13.3 Tela de Revisão

```
[SCREENSHOT: Tela de revisão do cupom com lista de itens, potes e forma de pagamento]
```

**Campos de revisão:**

- **Estabelecimento** — preenchido automaticamente, editável
- **Total** — preenchido automaticamente, editável
- **Data** — data de emissão, editável (DD/MM/AAAA)

**Forma de Pagamento:**
- Chips: Débito, Crédito, Pix, Dinheiro, Transferência, Vale Alimentação, Vale Refeição
- Se Crédito:
  - Seletor de cartão
  - Toggle parcelamento + número de parcelas

**Lista de Itens:**

```
[SCREENSHOT: Item individual com nome, valor e seletor de pote]
```

Cada item da nota exibe:
- Nome do item (ex: "ARROZ TIPO 1 5KG")
- Quantidade
- Valor total do item
- **Seletor de Pote** — para direcionar o item para o pote correto

**Modo Simplificado** *(toggle)*:
- Ao invés de alocar item a item, seleciona um único pote para todo o cupom
- Útil para compras em um único estabelecimento/categoria

**Barra de Busca:**
- Filtra itens por nome
- Útil para cupons com muitos itens

**Seletor Global de Pote:**
- Seleciona um pote para todos os itens de uma vez
- Pode ser sobrescrito item a item após

### 13.4 Seção IR (Módulo Premium)

```
[SCREENSHOT: Seção IR no OCR com toggle e campos de categoria]
```

- **Toggle "Dedutível no IR"** — aplica a **todos** os itens do cupom
- CNPJ do estabelecimento pré-preenchido como "CPF/CNPJ do prestador"
- Nome do estabelecimento pré-preenchido como "Prestador"
- Seletor de categoria IR
- Campo de CPF/CNPJ editável

### 13.5 Base de Preços Colaborativa

```
[SCREENSHOT: Modal de opt-in para compartilhamento de preços]
```

Após salvar um cupom NFC-e pela primeira vez:

**Modal de Opt-in:**
- Explica que os dados de preço (sem dados pessoais) podem ser compartilhados
- Dois botões: "Compartilhar" / "Não compartilhar"
- Escolha é salva em `user_preferences`

**Se usuário aceitou:**
- Dados de preço (item, valor, CNPJ, cidade/estado) são enviados para base colaborativa
- Sem user_id, sem dados pessoais identificáveis
- Lotes de 50 itens

### 13.6 Salvamento

**Ao tocar "Salvar":**
1. Valida que todos os itens têm pote selecionado
2. Cria transação(ões) no banco
3. Se parcelado com crédito: cria N transações com group_id comum
4. Cada parcela tem `billing_date` calculado individualmente
5. Verifica se usuário optou por compartilhar preços → envia dados
6. Se usuário nunca respondeu → exibe modal de opt-in
7. Verifica conquistas (badges) após salvar

---

## 14. TELA DE PROJEÇÃO FINANCEIRA

A tela de Projeção apresenta uma visão de **6 meses passados + 12 meses futuros** do fluxo de caixa do usuário.

```
[SCREENSHOT: Tela de Projeção com tabela horizontal de meses e saldos]
```

### 14.1 Cards de Resumo

- 💰 **Renda mensal base** — soma das fontes de receita configuradas
- 📊 **Média de gastos (últimos 3 meses)** — baseado em dados reais

### 14.2 Tabela de Projeção (Scroll Horizontal)

**Colunas:**
| Coluna | Descrição |
|---|---|
| Mês | Nome abreviado + ano |
| Receita | Total de receitas do mês |
| Despesa | Total de despesas do mês |
| Saldo | Receita − Despesa |

**Linhas passadas e atual:**
- Dados reais do banco de dados
- Texto normal, cores sólidas

**Linhas futuras:**
- Dados projetados com base nos limites dos potes
- Texto em itálico, tonalidade mais suave
- Marcador 🔮 na coluna de mês

**Indicador de crédito:**
- Meses com parcelas de cartão de crédito: ícone 💳
- Clicável → abre modal de detalhamento das parcelas

```
[SCREENSHOT: Modal de crédito mostrando parcelas de cartão em um mês específico]
```

**Modal de Parcelas de Crédito:**
- Título: "Crédito — [Mês/Ano]"
- Lista de todas as parcelas de cartão naquele mês:
  - Descrição + estabelecimento
  - Valor da parcela
  - "X/Y" (número da parcela / total)
  - Data da compra original
  - Data de vencimento
  - Pote vinculado (ícone colorido)
- Barra de busca para filtrar
- Total das parcelas

### 14.3 Card Informativo

```
[SCREENSHOT: Card explicativo da projeção]
```

Explica como a projeção é calculada:
- ✅ Meses passados: dados reais
- 📍 Mês atual: gastos até hoje
- 🔮 Meses futuros: soma dos orçamentos dos potes + excedente de parcelamentos

### 14.4 Regras de Negócio

**Para meses futuros:**
- Receita projetada = soma das fontes de receita
- Despesa projetada = soma dos limites dos potes + parcelas de crédito que excedem os limites dos potes
- Se um pote tem limite R$ 500 mas há parcelas de crédito de R$ 200 → projeção usa R$ 700 (pote + excedente)

**Para meses passados:**
- Crédito filtrado por `billing_date` → captura todas as parcelas que vencem naquele mês, independente de quando foram compradas

---

## 15. TELA DE METAS E RESERVA DE EMERGÊNCIA

A tela de Metas centraliza o planejamento de longo prazo do usuário.

```
[SCREENSHOT: Tela de Metas com card de Reserva de Emergência e cards de metas]
```

### 15.1 Header

- Título: "Metas de Longo Prazo"
- **Botão 🏆 "Concluídas"** — abre modal de metas finalizadas

### 15.2 Card Reserva de Emergência

```
[SCREENSHOT: Card de Reserva de Emergência com saldo, meta e botões]
```

**Exibição:**
- 🛡️ Ícone + "Reserva de Emergência"
- **Saldo atual** — valor grande em destaque
- **Meta** (se configurada): "Meta: R$ X.XXX,XX"
- **Barra de progresso** (se meta configurada)
- **Botão 📋** — histórico de movimentações

**Botões de ação:**
- **+ Depositar** — abre modal de depósito
- **− Sacar** — abre modal de saque

**Modal de Depósito da Reserva:**

```
[SCREENSHOT: Modal de depósito na reserva com seleção de tipo]
```

Etapa 1 — Seleção de tipo:
- 💰 **Externo** — 13º, bônus, doação (não afeta ciclo)
- 📅 **Do ciclo** — vira despesa em um mês específico

Etapa 2 — Formulário:
- Valor
- Descrição (opcional)
- Seletor de mês (se "do ciclo")
- Botão confirmar com validação de saldo

**Modal de Saque da Reserva:**
- Valor
- Descrição (opcional)
- Seletor de mês de destino (vira receita naquele mês)
- Validação: não pode sacar mais do que o saldo atual

**Modal de Histórico da Reserva:**
- Lista cronológica de movimentações
- Cada item: tipo, valor (±), data, descrição
- Saldo acumulado visível

---

### 15.3 Cards de Metas

```
[SCREENSHOT: Card de meta individual com jarra, progresso e botões]
```

**Cada card exibe:**
- **Imagem de jarra** — preenchimento visual proporcional ao % atingido
- **Badge de horizonte** (colorido por prazo):
  - 🟢 Verde — curto prazo (< 1 ano)
  - 🟡 Âmbar — médio prazo (1-3 anos)
  - 🟣 Roxo — longo prazo (> 3 anos)
- Nome da meta
- **Valor atual** e **Valor alvo**
- **Barra de progresso** colorida
- **Porcentagem** atingida
- Aporte mensal + projeção de valor futuro (se configurado)
- **Badge "Meta atingida! 🎉"** quando `atual >= alvo`

**Botões por card:**
- **+ Depositar** — modal de depósito
- **− Sacar** — modal de saque
- **✅ Concluir** — aparece quando meta foi atingida → confirma conclusão via Alert

**Menu de contexto (long press):**
- ✏️ Editar meta
- 🗑️ Excluir meta

---

### 15.4 Modal de Depósito em Meta

```
[SCREENSHOT: Modal de depósito em meta com seletor de tipo]
```

**Etapa 1 — Tipo:**
- 💰 **Depósito externo** — 13º, bônus, herança (não gera transação no ciclo)
- 📅 **Do ciclo** — gera despesa em um mês específico

**Etapa 2 — Formulário:**
- Valor (com validação > 0)
- Descrição (opcional)
- Seletor de mês (se do ciclo) — permite meses passados e futuros
- Botão "Confirmar"

---

### 15.5 Modal de Saque em Meta

```
[SCREENSHOT: Modal de saque em meta com seletor de tipo]
```

**Etapa 1 — Tipo:**
- ↑ **Sacar para o mês** — vira receita em um mês específico
- 🎉 **Concluir meta** — altera status para "concluída" sem gerar transação

**Etapa 2 — Formulário (para saque para mês):**
- Valor (validação: não pode exceder saldo atual)
- Descrição (opcional)
- Seletor de mês de destino
- Botão "Confirmar"

**Para conclusão:**
- Alert de confirmação
- Meta vai para histórico de Concluídas

---

### 15.6 Criação de Meta

```
[SCREENSHOT: Modal de criação de nova meta com campos]
```

**Botão "+ Nova meta"** na barra inferior.

**Campos:**
- **Nome** — ex: "Viagem para Europa", "Fundo de Emergência"
- **Valor alvo** — R$ objetivo
- **Data alvo** (opcional) — data limite para atingir a meta
- **Horizonte** — anos estimados
- **Aporte mensal** (opcional) — R$ a depositar por mês
- **Taxa de juros anual** (opcional) — para projeção de valor futuro
- **Cor** — seletor de cores

---

### 15.7 Modal de Metas Concluídas

```
[SCREENSHOT: Modal de metas concluídas com lista e badges de status]
```

- Lista de metas com status ≠ "active"
- Cada item: nome, valor acumulado, data de conclusão
- Badge de status:
  - ✅ "Concluída" — meta finalizada com sucesso
  - ❌ "Cancelada" — meta encerrada antes do objetivo

---

## 16. MÓDULO IR — DEDUÇÕES DE IMPOSTO DE RENDA

O módulo IR é uma funcionalidade **premium** que permite ao usuário registrar, organizar e exportar todas as despesas dedutíveis na declaração do Imposto de Renda.

### 16.1 Paywall (Módulo Não Habilitado)

```
[SCREENSHOT: Tela paywall do módulo IR com lista de funcionalidades]
```

Para usuários sem o módulo habilitado:
- Ícone 📋 grande centralizado
- Título: "Funcionalidade Premium"
- Descrição: "O módulo de Deduções IR está disponível no plano Premium"
- Lista de funcionalidades incluídas:
  - ✓ Saúde, educação, previdência
  - ✓ Limites automáticos por categoria
  - ✓ Exportação em PDF
  - ✓ Foto dos recibos
- Botão "Conhecer plano Premium"

---

### 16.2 Tela Principal IR

```
[SCREENSHOT: Tela de Deduções IR com grupos por categoria e total]
```

**Header:**
- ‹ Botão voltar
- Título "Deduções IR"

**Seletor de Ano:**
- ◀ Ano anterior
- Ano em destaque
- ▶ Próximo ano (desabilitado no ano atual)

**Estado Vazio:**
- "Nenhum lançamento dedutível em [ano]"
- Instrução de como cadastrar

---

### 16.3 Cards por Categoria

```
[SCREENSHOT: Card de categoria Saúde com progresso, itens e valores]
```

**Cabeçalho do card (azul):**
- Nome da categoria (ex: "Saúde")
- Total acumulado em R$ (direita, negrito)

**Seção de limite (se a categoria tem limite legal):**
- Barra de progresso: % do limite utilizado
- Texto: "⚠️ Limite: R$ X.XXX,XX/ano · Ainda pode deduzir: R$ X.XXX,XX"
- Se excedido: "🔴 Excedido em R$ X,XX (limite: R$ X.XXX,XX)"

**Categorias sem limite:**
- "✅ Sem limite — 100% dedutível"

**Lista de itens dentro do card:**

```
[SCREENSHOT: Item individual de dedução com botão de recibo]
```

Cada item:
- Nome do prestador (ex: "Dr. João Silva" ou nome do hospital)
- CPF/CNPJ do prestador
- Descrição + valor + data
- Número do recibo (se informado)
- Botão 🧾 — se há foto do recibo (abre modal de visualização)

---

### 16.4 Limites Legais por Categoria

| Categoria | Limite Anual |
|---|---|
| Saúde | Sem limite |
| Educação | R$ 3.561,50 |
| Previdência PGBL | Sem limite |
| Previdência Social | Sem limite |
| Doação | Sem limite |
| Pensão Alimentícia | Sem limite |
| Outros | Sem limite |

---

### 16.5 Total Geral

- Card azul no final da lista
- "TOTAL DE DEDUÇÕES [ANO]"
- Valor total em destaque

---

### 16.6 Exportação PDF

```
[SCREENSHOT: Botão de exportação PDF e PDF gerado aberto]
```

**Botão "📄 Exportar PDF"** — fixo no rodapé quando há itens:

O PDF gerado contém:
- Cabeçalho com logo do SnapGestão e nome do usuário
- Ano de referência
- Para cada categoria:
  - Nome e total
  - Barra de progresso vs. limite
  - Lista de deduções com todos os detalhes
- Total geral de deduções
- Rodapé com data de geração

**Após geração:**
- PDF salvo em Downloads do Android
- Alert com opção de Compartilhar imediatamente
- Compatible com e-mail, WhatsApp, etc.

---

### 16.7 Modal de Visualização de Recibo

```
[SCREENSHOT: Modal com foto do recibo em tela cheia]
```

- Fundo escuro (overlay)
- Imagem do recibo em destaque
- Cabeçalho: nome do prestador + botão fechar
- Botão "Compartilhar imagem"

---

## 17. MENTOR FINANCEIRO (IA)

O Mentor Financeiro é um assistente de inteligência artificial que analisa os dados financeiros do usuário e gera insights personalizados.

```
[SCREENSHOT: Tela do Mentor Financeiro com análise e botão de gerar relatório]
```

### 17.1 Seletor de Provedor de IA

```
[SCREENSHOT: Seletor de provedor IA com três opções]
```

O usuário pode escolher qual modelo de IA deseja usar:
- 🤖 **Claude (Anthropic)** — Haiku 4.5, padrão recomendado, mais preciso
- 🌟 **Gemini (Google)** — Gemini 2.5 Flash, boa relação qualidade/velocidade
- ⚡ **Groq** — Llama 3.3 70B, leve e eficiente

### 17.2 Análise Gerada

A IA analisa:
- Histórico de gastos por pote
- Tendências de consumo
- Comparação com meses anteriores
- Progresso de metas
- Alertas de potes críticos
- Oportunidades de economia

**Texto da análise:**
- Formatado em seções
- Emojis para facilitar leitura mobile
- Sugestões práticas e personalizadas

### 17.3 Exportação PDF do Mentor

```
[SCREENSHOT: PDF do Mentor Financeiro com análise formatada]
```

- Gera PDF com análise completa
- Cabeçalho com logo SnapGestão + ícone do provedor de IA usado
- Título: "Relatório do Mentor Financeiro"
- Data de geração
- Análise formatada em seções
- Salvo em Downloads

### 17.4 Limite de Tokens

- Cada usuário tem um limite mensal de tokens de IA
- Controlado na tabela `user_ai_tokens`
- Quando limite atingido: mensagem informativa e opção de upgrade

---

## 18. ANALISADOR DE PREÇOS (IA)

O Analisador de Preços combina IA com a base colaborativa de preços para identificar oportunidades de economia.

```
[SCREENSHOT: Tela do Analisador de Preços com comparativo de estabelecimentos]
```

### 18.1 Como Funciona

1. Usuário acessa a tela do Analisador
2. IA identifica os **5 itens mais comprados** pelo usuário
3. Busca na base colaborativa os preços desses itens nos últimos 30 dias
4. Compara preços entre estabelecimentos
5. Gera análise com sugestões de onde comprar mais barato

### 18.2 Comparativo de Preços

Para cada item analisado:
- Nome do item
- Preço médio pago pelo usuário
- Preço mais baixo disponível (qual estabelecimento)
- Economia potencial em R$

### 18.3 Dados Colaborativos

- Preços anônimos de outros usuários que optaram por compartilhar
- Agrupados por estabelecimento (via CNPJ)
- Apenas dados de cupons NFC-e (mais confiáveis)
- Atualização em tempo real conforme novos cupons são escaneados
- Expiram automaticamente após 30 dias

### 18.4 Exportação PDF

- Gerado com análise completa
- Mesmo padrão visual do Mentor Financeiro
- Título: "Relatório do Analisador de Preços"

---

## 19. TELA DE PERFIL E CONFIGURAÇÕES

A tela de Perfil centraliza todas as configurações do usuário e acesso a funcionalidades avançadas.

```
[SCREENSHOT: Tela de Perfil com header, stats e grupos de configurações]
```

### 19.1 Header do Perfil

- **Avatar** — círculo com iniciais do nome em cor primária
- **Nome completo** do usuário (grande, negrito)
- **E-mail**
- **Badge de ciclo** — "Ciclo: Dia X a [data fim]"

### 19.2 Cards de Estatísticas

```
[SCREENSHOT: Cards de estatísticas com saldo, metas e progresso]
```

Três cards lado a lado:
- 💰 **Saldo atual** — saldo do ciclo em andamento
- 🎯 **Metas ativas** — quantidade de metas em aberto
- 📊 **Meta prioritária** — nome + barra de % da meta principal

### 19.3 Card de Conquistas

```
[SCREENSHOT: Card de conquistas com preview dos 3 últimos badges]
```

- 🏆 Título "Conquistas"
- "X de N badges conquistados"
- Preview dos 3 últimos badges obtidos (ícone + nome)
- Link "Ver todas →" → tela de conquistas

### 19.4 Cards de IA

**Mentor Financeiro:**
- 🤖 Ícone
- Título e subtítulo
- Botão → abre tela do mentor

**Analisador de Preços:**
- 🔍 Ícone + badge "IA"
- Título e subtítulo
- Botão → abre tela do analisador

### 19.5 Grupos de Configurações

**Conta:**
- 💼 **Fontes de receita** — gerenciar fontes de renda
- 📅 **Ciclo mensal** — alterar dia de início do ciclo (1-28)
- 💱 **Moeda** — "Multi-moeda em breve"

**Potes e Cartões:**
- 💳 **Meus cartões de crédito** — gerenciar cartões
- 👶 **Modo Mesada** — "Em breve"

**Notificações:**
- ⚠️ **Alerta de gasto crítico** — toggle
- 🔔 **Lembrete fim de ciclo** — toggle
- 🏆 **Incentivos e conquistas** — toggle

**Dados:**
- 🤝 **Compartilhar preços anônimos** — toggle (base colaborativa)
- 📋 **Exportar lançamentos** → modal de exportação Excel
- 🗑️ **Limpar dados de teste** → ação destrutiva com confirmação

**Financeiro:**
- 📋 **Deduções de IR** → tela IR (ou paywall se não habilitado)

**Legal:**
- 📋 **Termos de Uso** → link externo
- 🔒 **Política de Privacidade** → link externo

**Sobre:**
- ℹ️ Versão 1.0.0
- 🚪 **Sair da conta** — logout com confirmação

### 19.6 Nota Legal LGPD

- "Você aceitou os Termos de Uso (versão 1.0) em [data/hora]"
- Referência à Política de Privacidade

### 19.7 Zona de Perigo

```
[SCREENSHOT: Zona de perigo com botão vermelho de exclusão de conta]
```

- Seção "⚠️ Zona de Perigo" em vermelho
- Botão "🗑️ Excluir minha conta"
- **Dois níveis de confirmação:**
  1. "Tem certeza? Esta ação é irreversível"
  2. "CONFIRMAÇÃO FINAL: todos os dados serão apagados"
- Botão desabilitado + spinner durante processamento

---

## 20. CARTÕES DE CRÉDITO

O gerenciamento de cartões permite que o app calcule automaticamente as datas de vencimento das compras no crédito.

```
[SCREENSHOT: Modal de cartões de crédito com lista e formulário de cadastro]
```

### 20.1 Lista de Cartões

- Nome do cartão (ex: "Nubank", "Itaú Platinum")
- Últimos 4 dígitos (ex: •••• 1234)
- Fechamento: "Dia X"
- Vencimento: "Dia Y"
- Botão editar + excluir por cartão

### 20.2 Cadastro de Cartão

**Campos:**
- **Nome** — ex: "Nubank", "Cartão Principal"
- **Últimos 4 dígitos** — (opcional, para identificação)
- **Dia de fechamento** — 1 a 31 (quando a fatura fecha)
- **Dia de vencimento** — 1 a 31 (quando a fatura vence)

### 20.3 Cálculo de Billing Date

Algoritmo de cálculo da data de vencimento:

```
1. Se data da compra >= dia de fechamento → fatura do próximo mês
2. Se dia de vencimento < dia de fechamento → adiciona mais 1 mês
3. Para cada parcela → adiciona offset de N meses
```

**Exemplo:**
- Cartão: fechamento dia 15, vencimento dia 5
- Compra: dia 10 (antes do fechamento)
- Vencimento 1ª parcela: dia 5 do mês seguinte
- Vencimento 2ª parcela: dia 5 de 2 meses depois

---

## 21. FONTES DE RECEITA

O sistema de fontes de receita permite registrar e rastrear historicamente a evolução da renda do usuário.

```
[SCREENSHOT: Modal de fontes de receita com lista e editor]
```

### 21.1 Gerenciamento

**Modal de Fontes de Receita** (Perfil → Fontes de receita):
- Lista de todas as fontes com nome, tipo e valor atual
- Botão "+" para adicionar nova fonte
- Toque para editar

**Edição de fonte:**
- Nome, tipo, valor
- **Seletor "Válido a partir de"** — escolhe a partir de qual mês a alteração vale (range: 24 meses atrás a 12 meses à frente)
- Permite registrar aumentos ou reduções salariais com data correta

### 21.2 Histórico de Renda

- Cada alteração de valor é registrada em `income_source_history`
- A tela Mensal usa o valor correto para cada mês histórico
- A Projeção usa o valor mais recente para meses futuros
- Meses passados sem alteração usam o valor mais antigo disponível

**Exemplo:**
- Janeiro: salário R$ 5.000
- Março: salário aumenta para R$ 6.000 (registrado com "Válido a partir de: março")
- App exibe R$ 5.000 em jan/fev e R$ 6.000 a partir de março

---

## 22. GAMIFICAÇÃO — CONQUISTAS E BADGES

O sistema de gamificação incentiva o usuário a manter boas práticas financeiras por meio de conquistas desbloqueáveis.

```
[SCREENSHOT: Tela de conquistas com badges obtidos e bloqueados]
```

### 22.1 Como Funciona

1. Usuário realiza ações no app (fechar ciclo, criar meta, depositar na reserva, etc.)
2. Após cada ação relevante, sistema verifica se algum badge foi conquistado
3. Se novo badge → exibe toast de comemoração (`BadgeToast`)
4. Badge registrado na tabela `user_badges`

### 22.2 Badges Disponíveis

| Badge | Nome | Requisito |
|---|---|---|
| 🎯 | Primeiro Pote | Criar o primeiro pote |
| 📊 | Mês Controlado | Fechar ciclo com saldo ≥ 0 |
| 💰 | Investidor | Criar primeira meta |
| 🛡️ | Proteção | Depositar na reserva de emergência |
| 🎉 | Mês Positivo | 3 ciclos consecutivos positivos |
| 📈 | Crescimento | Aumentar poupança mensalmente |
| 📷 | Leitor de Cupom | Escanear primeiro cupom NFC-e |
| 🤖 | Conselho de IA | Usar o Mentor Financeiro |
| ✅ | Meta Atingida | Concluir uma meta |

*(lista pode variar conforme atualização do app)*

### 22.3 Toast de Conquista

```
[SCREENSHOT: Toast de badge conquistado com animação]
```

- Exibido automaticamente após desbloquear badge
- Ícone do badge + nome + descrição
- Auto-dismiss após 3 segundos
- Swipe para fechar

### 22.4 Tela de Conquistas (via Perfil)

- Grade de todos os badges disponíveis
- Badges conquistados: coloridos, com data de conquista
- Badges bloqueados: cinza, com dica do requisito

---

## 23. EXPORTAÇÃO DE DADOS

### 23.1 Exportação Excel (CSV)

```
[SCREENSHOT: Modal de exportação com filtros de período]
```

**Acessado por:** Perfil → Dados → Exportar lançamentos

**Filtros:**
- Período (data inicial / data final)
- Tipo (despesas / receitas / todos)
- Pote específico ou todos os potes

**Formato do arquivo:**
- CSV compatível com Excel e Google Sheets
- Colunas: Data, Descrição, Estabelecimento, Valor, Pote, Forma de Pagamento, Tipo
- Salvo em Downloads do Android
- Opção de compartilhar por qualquer app

### 23.2 Exportação PDF do IR

Ver seção 16.6 — Exportação PDF do módulo IR.

### 23.3 Exportação PDF do Mentor/Analisador

Ver seções 17.3 e 18.4.

---

## 24. EXCLUSÃO DE CONTA

O usuário pode solicitar a exclusão completa e irreversível de todos os seus dados.

```
[SCREENSHOT: Confirmação final de exclusão de conta]
```

### 24.1 Processo

1. Usuário acessa Perfil → Zona de Perigo → "Excluir minha conta"
2. **Primeiro Alert:** "Tem certeza? Todos os seus dados serão apagados permanentemente. Esta ação não pode ser desfeita."
3. **Segundo Alert:** "ATENÇÃO — Confirmação final. Todos os dados serão deletados agora."
4. App chama Edge Function `delete-account` no Supabase
5. Dados deletados em ordem:
   - Transações de metas
   - Metas
   - Transações da reserva de emergência
   - Reserva de emergência
   - Meses de lançamentos agendados
   - Lançamentos agendados
   - Rollovers de ciclo
   - Transações
   - Histórico de potes
   - Potes
   - Histórico de fontes de receita
   - Fontes de receita
   - Usuário
6. Remove usuário do `auth.users` (Supabase Auth)
7. Limpa SecureStore do dispositivo
8. Faz logout
9. Redireciona para tela de login

### 24.2 Conformidade LGPD

- Exclusão imediata e completa (direito ao esquecimento — Art. 18, LGPD)
- Sem retenção de dados após exclusão
- Sem período de carência (exclusão instantânea)

---

## 25. JORNADAS COMPLETAS DO USUÁRIO

### Jornada A — Usuário Iniciante

```
1. Baixa o app → Cadastro com e-mail e senha
2. Confirma e-mail via link
3. Aceita Termos de Uso + Política de Privacidade
4. Onboarding:
   - Define saldo inicial de R$ 3.500
   - Escolhe ciclo personalizado (dia 5 — dia do salário)
   - Adiciona fonte: "Salário CLT" — R$ 4.000/mês
   - Cria pote "Alimentação" — R$ 800/mês (verde)
5. Chega à tela Mensal
6. FAB → cria potes: Moradia (R$ 1.200), Transporte (R$ 300), Lazer (R$ 500)
7. FAB → Registrar despesa: R$ 50 no pote Alimentação (Pix, mercado)
8. Escaneia cupom do supermercado (NFC-e)
   - App detecta 23 itens
   - Usuário seleciona pote Alimentação para todos
   - Salva em 2 toques
9. No dia 30 → Fechar ciclo → Sobra de R$ 200 → Investe em meta "Férias"
10. Próximo mês → repete o processo, acompanha progresso da meta
```

---

### Jornada B — Usuário Autônomo com IR

```
1. Completa onboarding (ciclo dia 1, 3 fontes de receita — freelances)
2. Habilita módulo IR (Premium)
3. Vai ao médico → FAB → Nova despesa → "Consulta Cardiologista"
   - Toggle "Dedutível no IR" ✓
   - Categoria: Saúde
   - Prestador: Dr. Carlos Mendes — CPF: 123.456.789-00
   - Anexa foto do recibo
4. Paga mensalidade escolar → mesmo fluxo → Categoria: Educação
5. Em dezembro → Perfil → Deduções de IR
   - Vê Saúde: R$ 12.400 (sem limite)
   - Vê Educação: R$ 3.200 de R$ 3.561 de limite
   - Toca "Exportar PDF"
6. Compartilha PDF com contador por WhatsApp
```

---

### Jornada C — Usuário com Cartão de Crédito

```
1. Perfil → Meus cartões → Cadastra "Nubank" (fechamento 15, vencimento 5)
2. FAB → Nova despesa → R$ 1.500 em móveis
   - Forma de pagamento: Crédito
   - Cartão: Nubank
   - Toggle parcelado: 5x de R$ 300
3. App cria 5 parcelas com datas:
   - Parcela 1: vencimento 05/jun
   - Parcela 2: vencimento 05/jul
   - ...
   - Parcela 5: vencimento 05/out
4. Tela de Projeção:
   - Mostra ícone 💳 nos meses jun-out
   - Toque em julho → Modal de crédito → vê "Móveis 2/5 — R$ 300"
5. Fecha ciclo de maio → saldo considera apenas parcela 1 (R$ 300)
```

---

### Jornada D — Usuário Focado em Metas

```
1. Tela Metas → Reserva de Emergência → Define meta: R$ 10.000
2. Tela Metas → + Nova meta → "Viagem Japão" → R$ 15.000 → 24 meses → R$ 625/mês
3. Mês 1 → Fechar ciclo com sobra → "Investir em meta" → Viagem Japão
4. Mês 3 → Recebe 13º → Metas → Depositar na reserva → "Externo" → R$ 2.000
5. Mês 18 → Meta atingida:
   - Badge "Meta atingida!" desbloqueado
   - Toast de parabéns
   - Toca "✅ Concluir"
6. Meta vai para "Concluídas"
7. Cria nova meta: "Troca do carro"
```

---

### Jornada E — Lançamentos a Confirmar

```
1. Tem plano de saúde R$ 450/mês debitado no dia 10
2. Detalhe do pote Saúde → Botão "📋 Agendar"
3. Modal: "Plano de Saúde" · R$ 450 · dia 10 · 24 meses · Módulo IR: Saúde
4. Sistema cria 24 linhas mensais com status "pendente"
5. Mês seguinte → Pote Saúde → seção "Pendentes"
   - Vê "Plano de Saúde — R$ 450 — vence 10/06"
   - Toca "Confirmar" → vira transação real + registra no IR
6. Repete mês a mês com 2 toques
7. Tab Potes mostra badge "24" no início, diminuindo a cada confirmação
```

---

## RESUMO EXECUTIVO PARA INVESTIDORES

### Problema Resolvido

85% dos brasileiros não controlam suas finanças pessoais de forma organizada. Os aplicativos existentes são complexos, não se adaptam ao ciclo de pagamento do usuário e não integram com a realidade fiscal brasileira (cartão de crédito com parcelamento, NFC-e, IRPF).

### Solução

O SnapGestão oferece controle financeiro **adaptado à realidade brasileira**:
- Ciclo financeiro personalizado (dia do salário)
- Parcelamento no crédito com cálculo automático
- Escaneamento de cupom NFC-e (exclusivo a poucos apps)
- Módulo completo de deduções do IR
- IA personalizada para análise e aconselhamento

### Modelo de Monetização

- **Plano Gratuito** — funcionalidades essenciais (potes, ciclo, lançamentos, metas)
- **Plano Premium** — módulo IR, tokens de IA ilimitados, base de preços avançada, exportações avançadas

### Tração

- App funcional e testado em React Native / Expo
- Backend completo em Supabase com RLS (Row Level Security)
- Integração com Google Cloud Vision (OCR), SEFAZ (NFC-e), Claude/Gemini/Groq (IA)
- LGPD compliant desde o primeiro release

### Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Mobile | React Native + Expo 54 + TypeScript |
| Navegação | Expo Router v6 (file-based) |
| Estado | Zustand + React Query |
| Backend | Supabase (Postgres + RLS + Edge Functions) |
| Storage | Supabase Storage (recibos IR) |
| IA | Claude Haiku (Anthropic) + Gemini 2.5 Flash + Llama 3.3 70B (Groq) |
| OCR | Google Cloud Vision API |
| NFC-e | SEFAZ WebView (SP, RJ, MG e outros estados) |
| Offline | expo-sqlite (sync futuro) |

---

*Documento gerado em maio de 2026 · SnapGestão v1.0*  
*Confidencial — uso exclusivo para apresentação a investidores*
