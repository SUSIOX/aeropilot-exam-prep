const { DynamoDBClient, ScanCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall, marshall } = require('@aws-sdk/util-dynamodb');
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
  const orphans = explanations.filter(e => !qIds.has(e.questionId));

  console.log(`Nalezeno ${orphans.length} osiřelých vysvětlení k smazání:`);
  orphans.forEach(e => console.log(`  ${e.questionId} | ${e.model}`));

  let ok = 0, fail = 0;
  for (const e of orphans) {
    try {
      await client.send(new DeleteItemCommand({
        TableName: 'aeropilot-ai-explanations',
        Key: marshall({ questionId: e.questionId, model: e.model })
      }));
      console.log(`✅ Smazáno: ${e.questionId} / ${e.model}`);
      ok++;
    } catch (err) {
      console.log(`❌ Chyba: ${e.questionId}: ${err.message}`);
      fail++;
    }
  }

  console.log(`\nHotovo: ${ok} smazáno, ${fail} chyb`);
}
run().catch(console.error);
