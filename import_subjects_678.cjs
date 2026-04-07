const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const fs = require('fs');

const client = new DynamoDBClient({ region: "eu-central-1" });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE = "aeropilot-questions";
const CORRECT_OPTIONS = ['A', 'B', 'C', 'D'];
const NOW = new Date().toISOString();

async function importSubject(subjectId) {
  const file = `subject_${subjectId}.json`;
  const questions = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`\n📥 Importuji ${file} (${questions.length} otázek) -> Subject ${subjectId}...`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const q of questions) {
    const questionId = `subject${subjectId}_q${q.id}`;

    // Check if already exists
    try {
      const existing = await docClient.send(new GetCommand({
        TableName: TABLE,
        Key: { questionId }
      }));
      if (existing.Item) {
        skipped++;
        continue;
      }
    } catch {}

    const item = {
      questionId,
      question: q.question,
      answers: q.answers,
      correct: q.correct,
      correctOption: CORRECT_OPTIONS[q.correct] || 'A',
      subjectId: subjectId,
      source: 'user',
      createdBy: 'import_script',
      originalId: q.id,
      id: q.id,
      explanation: q.explanation || '',
      image: q.image || null,
      approved: true,
      approvedBy: 'system',
      approvedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    };

    try {
      await docClient.send(new PutCommand({ TableName: TABLE, Item: item }));
      imported++;
      if (imported % 20 === 0) console.log(`   Importováno ${imported}/${questions.length}...`);
    } catch (e) {
      console.error(`   ❌ Chyba u ${questionId}: ${e.message}`);
      errors++;
    }
  }

  console.log(`   ✅ Subject ${subjectId}: importováno ${imported}, přeskočeno ${skipped}, chyby ${errors}`);
  return { imported, skipped, errors };
}

async function main() {
  console.log("=== Import subjectů 6, 7, 8 do DynamoDB ===\n");
  const results = {};
  for (const sid of [6, 7, 8]) {
    results[sid] = await importSubject(sid);
  }
  console.log("\n=== VÝSLEDEK ===");
  for (const [sid, r] of Object.entries(results)) {
    console.log(`Subject ${sid}: ${r.imported} nových, ${r.skipped} přeskočeno, ${r.errors} chyb`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
