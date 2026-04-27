# 📱 Guia de Build — SnapGestão

## Pré-requisitos

### 1. Node.js e dependências
```bash
node --version  # precisa ser 18+
npm install
```

### 2. Java JDK 17
Download: https://adoptium.net/
Verificar: java -version

### 3. Android Studio
Download: https://developer.android.com/studio
Após instalar:
- Abrir Android Studio
- SDK Manager → instalar Android SDK 34
- Configurar ANDROID_HOME nas variáveis de ambiente

### 4. Variáveis de ambiente do sistema (Windows)
```
ANDROID_HOME = C:\Users\SEU_USUARIO\AppData\Local\Android\Sdk
Path += %ANDROID_HOME%\tools
Path += %ANDROID_HOME%\platform-tools
```

## Passo a Passo do Build

### 1. Preparar o .env de produção
```bash
# Copiar o exemplo e preencher com valores reais
copy .env.production.example .env
# Editar o .env com as chaves reais
```

### 2. Gerar os arquivos nativos
```bash
npx expo prebuild --clean
```
Isso cria a pasta /android com todo o código nativo.

### 3. Gerar a keystore (APENAS NA PRIMEIRA VEZ)
A keystore é sua assinatura digital — guarde com segurança!
```bash
keytool -genkeypair -v \
  -storefile android/app/snapgestao.keystore \
  -alias snapgestao \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```
Anote as senhas criadas — sem elas não pode atualizar o app!

### 4. Configurar a keystore no gradle
Criar arquivo android/keystore.properties:
```
storePassword=SUA_SENHA_AQUI
keyPassword=SUA_SENHA_AQUI
keyAlias=snapgestao
storeFile=snapgestao.keystore
```

Editar android/app/build.gradle para usar a keystore:
```gradle
android {
    signingConfigs {
        release {
            def keystorePropertiesFile =
              rootProject.file("keystore.properties")
            def keystoreProperties = new Properties()
            keystoreProperties.load(
              new FileInputStream(keystorePropertiesFile)
            )
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            shrinkResources true
        }
    }
}
```

### 5. Gerar o APK de release
```bash
cd android
./gradlew assembleRelease
# Windows:
gradlew assembleRelease
```

### 6. Localizar o APK gerado
```
android/app/build/outputs/apk/release/app-release.apk
```

### 7. Testar o APK antes de publicar
Instalar direto no celular via cabo USB:
```bash
adb install android/app/build/outputs/apk/release/app-release.apk
```

## Para publicar na Google Play

### Gerar AAB em vez de APK (recomendado pela Google)
```bash
cd android
gradlew bundleRelease
```
Arquivo gerado:
android/app/build/outputs/bundle/release/app-release.aab

### Upload no Google Play Console
1. Acesse play.google.com/console
2. Criar novo app
3. Preencher ficha do app:
   - Nome: SnapGestão
   - Descrição curta (80 chars)
   - Descrição completa
   - Screenshots (mínimo 2)
   - Ícone 512×512px
   - Imagem de destaque 1024×500px
4. Production → Create new release
5. Upload do .aab
6. Aguardar revisão (1-3 dias)

## Atualizar o app (versões futuras)

Sempre que publicar uma atualização:
1. Incrementar versionCode em app.json:
   "versionCode": 2  (incrementar +1)
2. Incrementar version se mudança grande:
   "version": "1.1.0"
3. Repetir passos 2, 5 e 6 acima

## ⚠️ IMPORTANTE — Guardar com segurança

Fazer backup de:
- android/app/snapgestao.keystore
- android/keystore.properties (com as senhas)
- .env (com as chaves de API)

SEM A KEYSTORE NÃO É POSSÍVEL ATUALIZAR O APP!

## Arquivos a adicionar no .gitignore
```
android/
*.keystore
keystore.properties
```
