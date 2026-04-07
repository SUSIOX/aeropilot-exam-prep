const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const client = new DynamoDBClient({ region: 'eu-central-1' });

async function checkExplanationTable() {
  console.log('=== DETAIL: aeropilot-ai-explanations ===\n');
  
  let lastKey = null, scanned = 0, total = 0;
  const byFormat = { 'subjectN_qID': 0, 'N_id': 0, 'ai_hash': 0, 'other': 0 };
  const sample = [];
  
  do {
    const r = await client.send(new ScanCommand({
      TableName: 'aeropilot-ai-explanations',
      ExclusiveStartKey: lastKey,
      Limit: 1000
    }));
    
    for (const item of r.Items || []) {
      total++;
      const qid = item.questionId?.S || item.id?.S || 'unknown';
      
      // Classify format
      if (/^subject\d+_q\d+$/.test(qid)) byFormat['subjectN_qID']++;
      else if (/^\d+_\d+$/.test(qid)) byFormat['N_id']++;
      else if (/^ai_[a-f0-9]+$/.test(qid)) byFormat['ai_hash']++;
      else byFormat['other']++;
      
      if (sample.length < 10) {
        sample.push({
          questionId: qid,
          explanation: item.explanation?.S ? item.explanation.S.substring(0, 80) + '...' : 'NO',
          provider: item.provider?.S || 'NO',
          model: item.model?.S || 'NO',
          createdAt: item.createdAt?.S || 'NO'
        });
      }
    }
    
    scanned += r.ScannedCount || 0;
    lastKey = r.LastEvaluatedKey;
    process.stdout.write(`\rScan: ${scanned} items, total: ${total}`);
  } while (lastKey);
  
  console.log('\n\n=== VÝSLEDKY ===');
  console.log(`Celkem explanations: ${total}`);
  console.log('Podle formátu questionId:');
  Object.entries(byFormat).forEach(([f, c]) => console.log(`  ${f}: ${c}`));
  
  console.log('\nSample items:');
  sample.forEach(s => {
    console.log(`  ${s.questionId}`);
    console.log(`    provider: ${s.provider}, model: ${s.model}`);
    console.log(`    explanation: ${s.explanation}`);
    console.log(`    created: ${s.createdAt}`);
    console.log('');
  });
}

checkExplanationTable().catch(console.error);
