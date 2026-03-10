import { config } from 'dotenv';
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
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
  console.log('🔧 Vytvářím tabulku aeropilot-questions...');
  try {
    await client.send(new CreateTableCommand({
      TableName: 'aeropilot-questions',
      AttributeDefinitions: [
        { AttributeName: 'questionId', AttributeType: 'S' },
        { AttributeName: 'subjectId', AttributeType: 'N' }
      ],
      KeySchema: [
        { AttributeName: 'questionId', KeyType: 'HASH' }
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'subjectId-index',
          KeySchema: [{ AttributeName: 'subjectId', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' }
        }
      ],
      BillingMode: 'PAY_PER_REQUEST'
    }));
    console.log('✅ Tabulka vytvořena, čekám na aktivaci...');

    // Wait for ACTIVE
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const desc = await client.send(new DescribeTableCommand({ TableName: 'aeropilot-questions' }));
      if (desc.Table?.TableStatus === 'ACTIVE') {
        console.log('✅ Tabulka je ACTIVE - připravena pro import!');
        return;
      }
      process.stdout.write('.');
    }
  } catch (e: any) {
    if (e.name === 'ResourceInUseException') {
      console.log('✅ Tabulka již existuje.');
    } else {
      console.error('❌ Chyba:', e.message);
    }
  }
}

run();
