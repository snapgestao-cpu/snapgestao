# SnapGestao - Build Script
# Execute: .\build.ps1

Write-Host "Iniciando build do SnapGestao..." -ForegroundColor Cyan

Set-Location C:\snapgestao\snapgestao

# 1. Commitar assets atualizados
Write-Host "Commitando assets..." -ForegroundColor Yellow
git add assets/
git add app.json
git commit -m "build: atualizar icones e versao" --allow-empty
git push origin master:main

# 2. Parar processos Gradle
Write-Host "Parando processos Gradle..." -ForegroundColor Yellow
Get-Process | Where-Object {
  $_.Name -match "java|gradle"
} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 3. Parar Gradle Daemon
if (Test-Path android) {
  Set-Location android
  .\gradlew --stop 2>$null
  Set-Location ..
  Start-Sleep -Seconds 2
}

# 4. Deletar pasta android
Write-Host "Limpando build anterior..." -ForegroundColor Yellow
if (Test-Path android) {
  Remove-Item -Recurse -Force android -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
}

# 5. Prebuild com icones novos
Write-Host "Gerando arquivos nativos..." -ForegroundColor Yellow
npx expo prebuild --clean --no-install
if ($LASTEXITCODE -ne 0) {
  Write-Host "Erro no prebuild!" -ForegroundColor Red
  exit 1
}

# 6. Gerar bundle JavaScript
Write-Host "Gerando bundle JavaScript..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force `
  -Path "android\app\src\main\assets" | Out-Null

npx react-native bundle `
  --platform android `
  --dev false `
  --entry-file node_modules/expo-router/entry.js `
  --bundle-output android\app\src\main\assets\index.android.bundle `
  --assets-dest android\app\src\main\res

if ($LASTEXITCODE -ne 0) {
  Write-Host "Erro ao gerar bundle!" -ForegroundColor Red
  exit 1
}

# 7. Build do APK
Write-Host "Compilando APK..." -ForegroundColor Yellow
Set-Location android
.\gradlew assembleRelease
$buildResult = $LASTEXITCODE
Set-Location ..

if ($buildResult -ne 0) {
  Write-Host "Erro no build!" -ForegroundColor Red
  exit 1
}

# 8. Copiar APK com nome da versao do app.json
$appJson = Get-Content app.json | ConvertFrom-Json
$version = $appJson.expo.version
$versionCode = $appJson.expo.android.versionCode
$apkSource = "android\app\build\outputs\apk\release\app-release.apk"
$apkDest = "SnapGestao-v$version-build$versionCode.apk"

if (Test-Path $apkSource) {
  Copy-Item $apkSource $apkDest -Force
  $size = (Get-Item $apkDest).Length / 1MB
  Write-Host "APK gerado com sucesso!" -ForegroundColor Green
  Write-Host "Arquivo: $apkDest" -ForegroundColor Green
  Write-Host "Tamanho: $([math]::Round($size,1)) MB" -ForegroundColor Green
  Write-Host "Localizacao: C:\snapgestao\snapgestao\$apkDest" -ForegroundColor Green
} else {
  Write-Host "APK nao encontrado!" -ForegroundColor Red
  exit 1
}
