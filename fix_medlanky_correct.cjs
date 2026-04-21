const { DynamoDBClient, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const fs = require('fs');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE_NAME = 'aeropilot-questions';

const L = { 0: 'A', 1: 'B', 2: 'C', 3: 'D' };

async function run() {
  console.log('[1] Načítám Medlánky otázky z DynamoDB...');
  
  let allItems = [];
  let lastKey = undefined;
  
  do {
    const result = await client.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(questionId, :prefix) OR (begins_with(questionId, :prefix2) AND subcategory = :sub)',
      ExpressionAttributeValues: { 
        ':prefix': { S: 'medlanky_nav_' },
        ':prefix2': { S: 'klub_q' },
        ':sub': { S: 'Medlánky' }
      },
      ExclusiveStartKey: lastKey
    }));
    if (result.Items) allItems.push(...result.Items);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  
  console.log(`[1] Nalezeno ${allItems.length} Medlánky otázek v DB`);
  
  // Načíst zdrojové JSON soubory pro porovnání
  const klubove = JSON.parse(fs.readFileSync('public/otazkykluby.json', 'utf8'));
  let medlankyMain = [];
  try {
    medlankyMain = JSON.parse(fs.readFileSync('public/navigace_medlanky.json', 'utf8'));
  } catch (e) {
    console.log('  navigace_medlanky.json nenalezen, použijeme jen otazkykluby.json');
  }
  const medlankyFromKlub = klubove.filter(q => q.category === 'Navigace SPL');
  
  // Reconstruct same unique list as import script
  const allQuestions = [...medlankyMain, ...medlankyFromKlub];
  const seen = new Set();
  const unique = [];
  allQuestions.forEach((q, idx) => {
    const key = q.question.trim().toLowerCase().slice(0, 50);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(q);
    }
  });
  
  console.log(`[2] Zdrojových unikátních otázek: ${unique.length}`);
  
  // Pro každou otázku v DB najít správnou odpověď ze zdrojového JSON
  let fixed = 0;
  let alreadyOk = 0;
  let notFound = 0;
  
  for (const item of allItems) {
    const qId = item.questionId.S;
    const questionText = item.question.S;
    const currentCorrect = parseInt(item.correct?.N || '0');
    const currentOption = item.correctOption?.S || 'A';
    
    // Najít odpovídající otázku ve zdroji podle textu
    const sourceQ = unique.find(q => 
      q.question.trim().toLowerCase().slice(0, 50) === questionText.trim().toLowerCase().slice(0, 50)
    );
    
    if (!sourceQ) {
      console.log(`  ⚠️ ${qId}: nenalezena ve zdroji: "${questionText.slice(0, 50)}..."`);
      notFound++;
      continue;
    }
    
    // Zjistit správný index z options (correct: true)
    let correctIndex = -1;
    if (sourceQ.options) {
      correctIndex = sourceQ.options.findIndex(o => o.correct === true);
    }
    if (correctIndex < 0 && sourceQ.correct_labels) {
      // correct_labels obsahuje MALÁ písmena: "a", "b", "c"
      const label = sourceQ.correct_labels[0]?.toLowerCase();
      correctIndex = label ? label.charCodeAt(0) - 97 : 0; // 97 = 'a'
    }
    if (correctIndex < 0) correctIndex = 0;
    
    const correctOption = L[correctIndex] || 'A';
    
    if (currentCorrect === correctIndex && currentOption === correctOption) {
      alreadyOk++;
      continue;
    }
    
    console.log(`  🔧 ${qId}: "${questionText.slice(0, 50)}..."`);
    console.log(`      BYLO: correct=${currentCorrect}, correctOption=${currentOption}`);
    console.log(`      MÁ BÝT: correct=${correctIndex}, correctOption=${correctOption}`);
    
    // Opravit v DynamoDB
    await client.send(new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: { questionId: { S: qId } },
      UpdateExpression: 'SET correct = :c, correctOption = :co',
      ExpressionAttributeValues: {
        ':c': { N: String(correctIndex) },
        ':co': { S: correctOption }
      }
    }));
    
    fixed++;
  }
  
  console.log(`\n[3] Hotovo!`);
  console.log(`  ✅ Opraveno: ${fixed}`);
  console.log(`  ✓ Již OK: ${alreadyOk}`);
  console.log(`  ⚠️ Nenalezeno: ${notFound}`);
}

run().catch(e => {
  console.error('❌ Chyba:', e.message);
  process.exit(1);
});
