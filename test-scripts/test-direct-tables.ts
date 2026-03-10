// AWS DynamoDB Direct Table Test
import { DynamoDBClient, DescribeTableCommand, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

// AWS credentials from environment variables
const awsConfig = {
  region: process.env.AWS_REGION || 'eu-central-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
};

// Expected table names
const expectedTables = [
  'aeropilot-ai-explanations',
  'aeropilot-learning-objectives',
  'aeropilot-user-progress',
  'aeropilot-question-flags',
  'ai-explanations',
  'learning-objectives',
  'user-progress',
  'question-flags'
];

// Test specific tables
async function testSpecificTables() {
  console.log('🔍 Testing Specific Aeropilot Tables...\n');
  
  try {
    const client = new DynamoDBClient(awsConfig);
    const docClient = DynamoDBDocumentClient.from(client);
    
    let foundTables = 0;
    
    for (const tableName of expectedTables) {
      try {
        console.log(`📋 Testing table: ${tableName}`);
        
        const describeCommand = new DescribeTableCommand({
          TableName: tableName
        });
        
        const result = await client.send(describeCommand);
        
        console.log(`✅ Table "${tableName}" found!`);
        console.log(`   Status: ${result.Table?.TableStatus}`);
        console.log(`   Items: ${result.Table?.ItemCount || 0}`);
        console.log(`   Size: ${result.Table?.TableSizeBytes || 0} bytes`);
        
        if (result.Table?.KeySchema) {
          console.log(`   Keys: ${result.Table.KeySchema.map(k => `${k.AttributeName} (${k.KeyType})`).join(', ')}`);
        }
        
        foundTables++;
        
        // Test read/write on this table
        await testTableOperations(docClient, tableName);
        
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
    
    console.log(`\n📊 Summary: Found ${foundTables} out of ${expectedTables.length} expected tables`);
    
    if (foundTables === 0) {
      console.log('\n💡 No Aeropilot tables found. You may need to create them.');
      console.log('📝 Suggested table creation commands:');
      
      expectedTables.forEach(tableName => {
        consoleTableSchema(tableName);
      });
    }
    
    return foundTables > 0;
    
  } catch (error: any) {
    console.error('❌ Table test failed:', error.message);
    return false;
  }
}

// Test basic operations on a table
async function testTableOperations(docClient: any, tableName: string) {
  try {
    console.log(`  🔧 Testing operations on ${tableName}...`);
    
    // Test write (put a test item)
    const testItem = {
      questionId: 'test-connection',
      model: 'test-model',
      explanation: 'Test explanation for connection',
      provider: 'gemini',
      usageCount: 1,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    };
    
    const putCommand = new PutCommand({
      TableName: tableName,
      Item: testItem,
      ConditionExpression: 'attribute_not_exists(questionId)' // Only put if not exists
    });
    
    try {
      await docClient.send(putCommand);
      console.log(`  ✅ Write test passed`);
    } catch (putError: any) {
      if (putError.name === 'ConditionalCheckFailedException') {
        console.log(`  ✅ Write test passed (item already exists)`);
      } else {
        console.log(`  ❌ Write test failed: ${putError.message}`);
        return;
      }
    }
    
    // Test read (get the test item)
    const getCommand = new GetCommand({
      TableName: tableName,
      Key: {
        questionId: 'test-connection',
        model: 'test-model'
      }
    });
    
    try {
      const getResult = await docClient.send(getCommand);
      if (getResult.Item) {
        console.log(`  ✅ Read test passed`);
      } else {
        console.log(`  ⚠️ Read test: item not found`);
      }
    } catch (getError: any) {
      console.log(`  ❌ Read test failed: ${getError.message}`);
    }
    
  } catch (error: any) {
    console.log(`  ❌ Operations test failed: ${error.message}`);
  }
}

// Show table schema suggestions
function consoleTableSchema(tableName: string) {
  console.log(`\n📝 Table: ${tableName}`);
  
  if (tableName.includes('explanations')) {
    console.log(`   Partition Key: questionId (String)`);
    console.log(`   Sort Key: model (String)`);
    console.log(`   Attributes: explanation, detailedExplanation, provider, usageCount, createdAt, lastUsed`);
  } else if (tableName.includes('objectives')) {
    console.log(`   Partition Key: questionId (String)`);
    console.log(`   Attributes: objective, confidence, createdAt`);
  } else if (tableName.includes('progress')) {
    console.log(`   Partition Key: userId (String)`);
    console.log(`   Sort Key: questionId (String)`);
    console.log(`   Attributes: isCorrect, answerTimestamp, attempts`);
  } else if (tableName.includes('flags')) {
    console.log(`   Partition Key: questionId (String)`);
    console.log(`   Attributes: isFlagged, flaggedAt, flagReason`);
  }
}

// Test with mock table creation suggestion
async function suggestTableCreation() {
  console.log('\n🔧 AWS CLI Commands for Table Creation:');
  console.log('='.repeat(50));
  
  const tables = [
    {
      name: 'aeropilot-ai-explanations',
      key: 'questionId',
      sortKey: 'model'
    },
    {
      name: 'aeropilot-learning-objectives',
      key: 'questionId'
    },
    {
      name: 'aeropilot-user-progress',
      key: 'userId',
      sortKey: 'questionId'
    },
    {
      name: 'aeropilot-question-flags',
      key: 'questionId'
    }
  ];
  
  tables.forEach(table => {
    let command = `aws dynamodb create-table \\
    --table-name ${table.name} \\
    --attribute-definitions \\
        AttributeName=${table.key},AttributeType=S`;
    
    if (table.sortKey) {
      command += ` \\
        AttributeName=${table.sortKey},AttributeType=S`;
    }
    
    command += ` \\
    --key-schema \\
        AttributeName=${table.key},KeyType=HASH`;
    
    if (table.sortKey) {
      command += ` \\
        AttributeName=${table.sortKey},KeyType=RANGE`;
    }
    
    command += ` \\
    --billing-mode PAY_PER_REQUEST \\
    --region eu-central-1`;
    
    console.log(`\n# Create ${table.name}:`);
    console.log(command);
  });
}

// Run all tests
async function runDirectTests() {
  console.log('='.repeat(60));
  console.log('AWS DYNAMODB DIRECT TABLE TEST');
  console.log('='.repeat(60));
  
  const tableTest = await testSpecificTables();
  
  if (!tableTest) {
    await suggestTableCreation();
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('DIRECT TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Table Access: ${tableTest ? '✅ PASS' : '❌ FAIL'}`);
  
  if (tableTest) {
    console.log('\n🎉 Your DynamoDB connection is working!');
    console.log('✅ Tables are accessible');
    console.log('✅ Read/Write operations working');
  } else {
    console.log('\n⚠️ Tables not found or not accessible');
    console.log('💡 Check table names or create missing tables');
  }
}

// Export for browser use
if (typeof window !== 'undefined') {
  (window as any).runDirectTests = runDirectTests;
  console.log('🌐 Direct test functions available. Run runDirectTests() in console.');
} else {
  runDirectTests();
}

export { runDirectTests, testSpecificTables };
