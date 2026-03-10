# 🗄️ DYNAMODB NÁVOD - KROK ZA KROKEM

## 🔑 KROK 1: NASTAVENÍ AWS CREDENTIALS

### 1.1 Vytvoř .env soubor
```bash
# Zkopíruj šablonu
cp .env.example .env
```

### 1.2 Edituj .env soubor
```bash
# Otevři v editoru a vlož své credentials
AWS_ACCESS_KEY_ID=tvoje_aws_access_key_id
AWS_SECRET_ACCESS_KEY=tvoje_aws_secret_access_key
AWS_REGION=eu-central-1
```

## 🗄️ KROK 2: VYTVOŘENÍ DYNAMODB TABULEK

### 2.1 Spusť skript pro vytvoření tabulek
```bash
cd "/Users/jhs/CascadeProjects/aeropilot-exam-prep (3)"
npx ts-node test-scripts/create-dynamodb-tables.ts
```

### 2.2 Co se vytvoří:
- `aeropilot-ai-explanations` - Cache pro AI vysvětlení
- `aeropilot-learning-objectives` - Učební cíle
- `aeropilot-user-progress` - Pokrok uživatelů
- `aeropilot-question-flags` - Označení otázek

## 🔍 KROK 3: TEST SPOJENÍ

### 3.1 Spusť test připojení
```bash
npx ts-node test-scripts/test-dynamodb-connection.ts
```

### 3.2 Kompletní test
```bash
npx ts-node test-scripts/test-complete-connection.ts
```

## ⚙️ KROK 4: KONFIGURACE APLIKACE

### 4.1 DynamoDB Status Component
Aplikace má `DynamoDBStatus` komponentu, která zobrazuje:
- Online/Offline status
- Počet operací za minutu
- Health status

### 4.2 Admin Dashboard
`AdminDashboard` umožňuje:
- Monitorovat DynamoDB operace
- Spravovat cache
- View statistiky

## 🚀 KROK 5: SPUŠTĚNÍ APLIKACE

### 5.1 Development
```bash
npm run dev
```

### 5.2 Production Build
```bash
npm run build
npm run preview
```

## 📊 KROK 6: VERIFIKACE FUNKČNOSTI

### 6.1 Vyzkoušej AI funkce:
1. Jdi do AI sekce
2. Generuj otázky
3. Zkontroluj DynamoDB cache

### 6.2 Zkontroluj Admin Dashboard:
1. Jdi do Settings
2. Klikni na "Admin Dashboard"
3. Sleduj DynamoDB statistiky

## 🔧 TROUBLESHOOTING

### Problém: "Access Denied"
- Zkontroluj AWS credentials v .env
- Ujisti se že máš oprávnění pro DynamoDB

### Problém: "Table not found"
- Spusť create-dynamodb-tables.ts
- Zkontroluj region nastavení

### Problém: "Rate limit exceeded"
- Aplikace má automatický rate limiting
- Počkej pár minut a zkusi znovu

## 🎯 CO FUNGUJE S DYNAMODB:

### ✅ AI Explanations Cache
- Ukládá generované vysvětlení
- Rychlé načítání z cache
- Automatické expirace

### ✅ User Progress Tracking
- Ukládá odpovědi uživatelů
- Sleduje pokrok v čase
- Statistiky a analytics

### ✅ Question Flags
- Ukládá označení otázek
- Synchronizace mezi zařízeními
- Persistentní storage

### ✅ Learning Objectives
- Detekované učební cíle
- Propojení s otázkami
- Inteligentní caching

## 📱 MOBILE COMPATIBILITY

Aplikace funguje offline s localStorage a synchronizuje s DynamoDB když je online.

---

## 🎉 HOTovo!

Jakmile projdeš těmito kroky, budeš mít plně funkční DynamoDB integraci s:
- ✅ Automatickým cachingem
- ✅ Rate limitingem
- ✅ Monitoringem
- ✅ Offline supportem
