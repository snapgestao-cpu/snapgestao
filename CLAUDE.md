# CLAUDE.md

## Projeto

**SnapGestão** — app de controle financeiro pessoal (React Native + Expo 54).  
Supabase: `https://cvyissbkfwphtmvvcvop.supabase.co`

## Documentação detalhada

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — routing, data flow, cycle sync, libs, auth, styling
- [`docs/BANCO_DE_DADOS.md`](docs/BANCO_DE_DADOS.md) — schema, migrations, queries de potes, transações
- [`docs/FEATURES.md`](docs/FEATURES.md) — todas as features: potes, mensal, projeção, OCR/NFC-e, IA, gamification, imports/exports
- [`docs/PERFORMANCE_E_BUGS.md`](docs/PERFORMANCE_E_BUGS.md) — regras de performance, bugs Android conhecidos, constraints

## Stack

React Native · Expo 54 · Expo Router ~6.0.23 · TypeScript · Supabase (Postgres + RLS + Edge Functions) · Zustand · React Query · expo-sqlite

## Comandos

```bash
npm start                    # Metro Bundler
npm run android              # rodar no Android
npx tsc --noEmit             # type-check
npm install <pkg> --legacy-peer-deps   # instalar (sempre --legacy-peer-deps)
npm run build:android        # APK release
npm run build:android:debug  # APK debug
npm run prebuild             # regenerar android/ ios/ (DESTRUTIVO)
```

## Variáveis de ambiente (`.env` — nunca commitar)

```
EXPO_PUBLIC_SUPABASE_URL=https://cvyissbkfwphtmvvcvop.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_GEMINI_API_KEY=...
EXPO_PUBLIC_ANTHROPIC_API_KEY=...
EXPO_PUBLIC_GROQ_API_KEY=...
```

`EXPO_PUBLIC_*` são inlined pelo Metro. Secrets de backend nunca devem usar este prefixo.

## Regras críticas (resumo rápido)

- **Potes**: sempre usar `lib/pot-history.ts` — nunca `.is('deleted_at', null)` sozinho
- **Ciclos**: crédito filtra por `billing_date`; tudo mais por `date`
- **`monthly.tsx`**: usa `computeCycleSummaryFromData` (síncrono) — nunca `calculateCycleSummary`
- **`_layout.tsx`**: nunca adicionar `getSession()` extra — `init()` já cuida disso
- **Onboarding guard**: nunca usar `initial_balance === 0` — saldo zero é válido
- **payment_method**: nunca usar `'other'` — não é válido no DB; fallback: `'cash'`
- **PDF**: nunca usar `documentDirectory` para salvar — usar `MediaLibrary` + Downloads
- **NFCeWebView**: URL já vem sanitizada do caller — nunca chamar `sanitizeNFCeUrl` dentro
- **Notificações**: completamente desabilitadas — não adicionar imports de `expo-notifications`

## Roadmap

- [ ] Glossário financeiro
- [ ] Testes e validações finais
- [ ] Build de produção (EAS)
- [ ] Push notifications (requer build de produção)
