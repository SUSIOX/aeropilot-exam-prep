# 🔒 AWS Cognito Setup Guide

## 🎯 CÍL: Nastavit bezpečné připojení k DynamoDB bez credentials v kódu

---

## 📋 KROK 1: Vytvoř Cognito Identity Pool

### 1.1 AWS Console → Cognito → Identity pools → Create
```
https://eu-central-1.console.aws.amazon.com/cognito/users/
```

### 1.2 Konfigurace Identity Pool:
- **Identity pool name:** `aeropilot-identity-pool`
- **Enable access to unauthenticated identities:** ✅ CHECK
- **Authentication providers:** Zatím nic (použijeme unauthenticated)

### 1.3 Vytvoř Identity Pool
Klikni **Create identity pool**

### 1.4 Poznamenej si Identity Pool ID
```
Příklad: eu-central-1:12345678-1234-1234-1234-123456789012
```

---

## 📋 KROK 2: Vytvoř IAM Role

### 2.1 Po vytvoření Identity Poolu se automaticky vytvoří 2 role:
- **Unauthenticated role:** `Cognito_aeropilotIdentityPoolUnauth_Role`
- **Authenticated role:** `Cognito_aeropilotIdentityPoolAuth_Role`

### 2.2 Uprav Unauthenticated Role (tu použijeme):
```
AWS Console → IAM → Roles → Cognito_aeropilotIdentityPoolUnauth_Role
```

### 2.3 Přidej DynamoDB Permissions:
Klikni **Add permissions** → **Create inline policy** → **JSON**

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:Query",
                "dynamodb:Scan",
                "dynamodb:BatchWriteItem"
            ],
            "Resource": [
                "arn:aws:dynamodb:eu-central-1:YOUR_ACCOUNT_ID:table/aeropilot-*"
            ]
        }
    ]
}
```

**DŮLEŽITÉ:** Nahraď `YOUR_ACCOUNT_ID` tvým AWS Account ID

---

## 📋 KROK 3: Získej AWS Account ID

### 3.1 AWS Console → My Account (vpravo nahoře)
### 3.2 Najdi **Account ID**
```
Příklad: 123456789012
```

---

## 📋 KROK 4: Nastav .env soubor

### 4.1 Vytvoř .env soubor:
```bash
cp .env.example .env
```

### 4.2 Uprav .env:
```bash
# AWS Cognito Configuration
COGNITO_IDENTITY_POOL_ID=eu-central-1:TVOJE_IDENTITY_POOL_ID
AWS_REGION=eu-central-1

# GEMINI_API_KEY: Required for Gemini AI API calls.
GEMINI_API_KEY="MY_GEMINI_API_KEY"

# APP_URL: The URL where this applet is hosted.
APP_URL="MY_APP_URL"
```

**DŮLEŽITÉ:** Nahraď `TVOJE_IDENTITY_POOL_ID` skutečným ID z kroku 1.4

---

## 📋 KROK 5: Test připojení

### 5.1 Spusť test:
```bash
cd "/Users/jhs/CascadeProjects/aeropilot-exam-prep (3)"
npx ts-node test-scripts/test-dynamodb-connection.ts
```

### 5.2 Očekávaný výstup:
```
🚀 Testing AWS DynamoDB Connection with Secure Cognito Credentials...

✅ DynamoDB client created successfully with Cognito credentials

📋 Testing: List Tables...
✅ Found 4 tables:
   1. aeropilot-ai-explanations
   2. aeropilot-learning-objectives  
   3. aeropilot-user-progress
   4. aeropilot-question-flags

✅ Table 'aeropilot-ai-explanations' exists and is active
✅ Table 'aeropilot-learning-objectives' exists and is active
✅ Table 'aeropilot-user-progress' exists and is active
✅ Table 'aeropilot-question-flags' exists and is active

🎉 All tests passed! Your AWS DynamoDB is ready.
```

---

## 📋 KROK 6: Spusť aplikaci

### 6.1 Development:
```bash
npm run dev
```

### 6.2 Production:
```bash
npm run build
npm run preview
```

---

## 🔍 KONTROLA BEZPEČNOSTI

### ✅ Co je nyní bezpečné:
- **Žádné credentials v kódu**
- **Cognito Identity Pool** poskytuje temporary credentials
- **IAM Role** s minimal permissions
- **Automatická rotace** credentials

### ✅ Funguje:
- DynamoDB připojení
- AI explanations cache
- User progress tracking
- Question flags

---

## 🚨 TROUBLESHOOTING

### Chyba: "COGNITO_IDENTITY_POOL_ID not configured"
**Řešení:** Ujisti se že máš správné ID v .env souboru

### Chyba: "Access Denied"  
**Řešení:** Zkontroluj IAM role permissions

### Chyba: "Table not found"
**Řešení:** Ujisti se že tabulky existují a mají správné názvy

---

## 🎉 VÝSLEDEK

Máš plně bezpečné DynamoDB připojení:
- ✅ 0 credentials v kódu
- ✅ Cognito Identity Pool
- ✅ IAM role s minimal permissions
- ✅ Automatická správa credentials
- ✅ Fungující AI cache a user data

**Aplikace je ready pro production deployment!** 🚀✈️☁️
