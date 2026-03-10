import { config } from 'dotenv';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';

config();

const region = process.env.AWS_REGION || 'eu-central-1';
const identityPoolId = process.env.COGNITO_IDENTITY_POOL_ID!;
const credentials = fromCognitoIdentityPool({ client: new CognitoIdentityClient({ region }), identityPoolId });
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region, credentials }));

const TABLE = 'aeropilot-ai-explanations';

async function run() {
  console.log('='.repeat(50));
  console.log('TEST: Zápis do aeropilot-ai-explanations');
  console.log('='.repeat(50));

  const now = new Date().toISOString();
  const testItem = {
    questionId: '2_15',
    model: 'gemini-3-flash-preview',
    explanation: 'Testovací vysvětlení z import skriptu.',
    provider: 'gemini',
    usageCount: 1,
    createdAt: now,
    lastUsed: now
  };

  // 1. Write
  console.log('\n📝 Zapisuji:', JSON.stringify(testItem, null, 2));
  await docClient.send(new PutCommand({ TableName: TABLE, Item: testItem }));
  console.log('✅ Zápis úspěšný!');

  // 2. Read back
  const result = await docClient.send(new GetCommand({
    TableName: TABLE,
    Key: { questionId: '2_15', model: 'gemini-3-flash-preview' }
  }));
  console.log('\n📖 Načteno zpět:', JSON.stringify(result.Item, null, 2));

  // 3. Cleanup
  console.log('\n🧹 Test položka ponechána v tabulce.');
}

run().catch(e => console.error('❌ Chyba:', e.message));
