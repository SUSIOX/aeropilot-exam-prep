/**
 * Analyzuje obsah explanationů v DynamoDB a identifikuje špatné kvality
 * 
 * Usage:
 *   node analyze-explanations-content.cjs           # Zobrazí analýzu
 *   node analyze-explanations-content.cjs --delete  # SMAŽE špatné!
 */

const { DynamoDBClient, ScanCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const fs = require('fs');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const TABLE = 'aeropilot-ai-explanations';
const ARGS = process.argv.slice(2);
const SHOULD_DELETE = ARGS.includes('--delete');

// 🔴 Znaky špatných explanations - HLAVNÍ indikátory
const BAD_PATTERNS = [
  // Generováno AI
  /generováno.*ai/i,
  /generováno.*agent/i,
  /vygenerováno.*ai/i,
  /ai.*generoval/i,
  /vytvořeno.*ai/i,
  /zpracováno.*ai/i,
  /ai.*vytvořil/i,
  /automaticky.*generováno/i,
  
  // Zopakování správné odpovědi na začátku
  /^(správná odpověď|odpověď [abcd]| Správná odpověď|Odpověď [abcd])/i,
  /správná odpověď.*je.*[abcd]/i,
  /proč je odpověď [abcd]/i,
  /odpověď [abcd] je správná/i,
  /správně je [abcd]/i,
  /správná je [abcd]/i,
  /odpověď.*[abcd].*je správná/i,
  /správná.*odpověď.*[abcd]/i,
  
  // Zopakování otázky
  /otázka zní/i,
  /dotaz zní/i,
  /v otázce se ptáme/i,
  /podle otázky/i,
  /v této otázce/i,
  /tato otázka/i,
  
  // Hloupé fráze
  /toto je správné/i,
  /to je správná odpověď/i,
  /vybrali jsme správně/i,
  /zvolili jsme správně/i,
  /správná volba/i,
  /správně jste/i,
  /je správně, protože/i,
];

// 🟡 Podezřelé - absence technického "proč"
function lacksTechnicalReasoning(exp) {
  // Musí obsahovat technické spojky NEBO čísla/reference
  const technicalConnectors = /(protože|jelikož|z důvodu|díky|vzhledem k|na základě|podle|dle|tudíž|proto|takže|kde|když|jestliže|pokud|jakmile|tím pádem)/i;
  const hasConnectors = technicalConnectors.test(exp);
  
  // Čísla nebo technické reference
  const hasNumbers = /\d/.test(exp);
  const hasReferences = /(EASA|ICAO|CS-\d+|AMC|GM|Part|MED|CAT|PICUS|VFR|IFR|FAA|UCL|NPA)/i.test(exp);
  
  // Pokud nemá spojky A nemá čísla/reference = podezřelé
  if (!hasConnectors && !hasNumbers && !hasReferences) {
    return true;
  }
  
  return false;
}

function isBadExplanation(exp, item) {
  const issues = [];
  
  // 1. Obsahuje "Generováno AI" nebo podobně
  for (const pattern of BAD_PATTERNS) {
    if (pattern.test(exp)) {
      issues.push(`Pattern: ${pattern.source.substring(0, 40)}`);
      break; // Stačí jeden pattern
    }
  }
  
  // 2. Chybí technické odůvodnění "proč"
  if (lacksTechnicalReasoning(exp)) {
    issues.push('Chybí technické odůvodnění (protože, podle, čísla, reference)');
  }
  
  // 3. Příliš krátké (< 30 znaků = asi prázdné/nevalidní)
  if (exp.length < 30) {
    issues.push(`Příliš krátké (${exp.length} znaků)`);
  }
  
  // 4. Příliš dlouhé bez struktury (blbý text)
  if (exp.length > 2000 && !exp.includes('\n') && !exp.includes('**')) {
    issues.push('Dlouhý text bez struktury');
  }
  
  return issues.length > 0 ? issues : null;
}

async function analyzeExplanations() {
  console.log(`=== Analýza explanationů v DynamoDB ${SHOULD_DELETE ? '(SMAŽENÍ AKTIVNÍ!)' : ''} ===\n`);
  
  if (SHOULD_DELETE) {
    console.log('⚠️  VAROVÁNÍ: Spouštíš s --delete - špatné explanations budou SMAZÁNY!\n');
    console.log('Pokračuji za 3 sekundy...\n');
    await new Promise(r => setTimeout(r, 3000));
  }
  
  let lastKey = null, scanned = 0;
  const good = [], bad = [];
  let patternCount = 0, reasoningCount = 0, shortCount = 0, longCount = 0;
  
  do {
    try {
      const r = await client.send(new ScanCommand({
        TableName: TABLE,
        ExclusiveStartKey: lastKey,
        Limit: 1000
      }));
      
      for (const item of r.Items || []) {
        scanned++;
        const data = unmarshall(item);
        const qid = data.questionId || 'unknown';
        const exp = data.explanation || '';
        
        const issues = isBadExplanation(exp, data);
        
        if (issues) {
          // Spočítat typy problémů
          if (issues.some(i => i.includes('Pattern'))) patternCount++;
          if (issues.some(i => i.includes('odůvodnění'))) reasoningCount++;
          if (issues.some(i => i.includes('krátké'))) shortCount++;
          if (issues.some(i => i.includes('struktury'))) longCount++;
          
          bad.push({
            questionId: qid,
            model: data.model,
            provider: data.provider,
            createdAt: data.createdAt,
            length: exp.length,
            issues: issues,
            preview: exp.substring(0, 150) + (exp.length > 150 ? '...' : ''),
            fullText: exp
          });
          
          if (SHOULD_DELETE) {
            await deleteExplanation(qid, data.model);
          }
        } else {
          good.push({ questionId: qid, length: exp.length, model: data.model });
        }
      }
      
      lastKey = r.LastEvaluatedKey;
      process.stdout.write(`\r📊 Scan: ${scanned}...`);
    } catch (err) {
      console.error('\n❌ Chyba scanu:', err.message);
      break;
    }
  } while (lastKey);
  
  console.log('\n\n========================================');
  console.log('        VÝSLEDKY ANALÝZY');
  console.log('========================================');
  console.log(`\n📦 Celkem explanations: ${scanned}`);
  console.log(`\n✅ Kvalitní: ${good.length} (${Math.round(good.length/scanned*100)}%)`);
  console.log(`\n❌ Špatných: ${bad.length} (${Math.round(bad.length/scanned*100)}%)`);
  
  if (bad.length > 0) {
    console.log(`\n   Detaily špatných:`);
    console.log(`   • "Generováno AI" vzory: ${patternCount}`);
    console.log(`   • Chybí technické odůvodnění: ${reasoningCount}`);
    console.log(`   • Příliš krátké: ${shortCount}`);
    console.log(`   • Dlouhé bez struktury: ${longCount}`);
    
    console.log(`\n========================================`);
    console.log('     UKÁZKY ŠPATNÝCH (top 5)');
    console.log('========================================');
    
    bad.slice(0, 5).forEach((b, i) => {
      console.log(`\n--- #${i+1}: ${b.questionId} ---`);
      console.log(`Provider: ${b.provider} | Model: ${b.model}`);
      console.log(`Délka: ${b.length} znaků | Vytvořeno: ${b.createdAt || 'neznámé'}`);
      console.log(`Problémy:`);
      b.issues.forEach(issue => console.log(`  • ${issue}`));
      console.log(`\nText preview:\n"${b.preview}"\n`);
    });
    
    if (bad.length > 5) {
      console.log(`... a dalších ${bad.length - 5} špatných explanations`);
    }
    
    // Uložit detaily do souboru
    const reportFile = 'bad_explanations.json';
    fs.writeFileSync(reportFile, JSON.stringify({
      scanned,
      good: good.length,
      bad: bad.length,
      breakdown: {
        patternCount,
        reasoningCount,
        shortCount,
        longCount
      },
      badItems: bad,
      goodItems: good.slice(0, 100) // Prvních 100 dobrých pro referenci
    }, null, 2));
    
    console.log(`\n💾 Kompletní report uložen do: ${reportFile}`);
    
    if (!SHOULD_DELETE) {
      console.log(`\n⚠️  Pro SMAZÁNÍ špatných explanations spusť:`);
      console.log(`   node analyze-explanations-content.cjs --delete`);
      console.log(`\n💡 Tip: Prohlédni si nejprve ukázky výše a ujisti se,`);
      console.log(`   že detekce funguje správně.`);
    }
  } else {
    console.log('\n🎉 Všechny explanations jsou kvalitní!');
  }
  
  return { good, bad };
}

async function deleteExplanation(questionId, model) {
  try {
    await client.send(new DeleteItemCommand({
      TableName: TABLE,
      Key: {
        questionId: { S: questionId },
        model: { S: model || 'unknown' }
      }
    }));
    console.log(`   🗑️  Smazáno: ${questionId}`);
  } catch (err) {
    console.error(`   ❌ Chyba mazání ${questionId}:`, err.message);
  }
}

// Spustit analýzu
analyzeExplanations()
  .then(() => {
    console.log('\n========================================');
    console.log('✅ Analýza dokončena');
    console.log('========================================\n');
  })
  .catch(err => {
    console.error('\n========================================');
    console.error('❌ Chyba:', err.message);
    console.error('========================================\n');
    process.exit(1);
  });
