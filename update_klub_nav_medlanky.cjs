const { DynamoDBClient, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const client = new DynamoDBClient({ region: 'eu-central-1' });

async function run() {
  console.log('[1] Aktualizuji klub_qXXX Navigace otázky na Medlánky...');
  
  let updated = 0;
  let lastKey = null;
  
  do {
    const r = await client.send(new ScanCommand({
      TableName: 'aeropilot-questions',
      FilterExpression: 'begins_with(questionId, :prefix) AND subjectId = :sid',
      ExpressionAttributeValues: { 
        ':prefix': { S: 'klub_' },
        ':sid': { N: '9' }
      },
      ExclusiveStartKey: lastKey,
      Limit: 50
    }));
    
    for (const item of r.Items) {
      const q = unmarshall(item);
      
      console.log(`  Aktualizuji ${q.questionId}: ${q.question?.slice(0, 50)}...`);
      await client.send(new UpdateItemCommand({
        TableName: 'aeropilot-questions',
        Key: { questionId: { S: q.questionId } },
        UpdateExpression: 'SET subcategory = :sub',
        ExpressionAttributeValues: { ':sub': { S: 'Medlánky' } }
      }));
      updated++;
    }
    
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);
  
  console.log(`[2] Hotovo! Aktualizováno ${updated} otázek.`);
}

run().catch(e => {
  console.error('❌ Chyba:', e.message);
  process.exit(1);
});
