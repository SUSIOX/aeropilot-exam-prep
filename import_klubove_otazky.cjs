const fs = require('fs');
const { DynamoDBClient, PutItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');

const client = new DynamoDBClient({ region: 'eu-central-1' });

const L = ['A', 'B', 'C', 'D'];
const LABEL_MAP = { 'a': 0, 'b': 1, 'c': 2, 'd': 3 };

async function run() {
  console.log('[1] Načítám klubové otázky z JSON...');
  const otazky = JSON.parse(fs.readFileSync('public/otazkykluby.json', 'utf8'));
  console.log(`[1] Nalezeno ${otazky.length} otázek`);

  // Zjistit nejvyšší existující klubové ID
  console.log('[2] Kontroluji existující klubové otázky v DB...');
  let maxId = 0;
  for (let i = 1; i <= 100; i++) {
    try {
      const r = await client.send(new GetItemCommand({
        TableName: 'aeropilot-questions',
        Key: { questionId: { S: `klub_q${i}` } }
      }));
      if (r.Item) {
        maxId = i;
      }
    } catch (e) {}
  }
  console.log(`[2] Poslední existující: klub_q${maxId}, začnu od q${maxId + 1}`);

  const categories = {};
  const toImport = [];

  for (let i = 0; i < otazky.length; i++) {
    const q = otazky[i];
    const qNum = maxId + i + 1;
    const qId = `klub_q${qNum}`;

    // Extrahovat odpovědi
    const answers = q.options.map(opt => opt.text);
    const correctLabels = q.correct_labels || [];
    const correctIndices = correctLabels.map(l => LABEL_MAP[l.toLowerCase()]).filter(x => x !== undefined);
    const correct = correctIndices[0] !== undefined ? correctIndices[0] : 0;

    // Normalizovat na 4 odpovědi pokud jsou jen 3
    while (answers.length < 4) {
      answers.push('');
    }

    // Mapovat kategorii na subject
    let subjectId = 10; // Klubové = subject 10
    let categoryName = q.category || 'Klubové otázky';
    
    if (categoryName.includes('Letecké výkony')) subjectId = 10;
    else if (categoryName.includes('Lidská výkonnost')) subjectId = 10;
    else if (categoryName.includes('Meteorologie')) subjectId = 10;

    if (!categories[categoryName]) categories[categoryName] = 0;
    categories[categoryName]++;

    const item = {
      questionId: qId,
      subjectId: subjectId,
      question: q.question,
      answers: answers.slice(0, 4),
      correct: correct,
      correctOption: L[correct] || 'A',
      category: categoryName,
      subcategory: categoryName === 'Navigace SPL' ? 'Medlánky' : undefined,
      source: 'klub',
      license: 'KL',
      metadata: { applies_to: ['KL'], license_note: 'Klubové otázky SPL' },
      createdBy: 'import_script',
      approved: true,
      approvedBy: 'system',
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      image: null,
      originalId: qNum,
      isVerified: false,
    };

    toImport.push(item);
  }

  console.log('[3] Přehled kategorií:');
  Object.entries(categories).forEach(([cat, count]) => {
    console.log(`    ${cat}: ${count} otázek`);
  });

  // Ukázka první otázky
  console.log('\n[4] Ukázka první otázky k importu:');
  const sample = toImport[0];
  console.log(`    ID: ${sample.questionId}`);
  console.log(`    Otázka: ${sample.question.slice(0, 70)}...`);
  console.log(`    Odpovědi: ${sample.answers.length}`);
  console.log(`    Správná: ${sample.correctOption} (${sample.correct})`);
  console.log(`    Licence: ${sample.license}`);
  console.log(`    Kategorie: ${sample.category}`);

  console.log('\n[5] Kontrola duplicit...');
  const existing = [];
  const newOnes = [];
  
  for (const item of toImport) {
    const r = await client.send(new GetItemCommand({
      TableName: 'aeropilot-questions',
      Key: { questionId: { S: item.questionId } }
    }));
    if (r.Item) {
      existing.push(item.questionId);
    } else {
      newOnes.push(item);
    }
  }

  if (existing.length > 0) {
    console.log(`    ⚠️ ${existing.length} již existuje: ${existing.join(', ')}`);
  }
  console.log(`    ✅ ${newOnes.length} nových otázek k importu`);

  if (newOnes.length === 0) {
    console.log('\n[6] Nic k importu. Končím.');
    return;
  }

  // Import
  console.log('\n[6] Importuji do DynamoDB...');
  let imported = 0;
  for (const item of newOnes) {
    try {
      await client.send(new PutItemCommand({
        TableName: 'aeropilot-questions',
        Item: marshall(item, { removeUndefinedValues: true }),
        ConditionExpression: 'attribute_not_exists(questionId)',
      }));
      console.log(`    ✅ ${item.questionId}: ${item.question.slice(0, 50)}...`);
      imported++;
    } catch (e) {
      console.log(`    ❌ ${item.questionId}: ${e.message}`);
    }
  }

  console.log(`\n[7] Hotovo! Importováno ${imported}/${newOnes.length} otázek.`);
  console.log('    Licence: KL (Klubové otázky)');
  console.log('    Subject: 10');
}

run().catch(e => {
  console.error('❌ Chyba:', e.message);
  process.exit(1);
});
