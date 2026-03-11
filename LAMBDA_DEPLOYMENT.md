# Lambda Deployment Guide

## 🎯 Řešení: Lambda s Client Secret

Protože váš App Client má Client Secret, použijeme Lambda funkci která bezpečně uloží secret a provede token exchange.

## 📋 Prerekvizity

1. **AWS CLI nainstalované a nakonfigurované**
   ```bash
   aws --version
   aws configure list
   ```

2. **Client Secret z Cognito**
   - Přejděte do: Cognito → User pools → User pool - dwwc1 → App integration → App clients → Aeropilot Exam Preparation
   - Klikněte "Show client secret"
   - Zkopírujte secret (dlouhý náhodný string)

## 🚀 Deployment

### Krok 1: Deploy Lambda funkci

```bash
./deploy-lambda-url.sh
```

Skript:
- ✅ Vytvoří IAM role pro Lambda
- ✅ Vytvoří Lambda funkci
- ✅ Nastaví Function URL (veřejně přístupný endpoint)
- ✅ Nakonfiguruje CORS
- ✅ Vypíše Lambda URL

### Krok 2: Nastavte Client Secret

Po deploym uvidíte instrukce. Spusťte:

```bash
# Nahraďte YOUR_ACTUAL_CLIENT_SECRET skutečným secretem z Cognito
aws lambda update-function-configuration \
  --function-name cognito-token-exchange \
  --environment "Variables={
    COGNITO_DOMAIN=eu-central-1cfdn8kqio.auth.eu-central-1.amazoncognito.com,
    CLIENT_ID=32d9ivfbtnpo69jaq7vld9p2jp,
    CLIENT_SECRET=YOUR_ACTUAL_CLIENT_SECRET,
    REDIRECT_URI=https://susiox.github.io/aeropilot-exam-prep/
  }" \
  --region eu-central-1
```

### Krok 3: Zkopírujte Lambda URL

Po deployment uvidíte něco jako:
```
📝 Lambda Function URL:
   https://abc123xyz.lambda-url.eu-central-1.on.aws/
```

**Zkopírujte tuto URL!**

### Krok 4: Aktualizujte .env

```bash
# Otevřete .env a aktualizujte:
LAMBDA_TOKEN_EXCHANGE_URL=https://abc123xyz.lambda-url.eu-central-1.on.aws/
```

### Krok 5: Test Lambda

```bash
# Test s dummy code (očekáváme chybu invalid_grant, ale ne invalid_client)
LAMBDA_URL="https://abc123xyz.lambda-url.eu-central-1.on.aws/"

curl -X POST "$LAMBDA_URL" \
  -H "Content-Type: application/json" \
  -d '{"code":"test_code"}'

# Očekávaný výstup (s neplatným code):
# {"error":"invalid_grant","error_description":"Invalid authorization code"}

# Pokud vidíte toto, Lambda funguje správně! ✅
```

### Krok 6: Rebuild aplikace

```bash
npm run build
```

### Krok 7: Deploy na GitHub Pages

```bash
git add .
git commit -m "Add Lambda token exchange"
git push
```

## 🧪 Kompletní test flow

1. **Otevřete aplikaci**
   ```
   https://susiox.github.io/aeropilot-exam-prep/
   ```

2. **Klikněte "Přihlásit se"**
   - Měli byste být přesměrováni na Cognito

3. **Přihlaste se nebo zaregistrujte**
   - Vyplňte email a heslo
   - Potvrzení emailu (pokud je required)

4. **Po přihlášení**
   - Cognito vás přesměruje zpět s authorization code
   - Frontend zavolá Lambda s code
   - Lambda provede token exchange s client secret
   - Lambda vrátí tokeny
   - Uživatel je přihlášený ✅

## 🔍 Debugging

### Browser Console (F12 → Console)

```javascript
// Měli byste vidět:
🔄 Exchanging authorization code via Lambda...
✅ Token exchange successful
✅ User authenticated via Cognito: {id: "...", username: "...", email: "..."}
```

### Network Tab (F12 → Network)

1. **Filtr: "lambda"**
2. **Najděte POST request na Lambda URL**
3. **Request:**
   ```json
   {"code":"abc123..."}
   ```
4. **Response (200):**
   ```json
   {
     "access_token": "...",
     "id_token": "...",
     "refresh_token": "...",
     "expires_in": 3600
   }
   ```

### CloudWatch Logs

```bash
# Zobrazit Lambda logs
aws logs tail /aws/lambda/cognito-token-exchange --follow --region eu-central-1
```

## ❌ Troubleshooting

### "Lambda URL not configured"
```
Problém: LAMBDA_TOKEN_EXCHANGE_URL není v .env
Řešení: Přidejte URL do .env a rebuild
```

### "invalid_client_secret"
```
Problém: Client secret v Lambda je špatný
Řešení: Zkontrolujte secret v Cognito a aktualizujte Lambda env vars
```

### "invalid_grant"
```
Problém: Authorization code je neplatný/expirovaný
Řešení: Normální - code má platnost jen 10 minut a lze použít jen 1×
```

### CORS error
```
Problém: Lambda nepovoluje CORS z vaší domény
Řešení: Zkontrolujte CORS nastavení v Lambda Function URL
```

## 🔐 Bezpečnost

### ✅ Výhody Lambda přístupu:
- Client secret je bezpečně uložený v Lambda (ne v browseru)
- Secret není viditelný v network requestech
- Lambda má IAM permissions a logging
- Můžete přidat rate limiting

### ⚠️ Důležité:
- Lambda URL je veřejná (auth-type NONE)
- Přidejte rate limiting v produkci
- Monitorujte CloudWatch logs
- Nastavte alarms pro chyby

## 📊 Monitoring

### CloudWatch Metrics
```bash
# Zobrazit invocations
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=cognito-token-exchange \
  --start-time 2026-03-11T00:00:00Z \
  --end-time 2026-03-11T23:59:59Z \
  --period 3600 \
  --statistics Sum \
  --region eu-central-1
```

### Errors
```bash
# Zobrazit errors
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=cognito-token-exchange \
  --start-time 2026-03-11T00:00:00Z \
  --end-time 2026-03-11T23:59:59Z \
  --period 3600 \
  --statistics Sum \
  --region eu-central-1
```

## 🎉 Hotovo!

Po úspěšném deployment:
- ✅ Lambda funkce běží
- ✅ Client secret je bezpečně uložený
- ✅ Token exchange funguje
- ✅ Uživatelé se mohou přihlásit
- ✅ Refresh tokens fungují

## 📝 Poznámky

- Lambda Function URL je jednodušší než API Gateway
- Žádné extra náklady za API Gateway
- CORS je nakonfigurovaný přímo v Function URL
- Logs jsou automaticky v CloudWatch
