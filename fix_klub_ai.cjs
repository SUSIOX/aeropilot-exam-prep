const { DynamoDBClient, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const fs = require('fs');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE_NAME = 'aeropilot-questions';

// AI-generated answers for the 3 problematic questions
const AI_FIXES = {
  'klub_q217': {
    question: 'Co z následujícího NEZPŮSOBÍ ztrátu orientace u pilota?',
    answers: [
      'let pod vlivem alkoholu',           // A - causes disorientation
      'pohyby hlavou při zatáčení',        // B - CORRECT (does NOT cause)
      'hypoxie (nedostatek kyslíku)',      // C - causes disorientation
      'únava a nedostatek spánku'          // D - causes disorientation
    ],
    correct: 1,
    correctOption: 'B'
  },
  'klub_q215': {
    // This question has structural issues - the text contains the answers
    // Need to restructure completely
    question: 'Která z následujících vlastností je ovlivněna stresem?',
    answers: [
      'pouze pozornost',                    // A
      'pouze soustředěnost',                // B
      'pouze paměť',                        // C
      'všechny uvedené (pozornost, soustředěnost, odpovědnost i paměť)' // D - CORRECT
    ],
    correct: 3,
    correctOption: 'D'
  },
  'klub_q199': {
    question: 'Do jaké výšky lze obvykle počítat s "přízemním efektem" (ground effect) v blízkosti země?',
    answers: [
      'asi do výšky rovnající se rozpětí křídla',        // A
      'asi do výšky jako je polovina rozpětí křídla',   // B - CORRECT
      'asi do výšky rovnající se délce trupu',           // C
      'pouze do výšky 10 metrů nad zemí'                 // D
    ],
    correct: 1,
    correctOption: 'B'
  }
};

async function applyAIFixes() {
  console.log('=== APPLY AI FIXES TO KLUB QUESTIONS ===\n');
  
  for (const [questionId, fix] of Object.entries(AI_FIXES)) {
    try {
      // Check if question exists
      const result = await client.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'questionId = :qid',
        ExpressionAttributeValues: { ':qid': { S: questionId } },
        ProjectionExpression: 'questionId, #q, answers, correct, correctOption',
        ExpressionAttributeNames: { '#q': 'question' }
      }));
      
      const items = result.Items?.map(unmarshall) || [];
      if (items.length === 0) {
        console.log(`⚠️  ${questionId}: Not found in DB`);
        continue;
      }
      
      const current = items[0];
      console.log(`\n${questionId}:`);
      console.log(`  Old Q: ${current.question?.substring(0, 60)}...`);
      console.log(`  New Q: ${fix.question}`);
      console.log(`  Answers: ${fix.answers.length} options`);
      console.log(`  Correct: ${fix.correctOption}`);
      
      // Apply fix
      await client.send(new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: { questionId: { S: questionId } },
        UpdateExpression: 'SET #q = :newQ, answers = :ans, correct = :corr, correctOption = :opt, updatedAt = :now, ai_fixed = :fixed',
        ExpressionAttributeNames: { '#q': 'question' },
        ExpressionAttributeValues: {
          ':newQ': { S: fix.question },
          ':ans': { L: fix.answers.map(a => ({ S: a })) },
          ':corr': { N: String(fix.correct) },
          ':opt': { S: fix.correctOption },
          ':now': { S: new Date().toISOString() },
          ':fixed': { BOOL: true }
        }
      }));
      
      console.log(`  ✅ Fixed with AI-generated answers`);
      
    } catch (err) {
      console.error(`  ✗ Failed ${questionId}: ${err.message}`);
    }
  }
  
  console.log('\n✅ AI fixes complete!');
  console.log('\nNote: These questions have been updated with AI-generated plausible answers.');
  console.log('Please review them manually to ensure accuracy.');
}

applyAIFixes().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
