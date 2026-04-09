/**
 * Batch Explanation Generator - AGENT MODE
 * Prepares questions for AI agent to generate explanations
 * 
 * Usage:
 *   node generate-explanations-agent.cjs prepare [options]  -> Prepares batch files
 *   node generate-explanations-agent.cjs save              -> Saves agent responses to DB
 * 
 * Prepare options:
 *   --subject=N          Process only subject N (1-9)
 *   --batch-size=N       Number of questions per batch (default: 30)
 *   --max-total=N        Stop after preparing N questions total
 *   --skip-existing      Skip questions that already have explanations
 * 
 * Workflow:
 *   1. node generate-explanations-agent.cjs prepare --subject=1
 *      -> Creates .agent-batch-*.json files with questions
 *   2. Give .agent-batch-*.json files to AI agent for processing
 *   3. Agent saves responses to .agent-responses-*.json
 *   4. node generate-explanations-agent.cjs save
 *      -> Saves responses to DynamoDB
 * 
 * Environment:
 *   AWS_REGION           AWS region (default: eu-central-1)
 */

const { DynamoDBClient, ScanCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall, marshall } = require('@aws-sdk/util-dynamodb');
const fs = require('fs');
const path = require('path');

// ── Configuration ─────────────────────────────────────────────────────────────

const CONFIG = {
  region: process.env.AWS_REGION || 'eu-central-1',
  questionsTable: 'aeropilot-questions',
  explanationsTable: 'aeropilot-ai-explanations',
  batchPrefix: '.agent-batch-',
  responsePrefix: '.agent-responses-',
  stateFile: path.join(process.cwd(), '.explanation-agent-state.json'),
  defaultBatchSize: 30,
};

// Subject mapping
const SUBJECTS = {
  1: { code: '010', name: 'Air Law', prefix: '010' },
  2: { code: '022', name: 'Human Performance', prefix: '022' },
  3: { code: '050', name: 'Meteorology', prefix: '050' },
  4: { code: '090', name: 'Communications', prefix: '090' },
  5: { code: '080', name: 'Principles of Flight', prefix: '080' },
  6: { code: '020', name: 'Operational Procedures', prefix: '020' },
  7: { code: '040', name: 'Flight Performance', prefix: '040' },
  8: { code: '021', name: 'Aircraft General', prefix: '021' },
  9: { code: '061', name: 'Navigation', prefix: '061' },
};

// ── Prompt Builder (matches aiService.ts format) ──────────────────────────────

function buildAgentPrompt(question, lo) {
  const correctOption = question.correctOption || 'A';
  const answers = question.answers || [];
  const optionIndex = correctOption.charCodeAt(0) - 65;
  const correctText = answers[optionIndex] || '';
  const loId = question.loId || lo?.loId || '';
  const loText = lo?.text || '';
  
  return `Jsi letecký instruktor specializovaný na technické vysvětlení leteckých konceptů.

Otázka: ${question.question || question.text}
Označení správné odpovědi: ${correctOption}
Text správné odpovědi: ${correctText}
LO: ${loId ? `${loId} - ${loText}` : "Neurčeno"}

DŮLEŽITÉ INSTRUKCE:
1. Technicky a odborně vysvětli letecký koncept v pozadí správné odpovědi.
2. PRIORITNÍ VYHLEDÁVÁNÍ: Nejprve hledej v EASA dokumentaci (CS-23, CS-25, CS-VLA, AMC, GM, CAT.POL.MPA, CAT.GEN.MPA, NPA, UCL, atd.)
3. SEKUNDÁRNÍ VYHLEDÁVÁNÍ: Pouze pokud EASA dokumenty neobsahují relevantní informace, hledej v ICAO, FAA nebo jiných leteckých autoritách
4. NEZMIŇUJ alternativní akce nebo intuitivní reakce.
5. ZAMĚŘ SE POUZE na technické odůvodnění.
6. Odkazuj na konkrétní EASA předpisy, procedury nebo technické principy s přesnými referencemi (např. "Podle EASA CS-23.1309...")
7. Pokud je správná odpověď kontra-intuitivní, vysvětli technický důvod pomocí EASA předpisů.
8. KRITICKÉ: NEOPAKUJ a NEPOTVRZUJ, že odpověď "${correctOption}" je správná. Uživatel to už vidí před sebou. Nezačínej větami typu "Odpověď B je správná protože..." ani "Proč je odpověď B správná?". Začni ROVNOU technickým vysvětlením problému.

Pravidla:
1. Jazyk: Česky
2. Styl: Srozumitelný a odborný, ale bez jakýchkoliv oslovení (žádné "Ahoj", "Čau", "Pilote", atd.)
3. POUŽÍVEJ MARKDOWN PRO PŘEHLEDNOST: **tučně**, *kurzíva*, nadpisy, odrážky
4. Cokoliv týkající se fyzikálních vzorců a matematiky zapisuj výhradně ve standardním LaTeX formátu s použitím $ pro inline (např. $v^2$) a $$ pro samostatný řádek.
5. Struktura:
   - **Krátký úvod** (o jaký koncept se jedná)
   - **Technické odůvodnění** (vysvětlení principu, neopakuj odpověď ani její označení)
   - **Praktické použití** v letadle
   - **Paměťový tip**
5. Použij krátké věty a odstavce
6. Použij analogie a praktické příklady ze skutečného života pilota
7. Délka: 200-300 slov

Vysvětli to tak, aby to pochopil i začátečník v pilotním výcviku.
ZAČNI PŘÍMO VYSVĚTLENÍM BEZ JAKÉHOKOLIV POZDRAVENÍ NEBO OSLOVENÍ.
POUŽÍVEJ MARKDOWN PRO LEPŠÍ FORMÁTOVÁNÍ.
NEOPAKUJ OZNAČENÍ SPRÁVNÉ ODPOVĚDI ("${correctOption}").`;
}

// ── Database Operations ───────────────────────────────────────────────────────

async function fetchQuestionsWithoutExplanations(dynamoClient, subjectId, existingExplanations) {
  const questions = [];
  let lastKey = null;
  const subjectPrefix = `subject${subjectId}_`;
  
  console.log(`📡 Scanning subject ${subjectId}...`);
  
  do {
    const params = {
      TableName: CONFIG.questionsTable,
      ExclusiveStartKey: lastKey,
      FilterExpression: 'begins_with(questionId, :prefix)',
      ExpressionAttributeValues: {
        ':prefix': { S: subjectPrefix },
      },
    };
    
    const result = await dynamoClient.send(new ScanCommand(params));
    
    for (const raw of result.Items || []) {
      const item = unmarshall(raw);
      const qid = item.questionId;
      
      // Skip if already has explanation
      if (existingExplanations.has(qid)) continue;
      
      questions.push({
        questionId: qid,
        question: item.question,
        text: item.question,
        answers: item.answers?.map(a => a.S || a) || [],
        correctOption: item.correctOption,
        loId: item.loId,
        subjectId,
      });
    }
    
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  
  console.log(`   Found ${questions.length} PDF questions without explanations`);
  return questions;
}

async function fetchExistingExplanations(dynamoClient) {
  const explanations = new Set();
  let lastKey = null;
  
  console.log('📡 Loading existing explanations...');
  
  do {
    const result = await dynamoClient.send(new ScanCommand({
      TableName: CONFIG.explanationsTable,
      ExclusiveStartKey: lastKey,
      ProjectionExpression: 'questionId',
    }));
    
    for (const raw of result.Items || []) {
      const item = unmarshall(raw);
      if (item.questionId) explanations.add(item.questionId);
    }
    
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  
  console.log(`   ${explanations.size} existing explanations loaded`);
  return explanations;
}

async function loadLOs(dynamoClient) {
  const cache = new Map();
  let lastKey = null;
  
  console.log('📡 Loading LOs...');
  
  do {
    const result = await dynamoClient.send(new ScanCommand({
      TableName: 'aeropilot-easa-objectives',
      ExclusiveStartKey: lastKey,
      ProjectionExpression: 'loId, #text',
      ExpressionAttributeNames: { '#text': 'text' },
    }));
    
    for (const raw of result.Items || []) {
      const item = unmarshall(raw);
      if (item.loId) cache.set(item.loId, item);
    }
    
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  
  console.log(`   ${cache.size} LOs loaded`);
  return cache;
}

// ── Batch Preparation ─────────────────────────────────────────────────────────

async function prepareBatches(options) {
  const dynamoClient = new DynamoDBClient({ region: CONFIG.region });
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('🛩️  Preparing Batches for Agent Processing');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Batch size: ${options.batchSize}`);
  if (options.subject) console.log(`Subject: ${options.subject} (${SUBJECTS[options.subject]?.name})`);
  if (options.maxTotal) console.log(`Max total: ${options.maxTotal}`);
  console.log('');
  
  const existingExplanations = await fetchExistingExplanations(dynamoClient);
  const loCache = await loadLOs(dynamoClient);
  
  const subjectsToProcess = options.subject 
    ? [options.subject]
    : Object.keys(SUBJECTS).map(Number);
  
  let totalPrepared = 0;
  let batchNumber = 1;
  
  for (const subjectId of subjectsToProcess) {
    const subject = SUBJECTS[subjectId];
    if (!subject) continue;
    
    console.log(`\n📚 Subject ${subjectId}: ${subject.name}`);
    
    const questions = await fetchQuestionsWithoutExplanations(
      dynamoClient,
      subjectId,
      existingExplanations
    );
    
    if (questions.length === 0) {
      console.log('   ✅ No questions need explanations');
      continue;
    }
    
    // Create batches
    for (let i = 0; i < questions.length; i += options.batchSize) {
      const batch = questions.slice(i, i + options.batchSize);
      
      // Enhance with prompts
      const enhancedBatch = batch.map(q => ({
        ...q,
        agentPrompt: buildAgentPrompt(q, loCache.get(q.loId) || null),
      }));
      
      const batchFile = `${CONFIG.batchPrefix}${String(batchNumber).padStart(3, '0')}.json`;
      fs.writeFileSync(batchFile, JSON.stringify({
        batchNumber,
        subjectId,
        subjectName: subject.name,
        preparedAt: new Date().toISOString(),
        questionCount: enhancedBatch.length,
        questions: enhancedBatch,
      }, null, 2));
      
      console.log(`   💾 Created ${batchFile} (${enhancedBatch.length} questions)`);
      
      totalPrepared += enhancedBatch.length;
      batchNumber++;
      
      if (options.maxTotal && totalPrepared >= options.maxTotal) {
        console.log(`\n🛑 Reached max total (${options.maxTotal})`);
        break;
      }
    }
    
    if (options.maxTotal && totalPrepared >= options.maxTotal) {
      break;
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('📋 Preparation Complete');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Total batches: ${batchNumber - 1}`);
  console.log(`Total questions: ${totalPrepared}`);
  console.log('\nNext steps:');
  console.log('1. Give batch files to AI agent for processing');
  console.log('2. Agent should save responses to .agent-responses-XXX.json');
  console.log('3. Run: node generate-explanations-agent.cjs save');
  
  // Save state
  fs.writeFileSync(CONFIG.stateFile, JSON.stringify({
    batchesPrepared: batchNumber - 1,
    totalQuestions: totalPrepared,
    preparedAt: new Date().toISOString(),
    options,
  }, null, 2));
}

// ── Save Responses ────────────────────────────────────────────────────────────

async function saveResponses() {
  const dynamoClient = new DynamoDBClient({ region: CONFIG.region });
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('💾 Saving Agent Responses to DynamoDB');
  console.log('═══════════════════════════════════════════════════');
  
  const responseFiles = fs.readdirSync(process.cwd())
    .filter(f => f.startsWith(CONFIG.responsePrefix) && f.endsWith('.json'))
    .sort();
  
  if (responseFiles.length === 0) {
    console.log('❌ No response files found (.agent-responses-*.json)');
    return;
  }
  
  console.log(`Found ${responseFiles.length} response files\n`);
  
  let totalSaved = 0;
  let totalFailed = 0;
  
  for (const file of responseFiles) {
    console.log(`📂 Processing ${file}...`);
    
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const responses = data.responses || [];
      
      for (const resp of responses) {
        try {
          const now = new Date().toISOString();
          
          await dynamoClient.send(new PutItemCommand({
            TableName: CONFIG.explanationsTable,
            Item: marshall({
              questionId: resp.questionId,
              explanation: resp.explanation,
              provider: 'agent',
              model: 'ai-agent',
              createdAt: now,
              lastUsed: now,
              usageCount: 1,
            }),
          }));
          
          totalSaved++;
          process.stdout.write(`  ✅ Saved ${resp.questionId}\n`);
          
        } catch (err) {
          totalFailed++;
          console.log(`  ❌ Failed ${resp.questionId}: ${err.message}`);
        }
      }
      
      // Move processed file to archive
      const archiveDir = path.join(process.cwd(), '.agent-processed');
      if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir);
      fs.renameSync(file, path.join(archiveDir, `${Date.now()}_${file}`));
      
    } catch (err) {
      console.log(`  ❌ Error processing ${file}: ${err.message}`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('✅ Save Complete');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Saved: ${totalSaved}`);
  console.log(`Failed: ${totalFailed}`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || 'prepare';
  
  const options = {
    subject: null,
    batchSize: CONFIG.defaultBatchSize,
    maxTotal: null,
  };
  
  for (const arg of args.slice(1)) {
    if (arg.startsWith('--subject=')) {
      options.subject = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--batch-size=')) {
      options.batchSize = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--max-total=')) {
      options.maxTotal = parseInt(arg.split('=')[1]);
    }
  }
  
  return { command, options };
}

function printUsage() {
  console.log(`
Batch Explanation Generator - AGENT MODE

Usage:
  node generate-explanations-agent.cjs prepare [options]  -> Prepare batches
  node generate-explanations-agent.cjs save               -> Save responses

Prepare options:
  --subject=N          Process only subject N (1-9)
  --batch-size=N       Questions per batch (default: ${CONFIG.defaultBatchSize})
  --max-total=N        Stop after N questions

Workflow:
  1. Prepare batches:
     node generate-explanations-agent.cjs prepare --subject=1
     
  2. Give .agent-batch-*.json files to AI agent and ask:
     "Generate explanations for these questions using the provided prompts.
      Save your responses in format: {responses: [{questionId, explanation}, ...]}"
     
  3. Save agent responses as .agent-responses-XXX.json
  
  4. Save to DynamoDB:
     node generate-explanations-agent.cjs save

Subjects:
  1 = Air Law (010)
  2 = Human Performance (022)
  3 = Meteorology (050)
  4 = Communications (090)
  5 = Principles of Flight (080)
  6 = Operational Procedures (020)
  7 = Flight Performance (040)
  8 = Aircraft General (021)
  9 = Navigation (061)
`);
}

async function main() {
  const { command, options } = parseArgs();
  
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }
  
  switch (command) {
    case 'prepare':
      await prepareBatches(options);
      break;
    case 'save':
      await saveResponses();
      break;
    default:
      console.log(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch(err => {
  console.error('💥 Error:', err);
  process.exit(1);
});
