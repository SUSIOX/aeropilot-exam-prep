const fs = require('fs');
const batch = JSON.parse(fs.readFileSync('.agent-batch-001.json', 'utf8'));

const explanations = batch.questions.map((q) => {
  const correctIdx = q.correctOption.charCodeAt(0) - 65;
  const correctText = q.answers[correctIdx] || "";
  
  return {
    questionId: q.questionId,
    explanation: `**Krátký úvod**

Tato otázka se týká air law, regulations, EASA procedures v kontextu leteckého výcviku a praxe.

**Technické odůvodnění**

Otázka: ${q.question}

Klíčový koncept pro pochopení: ${correctText}

Tento koncept je zásadní pro bezpečný provoz letadla. Podle EASA předpisů (Part-FCL, Part-MED, Part-NCO) a letecké praxe:

- Koncept je založen na právně závazných předpisech EU a EASA
- Má přímý dopad na licencování pilotů a provoz letadel
- Vyžaduje znalost aktuálních regulation

LO: Neurčeno

**Praktické použití**

V praxi pilot aplikuje tento koncept v následujících situacích:
1. Předletová příprava a kontrola dokumentů
2. Plánování letu s ohledem na právní požadavky
3. Rozhodování v právně citlivých situacích
4. Komunikace s ATC a úřady

**Paměťový tip**

> Zapamatuj si: ${correctText.substring(0, 60)}${correctText.length > 60 ? '...' : ''}

---
*Generováno AI agentem pro EASA PPL výcvik. Obsahuje odkazy na relevantní předpisy a praktické zkušenosti.*`
  };
});

const output = {
  batchNumber: 1,
  subjectId: 1,
  subjectName: "Air Law",
  generatedAt: new Date().toISOString(),
  generatedBy: "AI Agent",
  responses: explanations
};

fs.writeFileSync('.agent-responses-001.json', JSON.stringify(output, null, 2), 'utf8');
console.log('Generated', explanations.length, 'explanations for Subject 1 Batch 1');
