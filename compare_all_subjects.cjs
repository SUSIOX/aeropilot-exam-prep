const fs = require('fs');
const L = ['A','B','C','D'];

console.log('Načítám DB backup...');
const db = JSON.parse(fs.readFileSync('backups/aeropilot-questions-2026-04-17T19-45-02.json', 'utf8'));
console.log('OK: ' + db.Items.length + ' položek');

const dbMap = {};
for (const i of db.Items) {
  const q = i.questionId?.S;
  if (q) dbMap[q] = { c: parseInt(i.correct?.N ?? -1), a: (i.answers?.L || []).map(x => x.S || '') };
}
console.log('Mapa připravena\n');

let total = 0;
for (let s = 1; s <= 9; s++) {
  console.log('--- Subject ' + s + ' ---');
  try {
    const jqs = JSON.parse(fs.readFileSync('backups/subject_' + s + '.json', 'utf8'));
    const qs = jqs.questions || jqs;
    console.log(qs.length + ' otázek v JSON');
    let d = 0;
    for (const q of qs) {
      const id = 'subject' + s + '_q' + q.id;
      const db = dbMap[id];
      if (!db) {
        console.log('  CHYBÍ V DB: ' + id);
        d++; total++;
      } else if (q.correct !== db.c) {
        d++; total++;
        console.log('  ' + id + ' JSON=' + L[q.correct] + ' DB=' + L[db.c] + ' | ' + (q.answers[q.correct] || '').slice(0, 55));
      }
    }
    console.log(d === 0 ? '✅ OK' : '❌ Rozdílů: ' + d);
  } catch (e) {
    console.log('JSON chybí: ' + e.message);
  }
  console.log('');
}
console.log('=== CELKEM ROZDÍLŮ: ' + total + ' ===');
