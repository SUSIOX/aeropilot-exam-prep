# Vytvoření Public App Client v Cognito

## ❌ Problém identifikován

```json
{"error":"invalid_client","error_description":"invalid_client_secret"}
```

**Současný App Client má Client Secret** - to způsobuje chybu při token exchange.
Public client (SPA) NESMÍ mít secret, protože nemůže být bezpečně uložený v browseru.

## ✅ Řešení: Vytvořit nový Public Client

### **Krok 1: Vytvořte nový App Client**

1. **Přejděte do AWS Console:**
   ```
   Cognito → User pools → User pool - dwwc1 
   → App integration → Create app client
   ```

2. **Základní nastavení:**
   ```
   App type: Public client ← DŮLEŽITÉ!
   App client name: aeropilot-web-public
   ```

3. **Authentication flows:**
   ```
   ☑ ALLOW_USER_PASSWORD_AUTH
   ☑ ALLOW_REFRESH_TOKEN_AUTH
   ☐ Don't generate a client secret ← MUSÍ být zaškrtnuté!
   ```

4. **OAuth 2.0 settings:**
   
   **Allowed callback URLs:**
   ```
   https://susiox.github.io/aeropilot-exam-prep/
   http://localhost:3002/
   ```
   
   **Allowed sign-out URLs:**
   ```
   https://susiox.github.io/aeropilot-exam-prep/
   http://localhost:3002/
   ```
   
   **OAuth 2.0 grant types:**
   ```
   ☑ Authorization code grant
   ☐ Implicit grant (optional)
   ```
   
   **OpenID Connect scopes:**
   ```
   ☑ email
   ☑ openid
   ☑ profile
   ```

5. **Advanced settings (optional):**
   ```
   Access token expiration: 60 minutes
   ID token expiration: 60 minutes
   Refresh token expiration: 30 days
   ```

6. **Klikněte "Create app client"**

### **Krok 2: Zkopírujte nový Client ID**

Po vytvoření uvidíte:
```
App client name: aeropilot-web-public
Client ID: NOVY_CLIENT_ID_XXXXX
Client secret: No client secret ← Toto je správně!
```

**Zkopírujte si nový Client ID!**

### **Krok 3: Aktualizujte .env**

Otevřete `.env` soubor a změňte:

```env
# Staré (s client secret - NEFUNGUJE)
# COGNITO_CLIENT_ID=32d9ivfbtnpo69jaq7vld9p2jp

# Nové (bez client secret - FUNGUJE)
COGNITO_CLIENT_ID=NOVY_CLIENT_ID_XXXXX
```

### **Krok 4: Rebuild a deploy**

```bash
# Build aplikace
npm run build

# Commit změny
git add .
git commit -m "Fix: Use public Cognito client without secret"
git push

# Deploy na GitHub Pages (pokud používáte GitHub Actions)
# nebo manuálně zkopírujte dist/ do gh-pages branch
```

### **Krok 5: Test**

1. Vyčistěte browser cache (Ctrl+Shift+Delete)
2. Otevřete aplikaci: `https://susiox.github.io/aeropilot-exam-prep/`
3. Klikněte "Přihlásit se"
4. Měli byste být přesměrováni na Cognito login
5. Po přihlášení by měl fungovat token exchange

## 🧪 Test z terminálu (po vytvoření nového clienta)

```bash
# Test s novým Client ID (bez secretu)
curl -X POST "https://eu-central-1cfdn8kqio.auth.eu-central-1.amazoncognito.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&client_id=NOVY_CLIENT_ID&code=TEST_CODE&redirect_uri=https://susiox.github.io/aeropilot-exam-prep/"

# Očekávaná odpověď (s platným code):
# {"access_token":"...","id_token":"...","refresh_token":"...","expires_in":3600}

# S neplatným code (ale správný formát):
# {"error":"invalid_grant","error_description":"Invalid authorization code"}
```

## 📋 Checklist

- [ ] Vytvořen nový Public App Client
- [ ] Client secret: "No client secret"
- [ ] Callback URLs nastavené
- [ ] OAuth grant types: Authorization code grant
- [ ] Scopes: email, openid, profile
- [ ] Nový Client ID zkopírován
- [ ] .env aktualizován
- [ ] Aplikace rebuilded
- [ ] Změny committed a pushed
- [ ] Test přihlášení funguje

## ⚠️ Poznámky

**Proč nelze použít existující client?**
- Client secret nelze odstranit z existujícího clienta
- Musíte vytvořit nový client bez secretu

**Co se stane se starým clientem?**
- Můžete ho smazat nebo nechat (nebude se používat)
- Uživatelé nebudou ovlivněni (žádní uživatelé zatím nejsou)

**Bezpečnost:**
- Public client BEZ secretu je správný přístup pro SPA
- Secret by stejně nemohl být bezpečně uložený v browseru
- Cognito používá jiné mechanismy pro zabezpečení (PKCE, state parameter)

## 🆘 Pokud to stále nefunguje

1. **Zkontrolujte Callback URL:**
   - Musí být PŘESNĚ stejná jako v aplikaci
   - Včetně/bez trailing slash
   
2. **Zkontrolujte Console (F12):**
   - Network tab → oauth2/token
   - Podívejte se na request a response
   
3. **Zkontrolujte error message:**
   - "invalid_client" → Client ID je špatně
   - "invalid_grant" → Authorization code je neplatný/expirovaný
   - "unauthorized_client" → OAuth flow není povolený
