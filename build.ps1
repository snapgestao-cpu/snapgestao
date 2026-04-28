# SnapGestão — Build Script
# Execute: .\build.ps1

Write-Host "🚀 Iniciando build do SnapGestão..." -ForegroundColor Cyan

# 1. Ir para a pasta do projeto
Set-Location C:\snapgestao\snapgestao

# Commitar mudanças nos assets antes do build
Write-Host "💾 Commitando assets..." -ForegroundColor Yellow
git add assets/
git add app.json
git commit -m "build: atualizar ícones e versão" --allow-empty
git push origin master:main

# 2. Gerar bundle JS
Write-Host "📦 Gerando bundle JavaScript..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force `
  -Path "android\app\src\main\assets" | Out-Null

npx react-native bundle `
  --platform android `
  --dev false `
  --entry-file node_modules/expo-router/entry.js `
  --bundle-output android\app\src\main\assets\index.android.bundle `
  --assets-dest android\app\src\main\res

# 3. Build do APK
Write-Host "🔨 Compilando APK..." -ForegroundColor Yellow
Set-Location android
.\gradlew assembleRelease `
  -x lint `
  -x lintVitalAnalyzeRelease

# 4. Copiar APK para pasta raiz
Set-Location ..
$apkSource = "android\app\build\outputs\apk\release\app-release.apk"
$apkDest = "SnapGestao-v1.0.apk"

if (Test-Path $apkSource) {
    Copy-Item $apkSource $apkDest -Force
    $size = (Get-Item $apkDest).Length / 1MB
    Write-Host "✅ APK gerado com sucesso!" -ForegroundColor Green
    Write-Host "📁 Arquivo: $apkDest" -ForegroundColor Green
    Write-Host "📏 Tamanho: $([math]::Round($size, 1)) MB" -ForegroundColor Green
} else {
    Write-Host "❌ Erro: APK não encontrado" -ForegroundColor Red
}