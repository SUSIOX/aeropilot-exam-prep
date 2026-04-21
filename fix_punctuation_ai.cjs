const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const fs = require('fs');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE_NAME = 'aeropilot-questions';

// AI logic to determine punctuation
function determinePunctuation(question) {
  const q = question.trim();
  
  // Question words -> ?
  const questionWords = /^(Co|Jak|Kdo|Kde|Kdy|Proč|Který|Která|Které|Jaký|Jaká|Jaké|Kolik|Zda|Je|Jsou|Není|Proč|Má|Může|Lze)\b/i;
  if (questionWords.test(q)) {
    return '?';
  }
  
  // Statements -> .
  return '.';
}

async function fixPunctuationAI() {
  console.log('=== AI PUNCTUATION FIX ===\n');
  
  const files = fs.readdirSync('.').filter(f => f.startsWith('fix_list_')).sort().reverse();
  const data = JSON.parse(fs.readFileSync(files[0], 'utf8'));
  
  const questions = data.questionsToFix.filter(q => 
    q.issues.every(i => i.severity === 'low')
  );
  
  console.log(`Found ${questions.length} questions to fix\n`);
  console.log('AI will determine punctuation:');
  console.log('  - Questions (Co, Jak, Kdo...) -> ?');
  console.log('  - Statements -> .\n');
  
  let fixed = 0;
  let errors = 0;
  const log = [];
  
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const punct = determinePunctuation(q.question);
    const newQuestion = q.question + punct;
    
    console.log(`[${i+1}/${questions.length}] ${q.questionId}`);
    console.log(`  Before: "${q.question}"`);
    console.log(`  After:  "${newQuestion}"`);
    
    try {
      // Verify question exists
      const check = await client.send(new GetItemCommand({
        TableName: TABLE_NAME,
        Key: { questionId: { S: q.questionId } }
      }));
      
      if (!check.Item) {
        console.log(`  ⚠️  Not found in DB, skipping\n`);
        log.push({ id: q.questionId, status: 'not_found' });
        continue;
      }
      
      // Apply fix
      await client.send(new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: { questionId: { S: q.questionId } },
        UpdateExpression: 'SET #q = :newQ, updatedAt = :now, ai_fixed = :fixed',
        ExpressionAttributeNames: { '#q': 'question' },
        ExpressionAttributeValues: {
          ':newQ': { S: newQuestion },
          ':now': { S: new Date().toISOString() },
          ':fixed': { BOOL: true }
        }
      }));
      
      console.log(`  ✅ Fixed with "${punct}"\n`);
      fixed++;
      log.push({ id: q.questionId, status: 'fixed', added: punct });
      
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}\n`);
      errors++;
      log.push({ id: q.questionId, status: 'error', error: err.message });
    }
  }
  
  console.log('========== SUMMARY ==========');
  console.log(`Total: ${questions.length}`);
  console.log(`Fixed: ${fixed}`);
  console.log(`Errors: ${errors}`);
  console.log(`Not found: ${questions.length - fixed - errors}`);
  
  // Save log
  const logFile = `punctuation_fix_log_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(logFile, JSON.stringify({ timestamp: new Date().toISOString(), results: log }, null, 2));
  console.log(`\nLog saved to: ${logFile}`);
}

fixPunctuationAI().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
