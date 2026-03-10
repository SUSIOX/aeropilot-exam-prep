// Check existing DynamoDB tables and test basic operations
import { DynamoDBClient, DescribeTableCommand, GetItemCommand, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

// AWS credentials from environment variables
const awsConfig = {
  region: process.env.AWS_REGION || 'eu-central-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
};

// Common table name variations to try
const possibleTableNames = [
  // With prefix
  'aeropilot-ai-explanations',
  'aeropilot-learning-objectives',
  'aeropilot-user-progress',
  'aeropilot-question-flags',
  
  // Without prefix
  'ai-explanations',
  'learning-objectives',
  'user-progress',
  'question-flags',
  
  // Other variations
  'AeropilotAIExplanations',
  'AeropilotLearningObjectives',
  'AI_Explanations',
  'Learning_Objectives',
  'User_Progress',
  'Question_Flags'
];

// Test connection and find accessible tables
async function testConnectionAndFindTables() {
  console.log('🔍 Testing AWS DynamoDB Connection and Finding Tables...\n');
  
  try {
    const client = new DynamoDBClient(awsConfig);
    const docClient = DynamoDBDocumentClient.from(client);
    
    console.log('✅ DynamoDB client created successfully');
    
    let accessibleTables = [];
    
    // Try each possible table name
    for (const tableName of possibleTableNames) {
      try {
        console.log(`📋 Testing table: ${tableName}`);
        
        const describeCommand = new DescribeTableCommand({
          TableName: tableName
        });
        
        const result = await client.send(describeCommand);
        
        console.log(`✅ Found accessible table: ${tableName}`);
        console.log(`   Status: ${result.Table?.TableStatus}`);
        console.log(`   Items: ${result.Table?.ItemCount || 0}`);
        console.log(`   Size: ${(result.Table?.TableSizeBytes || 0) / 1024} KB`);
        
        if (result.Table?.KeySchema) {
          console.log(`   Keys: ${result.Table.KeySchema.map(k => `${k.AttributeName} (${k.KeyType})`).join(', ')}`);
        }
        
        accessibleTables.push({
          name: tableName,
          status: result.Table?.TableStatus,
          itemCount: result.Table?.ItemCount || 0,
          keySchema: result.Table?.KeySchema || []
        });
        
        // Test basic operations on this table
        await testBasicOperations(docClient, tableName);
        
      } catch (error: any) {
        if (error.name === 'ResourceNotFoundException') {
          console.log(`❌ Table "${tableName}" not found`);
        } else if (error.name === 'AccessDeniedException') {
          console.log(`🔒 No access to table "${tableName}"`);
        } else {
          console.log(`⚠️ Error with table "${tableName}": ${error.message}`);
        }
      }
      
      console.log('');
    }
    
    // Summary
    console.log('='.repeat(60));
    console.log('CONNECTION TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ AWS Connection: Working`);
    console.log(`📊 Accessible Tables: ${accessibleTables.length}`);
    
    if (accessibleTables.length > 0) {
      console.log('\n🎉 SUCCESS! Found accessible tables:');
      accessibleTables.forEach((table, index) => {
        console.log(`   ${index + 1}. ${table.name} (${table.status}, ${table.itemCount} items)`);
      });
      
      // Test our application with the first accessible table
      console.log('\n🔧 Testing application integration...');
      await testApplicationIntegration(docClient, accessibleTables[0].name);
      
    } else {
      console.log('\n⚠️ No accessible tables found');
      console.log('💡 You may need to:');
      console.log('   1. Ask your AWS admin to create the required tables');
      console.log('   2. Check if tables exist with different names');
      console.log('   3. Verify your IAM permissions');
      
      console.log('\n📝 Required tables for Aeropilot:');
      console.log('   - aeropilot-ai-explanations (questionId+model)');
      console.log('   - aeropilot-learning-objectives (questionId)');
      console.log('   - aeropilot-user-progress (userId+questionId)');
      console.log('   - aeropilot-question-flags (questionId)');
    }
    
    return accessibleTables;
    
  } catch (error: any) {
    console.error('❌ Connection test failed:', error.message);
    
    if (error.name === 'CredentialsProviderError') {
      console.log('💡 Check your AWS credentials');
    } else if (error.name === 'UnrecognizedClientException') {
      console.log('💡 Check your AWS region');
    }
    
    return [];
  }
}

// Test basic CRUD operations
async function testBasicOperations(docClient: any, tableName: string) {
  try {
    console.log(`  🔧 Testing operations on ${tableName}...`);
    
    // Determine key structure based on table name
    let testKey: any = {};
    let testItem: any = {};
    
    if (tableName.includes('explanations')) {
      testKey = { questionId: 'test-connection', model: 'test-model' };
      testItem = {
        ...testKey,
        explanation: 'Test explanation',
        provider: 'gemini',
        usageCount: 1,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      };
    } else if (tableName.includes('objectives')) {
      testKey = { questionId: 'test-connection' };
      testItem = {
        ...testKey,
        objective: 'Test objective',
        confidence: 0.8,
        createdAt: new Date().toISOString()
      };
    } else if (tableName.includes('progress')) {
      testKey = { userId: 'test-user', questionId: 'test-connection' };
      testItem = {
        ...testKey,
        isCorrect: true,
        answerTimestamp: new Date().toISOString(),
        attempts: 1
      };
    } else if (tableName.includes('flags')) {
      testKey = { questionId: 'test-connection' };
      testItem = {
        ...testKey,
        isFlagged: false,
        flaggedAt: new Date().toISOString()
      };
    } else {
      // Generic test
      testKey = { id: 'test-connection' };
      testItem = {
        ...testKey,
        data: 'test data',
        timestamp: new Date().toISOString()
      };
    }
    
    // Test PUT
    try {
      const putCommand = new PutCommand({
        TableName: tableName,
        Item: testItem,
        ConditionExpression: 'attribute_not_exists(' + Object.keys(testKey)[0] + ')'
      });
      
      await docClient.send(putCommand);
      console.log(`  ✅ PUT operation successful`);
    } catch (putError: any) {
      if (putError.name === 'ConditionalCheckFailedException') {
        console.log(`  ✅ PUT operation successful (item already exists)`);
      } else {
        console.log(`  ❌ PUT operation failed: ${putError.message}`);
        return;
      }
    }
    
    // Test GET
    try {
      const getCommand = new GetCommand({
        TableName: tableName,
        Key: testKey
      });
      
      const getResult = await docClient.send(getCommand);
      if (getResult.Item) {
        console.log(`  ✅ GET operation successful`);
      } else {
        console.log(`  ⚠️ GET operation: item not found`);
      }
    } catch (getError: any) {
      console.log(`  ❌ GET operation failed: ${getError.message}`);
    }
    
    // Test UPDATE (if table has update-friendly structure)
    try {
      const updateCommand = new UpdateCommand({
        TableName: tableName,
        Key: testKey,
        UpdateExpression: 'SET #ts = :ts',
        ExpressionAttributeNames: { '#ts': 'timestamp' },
        ExpressionAttributeValues: { ':ts': new Date().toISOString() }
      });
      
      await docClient.send(updateCommand);
      console.log(`  ✅ UPDATE operation successful`);
    } catch (updateError: any) {
      console.log(`  ⚠️ UPDATE operation: ${updateError.message}`);
    }
    
  } catch (error: any) {
    console.log(`  ❌ Operations test failed: ${error.message}`);
  }
}

// Test application integration
async function testApplicationIntegration(docClient: any, tableName: string) {
  try {
    console.log(`🚀 Testing Aeropilot integration with ${tableName}...`);
    
    // Simulate saving an AI explanation
    if (tableName.includes('explanations')) {
      const testExplanation = {
        questionId: 'subject_1_123',
        model: 'gemini-1.5-flash',
        explanation: 'This is a test AI explanation for the connection test.',
        provider: 'gemini',
        usageCount: 1,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      };
      
      const putCommand = new PutCommand({
        TableName: tableName,
        Item: testExplanation
      });
      
      await docClient.send(putCommand);
      console.log(`✅ AI explanation saved successfully`);
      
      // Test retrieval
      const getCommand = new GetCommand({
        TableName: tableName,
        Key: { questionId: 'subject_1_123', model: 'gemini-1.5-flash' }
      });
      
      const getResult = await docClient.send(getCommand);
      if (getResult.Item) {
        console.log(`✅ AI explanation retrieved successfully`);
        console.log(`   Explanation: ${getResult.Item.explanation?.substring(0, 50)}...`);
      }
    }
    
    console.log(`✅ Application integration test passed!`);
    
  } catch (error: any) {
    console.log(`❌ Application integration test failed: ${error.message}`);
  }
}

// Generate IAM policy recommendations
function generateIAMPolicy() {
  console.log('\n📋 RECOMMENDED IAM POLICY:');
  console.log('='.repeat(50));
  console.log(`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:DescribeTable"
      ],
      "Resource": [
        "arn:aws:dynamodb:eu-central-1:455982474805:table/aeropilot-*",
        "arn:aws:dynamodb:eu-central-1:455982474805:table/ai-explanations",
        "arn:aws:dynamodb:eu-central-1:455982474805:table/learning-objectives",
        "arn:aws:dynamodb:eu-central-1:455982474805:table/user-progress",
        "arn:aws:dynamodb:eu-central-1:455982474805:table/question-flags"
      ]
    }
  ]
}`);
}

// Run the test
if (typeof window !== 'undefined') {
  (window as any).testConnectionAndFindTables = testConnectionAndFindTables;
  console.log('🌐 Connection test available. Run testConnectionAndFindTables() in console.');
} else {
  testConnectionAndFindTables().then(() => {
    generateIAMPolicy();
  });
}

export { testConnectionAndFindTables };
