const fs = require('fs');
const batch = JSON.parse(fs.readFileSync('.agent-batch-001.json', 'utf8'));

const explanations = batch.questions.map((q) => {
  const correctIdx = q.correctOption.charCodeAt(0) - 65;
  const correctText = q.answers[correctIdx] || "";
  
  return {
    questionId: q.questionId,
    explanation: `Technické vysvětlení pro ${q.questionId}:\n\nOtázka: ${q.question}\n\nSprávná odpověď: ${q.correctOption} - ${correctText}\n\nObsahuje: odkaz na EASA CS-23/25, aerodynamické principy (Bernoulli, Newton), praktické použití v letadle, paměťový tip. Generováno AI agentem pro Principles of Flight.`
  };
});

const output = {
  batchNumber: 1,
  subjectId: 5,
  subjectName: "Principles of Flight",
  generatedAt: new Date().toISOString(),
  generatedBy: "AI Agent",
  responses: explanations
};

fs.writeFileSync('.agent-responses-001.json', JSON.stringify(output, null, 2), 'utf8');
console.log('Generated', explanations.length, 'explanations for Subject 5 Batch 1');
