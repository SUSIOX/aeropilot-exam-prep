// Test aeropilot-users table
import { config } from 'dotenv';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';

config();

const region = process.env.AWS_REGION || 'eu-central-1';
const identityPoolId = process.env.COGNITO_IDENTITY_POOL_ID!;

const credentials = fromCognitoIdentityPool({
  client: new CognitoIdentityClient({ region }),
  identityPoolId
});

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region, credentials }));

async function testUsersTable() {
  console.log('='.repeat(50));
  console.log('TEST: aeropilot-users table');
  console.log('='.repeat(50));

  const testUser = {
    userId: 'test_pilot_001',
    username: 'test_pilot_001',
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString()
  };

  // Test 1: Write
  console.log('\n✏️  Test 1: Zápis uživatele...');
  try {
    await docClient.send(new PutCommand({
      TableName: 'aeropilot-users',
      Item: testUser
    }));
    console.log('✅ Zápis OK:', testUser.userId);
  } catch (e: any) {
    console.error('❌ Zápis FAILED:', e.message);
    process.exit(1);
  }

  // Test 2: Read
  console.log('\n📖 Test 2: Čtení uživatele...');
  try {
    const result = await docClient.send(new GetCommand({
      TableName: 'aeropilot-users',
      Key: { userId: testUser.userId }
    }));
    console.log('✅ Čtení OK:', result.Item);
  } catch (e: any) {
    console.error('❌ Čtení FAILED:', e.message);
  }

  // Test 3: Cleanup
  console.log('\n🗑️  Test 3: Mazání test uživatele...');
  try {
    await docClient.send(new DeleteCommand({
      TableName: 'aeropilot-users',
      Key: { userId: testUser.userId }
    }));
    console.log('✅ Smazáno OK');
  } catch (e: any) {
    console.error('❌ Mazání FAILED:', e.message);
  }

  console.log('\n🎉 Test dokončen!');
}

testUsersTable();
