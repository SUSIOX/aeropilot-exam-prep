const { DynamoDBClient, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const fs = require('fs');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE_NAME = 'aeropilot-questions';

// Keywords indicating math/calculation questions where punctuation is less critical
const MATH_KEYWORDS = /\b(vypoč|vypocet|vzdálenost|rychlost|čas|směr|kurs|odchylka|úhel|výška|náklad|palivo|spotřeba|váha|hmotnost|výkon|tlak|teplota|frekvence|vln|výpočet|vypočtěte|kolik|převod|přepočet|přepočtěte)\b/i;
const UNITS = /\b(NM|km|m\/s|km\/h|ft|kg|l|gal|MHz|kHz|hPa|mbar|°C|°F|°|min|hod|s|m|ft\/min|kt|KIAS|KTAS)\b/;

// Check if question is mathematical/calculation type
function isMathQuestion(text) {
  return MATH_KEYWORDS.test(text) || UNITS.test(text);
}

// Check if issue is ONLY punctuation (not a real content problem)
function isOnlyPunctuationIssue(issues) {
  const realIssues = issues.filter(i => 
    !['no_ending_punct', 'short_question'].includes(i)
  );
  return realIssues.length === 0;
}

// Detect real problems that need fixing
function needsRealFix(q) {
  const issues = [];
  const text = q.question || '';
  const answers = q.answers || [];
  
  // Critical: Empty or placeholder text
  if (!text || text.trim().length === 0) {
    issues.push({ type: 'empty_question', severity: 'critical' });
  } else if (text.trim() === 'Vyřazena') {
    issues.push({ type: 'placeholder_text', severity: 'critical', detail: 'Question marked as excluded but still in DB' });
  }
  
  // Critical: No answers or too few
  if (answers.length === 0) {
    issues.push({ type: 'no_answers', severity: 'critical' });
  } else if (answers.length < 2) {
    issues.push({ type: 'too_few_answers', severity: 'high', detail: `Only ${answers.length} answers` });
  }
  
  // Critical: Empty answer strings
  const emptyAnswers = answers.filter(a => !a || a.trim() === '');
  if (emptyAnswers.length > 0) {
    issues.push({ type: 'empty_answer_strings', severity: 'high', detail: `${emptyAnswers.length} empty answers` });
  }
  
  // High: Mismatch between correct index and correctOption
  if (q.correct !== undefined && q.correctOption) {
    const expected = String.fromCharCode(65 + parseInt(q.correct));
    if (q.correctOption !== expected) {
      issues.push({ 
        type: 'correct_mismatch', 
        severity: 'high', 
        detail: `correct=${q.correct} (${expected}) but correctOption=${q.correctOption}` 
      });
    }
  }
  
  // Medium: Invalid correct index
  if (q.correct !== undefined) {
    const idx = parseInt(q.correct);
    if (isNaN(idx) || idx < 0 || idx >= answers.length) {
      issues.push({ type: 'invalid_correct', severity: 'high', detail: `correct=${q.correct} but only ${answers.length} answers` });
    }
  }
  
  // Low: Punctuation - only flag if NOT a math question
  if (!isMathQuestion(text)) {
    const lastChar = text.trim().slice(-1);
    if (text.length > 0 && !/[.!?;:]$/.test(lastChar)) {
      issues.push({ type: 'missing_punct', severity: 'low' });
    }
  }
  
  return issues;
}

async function analyzeAndPrepareFixes(subjectId) {
  console.log(`\n=== Analyzing Subject ${subjectId} ===`);
  
  let lastKey = null;
  let scanned = 0;
  const toFix = [];
  const skipMath = [];
  const skipOk = [];
  
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
      const issues = needsRealFix(q);
      
      if (issues.length === 0) {
        skipOk.push({ questionId: q.questionId, question: q.question?.substring(0, 50) });
        continue;
      }
      
      const hasCritical = issues.some(i => i.severity === 'critical');
      const hasHigh = issues.some(i => i.severity === 'high');
      
      // Skip if only punctuation and it's a math question
      if (isMathQuestion(q.question) && !hasCritical && !hasHigh) {
        skipMath.push({
          questionId: q.questionId,
          question: q.question?.substring(0, 80),
          issues: issues.map(i => i.type)
        });
        continue;
      }
      
      // Add to fix list
      toFix.push({
        questionId: q.questionId,
        subjectId: q.subjectId,
        question: q.question,
        answers: q.answers,
        correct: q.correct,
        correctOption: q.correctOption,
        issues: issues,
        source: q.source
      });
    }
    
    process.stdout.write(`\r  Scanned: ${scanned}, To Fix: ${toFix.length}, Skip (math): ${skipMath.length}`);
  } while (lastKey);
  
  console.log(`\n  ✓ Analysis complete`);
  
  return {
    subjectId,
    scanned,
    toFix,
    skipMath,
    skipOk: skipOk.length
  };
}

async function generateFixReport() {
  console.log('=== SELECTIVE QUESTION FIX ANALYSIS ===\n');
  console.log('Skipping punctuation issues for math/calculation questions');
  
  const allSubjects = [];
  
  for (let sid = 1; sid <= 9; sid++) {
    const result = await analyzeAndPrepareFixes(sid);
    allSubjects.push(result);
  }
  
  // Summary
  console.log('\n\n========== SUMMARY ==========');
  let totalToFix = 0;
  let totalSkipMath = 0;
  
  for (const s of allSubjects) {
    totalToFix += s.toFix.length;
    totalSkipMath += s.skipMath.length;
    console.log(`S${s.subjectId}: ${s.toFix.length} to fix, ${s.skipMath.length} skipped (math)`);
  }
  
  console.log(`\nTOTAL TO FIX: ${totalToFix}`);
  console.log(`Skipped (math questions): ${totalSkipMath}`);
  
  // Group by issue severity
  const bySeverity = { critical: [], high: [], medium: [], low: [] };
  for (const s of allSubjects) {
    for (const q of s.toFix) {
      for (const issue of q.issues) {
        bySeverity[issue.severity].push({
          questionId: q.questionId,
          subjectId: q.subjectId,
          type: issue.type,
          detail: issue.detail,
          question: q.question?.substring(0, 60)
        });
      }
    }
  }
  
  console.log('\n--- BY SEVERITY ---');
  console.log(`Critical: ${bySeverity.critical.length}`);
  console.log(`High: ${bySeverity.high.length}`);
  console.log(`Medium: ${bySeverity.medium.length}`);
  console.log(`Low: ${bySeverity.low.length}`);
  
  // Print critical and high priority
  if (bySeverity.critical.length > 0) {
    console.log('\n=== CRITICAL ISSUES (must fix) ===');
    bySeverity.critical.slice(0, 15).forEach((item, i) => {
      console.log(`\n${i+1}. [S${item.subjectId}] ${item.questionId}`);
      console.log(`   Type: ${item.type}`);
      console.log(`   Q: ${item.question}${item.question?.length >= 60 ? '...' : ''}`);
      if (item.detail) console.log(`   Detail: ${item.detail}`);
    });
  }
  
  if (bySeverity.high.length > 0) {
    console.log('\n=== HIGH PRIORITY (first 15) ===');
    bySeverity.high.slice(0, 15).forEach((item, i) => {
      console.log(`\n${i+1}. [S${item.subjectId}] ${item.questionId}`);
      console.log(`   Type: ${item.type}`);
      console.log(`   Q: ${item.question}${item.question?.length >= 60 ? '...' : ''}`);
      if (item.detail) console.log(`   Detail: ${item.detail}`);
    });
  }
  
  // Save fix list
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalToFix,
      bySeverity: {
        critical: bySeverity.critical.length,
        high: bySeverity.high.length,
        medium: bySeverity.medium.length,
        low: bySeverity.low.length
      }
    },
    questionsToFix: allSubjects.flatMap(s => s.toFix),
    skippedMathQuestions: allSubjects.flatMap(s => s.skipMath)
  };
  
  const filename = `fix_list_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(filename, JSON.stringify(report, null, 2));
  console.log(`\n✅ Fix list saved to: ${filename}`);
}

generateFixReport().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
