# Relatório de Auditoria Git — SnapGestão
**Data:** 28/05/2026  
**Branch:** master | **Commits:** 323 | **Arquivos rastreados:** 277

---

## ⚠️ Tamanho do repositório

| Item | Valor |
|---|---|
| Tamanho do `.git` | **91 MB** |
| Assets rastreados | 15 MB |
| Pasta `android/` (local, não empacotada no .git) | 2,1 GB |
| Objetos Git | 2.412 objetos soltos (84,58 MiB) |

**Status:** Atenção — o `.git` com 91 MB está acima do esperado para um projeto frontend. A causa principal são blobs antigos no histórico que já foram removidos da árvore de trabalho mas permanecem no histórico (`assets/adaptive-icon1.png` = 1,7 MB, `assets/carteira` = 1,5 MB, versões antigas de `package-lock.json` = ~450 KB cada, múltiplas versões de ícones).

**Recomendação:** Executar `git gc --aggressive --prune=now` para compactar objetos. Para limpeza profunda do histórico (remoção de blobs antigos), considerar `git filter-repo` após encerrar o ciclo de desenvolvimento atual — essa operação reescreve o histórico e requer force-push.

---

## ✅ Arquivos sensíveis rastreados

| Verificação | Resultado |
|---|---|
| `.env` no repositório | ✅ **Não** |
| `node_modules/` rastreado | ✅ **Não** |
| Arquivos `.apk` / `.aab` rastreados | ✅ **Não** (`.apk` está no .gitignore) |
| `android/app/debug.keystore` rastreado | ⚠️ **Sim** — ver abaixo |
| `.env.production.example` rastreado | ✅ **OK** — contém apenas placeholders |

### ⚠️ `android/app/debug.keystore`

O arquivo de keystore de **debug** do Android está rastreado. Isso foi adicionado intencionalmente no commit `b65ef9f` junto com o rastreamento completo da pasta `android/` (necessário para o repositório local do AsyncStorage).

- **Risco real:** Baixo — é um keystore de debug gerado automaticamente pelo SDK Android com senha pública (`android`/`androiddebugkey`). Não deve ser usado para assinar builds de produção.
- **Risco se repositório for público:** Médio — qualquer pessoa pode assinar APKs falsos com essa chave, o que pode confundir lojas alternativas.
- **Ação recomendada:** Se o repositório for tornado público, remover do histórico com `git filter-repo --path android/app/debug.keystore --invert-paths`. Por ora (repo privado), é aceitável.

---

## ✅ Auditoria de segurança — secrets hardcoded

| Verificação | Resultado |
|---|---|
| Chaves `sk_*` hardcoded | ✅ **Nenhuma encontrada** |
| Chaves `sk-ant-*` (Anthropic) hardcoded | ✅ **Nenhuma encontrada** |
| JWT tokens hardcoded (`eyJhb...`) | ✅ **Nenhum encontrado** |
| Supabase `anon_key` hardcoded | ✅ **Nenhuma encontrada** |

**Uso de `process.env` detectado em:**
- `lib/supabase.ts` — acessa `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `lib/ai-provider.ts` — acessa chaves Anthropic, Gemini, Groq
- `app/(tabs)/profile.tsx` — uso auxiliar

Todos os acessos são via variáveis de ambiente `EXPO_PUBLIC_*`, corretamente injetadas pelo Metro no build. **Nenhum secret está exposto no código-fonte.**

---

## ⚠️ `.gitignore` — Padrões faltando

| Padrão | Status |
|---|---|
| `node_modules/` | ✅ Presente |
| `.env` | ✅ Presente |
| `.env*.local` | ✅ Presente |
| `.expo/` | ✅ Presente |
| `dist/` | ✅ Presente |
| `*.apk` | ✅ Presente |
| `*.jks` | ✅ Presente |
| `*.pem` | ✅ Presente |
| `*.aab` | ❌ **Faltando** |
| `*.ipa` | ❌ **Faltando** |
| `android/app/build/` | ❌ **Faltando** |
| `.env.production` | ❌ **Faltando** |

> **Nota:** `android/` está rastreado intencionalmente para preservar o repositório local do AsyncStorage (`android/app/src/main/java/com/asyncstorage/...`). Os padrões faltantes acima não causaram problemas ainda mas devem ser adicionados preventivamente.

**Adicionar ao `.gitignore`:**
```
*.aab
*.ipa
.env.production
android/app/build/
android/build/
```

---

## ⚠️ Assets — Arquivos grandes

**Total de assets:** 15 MB

### Arquivos acima de 500 KB (atualmente no disco)

| Arquivo | Tamanho |
|---|---|
| `assets/potes/icon_v1.png` | 892 KB |
| `assets/icon_v1.png` | 810 KB |
| `assets/potes/Pote_volume_20.png` | 759 KB |
| `assets/potes/splash-icon.png` | 727 KB |
| `assets/icon.png` | 698 KB |
| `assets/adaptive-icon.png` | 698 KB |
| `assets/potes/logo_SpapGestao.png` | 501 KB |

### Blobs antigos ainda no histórico Git (já removidos da árvore)

| Objeto | Tamanho original |
|---|---|
| `assets/adaptive-icon1.png` | 1,7 MB |
| `assets/carteira` | 1,5 MB |
| `assets/potes/splash-icon.png` (versão antiga) | 745 KB |
| `assets/splash-icon1.png` | 660 KB |

**Status:** Atenção — 15 MB de assets é gerenciável para React Native, porém as imagens de potes (`Pote_volume_*.png`) somam ~3 MB e são arquivos PNG não otimizados.

**Recomendações:**
1. Executar `pngquant --quality=70-85 assets/potes/*.png assets/*.png` para reduzir ~40-60% sem perda visual perceptível
2. Converter imagens estáticas de UI (ícones, logos) para WebP — economia adicional de ~30%
3. Para o histórico: `git filter-repo` pode remover `assets/adaptive-icon1.png` e `assets/carteira` do histórico, reduzindo o `.git` em ~3 MB

---

## ✅ Histórico limpo — verificação de `.env`

| Verificação | Resultado |
|---|---|
| `.env` commitado alguma vez | ✅ **Não — histórico limpo** |
| `.env.production` no histórico | ✅ **Não** |
| Arquivo de exemplo com valores reais | ✅ **Não** — `.env.production.example` só tem placeholders |

O histórico de 323 commits não contém nenhum commit com arquivos `.env` reais.

---

## 📋 Ações recomendadas

### 🔴 Alta prioridade

1. **Adicionar padrões ao `.gitignore`:**
   ```
   *.aab
   *.ipa
   .env.production
   android/app/build/
   android/build/
   ```

### 🟡 Média prioridade

2. **Otimizar imagens de assets** com `pngquant` ou conversão para WebP — potencial redução de 5–8 MB no bundle final do app.

3. **Compactar repositório Git:**
   ```bash
   git gc --aggressive --prune=now
   ```
   Deve reduzir o `.git` de 91 MB para ~20–30 MB.

4. **Documentar decisão do `debug.keystore`** — se o repositório for aberto ao público no futuro, removê-lo do histórico antes.

### 🟢 Baixa prioridade

5. **Remover blobs antigos do histórico** (`assets/adaptive-icon1.png`, `assets/carteira`) com `git filter-repo` após o próximo release estável. Reduz o `.git` em ~3,2 MB adicionais.

6. **Considerar Git LFS** para arquivos de assets acima de 1 MB se o repositório crescer — não urgente no estágio atual.

---

## ✅ Conformidade para produção

**Apto — com ressalvas menores.**

O repositório está em boa forma para produção:
- Nenhum secret ou API key hardcoded no código-fonte ✅
- Nenhum `.env` real no histórico ✅
- `node_modules` e builds não rastreados ✅
- Stack de variáveis de ambiente corretamente estruturada com `EXPO_PUBLIC_*` ✅

As ressalvas (`debug.keystore` rastreado, alguns padrões faltando no `.gitignore`, assets não otimizados) **não bloqueiam** a publicação na Google Play Store, mas devem ser endereçadas antes de abrir o repositório publicamente ou antes de um crescimento significativo do time.
