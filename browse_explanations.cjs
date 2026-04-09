const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const readline = require('readline');

const client = new DynamoDBClient({ region: 'eu-central-1' });

async function scanTable(table) {
  let lastKey = null;
  const items = [];
  do {
    const r = await client.send(new ScanCommand({ TableName: table, ExclusiveStartKey: lastKey }));
    for (const raw of r.Items || []) items.push(unmarshall(raw));
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function loadAll() {
  process.stdout.write('Načítám otázky...');
  const allQuestions = await scanTable('aeropilot-questions');
  process.stdout.write(' OK\nNačítám vysvětlení...');
  const allExplanations = await scanTable('aeropilot-ai-explanations');
  process.stdout.write(' OK\n');

  // Množina questionId kde už vysvětlení existuje
  const explained = new Set(allExplanations.map(e => e.questionId));

  // Jen PDF otázky BEZ vysvětlení
  const missing = allQuestions
    .filter(q => {
      const qid = q.questionId || '';
      return /^subject\d+_q\d+$/.test(qid) && !explained.has(qid);
    })
    .map(q => ({
      questionId: q.questionId,
      question: q.question || q.text || '(bez textu)',
      answers: q.answers || [],
      correct: q.correct,
      subjectId: q.subjectId
    }))
    .sort((a, b) => {
      const am = a.questionId.match(/^subject(\d+)_q(\d+)$/);
      const bm = b.questionId.match(/^subject(\d+)_q(\d+)$/);
      const subj = Number(am[1]) - Number(bm[1]);
      return subj !== 0 ? subj : Number(am[2]) - Number(bm[2]);
    });

  return missing;
}

function wrapText(text, width, indent) {
  const words = (text || '').split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width - indent - 2) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + ' ' + w : w;
    }
  }
  if (cur) lines.push(cur);
  return lines.map(l => ' '.repeat(indent) + l).join('\n');
}

function renderItem(item, index, total) {
  const width = process.stdout.columns || 110;
  const line = '─'.repeat(width);
  const labels = ['A', 'B', 'C', 'D'];

  console.clear();
  console.log(`\n${line}`);
  console.log(`  ❓  BEZ VYSVĚTLENÍ  │  ${index + 1} / ${total}  │  Předmět ${(item.questionId.match(/^subject(\d+)/) || [])[1] || '?'}  │  ${item.questionId}`);
  console.log(line);
  console.log('');
  console.log(wrapText(item.question, width, 2));
  console.log('');

  const answers = Array.isArray(item.answers) ? item.answers : [];
  answers.forEach((ans, i) => {
    const marker = i === item.correct ? '✅' : '  ';
    console.log(`  ${marker} ${labels[i]}) ${ans}`);
  });

  console.log(`\n${line}`);
  console.log('  [Enter] / [→]  další    [B] / [←]  zpět    [Q]  konec');
  console.log(line + '\n');
}

async function main() {
  const items = await loadAll();
  console.clear();
  console.log(`\n📋 ${items.length} PDF otázek BEZ vysvětlení.\n`);

  let index = 0;
  renderItem(items[index], index, items.length);

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  process.stdin.on('keypress', (str, key) => {
    if (!key) return;

    if (key.name === 'return' || key.name === 'right') {
      if (index < items.length - 1) index++;
      renderItem(items[index], index, items.length);
    } else if (key.name === 'b' || key.name === 'left') {
      if (index > 0) index--;
      renderItem(items[index], index, items.length);
    } else if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      console.log('\nNashledanou!\n');
      process.exit(0);
    }
  });
}

main().catch(err => {
  console.error('Chyba:', err.message);
  process.exit(1);
});
