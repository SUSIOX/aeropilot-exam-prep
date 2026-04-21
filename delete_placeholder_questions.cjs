const { DynamoDBClient, ScanCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE_NAME = 'aeropilot-questions';

const PLACEHOLDER_TEXTS = ['Vyřazena', 'Vyrazena', 'VYRazena', 'vyřazena'];

async function findAndDeletePlaceholders() {
  console.log('=== DELETE PLACEHOLDER QUESTIONS ===\n');
  console.log('Looking for questions with text:', PLACEHOLDER_TEXTS.join(', '));
  
  let lastKey = null;
  let scanned = 0;
  const toDelete = [];
  
  // Scan all questions
  do {
    const result = await client.send(new ScanCommand({
      TableName: TABLE_NAME,
      ProjectionExpression: 'questionId, #q, #src, subjectId',
      ExpressionAttributeNames: { '#q': 'question', '#src': 'source' },
      ExclusiveStartKey: lastKey,
      Limit: 1000
    }));
    
    const items = result.Items?.map(unmarshall) || [];
    scanned += items.length;
    lastKey = result.LastEvaluatedKey;
    
    for (const q of items) {
      const questionText = q.question?.trim() || '';
      if (PLACEHOLDER_TEXTS.includes(questionText)) {
        toDelete.push({
          questionId: q.questionId,
          subjectId: q.subjectId,
          source: q.source,
          question: questionText
        });
      }
    }
    
    process.stdout.write(`\rScanned: ${scanned}, Found ${toDelete.length} placeholders`);
  } while (lastKey);
  
  console.log('\n\n=== FOUND QUESTIONS TO DELETE ===');
  if (toDelete.length === 0) {
    console.log('No placeholder questions found!');
    return;
  }
  
  toDelete.forEach((q, i) => {
    console.log(`${i+1}. ${q.questionId} (Subject ${q.subjectId}, Source: ${q.source})`);
  });
  
  console.log(`\nTotal to delete: ${toDelete.length}`);
  console.log('\n⚠️  WARNING: This will PERMANENTLY delete these questions from DynamoDB!');
  console.log('Type "DELETE" to confirm, or anything else to cancel:');
  
  // For safety, require confirmation
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise(resolve => {
    rl.question('> ', resolve);
  });
  rl.close();
  
  if (answer.trim() !== 'DELETE') {
    console.log('\n❌ Cancelled. No questions deleted.');
    return;
  }
  
  // Proceed with deletion
  console.log('\n=== DELETING QUESTIONS ===');
  let deleted = 0;
  let errors = 0;
  
  for (const q of toDelete) {
    try {
      await client.send(new DeleteItemCommand({
        TableName: TABLE_NAME,
        Key: { questionId: { S: q.questionId } }
      }));
      console.log(`✓ Deleted: ${q.questionId}`);
      deleted++;
    } catch (err) {
      console.error(`✗ Failed to delete ${q.questionId}: ${err.message}`);
      errors++;
    }
  }
  
  console.log('\n=== RESULT ===');
  console.log(`Deleted: ${deleted}`);
  console.log(`Errors: ${errors}`);
  console.log(`\n✅ Placeholder cleanup complete!`);
}

findAndDeletePlaceholders().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
