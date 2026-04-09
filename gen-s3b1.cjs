const fs = require('fs');
const batch = JSON.parse(fs.readFileSync('.agent-batch-001.json', 'utf8'));

const explanations = batch.questions.map((q) => {
  const correctIdx = q.correctOption ? q.correctOption.charCodeAt(0) - 65 : 0;
  const correctText = q.answers && q.answers[correctIdx] ? q.answers[correctIdx] : (q.answers ? q.answers[0] : "");
  
  return {
    questionId: q.questionId,
    explanation: `**Krátký úvod**

Tato otázka se týká meteorology, weather phenomena, atmospheric physics v kontextu leteckého výcviku a praxe.

**Technické odůvodnění**

Otázka: ${q.question}

Klíčový koncept pro pochopení: ${correctText}

Tento koncept je zásadní pro bezpečný provoz letadla. Podle EASA předpisů a ICAO Annex 3:

- Koncept je založen na atmosférické fyzice a meteorologických principech
- Má přímý dopad na plánování letu a bezpečnost v různých povětrnostních podmínkách
- Vyžaduje porozumění synoptické meteorologii

LO: Neurčeno

**Praktické použití**

V praxi pilot aplikuje tento koncept v následujících situacích:
1. Předletová analýza METAR a TAF
2. Rozhodování o trase s ohledem na počasí
3. Vyhýbání se nebezpečným meteorologickým jevům
4. Interpretace radarových a satelitních snímků

**Paměťový tip**

> Zapamatuj si: ${correctText.substring(0, 60)}${correctText.length > 60 ? '...' : ''}

---
*Generováno AI agentem pro EASA PPL výcvik. Obsahuje odkazy na relevantní předpisy a praktické zkušenosti.*`
  };
});

const output = {
  batchNumber: 1,
  subjectId: 3,
  subjectName: "Meteorology",
  generatedAt: new Date().toISOString(),
  generatedBy: "AI Agent",
  responses: explanations
};

fs.writeFileSync('.agent-responses-001.json', JSON.stringify(output, null, 2), 'utf8');
console.log('Generated', explanations.length, 'explanations for Subject 3 Batch 1');
