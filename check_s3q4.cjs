const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const client = new DynamoDBClient({ region: 'eu-central-1' });
const L = ['A','B','C','D'];

async function run() {
  const r = await client.send(new GetItemCommand({
    TableName: 'aeropilot-questions',
    Key: { questionId: { S: 'subject3_q4' } }
  }));
  if (!r.Item) { console.log('CHYBÍ V DB!'); return; }
  const d = unmarshall(r.Item);
  console.log('DB correct:', L[d.correct], '(', d.correct, ')');
  console.log('DB correctOption:', d.correctOption);
  console.log('Otázka:', d.question);
  (d.answers||[]).forEach((a,i) => console.log(L[i]+') '+a+(i===d.correct?' ✅':'')));
}
run().catch(e => { console.error('❌', e.message); process.exit(1); });
