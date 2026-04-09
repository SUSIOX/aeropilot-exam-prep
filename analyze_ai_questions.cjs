const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const client = new DynamoDBClient({ region: 'eu-central-1' });

async function run() {
  let lk = null, items = [];
  do {
    const r = await client.send(new ScanCommand({ TableName: 'aeropilot-questions', ExclusiveStartKey: lk }));
    for (const i of r.Items||[]) items.push(unmarshall(i));
    lk = r.LastEvaluatedKey;
  } while (lk);

  const aiFormat = items.filter(q => /^ai_/.test(q.questionId||''));
  console.log('ai_ format count:', aiFormat.length);

  const sample = aiFormat.slice(0, 3);
  console.log('\nSample fields:');
  sample.forEach(q => {
    console.log(JSON.stringify({
      questionId: q.questionId,
      subjectId: q.subjectId,
      source: q.source,
      loId: q.loId || q.lo_id,
      question: (q.question||'').slice(0, 80),
      answersCount: (q.answers||[]).length,
      correct: q.correct
    }, null, 2));
  });

  // Count by EASA LO prefix
  const byLO = {};
  aiFormat.forEach(q => {
    const m = (q.questionId||'').match(/^ai_(\d+)\./);
    const key = m ? m[1] : 'other';
    byLO[key] = (byLO[key]||0) + 1;
  });
  console.log('\nBy EASA LO code:', JSON.stringify(byLO, null, 2));

  // Check subjectId distribution
  const bySubject = {};
  aiFormat.forEach(q => {
    const s = String(q.subjectId || 'missing');
    bySubject[s] = (bySubject[s]||0) + 1;
  });
  console.log('\nBy subjectId field:', JSON.stringify(bySubject, null, 2));

  // Check if subjectId is set vs missing
  const missingSubject = aiFormat.filter(q => !q.subjectId);
  console.log('\nMissing subjectId:', missingSubject.length);
  if (missingSubject.length > 0) {
    console.log('Example:', JSON.stringify({
      questionId: missingSubject[0].questionId,
      keys: Object.keys(missingSubject[0])
    }));
  }
}
run().catch(console.error);
