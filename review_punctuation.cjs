const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const fs = require('fs');
const readline = require('readline');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE_NAME = 'aeropilot-questions';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function reviewPunctuation() {
  console.log('=== INTERACTIVE PUNCTUATION REVIEW ===\n');
  console.log('Loading questions with punctuation issues...\n');
  
  const files = fs.readdirSync('.').filter(f => f.startsWith('fix_list_')).sort().reverse();
  const data = JSON.parse(fs.readFileSync(files[0], 'utf8'));
  
  const questions = data.questionsToFix.filter(q => 
    q.issues.every(i => i.severity === 'low')
  );
  
  console.log(`Found ${questions.length} questions to review\n`);
  
  let reviewed = 0;
  let fixed = 0;
  let skipped = 0;
  
  for (const q of questions) {
    reviewed++;
    console.log(`\n========== ${reviewed}/${questions.length} ==========`);
    console.log(`ID: ${q.questionId} (Subject ${q.subjectId})`);
    console.log(`Source: ${q.source}`);
    console.log('');
    console.log(`Q: "${q.question}"`);
    console.log(`Last char: "${q.question?.slice(-1)}"`);
    console.log('');
    
    const answer = await question('Add [.] or [?] or [skip] or [quit]: ');
    
    if (answer.trim().toLowerCase() === 'quit') {
      console.log('\n--- Stopped ---');
      break;
    }
    
    if (answer.trim() === '.') {
      await applyFix(q.questionId, q.question + '.');
      fixed++;
      console.log('✅ Added period');
    } else if (answer.trim() === '?') {
      await applyFix(q.questionId, q.question + '?');
      fixed++;
      console.log('✅ Added question mark');
    } else {
      skipped++;
      console.log('⏭️  Skipped');
    }
  }
  
  rl.close();
  
  console.log('\n========== SUMMARY ==========');
  console.log(`Reviewed: ${reviewed}`);
  console.log(`Fixed: ${fixed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Remaining: ${questions.length - reviewed}`);
}

async function applyFix(questionId, newQuestion) {
  await client.send(new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: { questionId: { S: questionId } },
    UpdateExpression: 'SET #q = :newQ, updatedAt = :now',
    ExpressionAttributeNames: { '#q': 'question' },
    ExpressionAttributeValues: {
      ':newQ': { S: newQuestion },
      ':now': { S: new Date().toISOString() }
    }
  }));
}

reviewPunctuation().catch(err => {
  console.error('Error:', err);
  rl.close();
  process.exit(1);
});
