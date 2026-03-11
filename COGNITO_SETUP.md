# Cognito Authentication Setup

Tento dokument popisuje kompletní nastavení Amazon Cognito pro přihlašování v aplikaci.

## **1. AWS Cognito User Pool Setup**

### Vytvoření User Pool
1. Přejděte do AWS Console → Cognito
2. Klikněte "Create user pool"
3. Vyberte "Cognito user pools"
4. Nastavte:
   - **User pool name**: `aeropilot-users`
   - **Standard attributes**: email (required)
   - **Username configuration**: Allow email addresses
   - **Password policies**: Min 6 characters
   - **MFA**: No MFA
   - **User account recovery**: Enable email verification
   - **App integration**: 
     - App type: Public client
     - App name: `aeropilot-web`
     - Refresh token: Enabled
     - OAuth 2.0: Enabled
     - OIDC: Enabled
     - Callback URLs: `https://susiox.github.io/aeropilot-exam-prep/`
     - Sign out URLs: `https://susiox.github.io/aeropilot-exam-prep/`
     - Allowed OAuth flows: Authorization code grant
     - Allowed OAuth scopes: email, openid, profile
     - Allowed CORS origins: `https://susiox.github.io`

### Získání potřebných údajů
Po vytvoření User Poolu si poznamenejte:
- **User pool ID**: `eu-central-1_XXXXXXX`
- **App client ID**: `32d9ivfbtnpo69jaq7vld9p2jp`
- **Domain**: `eu-central-1cfdn8kqio.auth.eu-central-1.amazoncognito.com`

## **2. Lambda Funkce pro Token Exchange**

### Deployment
```bash
# Upravte ACCOUNT-ID v deploy-lambda.sh
./deploy-lambda.sh
```

### Environment Variables pro Lambda
- `USER_POOL_ID`: `eu-central-1_XXXXXXX`
- `CLIENT_ID`: `32d9ivfbtnpo69jaq7vld9p2jp`
- `AWS_REGION`: `eu-central-1`

### IAM Role pro Lambda
Potřebuje permissions:
- `cognito-idp:AdminInitiateAuth`
- `cognito-idp:RespondToAuthChallenge`
- `logs:CreateLogGroup`
- `logs:CreateLogStream`
- `logs:PutLogEvents`

## **3. Konfigurace Aplikace**

### .env soubor
```env
# AWS Cognito User Pool Configuration
COGNITO_DOMAIN=eu-central-1cfdn8kqio.auth.eu-central-1.amazoncognito.com
COGNITO_CLIENT_ID=32d9ivfbtnpo69jaq7vld9p2jp
COGNITO_REDIRECT_URI=https://susiox.github.io/aeropilot-exam-prep/
LAMBDA_TOKEN_EXCHANGE_URL=https://xxx.execute-api.eu-central-1.amazonaws.com/prod/token

# AWS Cognito Identity Pool Configuration
COGNITO_IDENTITY_POOL_ID=eu-central-1:b30b46cc-5882-4d11-ab16-00cc715a793d
AWS_REGION=eu-central-1
```

## **4. Testování**

### Testovací scénáře
1. **Nový uživatel registrace**
   - Klikněte na "Přihlásit se přes Cognito"
   - Přesměrování na Cognito Hosted UI
   - "Sign up" → vyplnění emailu a hesla
   - Potvrzení emailu
   - Přihlášení a návrat do aplikace

2. **Přihlášení existujícího uživatele**
   - Přesměrování na Cognito
   - Přihlášení s existujícím účtem
   - Automatický návrat s tokeny

3. **Odhlášení**
   - Klikněte na odhlášení
   - Přesměrování na Cognito logout
   - Návrat na hlavní stránku

## **5. Bezpečnostní nastavení**

### Cognito User Pool
- Enable advanced security
- Set password policy
- Enable MFA pro produkci
- Configure email templates

### Lambda
- Use environment variables pro sensitive data
- Enable X-Ray tracing
- Set up CloudWatch alarms
- Enable API throttling

### Frontend
- HTTPS only
- CSRF protection s state parameter
- Token expirace checking
- Secure storage

## **6. Troubleshooting**

### Common Issues
1. **Redirect URI mismatch**
   - Zkontrolujte URL v Cognito vs .env
   - Musí být přesně stejná

2. **CORS errors**
   - Přidejte doménu do CORS origins v Cognito
   - Zkontrolujte Lambda CORS headers

3. **Token exchange fails**
   - Zkontrolujte Lambda environment variables
   - Overte IAM permissions
   - Check CloudWatch logs

4. **User not found**
   - User musí existovat v Cognito User Pool
   - Email musí být verified

### Debugging
```javascript
// Check Cognito config
console.log('Domain:', process.env.COGNITO_DOMAIN);
console.log('Client ID:', process.env.COGNITO_CLIENT_ID);
console.log('Redirect URI:', process.env.COGNITO_REDIRECT_URI);

// Check tokens
const tokens = cognitoAuthService.getTokens();
console.log('Tokens:', tokens);

// Check user data
const user = cognitoAuthService.getCurrentUser();
console.log('User:', user);
```

## **7. Produkční nasazení**

1. **Aktualizujte všechny URL** na produkční
2. **Zakažte debug logging**
3. **Nastavte monitoring**
4. **Testujte kompletní flow**
5. **Backup Cognito konfiguraci**

## **8. Migration ze starého systému**

- Staré uživatele bez hesla budou muset si vytvořit nový účet
- Data v DynamoDB zůstanou zachována
- Identity pool credentials fungují dál pro DB přístup
