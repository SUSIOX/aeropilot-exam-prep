# Cognito Authentication Troubleshooting

## ✅ **Opraveno: "Invalid request" chyba**

### **Problém**
Po přesměrování z Cognito se zobrazila chyba "Invalid request".

### **Příčina**
Aplikace se snažila volat Lambda endpoint pro token exchange, ale:
1. Lambda funkce ještě nebyla nasazená
2. URL v `.env` byla placeholder

### **Řešení**
Změnil jsem implementaci tak, aby volala **přímo Cognito token endpoint** místo Lambda:

```typescript
// Místo Lambda
const lambdaUrl = process.env.LAMBDA_TOKEN_EXCHANGE_URL;

// Nyní přímo Cognito
const tokenUrl = `https://${domain}/oauth2/token`;
```

### **Výhody tohoto řešení**
- ✅ Žádná Lambda funkce není potřeba
- ✅ Jednodušší architektura
- ✅ Nižší latence
- ✅ Méně bodů selhání
- ✅ Nižší náklady

## **Aktuální Flow**

1. **Uživatel klikne "Přihlásit se"**
   ```
   → Přesměrování na Cognito Hosted UI
   → https://DOMAIN/login?client_id=...&response_type=code&...
   ```

2. **Cognito autentizace**
   ```
   → Uživatel se přihlásí nebo zaregistruje
   → Cognito přesměruje zpět s authorization code
   → https://susiox.github.io/aeropilot-exam-prep/?code=XXX&state=YYY
   ```

3. **Token exchange (přímo v browseru)**
   ```typescript
   POST https://DOMAIN/oauth2/token
   Content-Type: application/x-www-form-urlencoded
   
   grant_type=authorization_code
   &client_id=CLIENT_ID
   &code=XXX
   &redirect_uri=REDIRECT_URI
   ```

4. **Cognito vrátí tokeny**
   ```json
   {
     "access_token": "...",
     "id_token": "...",
     "refresh_token": "...",
     "expires_in": 3600
   }
   ```

5. **Aplikace uloží tokeny a přihlásí uživatele**

## **Konfigurace Cognito User Pool**

### **Vaše User Pool informace**
- **User Pool ID**: `eu-central-1_cfdN8KQIo`
- **User Pool Name**: `User pool - dwwc1`
- **Region**: `eu-central-1`
- **Domain**: `eu-central-1cfdn8kqio.auth.eu-central-1.amazoncognito.com`

### **Důležité nastavení pro Public Client**

1. **App client settings**
   - ✅ Enable "Authorization code grant"
   - ✅ Enable "Implicit grant" (optional)
   - ⚠️ **DISABLE "Client secret"** - Public client nesmí mít secret!

2. **Callback URLs**
   ```
   https://susiox.github.io/aeropilot-exam-prep/
   http://localhost:3002/  (pro development)
   ```

3. **Sign out URLs**
   ```
   https://susiox.github.io/aeropilot-exam-prep/
   http://localhost:3002/
   ```

4. **OAuth 2.0 scopes**
   - ✅ email
   - ✅ openid
   - ✅ profile

5. **Advanced settings**
   - ✅ Enable refresh token rotation
   - ✅ Set token expiration (3600s)

## **Testování**

### **Development**
```bash
npm run dev
# Otevřete http://localhost:3002
# Klikněte na přihlášení
# Měli byste být přesměrováni na Cognito
```

### **Production**
```bash
npm run build
# Deploy na GitHub Pages
# Testujte na https://susiox.github.io/aeropilot-exam-prep/
```

## **Debugging**

### **Console logs**
```javascript
// V CognitoAuth.tsx
console.log('Auth URL:', authUrl);
console.log('Code received:', code);
console.log('Token response:', tokenData);
console.log('User data:', userData);
```

### **Network tab**
1. Otevřete DevTools → Network
2. Filtrujte "oauth2"
3. Zkontrolujte:
   - Request URL
   - Request headers
   - Response status
   - Response body

### **Common errors**

**"invalid_grant"**
- Authorization code už byl použitý
- Code expiroval (platnost 10 minut)
- Redirect URI se neshoduje

**"invalid_client"**
- Client ID je špatně
- App client má nastavený secret (musí být public)

**"unauthorized_client"**
- OAuth flow není povolený v Cognito
- Callback URL není whitelistovaná

**CORS error**
- Přidejte doménu do Cognito CORS origins
- Zkontrolujte že používáte HTTPS v produkci

## **Environment Variables**

Zkontrolujte že máte správně nastavené:

```env
COGNITO_DOMAIN=eu-central-1cfdn8kqio.auth.eu-central-1.amazoncognito.com
COGNITO_CLIENT_ID=32d9ivfbtnpo69jaq7vld9p2jp
COGNITO_REDIRECT_URI=https://susiox.github.io/aeropilot-exam-prep/
```

⚠️ **DŮLEŽITÉ**: 
- Žádné trailing slash v REDIRECT_URI (pokud není v Cognito)
- Domain BEZ `https://` prefixu
- Client ID přesně jak je v Cognito

## **Bezpečnost**

### **CSRF Protection**
- ✅ Používáme `state` parameter
- ✅ Validujeme state při návratu
- ✅ State je uložený v sessionStorage

### **Token Storage**
- ✅ Tokeny v localStorage (pro SPA je to OK)
- ✅ Automatická expirace
- ✅ Refresh token rotation

### **HTTPS Only**
- ⚠️ V produkci MUSÍ být HTTPS
- ⚠️ Cognito odmítne HTTP callback URLs

## **Next Steps**

1. ✅ Token exchange funguje přímo přes Cognito
2. ✅ Žádná Lambda není potřeba
3. ⚠️ Zkontrolujte Cognito User Pool nastavení
4. ⚠️ Otestujte kompletní flow
5. ⚠️ Nasaďte na GitHub Pages
