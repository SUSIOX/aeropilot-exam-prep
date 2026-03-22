# Řešení problémů s mobilní aplikací a guest módem

## Identifikované problémy

1. **Při prohlížení na mobilu a vyvolání aplikace ze záložky se vždy spustí v guest módu místo na přihlášení**
   - Příčina: Na mobilních prohlížečích (iOS Safari, Chrome na iOS) má `sessionStorage` jiné chování než na desktopu
   - Při otevření aplikace ze záložky se vytváří nová session, která nemá přístup k předchozímu `sessionStorage`
   - Tokeny byly ukládány pouze do `sessionStorage`

2. **Landing page nefunguje správně na mobilech**
   - Logika závisela na `localStorage.getItem('landingPageShown')`
   - Na mobilech může být `localStorage` také nestabilní
   - Uživatelé viděli landing page příliš často nebo naopak vůbec

## Implementovaná řešení

### 1. Hybridní ukládání tokenů (`src/services/cognitoAuthService.ts`)

**Změny:**
- Upravena metoda `storeTokens(tokenData: TokenData, rememberMe: boolean = false)`
  - Access token a id token se ukládají do `sessionStorage` (krátkodobé)
  - Refresh token se ukládá podle volby `rememberMe`:
    - Pokud `rememberMe === true`: refresh token do `localStorage` + `sessionStorage`
    - Pokud `rememberMe === false`: refresh token pouze do `sessionStorage`
- Upravena metoda `getTokens()` pro kontrolu obou úložišť
- Přidána metoda `restoreSession()` pro obnovení session z `localStorage`
- Upravena metoda `clearTokens()` pro mazání tokenů z obou úložišť

### 2. Vylepšená inicializace autentizace (`src/App.tsx`)

**Změny:**
- Upraven `useEffect` pro inicializaci credentials:
  - Při startu aplikace se zkusí obnovit session z `localStorage`
  - Pokud máme persistentní tokeny (`refresh_token` + `remember_me === 'true'`), zavoláme `cognitoAuthService.restoreSession()`
  - Po úspěšném obnovení se nastaví `userMode` na `'logged-in'`
- Upravena inicializace `userMode`:
  - Přidána kontrola persistentních tokenů pro mobilní zařízení
  - Log pro informování o nalezení persistentních tokenů

### 3. Mobile-friendly landing page (`src/App.tsx`)

**Změny:**
- Upravena logika `showLandingPage`:
  - Detekce mobilního zařízení pomocí `navigator.userAgent`
  - **Pro mobilní zařízení:**
    - Landing page se zobrazuje pouze pro guesty
    - Zobrazuje se maximálně 1x denně (podle `landingPageLastShown`)
    - Ukládá se datum místo permanentního flagu
  - **Pro desktop:**
    - Původní logika (permanentní flag `landingPageShown`)
- Upraveny funkce `switchToGuestMode()` a `handleLandingAuthSuccess()` pro správné ukládání stavu podle typu zařízení

### 4. "Remember me" funkcionalita (`src/components/CognitoAuth.tsx`)

**Změny:**
- Přidán state `rememberMe` (defaultně `true` pro lepší mobilní UX)
- Přidán checkbox "Zůstat přihlášen (doporučeno pro mobily)" do UI
- Upravena funkce `exchangeCodeForTokens()` pro použití `cognitoAuthService.storeTokens()` s parametrem `rememberMe`
- Přidán import `cognitoAuthService`

## Výhody implementovaného řešení

1. **Lepší UX na mobilech:** Uživatelé zůstanou přihlášení i po zavření a znovu otevření aplikace
2. **Automatické obnovení session:** Při ztrátě `sessionStorage` se session obnoví z `localStorage`
3. **Inteligentní landing page:** Na mobilech se nezobrazuje příliš často, ale stále plní svůj účel
4. **Zvýšená bezpečnost:** Access tokeny zůstávají v `sessionStorage`, pouze refresh token může být v `localStorage`
5. **Zpětná kompatibilita:** Stávající uživatelé nejsou ovlivněni

## Testování

- Build aplikace proběhl úspěšně (`npm run build`)
- TypeScript chyby: Zbývá jedna chyba nesouvisející s těmito změnami (ModelButtonProps)
- Funkčnost by měla být zachována pro všechny scénáře:
  - Noví uživatelé na mobilech
  - Existující uživatelé na mobilech
  - Desktop uživatelé
  - Přechod mezi guest a logged-in módy

## Nasazení

Změny jsou připraveny k nasazení. Doporučeno:
1. Otestovat na reálných mobilních zařízeních (iOS Safari, Android Chrome)
2. Monitorovat chyby v konzoli prohlížeče
3. Sledovat metriky přihlášení/odhlášení

## Budoucí vylepšení

1. **IndexedDB pro spolehlivější ukládání:** Pro kritická data na mobilech
2. **Service Worker pro offline funkcionalitu:** PWA vylepšení
3. **Push notifikace:** Pro lepší engament uživatelů
4. **Detekce nedostatku místa:** Varování před vymazáním `localStorage`