const fs = require('fs');

const fileNames = ['subject_1.json', 'subject_2.json', 'subject_3.json', 'subject_4.json', 'subject_5.json', 'subject_6.json', 'subject_7.json', 'subject_8.json', 'subject_9.json'];

let totalQuestions = 0;
let justABCDCount = 0;
let emptyAnswersCount = 0;
let nonsenseCount = 0;

const problematicQuestions = [];

fileNames.forEach(file => {
  if (fs.existsSync(file)) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    totalQuestions += data.length;
    
    data.forEach(q => {
      if (!q.answers || !Array.isArray(q.answers)) {
        emptyAnswersCount++;
        problematicQuestions.push({ file, id: q.id, issue: "No answers array", answers: q.answers, text: q.question });
        return;
      }

      // Check for empty strings in all answers
      const isAllEmpty = q.answers.every(a => !a || typeof a !== 'string' || a.trim() === '');
      if (isAllEmpty) {
        emptyAnswersCount++;
        problematicQuestions.push({ file, id: q.id, issue: "All answers are empty", answers: q.answers, text: q.question });
        return;
      }

      // Check for just A, B, C, D
      const isJustABCD = q.answers.every(a => {
        const trimmed = typeof a === 'string' ? a.trim().toUpperCase() : '';
        return trimmed === 'A' || trimmed === 'B' || trimmed === 'C' || trimmed === 'D';
      });

      if (isJustABCD) {
        justABCDCount++;
        problematicQuestions.push({ file, id: q.id, issue: "Answers are just A, B, C, D", answers: q.answers, text: q.question });
        return;
      }
      
      if (q.answers.length < 2) {
        nonsenseCount++;
        problematicQuestions.push({ file, id: q.id, issue: "Less than 2 answers", answers: q.answers, text: q.question });
      }
    });
  }
});

console.log(`Total questions analyzed: ${totalQuestions}`);
console.log(`Questions with just A, B, C, D: ${justABCDCount}`);
console.log(`Questions with empty answers: ${emptyAnswersCount}`);
console.log(`Questions with < 2 answers: ${nonsenseCount}`);
console.log(`Total problematic: ${problematicQuestions.length}\n`);

problematicQuestions.forEach(item => {
  console.log(`--- ${item.file} ID ${item.id} [${item.issue}] ---`);
  console.log(`Q: "${item.text ? item.text.substring(0, 100).replace(/\n/g, ' ') + '...' : 'none'}"`);
  console.log(`A: ${JSON.stringify(item.answers)}\n`);
});
