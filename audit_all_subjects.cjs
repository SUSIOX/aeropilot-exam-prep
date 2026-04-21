const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const fs = require('fs');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE_NAME = 'aeropilot-questions';

const SUBJECT_NAMES = {
  1: 'Air Law',
  2: 'Human Performance',
  3: 'Meteorology',
  4: 'Communications',
  5: 'Principles of Flight',
  6: 'Operational Procedures',
  7: 'Flight Performance',
  8: 'Aircraft General Knowledge',
  9: 'Navigation'
};

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

  // Mismatch between correct and correctOption
  if (q.correct !== undefined && q.correctOption) {
    const expectedOption = String.fromCharCode(65 + parseInt(q.correct)); // 0->A, 1->B, etc.
    if (q.correctOption !== expectedOption) {
      issues.push('correct_mismatch');
    }
  }

  return issues;
}

async function auditSubject(subjectId) {
  console.log(`\nAuditing Subject ${subjectId}: ${SUBJECT_NAMES[subjectId]}...`);

  let lastKey = null;
  let scanned = 0;
  const problems = [];
  const sources = { ai: 0, user: 0, klub: 0, other: 0 };

  do {
    const result = await client.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'subjectId = :sid',
      ExpressionAttributeValues: { ':sid': { N: String(subjectId) } },
      ExclusiveStartKey: lastKey,
      Limit: 1000
    }));

    const items = result.Items?.map(unmarshall) || [];
    scanned += items.length;
    lastKey = result.LastEvaluatedKey;

    for (const q of items) {
      const source = q.source || 'other';
      sources[source] = (sources[source] || 0) + 1;
      sources.other -= (source === 'ai' || source === 'user' || source === 'klub') ? 0 : 1;

      const issues = detectIssues(q);
      if (issues.length > 0) {
        problems.push({
          questionId: q.questionId,
          question: q.question?.substring(0, 100),
          issues: issues,
          answerCount: q.answers?.length || 0,
          source: source
        });
      }
    }

    process.stdout.write(`\r  Scanned: ${scanned}, Problems: ${problems.length}`);
  } while (lastKey);

  // Count issues by type
  const issueCounts = {};
  for (const p of problems) {
    for (const issue of p.issues) {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
  }

  return {
    subjectId,
    subjectName: SUBJECT_NAMES[subjectId],
    totalQuestions: scanned,
    problemsFound: problems.length,
    sources,
    issueBreakdown: issueCounts,
    problematicQuestions: problems
  };
}

async function auditAllSubjects() {
  console.log('=== AUDIT ALL SUBJECTS ===\n');

  const allResults = [];
  let grandTotal = 0;
  let grandProblems = 0;

  for (let subjectId = 1; subjectId <= 9; subjectId++) {
    const result = await auditSubject(subjectId);
    allResults.push(result);
    grandTotal += result.totalQuestions;
    grandProblems += result.problemsFound;

    console.log(`\n  ✓ ${result.problemsFound}/${result.totalQuestions} with issues`);
  }

  // Summary
  console.log('\n\n========== FINAL SUMMARY ==========');
  console.log(`Total questions scanned: ${grandTotal}`);
  console.log(`Total problems found: ${grandProblems} (${((grandProblems/grandTotal)*100).toFixed(1)}%)`);

  console.log('\n--- By Subject ---');
  for (const r of allResults) {
    const pct = ((r.problemsFound / r.totalQuestions) * 100).toFixed(1);
    console.log(`S${r.subjectId} ${r.subjectName}: ${r.problemsFound}/${r.totalQuestions} (${pct}%)`);
  }

  // Global issue breakdown
  const globalIssues = {};
  for (const r of allResults) {
    for (const [issue, count] of Object.entries(r.issueBreakdown)) {
      globalIssues[issue] = (globalIssues[issue] || 0) + count;
    }
  }

  console.log('\n--- Global Issue Breakdown ---');
  const sortedIssues = Object.entries(globalIssues).sort((a,b) => b[1]-a[1]);
  for (const [issue, count] of sortedIssues) {
    console.log(`  ${issue}: ${count}`);
  }

  // Source breakdown
  console.log('\n--- Questions by Source ---');
  const sourceTotals = { ai: 0, user: 0, klub: 0, other: 0 };
  for (const r of allResults) {
    for (const [src, count] of Object.entries(r.sources)) {
      sourceTotals[src] += count;
    }
  }
  for (const [src, count] of Object.entries(sourceTotals)) {
    console.log(`  ${src}: ${count}`);
  }

  // Save full report
  const report = {
    timestamp: new Date().toISOString(),
    grandTotal,
    grandProblems,
    subjects: allResults,
    globalIssueBreakdown: globalIssues,
    sourceTotals
  };

  const filename = `audit_all_subjects_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(filename, JSON.stringify(report, null, 2));
  console.log(`\n✅ Full report saved to: ${filename}`);

  // Print top 20 worst questions
  console.log('\n========== TOP 20 WORST QUESTIONS ==========');
  const allProblems = allResults.flatMap(r => 
    r.problematicQuestions.map(p => ({...p, subjectId: r.subjectId, subjectName: r.subjectName}))
  );
  allProblems.sort((a,b) => b.issues.length - a.issues.length);

  allProblems.slice(0, 20).forEach((p, i) => {
    console.log(`\n${i+1}. [S${p.subjectId}] ${p.questionId}`);
    console.log(`   Issues: ${p.issues.join(', ')}`);
    console.log(`   Q: ${p.question}${p.question?.length >= 100 ? '...' : ''}`);
    console.log(`   Source: ${p.source}, Answers: ${p.answerCount}`);
  });
}

auditAllSubjects().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
