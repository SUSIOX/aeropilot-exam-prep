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
  // Scan with only subjectId projection
  const result = await docClient.send(new ScanCommand({
    TableName: 'aeropilot-questions',
    ProjectionExpression: 'subjectId'
  }));

  const counts: Record<string, number> = {};
  for (const item of result.Items || []) {
    const sid = String(item.subjectId);
    counts[sid] = (counts[sid] || 0) + 1;
  }

  console.log('Počty otázek:', counts);
  console.log('Celkem:', result.Items?.length);
  console.log('Typ subjectId první položky:', typeof result.Items?.[0]?.subjectId, '=', result.Items?.[0]?.subjectId);
}

run().catch(e => console.error('❌', e.message));
