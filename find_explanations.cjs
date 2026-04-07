const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE = 'aeropilot-questions';

async function findAll() {
  console.log('=== Hledám VŠECHNY položky s ai_explanation v DB ===\n');

  let lastKey = null;
  let scanned = 0;
  let found = [];

  do {
    const cmd = new ScanCommand({
      TableName: TABLE,
      ExclusiveStartKey: lastKey,
      Limit: 1000,
      FilterExpression: 'attribute_exists(ai_explanation)',
    });
    const result = await client.send(cmd);
    scanned += (result.ScannedCount || 0);
    lastKey = result.LastEvaluatedKey;

    for (const item of (result.Items || [])) {
      const qid = item.questionId?.S || '?';
      const source = item.source?.S || 'unknown';
      const subjectId = item.subjectId?.N || '?';
      const exp = item.ai_explanation?.S || '';
      const provider = item.ai_explanation_provider?.S || '?';
      const model = item.ai_explanation_model?.S || '?';
      const originalId = item.originalId?.N || '?';

      // Klasifikuj formát klíče
      let keyFormat = 'UNKNOWN';
      if (/^subject\d+_q\d+$/.test(qid)) keyFormat = 'CORRECT (subjectN_qID)';
      else if (/^ai_[a-f0-9]+$/.test(qid)) keyFormat = 'CORRECT (ai_hash)';
      else if (/^\d+_\d+$/.test(qid)) keyFormat = 'OLD (N_id)';
      else if (/^\d+_\d+_\d+$/.test(qid)) keyFormat = 'BAD (N_N_id)';
      else if (/^user_\d+_\d+$/.test(qid)) keyFormat = 'OLD (user_N_SEQ)';
      else if (/^subject\d+_q\d+_\d+$/.test(qid)) keyFormat = 'BAD (subjectN_qID_N)';

      found.push({ qid, keyFormat, source, subjectId, originalId, expLen: exp.length, provider, model });
    }

    process.stdout.write(`\rScan: ${scanned} položek, nalezeno: ${found.length}...`);
  } while (lastKey);

  console.log(`\n\n=== VÝSLEDEK: ${found.length} položek s ai_explanation ===\n`);

  if (found.length === 0) {
    console.log('❌ ŽÁDNÉ explanations v DynamoDB!\n');
    console.log('Explanations jsou pouze v localStorage prohlížeče.');
    console.log('Musíš je znovu vygenerovat, nebo exportovat z localStorage.');
    return;
  }

  // Souhrn podle formátu klíče
  const byFormat = {};
  const bySource = {};
  found.forEach(f => {
    byFormat[f.keyFormat] = (byFormat[f.keyFormat] || 0) + 1;
    bySource[f.source] = (bySource[f.source] || 0) + 1;
  });

  console.log('Podle formátu klíče:');
  Object.entries(byFormat).forEach(([f, c]) => console.log(`  ${f}: ${c}x`));

  console.log('\nPodle source:');
  Object.entries(bySource).forEach(([s, c]) => console.log(`  ${s}: ${c}x`));

  console.log('\nVšechny nalezené explanations:');
  found.forEach(f => {
    console.log(`  questionId: ${f.qid}`);
    console.log(`    → formát: ${f.keyFormat}`);
    console.log(`    → source: ${f.source}, subjectId: ${f.subjectId}, originalId: ${f.originalId}`);
    console.log(`    → provider: ${f.provider}, model: ${f.model}`);
    console.log(`    → délka explanationu: ${f.expLen} znaků`);
    console.log('');
  });
}

findAll().catch(err => { console.error('❌ Chyba:', err); process.exit(1); });
