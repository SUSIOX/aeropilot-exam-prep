# TODO: Implementace preference AI agenta pro vysvětlení
## Vytvořeno: 2026-04-08
## Stav: Čeká na implementaci
## Priorita: Střední

---

## 📋 POPIS

V databázi jsou vysvětlení od různých AI agentů:
- `claude` - Externí API (Anthropic)
- `gemini` - Externí API (Google)  
- `agent` - Interní agent (stará šablona)
- `agent-full` - Interní agent (nová šablona)

Uživatel by měl mít možnost si vybrat, kterého agenta chce používat.

---

## ✅ ÚKOLY

### 1. Databázové změny
- [ ] Přidat do uživatelského profilu pole `preferredAIProvider`
  - Typ: string
  - Default: 'auto'
  - Validní hodnoty: 'claude' | 'gemini' | 'agent' | 'agent-full' | 'auto'

### 2. Backend změny
- [ ] Upravit `getExplanation(questionId, userId)` v `/src/services/aiService.ts`
  ```typescript
  async function getExplanation(questionId: string, userId?: string): Promise<AIExplanation | null> {
    // 1. Získej uživatelovu preference
    const user = await getUserProfile(userId);
    const preferredProvider = user?.preferredAIProvider || 'auto';
    
    // 2. Hledej vysvětlení s daným providerem
    let explanation = await findExplanationByProvider(questionId, preferredProvider);
    
    // 3. Fallback chain
    if (!explanation && preferredProvider !== 'agent-full') {
      explanation = await findExplanationByProvider(questionId, 'agent-full');
    }
    if (!explanation) {
      explanation = await findExplanationByProvider(questionId, 'agent');
    }
    if (!explanation) {
      explanation = await findAnyExplanation(questionId);
    }
    
    return explanation;
  }
  ```

- [ ] Upravit API endpoint `/api/explanations/:questionId`
  - Přidat query param: `?provider=agent`
  - Fallback na JWT user preference

### 3. Frontend změny
- [ ] Přidat do uživatelských nastavení novou sekci "AI Agent"
  - UI: Dropdown select
  - Options: 
    - "Automaticky (doporučeno)" → auto
    - "Interní AI (plná verze)" → agent-full
    - "Interní AI (základní)" → agent
    - "Anthropic Claude" → claude
    - "Google Gemini" → gemini
  - Tooltip: "Vyberte AI agenta, který generuje vysvětlení k otázkám"

- [ ] Upravit komponentu `QuestionExplanation.tsx`
  - Přidat loading state pro fetch s preferencí
  - Zobrazit badge s názvem použitého agenta
  - Přidat tlačítko "Zkusit jiného agenta" (rotace mezi dostupnými)

### 4. Admin dashboard
- [ ] Přidat statistiky používání jednotlivých agentů
  - Kolik vysvětlení má každý provider
  - Jakého agenta preferují uživatelé

---

## 🔧 TECHNICKÉ DETAILY

### DynamoDB query pro výběr agenta:
```javascript
// Primární preference
const result = await dynamoClient.send(new ScanCommand({
  TableName: "aeropilot-ai-explanations",
  FilterExpression: "questionId = :qid AND provider = :provider",
  ExpressionAttributeValues: {
    ":qid": { S: questionId },
    ":provider": { S: userPreference }
  }
}));

// Fallback na agent-full
if (!result.Items?.length) {
  // Try agent-full
}

// Fallback na agent
if (!result.Items?.length) {
  // Try agent
}

// Final fallback - any available
if (!result.Items?.length) {
  // Get first available
}
```

### User profile update:
```typescript
interface UserProfile {
  id: string;
  email: string;
  // ... existing fields
  preferredAIProvider?: 'claude' | 'gemini' | 'agent' | 'agent-full' | 'auto';
}
```

---

## ⏱️ ČASOVÝ ODHAD

| Úkol | Odhad |
|------|-------|
| Databázové změny | 30 min |
| Backend implementace | 1.5 hod |
| Frontend nastavení | 1 hod |
| Testování | 30 min |
| **CELKEM** | **3.5 hodiny** |

---

## 📝 POZNÁMKY

- Duplicitní záznamy pro stejnou otázku jsou OK - každý je pro jiného agenta
- Priorita: `agent-full` > `agent` > `claude` > `gemini` (podle kvality)
- Pro nové otázky generovat pomocí `agent-full` (nová šablona)
- Zachovat existující `claude` a `gemini` pro uživatele co je preferují

---

## 🔗 SOUVISEJÍCÍ SOUBORY

- `/src/services/aiService.ts`
- `/src/services/dynamoDBService.ts`  
- `/src/components/QuestionExplanation.tsx`
- `/src/pages/UserSettings.tsx`
- `/amplify/backend/function/getExplanation/src/index.js`

---

## ✅ ACCEPTANCE CRITERIA

- [ ] Uživatel může změnit preference AI agenta v nastavení
- [ ] Vysvětlení se načítá podle preference (s fallback chain)
- [ ] Pokud preferovaný agent nemá vysvětlení, použije se další v pořadí
- [ ] UI zobrazuje který agent generoval vysvětlení
- [ ] Funkce funguje i pro nepřihlášené uživatele (default: agent-full)
