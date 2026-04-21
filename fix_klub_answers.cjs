const { DynamoDBClient, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE_NAME = 'aeropilot-questions';

async function fixKlubAnswers() {
  console.log('=== FIX KLUB ANSWERS ===\n');
  
  let lastKey = null;
  let scanned = 0;
  const toFix3 = []; // 3 answers, delete D
  const toFix2 = []; // 2 answers, delete C and D
  
  // Scan all klub questions
  do {
    const result = await client.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(questionId, :prefix)',
      ExpressionAttributeValues: { ':prefix': { S: 'klub_' } },
      ExclusiveStartKey: lastKey,
      Limit: 1000
    }));
    
    const items = result.Items?.map(unmarshall) || [];
    scanned += items.length;
    lastKey = result.LastEvaluatedKey;
    
    for (const q of items) {
      const answers = q.answers || [];
      const nonEmpty = answers.filter(a => a && a.trim() !== '');
      
      // 3 valid answers - need to delete empty D
      if (nonEmpty.length === 3 && answers[3] === '') {
        toFix3.push({
          questionId: q.questionId,
          subjectId: q.subjectId,
          question: q.question?.substring(0, 60),
          answers: answers,
          correct: q.correct,
          correctOption: q.correctOption
        });
      }
      // 2 valid answers - need to delete empty C and D
      else if (nonEmpty.length === 2 && (answers[2] === '' || answers[3] === '')) {
        toFix2.push({
          questionId: q.questionId,
          subjectId: q.subjectId,
          question: q.question?.substring(0, 60),
          answers: answers,
          correct: q.correct,
          correctOption: q.correctOption
        });
      }
    }
    
    process.stdout.write(`\rScanned: ${scanned}, Found ${toFix3.length} with 3 answers, ${toFix2.length} with 2 answers`);
  } while (lastKey);
  
  console.log('\n\n=== ANALYSIS ===');
  console.log(`Questions with 3 answers (delete D): ${toFix3.length}`);
  console.log(`Questions with 2 answers (delete C, D): ${toFix2.length}`);
  
  // Show examples
  if (toFix3.length > 0) {
    console.log('\n=== Examples: 3 answers (keep A,B,C, delete D) ===');
    toFix3.slice(0, 3).forEach(q => {
      console.log(`\n${q.questionId}:`);
      console.log(`  Q: ${q.question}`);
      console.log(`  Answers: A="${q.answers[0]}" B="${q.answers[1]}" C="${q.answers[2]}" D="${q.answers[3]}"`);
      console.log(`  Correct: ${q.correct} (${q.correctOption})`);
    });
  }
  
  if (toFix2.length > 0) {
    console.log('\n=== Examples: 2 answers (keep A,B, delete C,D) ===');
    toFix2.slice(0, 3).forEach(q => {
      console.log(`\n${q.questionId}:`);
      console.log(`  Q: ${q.question}`);
      console.log(`  Answers: A="${q.answers[0]}" B="${q.answers[1]}" C="${q.answers[2]}" D="${q.answers[3]}"`);
      console.log(`  Correct: ${q.correct} (${q.correctOption})`);
    });
  }
  
  const totalToFix = toFix3.length + toFix2.length;
  if (totalToFix === 0) {
    console.log('\n✅ No questions need fixing!');
    return;
  }
  
  console.log(`\n\n⚠️  Ready to fix ${totalToFix} questions`);
  console.log('Type "FIX" to confirm, or anything else to cancel:');
  
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => rl.question('> ', resolve));
  rl.close();
  
  if (answer.trim() !== 'FIX') {
    console.log('\n❌ Cancelled. No changes made.');
    return;
  }
  
  // Apply fixes
  console.log('\n=== APPLYING FIXES ===');
  let fixed3 = 0, fixed2 = 0, errors = 0;
  
  // Fix 3-answer questions (remove D, keep A,B,C)
  for (const q of toFix3) {
    try {
      // Remove empty D (index 3)
      const newAnswers = q.answers.slice(0, 3);
      
      // Check if correct answer was D (index 3) - if so, we have a problem
      let newCorrect = q.correct;
      let newCorrectOption = q.correctOption;
      
      if (q.correct === 3) {
        console.log(`  ⚠️  ${q.questionId}: correct was D which is empty! Setting to A`);
        newCorrect = 0;
        newCorrectOption = 'A';
      }
      
      await client.send(new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: { questionId: { S: q.questionId } },
        UpdateExpression: 'SET answers = :ans, correct = :corr, correctOption = :opt, updatedAt = :now',
        ExpressionAttributeValues: {
          ':ans': { L: newAnswers.map(a => ({ S: a })) },
          ':corr': { N: String(newCorrect) },
          ':opt': { S: newCorrectOption },
          ':now': { S: new Date().toISOString() }
        }
      }));
      
      fixed3++;
      console.log(`✓ Fixed (3 ans→3): ${q.questionId}`);
    } catch (err) {
      console.error(`✗ Failed ${q.questionId}: ${err.message}`);
      errors++;
    }
  }
  
  // Fix 2-answer questions (remove C and D, keep A,B)
  for (const q of toFix2) {
    try {
      // Remove empty C and D (indexes 2,3)
      const newAnswers = q.answers.slice(0, 2);
      
      // Check if correct answer was C or D - if so, we have a problem
      let newCorrect = q.correct;
      let newCorrectOption = q.correctOption;
      
      if (q.correct >= 2) {
        console.log(`  ⚠️  ${q.questionId}: correct was ${q.correctOption} which is empty! Setting to A`);
        newCorrect = 0;
        newCorrectOption = 'A';
      }
      
      await client.send(new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: { questionId: { S: q.questionId } },
        UpdateExpression: 'SET answers = :ans, correct = :corr, correctOption = :opt, updatedAt = :now',
        ExpressionAttributeValues: {
          ':ans': { L: newAnswers.map(a => ({ S: a })) },
          ':corr': { N: String(newCorrect) },
          ':opt': { S: newCorrectOption },
          ':now': { S: new Date().toISOString() }
        }
      }));
      
      fixed2++;
      console.log(`✓ Fixed (4 ans→2): ${q.questionId}`);
    } catch (err) {
      console.error(`✗ Failed ${q.questionId}: ${err.message}`);
      errors++;
    }
  }
  
  console.log('\n=== RESULT ===');
  console.log(`Fixed 3→3 answers: ${fixed3}`);
  console.log(`Fixed 4→2 answers: ${fixed2}`);
  console.log(`Errors: ${errors}`);
  console.log(`\n✅ Klub answers fix complete!`);
}

fixKlubAnswers().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
