const { DynamoDBClient, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const client = new DynamoDBClient({ region: 'eu-central-1' });

// Mapování kategorií na subjectId
const CATEGORY_TO_SUBJECT = {
  'Letecké výkony a plánování SPL': 7,
  'Lidská výkonnost a omezení SPL': 2,
  'Meteorologie SPL': 3,
  'Navigace SPL': 9,
  'Provozní postupy SPL': 6,
  'Předpisy SPL': 1,
  'Všeobecné znalosti letadel SPL': 8,
  'Základy letu SPL': 5,
};

async function run() {
  console.log('[1] Hledám klubové otázky s subjectId 10...');
  
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
      
      if (q.subjectId === 10) {
        const newSubjectId = CATEGORY_TO_SUBJECT[q.category] || 10;
        
        if (newSubjectId !== 10) {
          console.log(`  Aktualizuji ${q.questionId}: ${q.category} -> subject ${newSubjectId}`);
          await client.send(new UpdateItemCommand({
            TableName: 'aeropilot-questions',
            Key: { questionId: { S: q.questionId } },
            UpdateExpression: 'SET subjectId = :sid',
            ExpressionAttributeValues: { ':sid': { N: String(newSubjectId) } }
          }));
          updated++;
        }
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
