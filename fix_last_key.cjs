const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const dc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'eu-central-1' }));
const fs = require('fs');
const json9 = JSON.parse(fs.readFileSync('subject_9.json'));
const TABLE = 'aeropilot-questions';

async function main() {
  const r = await dc.send(new GetCommand({ TableName: TABLE, Key: { questionId: 'subject9_q100_1' } }));
  const item = r.Item;
  console.log('question:', item.question);
  console.log('originalId:', item.originalId);

  const origId = item.originalId;
  const newQid = 'subject9_q' + origId;

  const ex = await dc.send(new GetCommand({ TableName: TABLE, Key: { questionId: newQid } }));
  if (ex.Item) {
    console.log('Target', newQid, 'already exists → deleting duplicate subject9_q100_1');
    await dc.send(new DeleteCommand({ TableName: TABLE, Key: { questionId: 'subject9_q100_1' } }));
    console.log('Done.');
  } else {
    const newItem = { ...item, questionId: newQid };
    await dc.send(new PutCommand({ TableName: TABLE, Item: newItem }));
    await dc.send(new DeleteCommand({ TableName: TABLE, Key: { questionId: 'subject9_q100_1' } }));
    console.log('Migrated to', newQid);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
