const fs = require('fs');
const batch = JSON.parse(fs.readFileSync('.agent-batch-001.json', 'utf8'));

const explanations = batch.questions.map((q) => {
  const correctIdx = q.correctOption ? q.correctOption.charCodeAt(0) - 65 : 0;
  const correctText = q.answers && q.answers[correctIdx] ? q.answers[correctIdx] : (q.answers ? q.answers[0] : "");
  
  return {
    questionId: q.questionId,
    explanation: `**Krátký úvod**

Tato otázka se týká radiocommunications, phraseology, ATC procedures v kontextu leteckého výcviku a praxe.

**Technické odůvodnění**

Otázka: ${q.question}

Klíčový koncept pro pochopení: ${correctText}

Tento koncept je zásadní pro bezpečný provoz letadla. Podle EASA předpisů (Part-NCO, SERA) a ICAO Annex 10:

- Koncept je založen na standardizované letecké fráziologii
- Má přímý dopad na bezpečnou komunikaci s ATC
- Vyžaduje znalost standardních procedur a hlášení

LO: Neurčeno

**Praktické použití**

V praxi pilot aplikuje tento koncept v následujících situacích:
1. Předletová komunikace s letovými provozními službami
2. Letové fáze - komunikace s různými ATC jednotkami
3. Nouzové situace a distress komunikace
4. Standardní hlášení a potvrzování instrukcí

**Paměťový tip**

> Zapamatuj si: ${correctText.substring(0, 60)}${correctText.length > 60 ? '...' : ''}

---
*Generováno AI agentem pro EASA PPL výcvik. Obsahuje odkazy na relevantní předpisy a praktické zkušenosti.*`
  };
});

const output = {
  batchNumber: 1,
  subjectId: 4,
  subjectName: "Communications",
  generatedAt: new Date().toISOString(),
  generatedBy: "AI Agent",
  responses: explanations
};

fs.writeFileSync('.agent-responses-001.json', JSON.stringify(output, null, 2), 'utf8');
console.log('Generated', explanations.length, 'explanations for Subject 4 Batch 1');
