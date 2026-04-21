const fs = require('fs');
const { DynamoDBClient, PutItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const client = new DynamoDBClient({ region: 'eu-central-1' });

const MISSING = [
  { s: 2, id: 33 },
  { s: 3, id: 73 },
  { s: 3, id: 74 },
  { s: 4, id: 80 },
  { s: 5, id: 100 },
  { s: 9, id: 43 },
  { s: 9, id: 100 },
];

const L = ['A','B','C','D'];

async function run() {
  console.log('[1] Načítám JSON soubory...');
  const jsonCache = {};
  for (const m of MISSING) {
    if (!jsonCache[m.s]) {
      const raw = JSON.parse(fs.readFileSync(`backups/subject_${m.s}.json`, 'utf8'));
      jsonCache[m.s] = raw.questions || raw;
    }
  }
  console.log('[1] OK\n');

  for (const m of MISSING) {
    const qid = `subject${m.s}_q${m.id}`;
    const qs = jsonCache[m.s];
    const q = qs.find(x => x.id == m.id);

    if (!q) {
      console.log(`[SKIP] ${qid}: nenalezeno v JSON!`);
      continue;
    }

    console.log(`[2] Kontrola duplicity: ${qid}...`);
    const existing = await client.send(new GetItemCommand({
      TableName: 'aeropilot-questions',
      Key: { questionId: { S: qid } }
    }));

    if (existing.Item) {
      console.log(`[SKIP] ${qid}: již EXISTS v DB! Přeskakuji.\n`);
      continue;
    }
    console.log(`[2] ${qid}: v DB neexistuje — OK\n`);

    const item = {
      questionId: qid,
      subjectId: m.s,
      question: q.question,
      answers: q.answers,
      correct: q.correct,
      correctOption: L[q.correct],
      source: 'user',
      createdBy: 'import_script',
      approved: true,
      approvedBy: 'system',
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      image: null,
      originalId: m.id,
    };

    console.log(`[3] Ukládám ${qid}:`);
    console.log(`    Otázka: ${q.question.slice(0, 70)}`);
    console.log(`    Correct: ${L[q.correct]} = ${q.answers[q.correct].slice(0, 60)}`);
    console.log(`    Počet odpovědí: ${q.answers.length}`);

    await client.send(new PutItemCommand({
      TableName: 'aeropilot-questions',
      Item: marshall(item, { removeUndefinedValues: true }),
      ConditionExpression: 'attribute_not_exists(questionId)',
    }));

    console.log(`[3] ✅ ${qid} uloženo\n`);
  }

  console.log('=== Hotovo ===');
}

run().catch(e => {
  console.error('❌ Chyba:', e.message);
  process.exit(1);
});
