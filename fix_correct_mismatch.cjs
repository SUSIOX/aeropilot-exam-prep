const { DynamoDBClient, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE_NAME = 'aeropilot-questions';

const QUESTIONS_TO_FIX = [
  { questionId: 'subject1_q6', correct: 2, correctOption: 'A', fixTo: 'C' },
  { questionId: 'ai_090.01.02.02_75sp8', correct: 0, correctOption: 'B', fixTo: 'A' }
];

async function fixCorrectMismatch() {
  console.log('=== FIX CORRECT MISMATCH ===\n');
  
  for (const item of QUESTIONS_TO_FIX) {
    try {
      // Get current question
      const result = await client.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'questionId = :qid',
        ExpressionAttributeValues: { ':qid': { S: item.questionId } },
        ProjectionExpression: 'questionId, #q, answers, correct, correctOption',
        ExpressionAttributeNames: { '#q': 'question' }
      }));
      
      const questions = result.Items?.map(unmarshall) || [];
      if (questions.length === 0) {
        console.log(`⚠️  ${item.questionId}: Not found in DB`);
        continue;
      }
      
      const q = questions[0];
      console.log(`\n${item.questionId}:`);
      console.log(`  Q: ${q.question?.substring(0, 60)}...`);
      console.log(`  Current: correct=${q.correct}, correctOption=${q.correctOption}`);
      console.log(`  Fix: correctOption should be ${item.fixTo} (matches correct=${item.correct})`);
      
      // Verify answer exists at correct index
      const answerCount = q.answers?.length || 0;
      if (item.correct >= answerCount) {
        console.log(`  ⚠️  Warning: correct=${item.correct} but only ${answerCount} answers!`);
        continue;
      }
      
      // Apply fix - update correctOption to match correct index
      await client.send(new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: { questionId: { S: item.questionId } },
        UpdateExpression: 'SET correctOption = :opt, updatedAt = :now',
        ExpressionAttributeValues: {
          ':opt': { S: item.fixTo },
          ':now': { S: new Date().toISOString() }
        }
      }));
      
      console.log(`  ✅ Fixed: correctOption set to ${item.fixTo}`);
      
    } catch (err) {
      console.error(`  ✗ Failed ${item.questionId}: ${err.message}`);
    }
  }
  
  console.log('\n✅ Correct mismatch fix complete!');
}

fixCorrectMismatch().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
