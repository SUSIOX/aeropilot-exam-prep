/**
 * DETAILED ANALYSIS: Question IDs, Answers, and Explanations Across the Application
 * Scans all DynamoDB tables and code to identify inconsistencies
 */
const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const fs = require('fs');
const path = require('path');

const client = new DynamoDBClient({ region: 'eu-central-1' });

async function scanTable(tableName) {
  let lastKey = null;
  const items = [];
  console.log(`Scanning ${tableName}...`);
  do {
    const r = await client.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey: lastKey }));
    for (const raw of r.Items || []) items.push(unmarshall(raw));
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);
  console.log(`  Found ${items.length} items`);
  return items;
}

function analyzeQuestionIds(items, tableName) {
  const analysis = {
    total: items.length,
    formats: {
      legacy_numeric: 0,    // 6_23
      unified_subject: 0,   // subject6_q23
      ai_hash: 0,           // subject8_ai_HASH
      user_hash: 0,         // subjectN_user_HASH
      test: 0,              // test-connection
      other: 0
    },
    examples: {},
    missingFields: [],
    duplicates: new Map()
  };

  items.forEach(item => {
    const qid = item.questionId || item.id || '';
    
    // Categorize format
    if (/^\d+_\d+$/.test(qid)) {
      analysis.formats.legacy_numeric++;
      if (!analysis.examples.legacy_numeric) analysis.examples.legacy_numeric = qid;
    } else if (/^subject\d+_q\d+$/.test(qid)) {
      analysis.formats.unified_subject++;
      if (!analysis.examples.unified_subject) analysis.examples.unified_subject = qid;
    } else if (/^subject\d+_ai_/.test(qid)) {
      analysis.formats.ai_hash++;
      if (!analysis.examples.ai_hash) analysis.examples.ai_hash = qid;
    } else if (/^subject\d+_user_/.test(qid)) {
      analysis.formats.user_hash++;
      if (!analysis.examples.user_hash) analysis.examples.user_hash = qid;
    } else if (/^test-/.test(qid)) {
      analysis.formats.test++;
      if (!analysis.examples.test) analysis.examples.test = qid;
    } else {
      analysis.formats.other++;
      if (!analysis.examples.other) analysis.examples.other = qid;
    }

    // Check for required fields
    if (!qid) analysis.missingFields.push({ item: JSON.stringify(item), missing: 'questionId/id' });
    
    // Track duplicates
    if (qid) {
      if (analysis.duplicates.has(qid)) {
        analysis.duplicates.get(qid).push(item);
      } else {
        analysis.duplicates.set(qid, [item]);
      }
    }
  });

  // Convert duplicates map to array for JSON serialization
  analysis.duplicates = Array.from(analysis.duplicates.entries())
    .filter(([qid, items]) => items.length > 1)
    .map(([qid, items]) => ({ questionId: qid, count: items.length, items }));

  return analysis;
}

function analyzeAnswers(items, tableName) {
  const analysis = {
    total: items.length,
    answerFormats: {
      array: 0,
      string: 0,
      missing: 0
    },
    correctIndexTypes: {
      number: 0,
      string: 0,
      missing: 0
    },
    issues: []
  };

  items.forEach(item => {
    const answers = item.answers;
    const correct = item.correct;

    // Analyze answers format
    if (Array.isArray(answers)) {
      analysis.answerFormats.array++;
    } else if (typeof answers === 'string') {
      analysis.answerFormats.string++;
    } else {
      analysis.answerFormats.missing++;
    }

    // Analyze correct index
    if (typeof correct === 'number') {
      analysis.correctIndexTypes.number++;
    } else if (typeof correct === 'string') {
      analysis.correctIndexTypes.string++;
    } else {
      analysis.correctIndexTypes.missing++;
    }

    // Check for consistency issues
    if (Array.isArray(answers) && typeof correct === 'number') {
      if (correct < 0 || correct >= answers.length) {
        analysis.issues.push({
          questionId: item.questionId || item.id,
          issue: 'correct index out of bounds',
          correct,
          answersLength: answers.length
        });
      }
    }
  });

  return analysis;
}

function analyzeExplanations(items, tableName) {
  const analysis = {
    total: items.length,
    explanationFields: {
      explanation: 0,
      ai_explanation: 0,
      missing: 0
    },
    providerInfo: {
      hasProvider: 0,
      hasModel: 0,
      missing: 0
    },
    modelDistribution: new Map(),
    providerDistribution: new Map()
  };

  items.forEach(item => {
    // Check explanation fields
    if (item.explanation) analysis.explanationFields.explanation++;
    if (item.ai_explanation) analysis.explanationFields.ai_explanation++;
    if (!item.explanation && !item.ai_explanation) analysis.explanationFields.missing++;

    // Check provider/model metadata
    if (item.provider || item.ai_explanation_provider) {
      analysis.providerInfo.hasProvider++;
      const provider = item.provider || item.ai_explanation_provider;
      analysis.providerDistribution.set(provider, (analysis.providerDistribution.get(provider) || 0) + 1);
    } else {
      analysis.providerInfo.missing++;
    }

    if (item.model || item.ai_explanation_model) {
      analysis.providerInfo.hasModel++;
      const model = item.model || item.ai_explanation_model;
      analysis.modelDistribution.set(model, (analysis.modelDistribution.get(model) || 0) + 1);
    }
  });

  // Convert maps to arrays
  analysis.modelDistribution = Array.from(analysis.modelDistribution.entries())
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count);

  analysis.providerDistribution = Array.from(analysis.providerDistribution.entries())
    .map(([provider, count]) => ({ provider, count }))
    .sort((a, b) => b.count - a.count);

  return analysis;
}

async function analyzeCodebase() {
  console.log('\n=== CODEBASE ANALYSIS ===\n');
  
  // Check App.tsx for ID references
  const appPath = '/Users/jhs/CascadeProjects/aeropilot-exam-prep (3)/src/App.tsx';
  const appContent = fs.readFileSync(appPath, 'utf8');
  
  const idReferences = {
    questionId: (appContent.match(/questionId/g) || []).length,
    id: (appContent.match(/\.id\b/g) || []).length,
    lo_id: (appContent.match(/lo_id/g) || []).length,
    loId: (appContent.match(/loId/g) || []).length,
    compositeId: (appContent.match(/compositeId/g) || []).length,
    localStorageKeys: (appContent.match(/ai_explanation_\$\{[^}]+\}/g) || []).length
  };

  console.log('App.tsx ID References:');
  Object.entries(idReferences).forEach(([key, count]) => {
    console.log(`  ${key}: ${count}`);
  });

  return { idReferences };
}

async function main() {
  console.log('=== DETAILED ANALYSIS: Question IDs, Answers, Explanations ===\n');

  // Scan all tables
  const questions = await scanTable('aeropilot-questions');
  const explanations = await scanTable('aeropilot-ai-explanations');
  const objectives = await scanTable('aeropilot-easa-objectives');

  // Analyze question IDs
  console.log('\n=== QUESTION ID ANALYSIS ===');
  const questionIdAnalysis = analyzeQuestionIds(questions, 'aeropilot-questions');
  console.log(`Total questions: ${questionIdAnalysis.total}`);
  console.log('ID Formats:');
  Object.entries(questionIdAnalysis.formats).forEach(([format, count]) => {
    console.log(`  ${format}: ${count} (example: ${questionIdAnalysis.examples[format] || 'none'})`);
  });
  console.log(`Missing ID fields: ${questionIdAnalysis.missingFields.length}`);
  console.log(`Duplicate IDs: ${questionIdAnalysis.duplicates.length}`);

  // Analyze explanation IDs
  console.log('\n=== EXPLANATION ID ANALYSIS ===');
  const explanationIdAnalysis = analyzeQuestionIds(explanations, 'aeropilot-ai-explanations');
  console.log(`Total explanations: ${explanationIdAnalysis.total}`);
  console.log('ID Formats:');
  Object.entries(explanationIdAnalysis.formats).forEach(([format, count]) => {
    console.log(`  ${format}: ${count} (example: ${explanationIdAnalysis.examples[format] || 'none'})`);
  });

  // Analyze answers
  console.log('\n=== ANSWERS ANALYSIS ===');
  const answersAnalysis = analyzeAnswers(questions, 'aeropilot-questions');
  console.log(`Answer formats: Array=${answersAnalysis.answerFormats.array}, String=${answersAnalysis.answerFormats.string}, Missing=${answersAnalysis.answerFormats.missing}`);
  console.log(`Correct index types: Number=${answersAnalysis.correctIndexTypes.number}, String=${answersAnalysis.correctIndexTypes.string}, Missing=${answersAnalysis.correctIndexTypes.missing}`);
  if (answersAnalysis.issues.length > 0) {
    console.log(`Issues found: ${answersAnalysis.issues.length}`);
    answersAnalysis.issues.slice(0, 5).forEach(issue => {
      console.log(`  ${issue.questionId}: ${issue.issue}`);
    });
  }

  // Analyze explanations
  console.log('\n=== EXPLANATIONS ANALYSIS ===');
  const explanationAnalysis = analyzeExplanations(explanations, 'aeropilot-ai-explanations');
  console.log(`Explanation fields: explanation=${explanationAnalysis.explanationFields.explanation}, ai_explanation=${explanationAnalysis.explanationFields.ai_explanation}, missing=${explanationAnalysis.explanationFields.missing}`);
  console.log(`Provider info: hasProvider=${explanationAnalysis.providerInfo.hasProvider}, hasModel=${explanationAnalysis.providerInfo.hasModel}, missing=${explanationAnalysis.providerInfo.missing}`);
  console.log('Top models:');
  explanationAnalysis.modelDistribution.slice(0, 5).forEach(({ model, count }) => {
    console.log(`  ${model}: ${count}`);
  });
  console.log('Top providers:');
  explanationAnalysis.providerDistribution.slice(0, 5).forEach(({ provider, count }) => {
    console.log(`  ${provider}: ${count}`);
  });

  // Cross-reference: questions without explanations
  console.log('\n=== CROSS-REFERENCE ===');
  const questionIds = new Set(questions.map(q => q.questionId || q.id));
  const explanationIds = new Set(explanations.map(e => e.questionId));
  const withoutExplanation = Array.from(questionIds).filter(id => !explanationIds.has(id));
  const orphanExplanations = Array.from(explanationIds).filter(id => !questionIds.has(id));

  console.log(`Questions without explanations: ${withoutExplanation.length}`);
  console.log(`Orphan explanations: ${orphanExplanations.length}`);

  if (withoutExplanation.length > 0) {
    console.log('Sample questions without explanations:');
    withoutExplanation.slice(0, 10).forEach(id => console.log(`  ${id}`));
  }

  if (orphanExplanations.length > 0) {
    console.log('Sample orphan explanations:');
    orphanExplanations.slice(0, 10).forEach(id => console.log(`  ${id}`));
  }

  // Codebase analysis
  const codeAnalysis = await analyzeCodebase();

  // Generate comprehensive report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalQuestions: questions.length,
      totalExplanations: explanations.length,
      questionsWithoutExplanations: withoutExplanation.length,
      orphanExplanations: orphanExplanations.length
    },
    questionIds: questionIdAnalysis,
    explanationIds: explanationIdAnalysis,
    answers: answersAnalysis,
    explanations: explanationAnalysis,
    crossReference: {
      withoutExplanation: withoutExplanation.slice(0, 100), // Limit for file size
      orphanExplanations: orphanExplanations.slice(0, 100)
    },
    codebase: codeAnalysis
  };

  // Save detailed report
  fs.writeFileSync('detailed_analysis_report.json', JSON.stringify(report, null, 2));
  console.log('\n=== REPORT SAVED ===');
  console.log('Detailed report saved to: detailed_analysis_report.json');
  console.log('\n=== ANALYSIS COMPLETE ===');
}

main().catch(console.error);
