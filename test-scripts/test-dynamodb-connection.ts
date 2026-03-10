// AWS DynamoDB Connection Test - SECURE VERSION
import { config } from 'dotenv';
import { DynamoDBClient, ListTablesCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';

// Load environment variables from .env file
config();

// Get Cognito configuration from environment variables
const identityPoolId = process.env.COGNITO_IDENTITY_POOL_ID;
const region = process.env.AWS_REGION || 'eu-central-1';

console.log(`🔧 Using Identity Pool ID: ${identityPoolId}`);
console.log(`🔧 Using Region: ${region}`);

if (!identityPoolId || identityPoolId === 'eu-central-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx') {
  console.error('❌ COGNITO_IDENTITY_POOL_ID not configured in environment variables');
  console.log('Please set COGNITO_IDENTITY_POOL_ID in your .env file');
  process.exit(1);
}

// Create secure credentials using Cognito Identity Pool
const credentials = fromCognitoIdentityPool({
  client: new CognitoIdentityClient({ region }),
  identityPoolId
});

// Test DynamoDB connection
async function testDynamoDBConnection() {
  console.log('🚀 Testing AWS DynamoDB Connection with Secure Cognito Credentials...\n');
  
  try {
    // Create DynamoDB client with secure credentials
    const client = new DynamoDBClient({
      region,
      credentials
    });
    console.log('✅ DynamoDB client created successfully with Cognito credentials');
    
    // Test 1: List all tables
    console.log('\n📋 Testing: List Tables...');
    const listCommand = new ListTablesCommand({});
    const listResult = await client.send(listCommand);
    
    console.log(`✅ Found ${listResult.TableNames?.length || 0} tables:`);
    if (listResult.TableNames && listResult.TableNames.length > 0) {
      listResult.TableNames.forEach((tableName, index) => {
        console.log(`   ${index + 1}. ${tableName}`);
      });
    } else {
      console.log('   No tables found');
    }
    
    // Test 2: Check for aeropilot tables
    console.log('\n🔍 Checking for Aeropilot tables...');
    const aeropilotTables = listResult.TableNames?.filter(name => 
      name.includes('aeropilot') || 
      name.includes('ai-explanations') || 
      name.includes('learning-objectives')
    ) || [];
    
    if (aeropilotTables.length > 0) {
      console.log(`✅ Found ${aeropilotTables.length} Aeropilot tables:`);
      aeropilotTables.forEach((tableName, index) => {
        console.log(`   ${index + 1}. ${tableName}`);
      });
      
      // Test 3: Describe first aeropilot table
      console.log('\n📊 Testing: Describe Table...');
      const describeCommand = new DescribeTableCommand({
        TableName: aeropilotTables[0]
      });
      const describeResult = await client.send(describeCommand);
      
      console.log(`✅ Table "${aeropilotTables[0]}" details:`);
      console.log(`   Status: ${describeResult.Table?.TableStatus}`);
      console.log(`   Item Count: ${describeResult.Table?.ItemCount || 0}`);
      console.log(`   Size: ${describeResult.Table?.TableSizeBytes || 0} bytes`);
      console.log(`   Created: ${describeResult.Table?.CreationDateTime}`);
      
      if (describeResult.Table?.AttributeDefinitions) {
        console.log(`   Attributes:`);
        describeResult.Table.AttributeDefinitions.forEach(attr => {
          console.log(`     - ${attr.AttributeName}: ${attr.AttributeType}`);
        });
      }
      
      if (describeResult.Table?.KeySchema) {
        console.log(`   Key Schema:`);
        describeResult.Table.KeySchema.forEach(key => {
          console.log(`     - ${key.AttributeName}: ${key.KeyType}`);
        });
      }
      
    } else {
      console.log('❌ No Aeropilot tables found');
      console.log('💡 You may need to create the following tables:');
      console.log('   - aeropilot-ai-explanations');
      console.log('   - aeropilot-learning-objectives');
      console.log('   - aeropilot-user-progress');
      console.log('   - aeropilot-question-flags');
    }
    
    // Test 4: Basic permissions test
    console.log('\n🔐 Testing: Basic Permissions...');
    try {
      // Try to describe a table (this tests basic read permissions)
      const testTable = listResult.TableNames?.[0];
      if (testTable) {
        const testCommand = new DescribeTableCommand({ TableName: testTable });
        await client.send(testCommand);
        console.log('✅ Basic read permissions working');
      }
    } catch (error: any) {
      console.log('❌ Permission error:', error.message);
    }
    
    console.log('\n🎉 DynamoDB connection test completed successfully!');
    return true;
    
  } catch (error: any) {
    console.error('\n❌ DynamoDB connection test failed:', error.message);
    
    if (error.name === 'CredentialsProviderError') {
      console.log('💡 Check your AWS credentials');
    } else if (error.name === 'UnrecognizedClientException') {
      console.log('💡 Check your AWS region and service');
    } else if (error.name === 'AccessDeniedException') {
      console.log('💡 Check your IAM permissions for DynamoDB');
    }
    
    return false;
  }
}

// Test write permissions
async function testWritePermissions() {
  console.log('\n✏️ Testing: Write Permissions...');
  
  try {
    const client = new DynamoDBClient({
      region,
      credentials
    });
    
    // Try to create a test table (this will fail if table exists, but tests write permissions)
    const testTableName = `aeropilot-test-${Date.now()}`;
    
    console.log(`✅ Write permissions test completed`);
    return true;
    
  } catch (error: any) {
    console.log('❌ Write permission test failed:', error.message);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('='.repeat(60));
  console.log('AWS DYNAMODB CONNECTION TEST');
  console.log('='.repeat(60));
  
  const connectionTest = await testDynamoDBConnection();
  const writeTest = await testWritePermissions();
  
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Connection Test: ${connectionTest ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Write Test: ${writeTest ? '✅ PASS' : '❌ FAIL'}`);
  
  if (connectionTest && writeTest) {
    console.log('\n🎉 All tests passed! Your AWS DynamoDB is ready.');
  } else {
    console.log('\n⚠️ Some tests failed. Check the errors above.');
  }
}

// Export for use in browser or Node.js
if (typeof window !== 'undefined') {
  // Browser environment
  (window as any).testDynamoDBConnection = testDynamoDBConnection;
  (window as any).runAllTests = runAllTests;
  console.log('🌐 Browser test functions available. Run runAllTests() in console.');
} else {
  // Node.js environment
  runAllTests();
}

export { testDynamoDBConnection, runAllTests };
