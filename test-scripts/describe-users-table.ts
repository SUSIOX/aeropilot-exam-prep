import { config } from 'dotenv';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';

config();

const region = process.env.AWS_REGION || 'eu-central-1';
const identityPoolId = process.env.COGNITO_IDENTITY_POOL_ID!;

const credentials = fromCognitoIdentityPool({
  client: new CognitoIdentityClient({ region }),
  identityPoolId
});

const client = new DynamoDBClient({ region, credentials });

async function run() {
  const result = await client.send(new DescribeTableCommand({ TableName: 'aeropilot-users' }));
  console.log('Key Schema:', JSON.stringify(result.Table?.KeySchema, null, 2));
  console.log('Attribute Definitions:', JSON.stringify(result.Table?.AttributeDefinitions, null, 2));
}

run().catch(e => console.error('❌', e.message));
