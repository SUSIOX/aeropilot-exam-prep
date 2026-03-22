import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'eu-central-1' }));
async function run() {
  const all: any[] = [];
  let lastKey: any = undefined;
  do {
    const res: any = await client.send(new ScanCommand({ TableName: 'aeropilot-questions', ExclusiveStartKey: lastKey }));
    all.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
    process.stdout.write('.');
  } while (lastKey);
  const counts = all.reduce((acc: any, i: any) => {
    const key = i.createdBy || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  console.log('\nCOUNTS:', counts);
  process.exit(0);
}
run().catch(err => { console.error(err); process.exit(1); });
