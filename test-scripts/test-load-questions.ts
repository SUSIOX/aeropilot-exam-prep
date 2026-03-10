import { config } from 'dotenv';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';

config();

const region = process.env.AWS_REGION || 'eu-central-1';
const identityPoolId = process.env.COGNITO_IDENTITY_POOL_ID!;
const credentials = fromCognitoIdentityPool({ client: new CognitoIdentityClient({ region }), identityPoolId });
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region, credentials }));

async function run() {
  console.log('='.repeat(50));
  console.log('TEST: Načítání otázek z DynamoDB');
  console.log('='.repeat(50));

  for (let subjectId = 1; subjectId <= 9; subjectId++) {
    const result = await docClient.send(new ScanCommand({
      TableName: 'aeropilot-questions',
      FilterExpression: 'subjectId = :sid',
      ExpressionAttributeValues: { ':sid': subjectId }
    }));
    const count = result.Items?.length || 0;
    const sample = result.Items?.[0];
    console.log(`✅ Subject ${subjectId}: ${count} otázek | source: "${sample?.source}" | první: "${String(sample?.question).substring(0, 50)}..."`);
  }
}

run().catch(e => console.error('❌', e.message));
