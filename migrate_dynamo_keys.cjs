/**
 * Migrace DynamoDB klíčů na jednotný formát subjectN_qID
 * 
 * Formáty ke sloučení:
 *   N_N_ID      → subjectN_qID   (originalId = třetí část)
 *   N_ID        → subjectN_qID   (originalId = druhá část)
 *   N_ai_LO     → ai_LO          (starý AI klíč → čistý AI formát)
 *   user_N_SEQ  → subjectN_qID   (dohledat originalId z textu v JSON)
 *   ai_LO       → beze změny (OK)
 *   subjectN_qID → beze změny (OK)
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const fs = require('fs');

const client = new DynamoDBClient({ region: "eu-central-1" });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE = "aeropilot-questions";
const DRY_RUN = process.argv.includes('--dry-run');

if (DRY_RUN) console.log("=== DRY RUN MODE (žádné změny) ===\n");
else console.log("=== LIVE MODE — provádím změny ===\n");

// Načti všechny JSON soubory pro dohledání originalId u user_N_SEQ
const jsonData = {};
for (let s = 1; s <= 9; s++) {
  try {
    jsonData[s] = JSON.parse(fs.readFileSync(`subject_${s}.json`, 'utf8'));
  } catch {}
}

function findOriginalId(subjectId, questionText) {
  const questions = jsonData[subjectId] || [];
  // Přesná shoda textu
  let q = questions.find(q => q.question === questionText);
  if (q) return q.id;
  // Částečná shoda prvních 50 znaků
  const prefix = questionText?.substring(0, 50);
  if (prefix) q = questions.find(q => q.question?.startsWith(prefix));
  if (q) return q.id;
  return null;
}

function classifyKey(qid) {
  if (/^ai_/.test(qid)) return 'ai_ok';
  if (/^subject\d+_q\d+$/.test(qid)) return 'subject_ok';
  if (/^subject\d+_q\d+_\d+$/.test(qid)) return 'subject_suffix'; // subjectN_qID_N collision
  if (/^subject\d+_ai_/.test(qid)) return 'subject_ai';           // subjectN_ai_... → ai_...
  if (/^\d+_\d+_\d+$/.test(qid)) return 'N_N_ID';
  if (/^\d+_\d+$/.test(qid)) return 'N_ID';
  if (/^\d+_ai_/.test(qid)) return 'N_ai';
  if (/^user_\d+_\d+$/.test(qid)) return 'user_seq';
  return 'unknown';
}

async function scanAll() {
  let items = [], lastKey;
  do {
    const r = await docClient.send(new ScanCommand({
      TableName: TABLE,
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(r.Items || []));
    lastKey = r.LastEvaluatedKey;
    process.stdout.write(`\r  Načteno: ${items.length}...`);
  } while (lastKey);
  console.log(`\r  Celkem načteno: ${items.length} položek`);
  return items;
}

async function migrateItem(item, newQid) {
  // Check if target already exists
  const existing = await docClient.send(new GetCommand({ TableName: TABLE, Key: { questionId: newQid } }));
  
  if (existing.Item) {
    // Merge explanations if old has them and new doesn't
    if (item.ai_explanation && !existing.Item.ai_explanation) {
      const { PutCommand: PC } = require("@aws-sdk/lib-dynamodb");
      // Copy explanation fields to existing item — handled via merge below
      console.log(`  ⚠️  Merge explanation: ${item.questionId} → ${newQid}`);
    }
    if (!DRY_RUN) {
      // Delete old key (target already has the data)
      await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { questionId: item.questionId } }));
    }
    return 'merged';
  }

  // Create new item with correct key
  const newItem = { ...item, questionId: newQid };
  if (!DRY_RUN) {
    await docClient.send(new PutCommand({ TableName: TABLE, Item: newItem }));
    await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { questionId: item.questionId } }));
  }
  return 'migrated';
}

async function main() {
  console.log("1. Načítám všechny položky z DynamoDB...");
  const items = await scanAll();

  // Classify
  const groups = { ai_ok: [], subject_ok: [], subject_ai: [], subject_suffix: [], N_N_ID: [], N_ID: [], N_ai: [], user_seq: [], unknown: [] };
  for (const item of items) {
    const cls = classifyKey(item.questionId);
    groups[cls].push(item);
  }

  console.log("\n2. Přehled klíčů:");
  for (const [cls, arr] of Object.entries(groups)) {
    console.log(`   ${cls.padEnd(15)}: ${arr.length} položek`);
  }

  const toMigrate = [...groups.N_N_ID, ...groups.N_ID, ...groups.N_ai, ...groups.N_ai, ...groups.subject_ai, ...groups.subject_suffix, ...groups.user_seq, ...groups.unknown];
  console.log(`\n3. Ke migraci: ${toMigrate.length} položek\n`);

  let migrated = 0, merged = 0, skipped = 0, errors = 0;

  for (const item of toMigrate) {
    const qid = item.questionId;
    const cls = classifyKey(qid);
    let newQid = null;
    let subjectId = item.subjectId;

    try {
      // Delete empty records (no question text)
      if (!item.question) {
        if (DRY_RUN) {
          console.log(`  DRY DELETE ${qid}: prázdný záznam (bez textu otázky)`);
        } else {
          await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { questionId: qid } }));
          console.log(`  🗑️  Smazán prázdný záznam: ${qid}`);
        }
        migrated++;
        continue;
      }

      if (cls === 'subject_ai') {
        // subjectN_ai_LO_hash → ai_LO_hash
        newQid = qid.replace(/^subject\d+_/, '');

      } else if (cls === 'subject_suffix') {
        // subjectN_qID_N → find real originalId from text
        const match = qid.match(/^subject(\d+)_q\d+_\d+$/);
        if (match) {
          subjectId = parseInt(match[1]);
          const origId = findOriginalId(subjectId, item.question);
          if (origId !== null) {
            newQid = `subject${subjectId}_q${origId}`;
          } else {
            console.log(`  ⚠️  SKIP ${qid}: nelze dohledat origId pro "${String(item.question||'').substring(0,50)}"`);
            skipped++; continue;
          }
        }

      } else if (cls === 'N_N_ID') {
        // e.g. "1_1_46" → subject=1, origId=46
        const parts = qid.split('_');
        subjectId = parseInt(parts[0]);
        const origId = parseInt(parts[2]);
        newQid = `subject${subjectId}_q${origId}`;

      } else if (cls === 'N_ID') {
        // e.g. "3_86" → subject=3, origId=86
        const parts = qid.split('_');
        subjectId = parseInt(parts[0]);
        const origId = parseInt(parts[1]);
        newQid = `subject${subjectId}_q${origId}`;

      } else if (cls === 'N_ai') {
        // e.g. "1_ai_010.02.01.03_o16lx" → "ai_010.02.01.03_o16lx"
        newQid = qid.replace(/^\d+_/, '');

      } else if (cls === 'user_seq') {
        // e.g. "user_6_027" → dohledat origId podle textu
        const parts = qid.split('_');
        subjectId = parseInt(parts[1]);
        const origId = findOriginalId(subjectId, item.question);
        if (origId !== null) {
          newQid = `subject${subjectId}_q${origId}`;
        } else {
          console.log(`  ⚠️  SKIP ${qid}: nelze dohledat originalId (text: "${String(item.question||'').substring(0,50)}")`);
          skipped++;
          continue;
        }

      } else if (cls === 'unknown') {
        console.log(`  ⚠️  SKIP ${qid}: neznámý formát`);
        skipped++;
        continue;
      }

      if (!newQid) { skipped++; continue; }

      if (DRY_RUN) {
        console.log(`  DRY: ${qid} → ${newQid}`);
        migrated++;
      } else {
        const result = await migrateItem(item, newQid);
        if (result === 'migrated') migrated++;
        else merged++;
        if ((migrated + merged) % 10 === 0) {
          process.stdout.write(`\r  Zpracováno: ${migrated} migrováno, ${merged} sloučeno, ${skipped} přeskočeno...`);
        }
      }
    } catch (e) {
      console.error(`\n  ❌ Chyba u ${qid}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n\n=== VÝSLEDEK ===`);
  console.log(`Migrováno:   ${migrated}`);
  console.log(`Sloučeno:    ${merged}`);
  console.log(`Přeskočeno:  ${skipped}`);
  console.log(`Chyby:       ${errors}`);
  if (DRY_RUN) console.log("\n(Spusť bez --dry-run pro skutečnou migraci)");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
