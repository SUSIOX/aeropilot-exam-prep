# Cognito Configuration Checklist

## ✅ Ověřeno
- [x] User Pool ID: `eu-central-1_cfdN8KQIo`
- [x] App Client ID: `32d9ivfbtnpo69jaq7vld9p2jp`
- [x] Domain: `eu-central-1cfdn8kqio.auth.eu-central-1.amazoncognito.com`
- [x] Region: `eu-central-1`

## ⚠️ Potřebuje ověření

### **App Client Settings**
Přejděte do: **Cognito → User pools → User pool - dwwc1 → App integration → App clients → Aeropilot Exam Preparation**

#### **1. Client Secret**
- [ ] **MUSÍ být**: "No client secret" nebo prázdné
- [ ] **NESMÍ být**: Vygenerovaný secret string

**Proč je to důležité:**
- Public client (SPA aplikace) NESMÍ mít client secret
- S client secret by token exchange vyžadoval secret v requestu
- To není možné v browseru (bezpečnostní riziko)

#### **2. Allowed callback URLs**
- [ ] Obsahuje: `https://susiox.github.io/aeropilot-exam-prep/`
- [ ] Pro development: `http://localhost:3002/`

**Kontrola:**
- URL musí být PŘESNĚ stejná jako v aplikaci
- Včetně/bez trailing slash (/)
- HTTPS v produkci

#### **3. Allowed sign-out URLs**
- [ ] Obsahuje: `https://susiox.github.io/aeropilot-exam-prep/`
- [ ] Pro development: `http://localhost:3002/`

#### **4. OAuth 2.0 grant types**
- [ ] **Authorization code grant** - MUSÍ být enabled
- [ ] Implicit grant - optional

#### **5. OpenID Connect scopes**
- [ ] `email` - MUSÍ být enabled
- [ ] `openid` - MUSÍ být enabled
- [ ] `profile` - MUSÍ být enabled

#### **6. Advanced settings**
- [ ] Refresh token expiration: 30 days (default)
- [ ] Access token expiration: 60 minutes (default)
- [ ] ID token expiration: 60 minutes (default)

## 🔍 Jak zkontrolovat

### **V AWS Console:**

1. **Otevřete App Client**
   ```
   Cognito → User pools → User pool - dwwc1 
   → App integration → App clients 
   → Aeropilot Exam Preparation
   ```

2. **Zkontrolujte "Hosted UI"**
   - Mělo by být "Enabled"
   - Domain: `eu-central-1cfdn8kqio`

3. **Zkontrolujte "App client information"**
   - Client ID: `32d9ivfbtnpo69jaq7vld9p2jp`
   - Client secret: **"No client secret"** ← KRITICKÉ!

4. **Zkontrolujte "OAuth 2.0 settings"**
   - Callback URLs
   - Sign-out URLs
   - Grant types
   - Scopes

## 🐛 Debugging "Invalid request"

### **Možné příčiny:**

1. **Client secret je nastavený**
   ```
   Řešení: Vytvořte nový App Client bez secretu
   ```

2. **Callback URL se neshoduje**
   ```
   Chyba: https://susiox.github.io/aeropilot-exam-prep
   Správně: https://susiox.github.io/aeropilot-exam-prep/
   (všimněte si trailing slash)
   ```

3. **OAuth flow není povolený**
   ```
   Řešení: Enable "Authorization code grant"
   ```

4. **Scopes nejsou nastavené**
   ```
   Řešení: Enable email, openid, profile
   ```

### **Test v browseru:**

1. Otevřete Console (F12)
2. Přejděte na Network tab
3. Klikněte "Přihlásit se"
4. Sledujte requesty:
   ```
   1. Redirect na Cognito: /login?client_id=...
   2. Po přihlášení: callback s ?code=...
   3. Token exchange: POST /oauth2/token
   ```

5. Zkontrolujte response na token exchange:
   ```javascript
   // Úspěch (200):
   {
     "access_token": "...",
     "id_token": "...",
     "refresh_token": "...",
     "expires_in": 3600
   }
   
   // Chyba (400):
   {
     "error": "invalid_grant",
     "error_description": "..."
   }
   ```

## 📝 Jak opravit

### **Pokud má App Client secret:**

1. **Vytvořte nový App Client:**
   ```
   Cognito → User pools → User pool - dwwc1 
   → App integration → Create app client
   
   Settings:
   - App type: Public client
   - App client name: aeropilot-web-public
   - Don't generate a client secret: ✓
   - Authentication flows: Authorization code grant
   ```

2. **Aktualizujte .env:**
   ```env
   COGNITO_CLIENT_ID=NOVY_CLIENT_ID
   ```

3. **Rebuild a deploy:**
   ```bash
   npm run build
   git add .
   git commit -m "Update Cognito client ID"
   git push
   ```

### **Pokud callback URL chybí:**

1. **Přidejte URL:**
   ```
   Cognito → User pools → User pool - dwwc1 
   → App integration → App clients 
   → Aeropilot Exam Preparation
   → Edit
   → Hosted UI settings
   → Allowed callback URLs: Add URL
   ```

2. **Uložte změny**

3. **Zkuste znovu přihlášení**

## ✅ Finální test

Po opravě konfigurace:

1. **Vyčistěte cache:**
   ```
   Ctrl+Shift+Delete → Clear cache
   ```

2. **Otevřete aplikaci:**
   ```
   https://susiox.github.io/aeropilot-exam-prep/
   ```

3. **Klikněte "Přihlásit se"**

4. **Měli byste vidět:**
   - Cognito login stránku
   - Po přihlášení: návrat do aplikace
   - Uživatelské jméno v headeru
   - Žádné error messages

## 🆘 Potřebujete pomoc?

Pošlete screenshot nebo zkopírujte text z:
1. **App client settings** (celá stránka)
2. **Browser console** (F12 → Console tab)
3. **Network tab** při token exchange (F12 → Network → oauth2/token)
