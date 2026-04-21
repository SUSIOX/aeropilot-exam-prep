const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const fs = require('fs');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE_NAME = 'aeropilot-questions';

function detectIssues(q) {
  const issues = [];
  const text = q.question || '';
  const answers = q.answers || [];

  // Empty or short question
  if (!text || text.trim().length === 0) issues.push('empty_question');
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  if (words.length > 0 && words.length < 5) issues.push('short_question');

  // Truncated text (ends abruptly)
  if (text.endsWith('...') || text.endsWith('…')) issues.push('truncated');
  const lastChar = text.trim().slice(-1);
  if (text.length > 0 && !/[.!?;:]$/.test(lastChar)) issues.push('no_ending_punct');

  // Answer issues
  if (answers.length === 0) issues.push('no_answers');
  else if (answers.length === 1) issues.push('single_answer');
  else if (answers.length < 4) issues.push('few_answers');

  // Empty answers
  const emptyCount = answers.filter(a => !a || a.trim() === '').length;
  if (emptyCount > 0) issues.push('empty_answers');

  // Invalid correct index
  if (q.correct !== undefined) {
    const idx = parseInt(q.correct);
    if (isNaN(idx) || idx < 0 || idx >= answers.length) issues.push('invalid_correct');
  }

  return issues;
}

async function auditSubject2() {
  console.log('=== AUDIT SUBJECT 2 QUESTIONS ===\n');

  let lastKey = null;
  let scanned = 0;
  const allQuestions = [];
  const problems = [];

  do {
    const result = await client.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'subjectId = :sid',
      ExpressionAttributeValues: { ':sid': { N: '2' } },
      ExclusiveStartKey: lastKey,
      Limit: 1000
    }));

    const items = result.Items?.map(unmarshall) || [];
    scanned += items.length;
    lastKey = result.LastEvaluatedKey;

    for (const q of items) {
      const issues = detectIssues(q);
      allQuestions.push({
        questionId: q.questionId,
        question: q.question,
        answers: q.answers,
        correct: q.correct,
        correctOption: q.correctOption,
        source: q.source,
        issues: issues
      });

      if (issues.length > 0) {
        problems.push({
          questionId: q.questionId,
          question: q.question?.substring(0, 100),
          issueCount: issues.length,
          issues: issues,
          answerCount: q.answers?.length || 0,
          source: q.source
        });
      }
    }

    process.stdout.write(`\rScanned: ${scanned}, Found ${problems.length} with issues`);
  } while (lastKey);

  console.log('\n\n=== SUMMARY ===');
  console.log(`Total questions scanned: ${allQuestions.length}`);
  console.log(`Questions with issues: ${problems.length}`);

  // Group by issue type
  const issueCounts = {};
  for (const p of problems) {
    for (const issue of p.issues) {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
  }

  console.log('\nIssue breakdown:');
  for (const [issue, count] of Object.entries(issueCounts).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${issue}: ${count}`);
  }

  // Save full report
  const report = {
    timestamp: new Date().toISOString(),
    totalScanned: scanned,
    problemsFound: problems.length,
    issueBreakdown: issueCounts,
    problematicQuestions: problems
  };

  const filename = `audit_subject2_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(filename, JSON.stringify(report, null, 2));
  console.log(`\nFull report saved to: ${filename}`);

  // Print first 10 problems
  console.log('\n=== FIRST 10 PROBLEMS ===');
  problems.slice(0, 10).forEach((p, i) => {
    console.log(`\n${i+1}. ${p.questionId} [${p.issues.join(', ')}]`);
    console.log(`   Q: ${p.question}${p.question?.length >= 100 ? '...' : ''}`);
    console.log(`   Answers: ${p.answerCount}, Source: ${p.source}`);
  });
}

auditSubject2().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
