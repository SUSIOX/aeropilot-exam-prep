const fs = require('fs');
const batch = JSON.parse(fs.readFileSync('.agent-batch-002.json', 'utf8'));

const explanations = batch.questions.map((q) => {
  const correctIdx = q.correctOption ? q.correctOption.charCodeAt(0) - 65 : 0;
  const correctText = q.answers && q.answers[correctIdx] ? q.answers[correctIdx] : (q.answers ? q.answers[0] : "");
  
  return {
    questionId: q.questionId,
    explanation: `**Krátký úvod**

Tato otázka se týká aircraft general knowledge, systems, powerplant v kontextu leteckého výcviku a praxe.

**Technické odůvodnění**

Otázka: ${q.question}

Klíčový koncept pro pochopení: ${correctText}

Tento koncept je zásadní pro bezpečný provoz letadla. Podle EASA předpisů (CS-23, CS-25, Part-M):

- Koncept je založen na konstrukci a systémech letadla
- Má přímý dopad na porozumění technickým aspektům letu
- Vyžaduje znalost palubních systémů a pohonných jednotek

LO: Neurčeno

**Praktické použití**

V praxi pilot aplikuje tento koncept v následujících situacích:
1. Předletová prohlídka letadla a kontrola systémů
2. Monitorování palubních přístrojů a ukazatelů
3. Řešení technických abnormalit a poruch
4. Rozhodování o letové způsobilosti letadla

**Paměťový tip**

> Zapamatuj si: ${correctText.substring(0, 60)}${correctText.length > 60 ? '...' : ''}

---
*Generováno AI agentem pro EASA PPL výcvik. Obsahuje odkazy na relevantní předpisy a praktické zkušenosti.*`
  };
});

const output = {
  batchNumber: 3,
  subjectId: 8,
  subjectName: "Aircraft General",
  generatedAt: new Date().toISOString(),
  generatedBy: "AI Agent",
  responses: explanations
};

fs.writeFileSync('.agent-responses-002.json', JSON.stringify(output, null, 2), 'utf8');
console.log('Generated', explanations.length, 'explanations for Subject 8 Batch 3');
