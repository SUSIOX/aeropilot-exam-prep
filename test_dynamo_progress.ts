import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'eu-central-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function checkUser(userId: string) {
  try {
    const res = await docClient.send(new GetCommand({
      TableName: 'aeropilot-users',
      Key: { userId }
    }));
    if (res.Item) {
      console.log('User found! Progress entries:', Object.keys(res.Item.progress || {}).length);
      const keys = Object.keys(res.Item.progress || {});
      if (keys.length > 0) {
        const sampleKey = keys[keys.length - 1]; // get a recent one or random
        console.log('Sample progress:', res.Item.progress[sampleKey]);
      }
      // Check for stats object
      if (res.Item.stats) {
        console.log('Stats object exists in DB!', JSON.stringify(res.Item.stats, null, 2));
      }
    } else {
      console.log('User not found in DB');
    }
  } catch (e) {
    console.error('Error fetching user', e);
  }
}

// Read cognito user id (since I don't know it, I will just scan to find one)
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

async function scanUsers() {
  const res = await docClient.send(new ScanCommand({ TableName: 'aeropilot-users', Limit: 5 }));
  for (const item of res.Items || []) {
    console.log(`\nUser: ${item.username || item.userId}`);
    const keys = Object.keys(item.progress || {});
    console.log(`Progress entries: ${keys.length}`);
    if (keys.length > 0) {
      // Find one with subjectId if it exists
      const withSubject = Object.values(item.progress as any).find((p: any) => p.subjectId !== undefined);
      if (withSubject) {
        console.log('Found entry WITH subjectId:', withSubject);
      } else {
        console.log('Sample entry WITHOUT subjectId:', item.progress[keys[0]]);
      }
    }
  }
}

scanUsers();
