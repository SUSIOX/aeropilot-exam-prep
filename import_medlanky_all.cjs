const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const fs = require('fs');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE_NAME = 'aeropilot-questions';

const L = { 0: 'A', 1: 'B', 2: 'C', 3: 'D' };

async function run() {
  console.log('[1] Načítám Medlánky otázky z obou souborů...');
  
  // Načíst oba JSON soubory
  const medlankyMain = JSON.parse(fs.readFileSync('public/navigace_medlanky.json', 'utf8'));
  const klubove = JSON.parse(fs.readFileSync('public/otazkykluby.json', 'utf8'));
  const medlankyFromKlub = klubove.filter(q => q.category === 'Navigace SPL');
  
  console.log(`  - navigace_medlanky.json: ${medlankyMain.length} otázek`);
  console.log(`  - otazkykluby.json (Navigace SPL): ${medlankyFromKlub.length} otázek`);
  
  // Spojit dohromady
  const allQuestions = [...medlankyMain, ...medlankyFromKlub];
  console.log(`  - Celkem: ${allQuestions.length} otázek`);
  
  // Kontrola duplicit podle otázky
  const seen = new Set();
  const unique = [];
  let duplicates = 0;
  
  allQuestions.forEach((q, idx) => {
    const key = q.question.trim().toLowerCase().slice(0, 50);
    if (seen.has(key)) {
      duplicates++;
      console.log(`  Duplikát #${duplicates}: ${q.question.slice(0, 60)}...`);
    } else {
      seen.add(key);
      unique.push({ ...q, _order: idx });
    }
  });
  
  console.log(`\n[2] Unikátních otázek: ${unique.length} (odstraněno ${duplicates} duplikátů)`);
  
  // Import do DynamoDB
  console.log('\n[3] Importuji do DynamoDB...');
  let imported = 0;
  let errors = 0;
  
  for (let i = 0; i < unique.length; i++) {
    const q = unique[i];
    const qNum = i + 1;
    const qId = `medlanky_nav_${qNum}`;
    
    // Najít správnou odpověď
    let correct = 0;
    if (q.correct_labels) {
      correct = q.correct_labels[0]?.charCodeAt(0) - 65;
    } else if (q.options) {
      correct = q.options.findIndex(o => o.correct === true);
    }
    if (correct < 0) correct = 0;
    
    // Extrahovat answers
    const answers = q.options ? q.options.map(o => o.text) : (q.answers || []);
    
    const item = {
      questionId: { S: qId },
      subjectId: { N: '9' },
      question: { S: q.question },
      answers: { L: answers.slice(0, 4).map(a => ({ S: a })) },
      correct: { N: String(correct) },
      correctOption: { S: L[correct] || 'A' },
      category: { S: 'Navigace SPL' },
      subcategory: { S: 'Medlánky' },
      source: { S: 'klub' },
      license: { S: 'KL' },
      metadata: { M: { 
        applies_to: { L: [{ S: 'KL' }] },
        license_note: { S: 'Klubové otázky Medlánky' }
      }},
      createdBy: { S: 'import_script' },
      approved: { BOOL: true },
      approvedBy: { S: 'system' },
      createdAt: { S: new Date().toISOString() },
      approvedAt: { S: new Date().toISOString() },
      image: { NULL: true },
      originalId: { N: String(qNum) },
      isVerified: { BOOL: false }
    };
    
    try {
      await client.send(new PutItemCommand({
        TableName: TABLE_NAME,
        Item: item
      }));
      imported++;
      if (imported % 20 === 0) {
        console.log(`  ✓ Importováno ${imported}/${unique.length}`);
      }
    } catch (err) {
      errors++;
      console.error(`  ✗ Chyba při importu ${qId}:`, err.message);
    }
  }
  
  console.log(`\n[4] Hotovo! Importováno ${imported} otázek, ${errors} chyb.`);
  console.log(`Celkem Medlánky otázek v DB: ${imported}`);
}

run().catch(e => {
  console.error('❌ Chyba:', e.message);
  process.exit(1);
});
