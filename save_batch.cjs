/**
 * Uloží vysvětlení z batch_N.json do aeropilot-ai-explanations
 * Použití: node save_batch.cjs batch_1.json
 */
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const fs = require('fs');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE = 'aeropilot-ai-explanations';
const MODEL = 'claude-opus-4-5';
const PROVIDER = 'claude';

async function saveBatch(file) {
  const items = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Ukládám ${items.length} vysvětlení z ${file}...`);
  let ok = 0, fail = 0;

  for (const item of items) {
    try {
      await client.send(new PutItemCommand({
        TableName: TABLE,
        Item: marshall({
          questionId: item.questionId,
          model: MODEL,
          provider: PROVIDER,
          explanation: item.explanation,
          detailedExplanation: null,
          createdAt: new Date().toISOString()
        }, { removeUndefinedValues: true })
      }));
      process.stdout.write(`✅ ${item.questionId}\n`);
      ok++;
    } catch (err) {
      process.stdout.write(`❌ ${item.questionId}: ${err.message}\n`);
      fail++;
    }
  }

  console.log(`\nHotovo: ${ok} OK, ${fail} chyb`);
}

const file = process.argv[2] || 'batch_1.json';
saveBatch(file).catch(console.error);
