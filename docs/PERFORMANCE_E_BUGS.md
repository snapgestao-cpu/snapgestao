# Performance e Bugs Conhecidos

## Regras de Performance (não regredir)

Cada query Supabase = ~100–300ms de roundtrip. Minimizar roundtrips.

- **Sem N+1 em pote queries** — `enrichWithHistory` usa um único `.in('pot_id', potIds)`. Nunca regredir para `Promise.all(pots.map(pot => supabase...eq('pot_id', pot.id)...))`.
- **Emergency pot balance sempre dentro de `Promise.all`** — nunca sequencialmente após o bloco principal. Ambos `index.tsx` e `monthly.tsx` incluem a query do ep balance no segundo bloco paralelo.
- **`checkAndGrantBadgesOnStartup` no startup, `checkAndGrantBadges` em ações explícitas** — startup pula 5 queries se chamado dentro de 1h (AsyncStorage key: `badge_check_{userId}`).
- **Sem `getSession()` redundante em `_layout.tsx`** — `init()` já chama `loadSession()`.
- **Projeção usa `getPotsHistoryBatch`** — 2 queries para todos os offsets, não uma `getPotsForMonth` por mês.
- **`monthly.tsx` usa `computeCycleSummaryFromData`** — síncrono, zero queries. O rollover incoming é buscado no `Promise.all` principal de 8 queries. **Nunca** chamar `calculateCycleSummary` de `monthly.tsx`.
- **`monthly.tsx` transaction queries com `.limit(200)`** — evita memória ilimitada em datasets grandes.
- **`ImportFileModal` em `monthly.tsx` é montado condicionalmente** — `{showImport && <ImportFileModal .../>}`. Nunca regredir para mount incondicional.
- **Single `NewPotModal` em `index.tsx`** — modes create e edit compartilham uma instância via `key={editingPot?.id ?? 'new'}` + `visible={showNewPot || !!editingPot}`. Não separar em dois mounts.

## Bugs Android Conhecidos (corrigidos — não reintroduzir)

### Button bounce
`KeyboardAvoidingView behavior="height"` no nível da tela causa animação de layout antes do teclado abrir.  
**Fix**: remover KAV das telas; usar `<SafeAreaView edges={['top']}>` como root. KAV apenas dentro de `Modal`.

### Modal layout corruption
Aninhar bottom sheet dentro do `TouchableOpacity` overlay com `justifyContent: 'flex-end'` causa sobreposição de elementos.  
**Fix**: siblings, não parent-child (ver docs/ARQUITETURA.md — Onboarding modal structure).

### `storage.removeItem is not a function`
`expo-secure-store` expõe `getItemAsync/setItemAsync/deleteItemAsync` mas Supabase SDK espera `getItem/setItem/removeItem`.  
**Fix**: `ExpoSecureStoreAdapter` em `lib/supabase.ts`.

## Constraints da plataforma

- `expo-router` pinado em `~6.0.23` para Expo 54 — não atualizar sem atualizar `expo` junto.
- New Architecture habilitada (`newArchEnabled: true`) — evitar libs incompatíveis.
- Usar apenas APIs do `expo-router` (`router`, `Link`, `useLocalSearchParams`) — nunca importar de `@react-navigation` diretamente.
- `babel.config.js` não existe — não criar a menos que seja necessário para algum plugin.
- Instalar dependências sempre com `--legacy-peer-deps`.

## Arquivos mortos (podem ser deletados)

- `components/ProjectionEntryModal.tsx` — não importado em lugar nenhum
- `components/charts/BarChart.tsx` — não importado em lugar nenhum
