const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const client = new DynamoDBClient({ region: 'eu-central-1' });

async function scan(table) {
  let lk = null, items = [];
  do {
    const r = await client.send(new ScanCommand({ TableName: table, ExclusiveStartKey: lk }));
    for (const i of r.Items||[]) items.push(unmarshall(i));
    lk = r.LastEvaluatedKey;
  } while (lk);
  return items;
}

async function run() {
  const questions = await scan('aeropilot-questions');
  const explanations = await scan('aeropilot-ai-explanations');

  const qIds = new Set(questions.map(q => q.questionId));
  const eIds = new Set(explanations.map(e => e.questionId));

  // 1. Orphan explanations (in explanations but NOT in questions)
  const orphans = explanations.filter(e => !qIds.has(e.questionId));
  console.log('\n=== ORPHAN EXPLANATIONS (v DB, otázka neexistuje) ===');
  orphans.forEach(e => {
    console.log(`  ${e.questionId} | model: ${e.model} | preview: ${(e.explanation||'').slice(0,60)}`);
  });

  // 2. ai_ format questions - do they load correctly?
  const aiQs = questions.filter(q => /^ai_/.test(q.questionId||''));
  console.log(`\n=== AI FORMAT QUESTIONS (${aiQs.length}) ===`);

  // Check what fields they have vs what App.tsx expects
  const sampleAi = aiQs.slice(0, 5);
  console.log('\nSample ai_ question fields:');
  sampleAi.forEach(q => {
    console.log({
      questionId: q.questionId,
      'has originalId': !!q.originalId,
      originalId: q.originalId,
      subjectId: q.subjectId,
      source: q.source,
      loId: q.loId,
    });
  });

  // 3. Check: which questions have both questionId AND originalId?
  const withOriginalId = questions.filter(q => !!q.originalId);
  console.log(`\nQuestions with originalId field: ${withOriginalId.length}`);
  if (withOriginalId.length > 0) {
    console.log('Sample:', withOriginalId.slice(0, 3).map(q => ({questionId: q.questionId, originalId: q.originalId})));
  }

  // 4. PDF format (subjectN_qID) - check if originalId is numeric
  const pdfQs = questions.filter(q => /^subject\d+_q\d+$/.test(q.questionId||''));
  console.log(`\nPDF format questions: ${pdfQs.length}`);
  const pdfSample = pdfQs.slice(0, 3);
  console.log('Sample PDF fields:');
  pdfSample.forEach(q => {
    console.log({
      questionId: q.questionId,
      'has originalId': !!q.originalId,
      originalId: q.originalId,
      source: q.source,
    });
  });

  // 5. App.tsx compositeId logic simulation:
  // const rawId = q.originalId || q.questionId;
  // const isNumericId = !isNaN(Number(rawId)) && !String(rawId).startsWith('ai_');
  // const compositeId = isNumericId ? `subject${subjectId}_q${rawId}` : String(rawId);
  console.log('\n=== COMPOSITYID SIMULATION ===');
  const testIds = [
    { questionId: 'subject1_q25', originalId: undefined, subjectId: 1 },
    { questionId: 'ai_020.09.06.01_xmed1', originalId: undefined, subjectId: 2 },
    { questionId: 'subject4_q37', originalId: undefined, subjectId: 4 },
  ];
  testIds.forEach(q => {
    const rawId = q.originalId || q.questionId;
    const isNumericId = !isNaN(Number(rawId)) && !String(rawId).startsWith('ai_');
    const compositeId = isNumericId ? `subject${q.subjectId}_q${rawId}` : String(rawId);
    console.log(`  ${q.questionId} → compositeId: "${compositeId}" ${compositeId === q.questionId ? '✅ match' : '❌ MISMATCH'}`);
  });

  // 6. Check for subject<N>_ai_ format in questions (should be none now)
  const subjectAiFormat = questions.filter(q => /^subject\d+_ai_/.test(q.questionId||''));
  console.log(`\nsubjectN_ai_ format in questions table: ${subjectAiFormat.length}`);

  // 7. Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total questions: ${questions.length}`);
  console.log(`  - PDF format (subjectN_qID): ${pdfQs.length}`);
  console.log(`  - AI format (ai_LO_hash): ${aiQs.length}`);
  console.log(`  - subjectN_ai_ format: ${subjectAiFormat.length}`);
  console.log(`Total explanations: ${explanations.length}`);
  console.log(`Orphan explanations: ${orphans.length}`);
  console.log(`\nKey insight: ai_ format questionIds are KEPT AS-IS in compositeId`);
  console.log(`→ save/load of explanations should work for ai_ questions`);
  console.log(`→ orphans are the real problem - ${orphans.length} dead explanations`);
}
run().catch(console.error);
