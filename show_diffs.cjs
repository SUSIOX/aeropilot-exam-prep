const fs = require('fs');
const L = ['A','B','C','D'];

console.log('[1/3] Načítám DB backup...');
const db = JSON.parse(fs.readFileSync('backups/aeropilot-questions-2026-04-17T19-45-02.json','utf8'));
console.log('[1/3] OK - ' + db.Items.length + ' položek');

console.log('[2/3] Buduju mapu...');
const dbMap = {};
for (const i of db.Items) {
  const q = i.questionId?.S;
  if (q) dbMap[q] = { c: parseInt(i.correct?.N ?? -1), a: (i.answers?.L||[]).map(x => x.S||'') };
}
console.log('[2/3] OK\n');

console.log('[3/3] Zobrazuji detaily rozdílů...\n');

const problems = [
  {s:1,id:13}, {s:2,id:33}, {s:3,id:73}, {s:3,id:74},
  {s:4,id:80}, {s:5,id:100}, {s:9,id:43}, {s:9,id:100}
];

for (const m of problems) {
  const qid = 'subject'+m.s+'_q'+m.id;
  const jqs = JSON.parse(fs.readFileSync('backups/subject_'+m.s+'.json','utf8'));
  const qs = jqs.questions || jqs;
  const q = qs.find(x => x.id == m.id);
  const dbq = dbMap[qid];

  console.log('── ' + qid + ' ──');
  if (!q) { console.log('  Otázka chybí i v JSON!\n'); continue; }
  console.log('  Otázka: ' + q.question.slice(0,80));
  console.log('  Odpovědi:');
  q.answers.forEach((a,i) => console.log('    ' + L[i] + ') ' + a.slice(0,65)));
  console.log('  JSON correct: ' + L[q.correct] + ' (' + q.correct + ')');
  if (!dbq) {
    console.log('  DB: CHYBÍ\n');
  } else {
    console.log('  DB correct:   ' + L[dbq.c] + ' (' + dbq.c + ')');
    console.log('  Status: ' + (q.correct === dbq.c ? '✅ SHODNÉ' : '❌ ROZDÍL') + '\n');
  }
}

console.log('[3/3] Hotovo.');
