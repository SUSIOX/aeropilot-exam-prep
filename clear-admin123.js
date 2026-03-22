// Clear admin123 DeepSeek keys from DynamoDB
// Run this in browser console when logged in as admin

async function clearAdmin123Keys() {
  try {
    console.log('🔍 Scanning for admin123 DeepSeek keys...');
    
    // Import dynamoDBService (adjust path if needed)
    const { dynamoDBService } = await import('./src/services/dynamoService.js');
    
    // Scan for all users with DeepSeek keys
    const scanCommand = {
      TableName: 'aeropilot-exam-prep-USERS', // Adjust table name if needed
      FilterExpression: 'attribute_exists(settings.deepseekApiKey)',
      ProjectionExpression: 'userId, settings.deepseekApiKey'
    };
    
    // This needs to be run in the app context where AWS credentials are available
    const result = await dynamoDBService.docClient.send(new ScanCommand(scanCommand));
    const users = result.Items || [];
    
    console.log(`📊 Found ${users.length} users with DeepSeek keys`);
    
    let cleaned = 0;
    for (const user of users) {
      const key = user.settings?.deepseekApiKey;
      console.log(`User ${user.userId}: "${key}"`);
      
      if (key === 'admin123' || key === 'test' || key === 'demo') {
        console.log(`🧹 Removing test key from user ${user.userId}`);
        
        const updateCommand = {
          TableName: 'aeropilot-exam-prep-USERS',
          Key: { userId: user.userId },
          UpdateExpression: 'REMOVE settings.deepseekApiKey SET updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':updatedAt': new Date().toISOString()
          }
        };
        
        await dynamoDBService.docClient.send(new UpdateCommand(updateCommand));
        cleaned++;
        console.log(`✅ Cleaned user ${user.userId}`);
      }
    }
    
    console.log(`🎉 Done! Cleaned ${cleaned} test keys`);
    return cleaned;
    
  } catch (error) {
    console.error('❌ Error:', error);
    return 0;
  }
}

// Auto-run
clearAdmin123Keys();
