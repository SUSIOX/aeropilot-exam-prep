# 🚨 IAM ROLE NASTAVENÍ - KROK ZA KROKEM

## PROBLÉM: "Invalid identity pool configuration"

To znamená že IAM role připojená k Cognito Identity Pool nemá správná oprávnění.

---

## 📋 KROK 1: Najdi správnou IAM roli

### 1.1 AWS Console → Cognito → Identity pools
```
https://eu-central-1.console.aws.amazon.com/cognito/
```

### 1.2 Najdi svůj Identity Pool:
- Jdi do "Identity pools"
- Najdi: `eu-central-1:b30b46cc-5882-4d11-ab16-00cc715a793d`
- Klikni na pool name

### 1.3 Zjisti jméno IAM role:
V "Identity pool information" uvidíš:
- **Unauthenticated role:** `Cognito_eucentral1b30b46ccUnauth_Role`
- **Authenticated role:** `Cognito_eucentral1b30b46ccAuth_Role`

---

## 📋 KROK 2: Uprav Unauthenticated Role

### 2.1 AWS Console → IAM → Roles
```
https://eu-central-1.console.aws.amazon.com/iam/
```

### 2.2 Najdi roli:
- Hledej: `Cognito_eucentral1b30b46ccUnauth_Role`
- Klikni na jméno role

### 2.3 Přidej DynamoDB permissions:
- Klikni "Add permissions" → "Create inline policy"
- Přepni na "JSON" tab
- Vlož tento JSON:

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
                "dynamodb:BatchWriteItem",
                "dynamodb:ListTables",
                "dynamodb:DescribeTable"
            ],
            "Resource": [
                "arn:aws:dynamodb:eu-central-1:*:table/aeropilot-*"
            ]
        }
    ]
}
```

### 2.4 Ulož policy:
- Klikni "Review policy"
- Název: `Cognito_DynamoDB_Access`
- Klikni "Create policy"

---

## 📋 KROK 3: Získej AWS Account ID

### 3.1 AWS Console → My Account (vpravo nahoře)
### 3.2 Najdi "Account ID"
```
Příklad: 123456789012
```

### 3.3 Aktualizuj policy (pokud jsi použil *):
Nahraď `*` v Resource tvým skutečným Account ID:

```json
"Resource": [
    "arn:aws:dynamodb:eu-central-1:TVOJE_ACCOUNT_ID:table/aeropilot-*"
]
```

---

## 📋 KROK 4: Test připojení

### 4.1 Spusť test znovu:
```bash
cd "/Users/jhs/CascadeProjects/aeropilot-exam-prep (3)"
npx ts-node test-scripts/test-dynamodb-connection.ts
```

### 4.2 Očekávaný výstup:
```
🔧 Using Identity Pool ID: eu-central-1:b30b46cc-5882-4d11-ab16-00cc715a793d
🔧 Using Region: eu-central-1

✅ DynamoDB client created successfully with Cognito credentials

📋 Testing: List Tables...
✅ Found 4 tables:
   1. aeropilot-ai-explanations
   2. aeropilot-learning-objectives  
   3. aeropilot-user-progress
   4. aeropilot-question-flags

🎉 All tests passed! Your AWS DynamoDB is ready.
```

---

## 🚨 Pokud stále nefunguje:

### Check 1: Trust relationship
V IAM role → Trust relationships:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "cognito-identity.amazonaws.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "cognito-identity.amazonaws.com:aud": "eu-central-1:b30b46cc-5882-4d11-ab16-00cc715a793d"
                },
                "ForAnyValue:StringLike": {
                    "cognito-identity.amazonaws.com:amr": "unauthenticated"
                }
            }
        }
    ]
}
```

### Check 2: Region consistency
Ujisti se že všechno používá `eu-central-1`:
- Cognito Identity Pool region
- DynamoDB tabulky region  
- IAM role region

---

## 🎯 RYCHLÉ ŘEŠENÍ:

Pokud chceš rychle testovat, můžeš dočasně dát roli plná oprávnění:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "*",
            "Resource": "*"
        }
    ]
}
```

**POZOR:** Toto je jen pro testování! Pro production použij restricted výše.

---

**Jakmile nastavíš IAM role správně, připojení bude fungovat!** 🔧✈️
