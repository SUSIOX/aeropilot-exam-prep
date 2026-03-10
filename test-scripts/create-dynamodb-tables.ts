// Create DynamoDB Tables for Aeropilot
import { config } from 'dotenv';
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';

config();

const identityPoolId = process.env.COGNITO_IDENTITY_POOL_ID!;
const region = process.env.AWS_REGION || 'eu-central-1';

const credentials = fromCognitoIdentityPool({
  client: new CognitoIdentityClient({ region }),
  identityPoolId
});

const client = new DynamoDBClient({ region, credentials });

// Table definitions
const tableDefinitions = [
  {
    name: 'aeropilot-ai-explanations',
    keySchema: [
      { AttributeName: 'questionId', KeyType: 'HASH' },
      { AttributeName: 'model', KeyType: 'RANGE' }
    ],
    attributeDefinitions: [
      { AttributeName: 'questionId', AttributeType: 'S' },
      { AttributeName: 'model', AttributeType: 'S' }
    ]
  },
  {
    name: 'aeropilot-learning-objectives',
    keySchema: [
      { AttributeName: 'questionId', KeyType: 'HASH' }
    ],
    attributeDefinitions: [
      { AttributeName: 'questionId', AttributeType: 'S' }
    ]
  },
  {
    name: 'aeropilot-user-progress',
    keySchema: [
      { AttributeName: 'userId', KeyType: 'HASH' },
      { AttributeName: 'questionId', KeyType: 'RANGE' }
    ],
    attributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'questionId', AttributeType: 'S' }
    ]
  },
  {
    name: 'aeropilot-question-flags',
    keySchema: [
      { AttributeName: 'questionId', KeyType: 'HASH' }
    ],
    attributeDefinitions: [
      { AttributeName: 'questionId', AttributeType: 'S' }
    ]
  },
  {
    name: 'aeropilot-users',
    keySchema: [
      { AttributeName: 'userId', KeyType: 'HASH' }
    ],
    attributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' }
    ]
  }
];

// Create a single table
async function createTable(tableDef: any) {
  
  console.log(`🔧 Creating table: ${tableDef.name}`);
  
  try {
    const command = new CreateTableCommand({
      TableName: tableDef.name,
      AttributeDefinitions: tableDef.attributeDefinitions,
      KeySchema: tableDef.keySchema,
      BillingMode: 'PAY_PER_REQUEST'
    });
    
    const result = await client.send(command);
    
    console.log(`✅ Table "${tableDef.name}" creation initiated!`);
    console.log(`   Status: ${result.TableDescription?.TableStatus}`);
    console.log(`   ARN: ${result.TableDescription?.TableArn}`);
    
    // Wait for table to become active
    console.log(`⏳ Waiting for table to become active...`);
    await waitForTableActive(client, tableDef.name);
    
    return true;
    
  } catch (error: any) {
    if (error.name === 'ResourceInUseException') {
      console.log(`✅ Table "${tableDef.name}" already exists`);
      
      // Check table status
      const describeCommand = new DescribeTableCommand({
        TableName: tableDef.name
      });
      
      const describeResult = await client.send(describeCommand);
      console.log(`   Status: ${describeResult.Table?.TableStatus}`);
      console.log(`   Items: ${describeResult.Table?.ItemCount || 0}`);
      
      return true;
    } else {
      console.error(`❌ Failed to create table "${tableDef.name}":`, error.message);
      return false;
    }
  }
}

// Wait for table to become active
async function waitForTableActive(client: DynamoDBClient, tableName: string, maxWait = 30) {
  const describeCommand = new DescribeTableCommand({ TableName: tableName });
  
  for (let i = 0; i < maxWait; i++) {
    try {
      const result = await client.send(describeCommand);
      
      if (result.Table?.TableStatus === 'ACTIVE') {
        console.log(`✅ Table "${tableName}" is now ACTIVE`);
        return true;
      }
      
      console.log(`   Status: ${result.Table?.TableStatus} (${i + 1}/${maxWait}s)`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error: any) {
      console.error(`   Error checking table status: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`⚠️ Table "${tableName}" did not become active within ${maxWait} seconds`);
  return false;
}

// Create all tables
async function createAllTables() {
  console.log('='.repeat(60));
  console.log('CREATING DYNAMODB TABLES FOR AEROPILOT');
  console.log('='.repeat(60));
  
  let successCount = 0;
  
  for (const tableDef of tableDefinitions) {
    const success = await createTable(tableDef);
    if (success) {
      successCount++;
    }
    console.log(''); // Empty line for readability
  }
  
  console.log('='.repeat(60));
  console.log('TABLE CREATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Successfully created: ${successCount}/${tableDefinitions.length} tables`);
  
  if (successCount === tableDefinitions.length) {
    console.log('\n🎉 All tables created successfully!');
    console.log('✅ Your DynamoDB is ready for Aeropilot!');
    
    // Test the connection
    console.log('\n🔍 Testing table access...');
    await testTableAccess();
    
  } else {
    console.log(`\n⚠️ ${tableDefinitions.length - successCount} tables failed to create`);
    console.log('💡 Check the errors above and try again');
  }
}

// Test access to created tables
async function testTableAccess() {
  try {
    const { testSpecificTables } = await import('./test-direct-tables');
    await testSpecificTables();
  } catch (error) {
    console.log('💡 Run the table access test separately with: npx tsx test-direct-tables.ts');
  }
}

// Run the table creation
if (typeof window !== 'undefined') {
  (window as any).createAllTables = createAllTables;
  console.log('🌐 Table creation function available. Run createAllTables() in console.');
} else {
  createAllTables();
}

export { createAllTables, createTable };
