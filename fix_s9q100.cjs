const { DynamoDBClient, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const client = new DynamoDBClient({ region: 'eu-central-1' });

async function run() {
  console.log('[1] Opravuji subject9_q100: correct 2 (C=117kt) -> 1 (B=125kt)...');
  await client.send(new UpdateItemCommand({
    TableName: 'aeropilot-questions',
    Key: { questionId: { S: 'subject9_q100' } },
    UpdateExpression: 'SET #c = :c, correctOption = :co',
    ExpressionAttributeNames: { '#c': 'correct' },
    ExpressionAttributeValues: { ':c': { N: '1' }, ':co': { S: 'B' } }
  }));
  console.log('[1] ✅ subject9_q100 opraveno: C -> B (125 kt)');
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
