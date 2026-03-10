import { config } from 'dotenv';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';

config();

const region = process.env.AWS_REGION || 'eu-central-1';
const identityPoolId = process.env.COGNITO_IDENTITY_POOL_ID!;
const credentials = fromCognitoIdentityPool({ client: new CognitoIdentityClient({ region }), identityPoolId });
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region, credentials }));

const now = new Date().toISOString();

async function testTable(table: string, item: Record<string, any>, key: Record<string, any>) {
  try {
    await docClient.send(new PutCommand({ TableName: table, Item: item }));
    const result = await docClient.send(new GetCommand({ TableName: table, Key: key }));
    if (result.Item) {
      // Cleanup test item
      await docClient.send(new DeleteCommand({ TableName: table, Key: key }));
      console.log(`✅ ${table} — zápis + čtení OK`);
    } else {
      console.log(`⚠️ ${table} — zápis OK, čtení prázdné`);
    }
  } catch (e: any) {
    console.log(`❌ ${table} — ${e.name}: ${e.message.slice(0, 80)}`);
  }
}

async function run() {
  console.log('Testing all 6 tables...\n');

  await testTable('aeropilot-users', 
    { userId: '_test_', username: '_test_', createdAt: now },
    { userId: '_test_' }
  );

  await testTable('aeropilot-questions',
    { questionId: '_test_', subjectId: 0, question: 'test', createdAt: now },
    { questionId: '_test_' }
  );

  await testTable('aeropilot-ai-explanations',
    { questionId: '_test_', model: '_test_', explanation: 'test', provider: 'gemini', createdAt: now, lastUsed: now, usageCount: 1 },
    { questionId: '_test_', model: '_test_' }
  );

  await testTable('aeropilot-user-progress',
    { userId: '_test_', questionId: '_test_', isCorrect: true, createdAt: now },
    { userId: '_test_', questionId: '_test_' }
  );

  await testTable('aeropilot-learning-objectives',
    { questionId: '_test_', objective: 'test', createdAt: now },
    { questionId: '_test_' }
  );

  await testTable('aeropilot-question-flags',
    { questionId: '_test_', isFlagged: true, createdAt: now },
    { questionId: '_test_' }
  );
}

run();
