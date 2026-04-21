const { DynamoDBClient, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const client = new DynamoDBClient({ region: 'eu-central-1' });

async function run() {
  console.log('[1] Hledám klubové otázky bez metadata...');
  
  let updated = 0;
  let lastKey = null;
  
  do {
    const r = await client.send(new ScanCommand({
      TableName: 'aeropilot-questions',
      FilterExpression: 'begins_with(questionId, :prefix)',
      ExpressionAttributeValues: { ':prefix': { S: 'klub_' } },
      ExclusiveStartKey: lastKey,
      Limit: 100
    }));
    
    for (const item of r.Items) {
      const q = unmarshall(item);
      
      // Kontrola jestli má metadata s applies_to
      const hasMetadata = q.metadata && q.metadata.applies_to && q.metadata.applies_to.includes('KL');
      
      if (!hasMetadata) {
        console.log(`  Aktualizuji ${q.questionId}...`);
        await client.send(new UpdateItemCommand({
          TableName: 'aeropilot-questions',
          Key: { questionId: { S: q.questionId } },
          UpdateExpression: 'SET #metadata = :metadata, #license = :license',
          ExpressionAttributeNames: { 
            '#metadata': 'metadata',
            '#license': 'license'
          },
          ExpressionAttributeValues: { 
            ':metadata': { M: { 
              applies_to: { L: [{ S: 'KL' }] },
              license_note: { S: 'Klubové otázky SPL' }
            }},
            ':license': { S: 'KL' }
          }
        }));
        updated++;
      }
    }
    
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);
  
  console.log(`[2] Hotovo! Aktualizováno ${updated} otázek.`);
}

run().catch(e => {
  console.error('❌ Chyba:', e.message);
  process.exit(1);
});
