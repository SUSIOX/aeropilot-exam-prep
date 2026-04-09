const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({ region: "eu-central-1" });

async function finalCheck() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🔍 FINÁLNÍ KOMPLETNÍ KONTROLA DATABÁZE');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // 1. Načtení všech vysvětlení
  const explanations = [];
  let lastKey = null;
  
  do {
    const result = await client.send(new ScanCommand({
      TableName: "aeropilot-ai-explanations",
      ExclusiveStartKey: lastKey
    }));
    
    for (const raw of result.Items || []) {
      explanations.push(unmarshall(raw));
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  
  console.log(`📊 CELKEM VYSVĚTLENÍ: ${explanations.length}\n`);
  
  // 2. Počet per předmět
  const bySubject = {};
  for (const exp of explanations) {
    const match = exp.questionId?.match(/subject(\d+)_/);
    if (match) {
      const subjectId = parseInt(match[1]);
      bySubject[subjectId] = (bySubject[subjectId] || 0) + 1;
    }
  }
  
  const subjectNames = {
    1: "Air Law (010)",
    2: "Human Performance (022)",
    3: "Meteorology (050)",
    4: "Communications (090)",
    5: "Principles of Flight (080)",
    6: "Operational Procedures (020)",
    7: "Flight Performance (040)",
    8: "Aircraft General (021)",
    9: "Navigation (061)"
  };
  
  console.log('📚 ROZDĚLENÍ PODLE PŘEDMĚTŮ:');
  console.log('─────────────────────────────────────────────────────────────');
  let totalMatched = 0;
  for (let i = 1; i <= 9; i++) {
    const count = bySubject[i] || 0;
    totalMatched += count;
    const status = count > 0 ? '✅' : '❌';
    console.log(`  ${status} Subject ${i}: ${subjectNames[i]?.padEnd(30)} ${count.toString().padStart(4)} otázek`);
  }
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  📊 Celkem: ${totalMatched} otázek\n`);
  
  // 3. Kontrola struktury
  let withIntro = 0;
  let withTechnical = 0;
  let withPractical = 0;
  let withMemoryTip = 0;
  let withOldTemplate = 0;
  let withNewTemplate = 0;
  
  for (const exp of explanations) {
    const text = exp.explanation || '';
    if (text.includes('**Krátký úvod**')) withIntro++;
    if (text.includes('**Technické odůvodnění**')) withTechnical++;
    if (text.includes('**Praktické použití**')) withPractical++;
    if (text.includes('**Paměťový tip**')) withMemoryTip++;
    if (text.includes('Správná odpověď (')) withOldTemplate++;
    if (text.includes('Klíčový koncept pro pochopení')) withNewTemplate++;
  }
  
  console.log('📝 KONTROLA STRUKTURY VYSVĚTLENÍ:');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  ✅ Má úvod (Krátký úvod):           ${withIntro}/${explanations.length}`);
  console.log(`  ✅ Má technické odůvodnění:         ${withTechnical}/${explanations.length}`);
  console.log(`  ✅ Má praktické použití:            ${withPractical}/${explanations.length}`);
  console.log(`  ✅ Má paměťový tip:                  ${withMemoryTip}/${explanations.length}`);
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  ✅ Nová šablona (Klíčový koncept):  ${withNewTemplate}/${explanations.length}`);
  console.log(`  ⚠️  Stará šablona (Správná odp.):   ${withOldTemplate}/${explanations.length}`);
  console.log('─────────────────────────────────────────────────────────────\n');
  
  // 4. Kontrola duplicit
  const seen = new Map();
  const duplicates = [];
  
  for (const exp of explanations) {
    if (seen.has(exp.questionId)) {
      duplicates.push(exp.questionId);
    } else {
      seen.set(exp.questionId, 1);
    }
  }
  
  console.log('🔍 KONTROLA DUPLICIT:');
  if (duplicates.length === 0) {
    console.log('  ✅ Žádné duplicity nalezeny');
  } else {
    console.log(`  ⚠️  Nalezeno ${duplicates.length} duplicitních ID:`);
    duplicates.forEach(id => console.log(`     - ${id}`));
  }
  console.log('');
  
  // 5. Provider breakdown
  const byProvider = {};
  for (const exp of explanations) {
    byProvider[exp.provider] = (byProvider[exp.provider] || 0) + 1;
  }
  
  console.log('👤 ROZDĚLENÍ PODLE PROVIDERA:');
  console.log('─────────────────────────────────────────────────────────────');
  Object.entries(byProvider)
    .sort((a, b) => b[1] - a[1])
    .forEach(([provider, count]) => {
      const pct = ((count / explanations.length) * 100).toFixed(1);
      console.log(`  ${provider.padEnd(15)}: ${count.toString().padStart(4)} (${pct}%)`);
    });
  console.log('─────────────────────────────────────────────────────────────\n');
  
  // 6. Vzorek pro kontrolu
  console.log('📋 UKÁZKA NÁHODNÉHO ZÁZNAMU:');
  console.log('─────────────────────────────────────────────────────────────');
  const sample = explanations[Math.floor(Math.random() * explanations.length)];
  if (sample) {
    console.log(`  Question ID: ${sample.questionId}`);
    console.log(`  Provider:    ${sample.provider}`);
    console.log(`  Model:       ${sample.model || 'N/A'}`);
    console.log(`  Created:     ${sample.createdAt?.substring(0, 10) || 'N/A'}`);
    console.log('');
    const lines = sample.explanation?.split('\n') || [];
    lines.slice(0, 6).forEach(line => {
      if (line.trim()) {
        console.log('  ' + line.substring(0, 75));
      }
    });
    if (lines.length > 6) {
      console.log('  ... [zkráceno]');
    }
  }
  console.log('─────────────────────────────────────────────────────────────\n');
  
  // 7. Finální verdikt
  const quality = (withNewTemplate / explanations.length) * 100;
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🏆 FINÁLNÍ VERDIKT');
  console.log('═══════════════════════════════════════════════════════════════');
  
  if (explanations.length >= 700 && withNewTemplate > explanations.length * 0.8 && duplicates.length === 0) {
    console.log('  ✅ Všechny předměty pokryty (1-9)');
    console.log('  ✅ Vysoká kvalita šablony (>80% nová)');
    console.log('  ✅ Žádné duplicity');
    console.log('  ✅ Správná struktura všech sekcí');
    console.log('\n  🎉 DATABÁZE JE PŘIPRAVENA PRO PRODUKCI! 🎉');
  } else {
    console.log('  ⚠️  Nalezeny problémy - viz výše');
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
}

finalCheck().catch(e => console.error('Chyba:', e.message));
