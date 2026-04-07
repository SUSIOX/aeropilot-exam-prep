/**
 * Migrace aeropilot-ai-explanations: N_id formát → subjectN_qID formát
 * Např: "6_23" → "subject6_q23", "8_8" → "subject8_q8"
 * AI otázky: "8_subject8_ai_HASH" → "subject8_ai_HASH"
 */
const { DynamoDBClient, ScanCommand, PutItemCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE = 'aeropilot-ai-explanations';

function migrateQuestionId(oldId) {
  // Formát: "6_23" → "subject6_q23"
  const simpleMatch = oldId.match(/^(\d+)_(\d+)$/);
  if (simpleMatch) {
    return `subject${simpleMatch[1]}_q${simpleMatch[2]}`;
  }

  // Formát: "8_subject8_ai_HASH" → "subject8_ai_HASH"
  const aiMatch = oldId.match(/^(\d+)_(subject\d+_ai_.+)$/);
  if (aiMatch) {
    return aiMatch[2]; // Vrátit jen "subject8_ai_HASH"
  }

  // Formát: "subject8_ai_HASH" nebo "subject8_q25" — už správný
  if (oldId.startsWith('subject')) {
    return oldId;
  }

  // Neznámý formát — ponechat
  return null;
}

async function migrate() {
  console.log('=== MIGRACE aeropilot-ai-explanations ===\n');

  // 1. Načíst všechny items
  let lastKey = null;
  const allItems = [];
  do {
    const r = await client.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey: lastKey }));
    for (const item of r.Items || []) allItems.push(unmarshall(item));
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);

  console.log(`Celkem items: ${allItems.length}\n`);

  let migrated = 0, skipped = 0, errors = 0;

  for (const item of allItems) {
    const oldId = item.questionId;
    const newId = migrateQuestionId(oldId);

    if (!newId || newId === oldId) {
      console.log(`  SKIP (již správný): ${oldId}`);
      skipped++;
      continue;
    }

    console.log(`  MIGRUJU: ${oldId} → ${newId}`);

    try {
      // 1. Zapsat nový item
      await client.send(new PutItemCommand({
        TableName: TABLE,
        Item: marshall({
          ...item,
          questionId: newId
        }, { removeUndefinedValues: true })
      }));

      // 2. Smazat starý item
      await client.send(new DeleteItemCommand({
        TableName: TABLE,
        Key: marshall({ questionId: oldId, model: item.model })
      }));

      console.log(`  ✅ OK`);
      migrated++;
    } catch (err) {
      console.error(`  ❌ CHYBA: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n=== VÝSLEDEK ===`);
  console.log(`Migrováno: ${migrated}`);
  console.log(`Přeskočeno (správný formát): ${skipped}`);
  console.log(`Chyby: ${errors}`);
}

migrate().catch(err => {
  console.error('Fatální chyba:', err);
  process.exit(1);
});
