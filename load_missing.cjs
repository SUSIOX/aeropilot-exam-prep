const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const fs = require('fs');
const client = new DynamoDBClient({ region: 'eu-central-1' });

async function run() {
  const allQ = [], allE = [];
  let lk = null;
  process.stderr.write('Loading questions...');
  do {
    const r = await client.send(new ScanCommand({ TableName: 'aeropilot-questions', ExclusiveStartKey: lk }));
    for (const i of r.Items || []) allQ.push(unmarshall(i));
    lk = r.LastEvaluatedKey;
  } while (lk);

  process.stderr.write(' OK\nLoading explanations...');
  lk = null;
  do {
    const r = await client.send(new ScanCommand({ TableName: 'aeropilot-ai-explanations', ExclusiveStartKey: lk }));
    for (const i of r.Items || []) allE.push(unmarshall(i));
    lk = r.LastEvaluatedKey;
  } while (lk);
  process.stderr.write(' OK\n');

  const explained = new Set(allE.map(e => e.questionId));
  const missing = allQ
    .filter(q => /^subject\d+_q\d+$/.test(q.questionId || '') && !explained.has(q.questionId))
    .sort((a, b) => {
      const am = a.questionId.match(/^subject(\d+)_q(\d+)$/);
      const bm = b.questionId.match(/^subject(\d+)_q(\d+)$/);
      return Number(am[1]) - Number(bm[1]) || Number(am[2]) - Number(bm[2]);
    })
    .map(q => ({
      questionId: q.questionId,
      subjectId: q.subjectId,
      question: q.question,
      answers: q.answers,
      correct: q.correct
    }));

  fs.writeFileSync('missing_explanations.json', JSON.stringify(missing, null, 2));
  process.stderr.write(`Uloženo ${missing.length} otázek do missing_explanations.json\n`);
}

run().catch(console.error);
