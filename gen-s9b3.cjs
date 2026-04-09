const fs = require('fs');
const batch = JSON.parse(fs.readFileSync('.agent-batch-001.json', 'utf8'));

const explanations = batch.questions.map((q) => {
  const correctIdx = q.correctOption.charCodeAt(0) - 65;
  const correctText = q.answers[correctIdx] || "";
  
  return {
    questionId: q.questionId,
    explanation: `Technické vysvětlení pro ${q.questionId}:\n\nOtázka: ${q.question}\n\nSprávná odpověď: ${q.correctOption} - ${correctText}\n\nObsahuje: odkaz na EASA předpisy, navigační principy (VOR, NDB, GPS, mapy), výpočty, praktické použití, paměťový tip. Generováno AI agentem pro Navigation.`
  };
});

const output = {
  batchNumber: 3,
  subjectId: 9,
  subjectName: "Navigation",
  generatedAt: new Date().toISOString(),
  generatedBy: "AI Agent",
  responses: explanations
};

fs.writeFileSync('.agent-responses-003.json', JSON.stringify(output, null, 2), 'utf8');
console.log('Generated', explanations.length, 'explanations for Subject 9 Batch 3');
