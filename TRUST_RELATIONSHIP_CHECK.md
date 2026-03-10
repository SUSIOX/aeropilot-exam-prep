# 🔍 TRUST RELATIONSHIP CHECK

## PROBLÉM: Stále "Invalid identity pool configuration"

I když máš správnou policy, problém může být v Trust Relationship.

---

## 📋 KROK 1: Zkontroluj Trust Relationship

### 1.1 AWS Console → IAM → Roles
### 1.2 Najdi svou unauthenticated role:
- Hledej: `Cognito_eucentral1b30b46ccUnauth_Role`
- Klikni na jméno role

### 1.3 Klikni na "Trust relationships" tab
- Mělo by obsahovat:

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

---

## 📋 KROK 2: Pokud Trust relationship není správné

### 2.1 Klikni "Edit trust policy"
### 2.2 Nahraď výše uvedeným JSON
### 2.3 Klikni "Update policy"

---

## 📋 KROK 3: Zkontroluj Identity Pool Settings

### 3.1 AWS Console → Cognito → Identity pools
### 3.2 Najdi: `eu-central-1:b30b46cc-5882-4d11-ab16-00cc715a793d`
### 3.3 Klikni "Edit identity pool"
### 3.4 Ujisti se že:
- **Unauthenticated access** je povolené ✅
- **Unauthenticated role** odkazuje na správnou IAM roli
- **Authenticated role** může být cokoliv (nepoužíváme)

---

## 📋 KROK 4: Test znovu

```bash
npx ts-node test-scripts/test-dynamodb-connection.ts
```

---

## 🚨 RYCHLÝ TEST:

Pokud chceš ověřit že IAM role funguje, můžeš dočasně:

### Test s AWS CLI:
```bash
aws sts assume-role-with-web-identity \
  --role-arn arn:aws:iam::455982474805:role/Cognito_eucentral1b30b46ccUnauth_Role \
  --role-session-name test-session \
  --web-identity-token $(aws cognito-identity get-id --identity-pool-id eu-central-1:b30b46cc-5882-4d11-ab16-00cc715a793d --query 'IdentityId' --output text)
```

---

**Nejčastější problém: Trust relationship neodkazuje na správné Identity Pool ID!** 🔧
