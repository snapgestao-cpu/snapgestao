# SnapGestao — Criar releases no GitHub
# Execute APÓS autenticar: gh auth login --web
# Execute: .\create-releases.ps1

$GH = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin\gh.exe"
$REPO = "snapgestao-cpu/snapgestao"

Set-Location C:\snapgestao\snapgestao

# Verificar autenticação
& $GH auth status
if ($LASTEXITCODE -ne 0) {
  Write-Host "Erro: autentique com 'gh auth login --web' primeiro" -ForegroundColor Red
  exit 1
}

# Verificar APKs
$debugApk  = "SnapGestao-v1.1.0-build19-preview.apk"
$releaseApk = "SnapGestao-v1.1.0-build19.apk"

if (-not (Test-Path $debugApk)) {
  Write-Host "APK debug nao encontrado: $debugApk" -ForegroundColor Red
  exit 1
}
if (-not (Test-Path $releaseApk)) {
  Write-Host "APK release nao encontrado: $releaseApk" -ForegroundColor Red
  exit 1
}

$debugSize   = [math]::Round((Get-Item $debugApk).Length / 1MB, 1)
$releaseSize = [math]::Round((Get-Item $releaseApk).Length / 1MB, 1)
Write-Host "APK preview:  $debugSize MB" -ForegroundColor Cyan
Write-Host "APK release:  $releaseSize MB" -ForegroundColor Cyan

# ── Release de Preview ──────────────────────────────────────────────────────
Write-Host "`nCriando release v1.1.0-preview..." -ForegroundColor Yellow

$previewNotes = @"
## Preview Build — Uso interno/testes

### Novidades v1.1.0
- 📊 Tela de Gráficos com 5 tópicos (Gastos, Receita, Metas, Crédito, IA)
- ⭐ Sistema de planos Free e Premium
- 📋 Módulo IR com reembolso de saúde redesenhado
- 💸 Registro e controle de Dívidas (novo)
- 🔢 Saldo negativo no onboarding
- 🖼️ Avatar personalizado no perfil
- 💳 Seleção visual de cartões de crédito (50+ cartões brasileiros)
- 📥 Importação com modelo de planilha
- 🤖 IA automática por plano (Llama Free / Claude Premium)
- ⚡ Assets otimizados: 15 MB → 5,4 MB (−64%)
- 🔒 .gitignore atualizado, auditoria de segurança completa

### Correções
- Exclusão de cartão com aviso de parcelas futuras
- Recalculo de billing_date ao alterar datas de fechamento/vencimento
- Limite combinado metas+dívidas no plano gratuito

### Instalação
1. Baixe o APK abaixo
2. No Android: Configurações → Segurança → Fontes desconhecidas → Ativar
3. Instale o arquivo APK

⚠️ **Build de desenvolvimento** — apenas para testes internos. Inclui logs de debug.
"@

& $GH release create v1.1.0-preview `
  $debugApk `
  --repo $REPO `
  --title "v1.1.0 Preview — Desenvolvimento" `
  --notes $previewNotes `
  --prerelease `
  --target main

if ($LASTEXITCODE -eq 0) {
  Write-Host "Release preview criada!" -ForegroundColor Green
} else {
  Write-Host "Erro ao criar release preview" -ForegroundColor Red
}

# ── Release de Produção ──────────────────────────────────────────────────────
Write-Host "`nCriando release v1.1.0..." -ForegroundColor Yellow

$releaseNotes = @"
## SnapGestão v1.1.0

### Novidades
- 📊 **Gráficos financeiros** — 5 categorias: Gastos, Receita e Saldo, Metas e Reserva, Crédito, Score IA
- ⭐ **Planos Free e Premium** — limites de potes, metas, cartões e tokens de IA
- 📋 **Módulo IR** redesenhado com reembolso de saúde inline
- 💸 **Controle de Dívidas** — registro, pagamentos (externo/ciclo), histórico, quitação
- 🔢 **Saldo negativo no onboarding** — toggle +/− para quem começa no vermelho
- 🖼️ **Avatar no perfil** — upload via câmera ou galeria
- 💳 **50+ cartões brasileiros** — seleção visual com logo do banco
- 📥 **Modelo de planilha** para importação de transações
- 🤖 **IA automática** — Llama 3.3 (free) / Claude Haiku (premium)
- ⚡ **Performance** — assets otimizados, lazy load, queries indexadas

### Instalação
1. Baixe o APK abaixo
2. No Android: **Configurações → Segurança → Instalar apps desconhecidos**
3. Selecione o arquivo e instale

### Requisitos
- Android 8.0+ (API 26)
- ~80 MB de armazenamento
"@

& $GH release create v1.1.0 `
  $releaseApk `
  --repo $REPO `
  --title "v1.1.0 — Release" `
  --notes $releaseNotes `
  --target production

if ($LASTEXITCODE -eq 0) {
  Write-Host "Release de producao criada!" -ForegroundColor Green
} else {
  Write-Host "Erro ao criar release de producao" -ForegroundColor Red
}

Write-Host "`nReleases disponiveis em: https://github.com/$REPO/releases" -ForegroundColor Cyan
