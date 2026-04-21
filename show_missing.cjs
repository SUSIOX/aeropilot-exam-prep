const fs = require('fs');
const L = ['A','B','C','D'];

const missing = [
  {s:2, id:33}, {s:3, id:73}, {s:3, id:74},
  {s:4, id:80}, {s:5, id:100}, {s:9, id:43}, {s:9, id:100}
];

console.log('=== CHYBĚJÍCÍ OTÁZKY V DB ===\n');

for (const m of missing) {
  const jqs = JSON.parse(fs.readFileSync(`backups/subject_${m.s}.json`, 'utf8'));
  const qs = jqs.questions || jqs;
  const q = qs.find(x => x.id == m.id);

  console.log(`── subject${m.s}_q${m.id} ──`);
  if (!q) { console.log('  CHYBÍ I V JSON!\n'); continue; }
  console.log(`  Otázka: ${q.question}`);
  q.answers.forEach((a, i) => {
    const mark = i === q.correct ? ' ✅' : '';
    console.log(`  ${L[i]}) ${a}${mark}`);
  });
  console.log();
}

console.log('Hotovo.');
