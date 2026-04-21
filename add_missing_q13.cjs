const fs = require('fs');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const client = new DynamoDBClient({ region: 'eu-central-1' });

async function run() {
  console.log('[1] Načítám subject_1.json...');
  const jqs = JSON.parse(fs.readFileSync('backups/subject_1.json', 'utf8'));
  const qs = jqs.questions || jqs;
  const q = qs.find(x => x.id == 13);
  console.log('[1] OK');

  console.log('[2] Otázka: ' + q.question);
  console.log('[2] Odpovědi:');
  q.answers.forEach((a, i) => console.log('  ' + ['A','B','C','D'][i] + ') ' + a));
  console.log('[2] Correct: ' + ['A','B','C','D'][q.correct] + ' = ' + q.answers[q.correct]);

  const item = {
    questionId: 'subject1_q13',
    subjectId: 1,
    question: q.question,
    answers: q.answers,
    correct: q.correct,
    correctOption: ['A','B','C','D'][q.correct],
    source: 'user',
    createdBy: 'import_script',
    approved: true,
    approvedBy: 'system',
    createdAt: new Date().toISOString(),
    image: null
  };

  console.log('[3] Ukládám do DynamoDB...');
  await client.send(new PutItemCommand({
    TableName: 'aeropilot-questions',
    Item: marshall(item, { removeUndefinedValues: true })
  }));
  console.log('[3] ✅ subject1_q13 uloženo');
}

run().catch(e => { console.error('❌ Chyba:', e.message); process.exit(1); });
