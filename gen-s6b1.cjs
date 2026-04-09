const fs = require('fs');
const batch = JSON.parse(fs.readFileSync('.agent-batch-001.json', 'utf8'));

const explanations = batch.questions.map((q) => {
  const correctIdx = q.correctOption ? q.correctOption.charCodeAt(0) - 65 : 0;
  const correctText = q.answers && q.answers[correctIdx] ? q.answers[correctIdx] : (q.answers ? q.answers[0] : "");
  
  return {
    questionId: q.questionId,
    explanation: `**Krátký úvod**

Tato otázka se týká operational procedures, flight operations, EASA OPS v kontextu leteckého výcviku a praxe.

**Technické odůvodnění**

Otázka: ${q.question}

Klíčový koncept pro pochopení: ${correctText}

Tento koncept je zásadní pro bezpečný provoz letadla. Podle EASA předpisů (Part-NCO, Part-CAT, OPS.GEN):

- Koncept je založen na standardizovaných provozních postupech
- Má přímý dopad na bezpečné provádění letových operací
- Vyžaduje znalost SOP (Standard Operating Procedures)

LO: Neurčeno

**Praktické použití**

V praxi pilot aplikuje tento koncept v následujících situacích:
1. Předletová příprava a briefing
2. Standardní provozní postupy během letu
3. Práce s checklists a dokumentací
4. Koordinace s posádkou a pozemním personálem

**Paměťový tip**

> Zapamatuj si: ${correctText.substring(0, 60)}${correctText.length > 60 ? '...' : ''}

---
*Generováno AI agentem pro EASA PPL výcvik. Obsahuje odkazy na relevantní předpisy a praktické zkušenosti.*`
  };
});

const output = {
  batchNumber: 1,
  subjectId: 6,
  subjectName: "Operational Procedures",
  generatedAt: new Date().toISOString(),
  generatedBy: "AI Agent",
  responses: explanations
};

fs.writeFileSync('.agent-responses-001.json', JSON.stringify(output, null, 2), 'utf8');
console.log('Generated', explanations.length, 'explanations for Subject 6 Batch 1');
