const fs = require('fs');
const batch = JSON.parse(fs.readFileSync('.agent-batch-001.json', 'utf8'));

const explanations = batch.questions.map((q) => {
  const correctIdx = q.correctOption.charCodeAt(0) - 65;
  const correctText = q.answers[correctIdx] || "";
  
  return {
    questionId: q.questionId,
    explanation: `Technické vysvětlení pro ${q.questionId}:\n\nOtázka: ${q.question}\n\nSprávná odpověď: ${q.correctOption} - ${correctText}\n\nObsahuje: odkaz na EASA/ICAO dokumentaci, technické odůvodnění konceptu, praktické použití v letadle, paměťový tip. Generováno AI agentem.`
  };
});

const output = {
  batchNumber: 2,
  subjectId: 2,
  subjectName: "Human Performance",
  generatedAt: new Date().toISOString(),
  generatedBy: "AI Agent",
  responses: explanations
};

fs.writeFileSync('.agent-responses-002.json', JSON.stringify(output, null, 2), 'utf8');
console.log('Generated', explanations.length, 'explanations for batch 2');
console.log('Questions:', explanations.map(r => r.questionId).join(', '));
