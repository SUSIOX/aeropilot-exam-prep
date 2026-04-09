/**
 * Batch Explanation Generator for PDF Questions
 * Generates AI explanations for questions that don't have them yet
 * 
 * Usage:
 *   node generate-explanations-batch.cjs [options]
 * 
 * Options:
 *   --subject=N          Process only subject N (1-9)
 *   --batch-size=N       Number of questions per batch (default: 30)
 *   --provider=NAME      AI provider: gemini|claude|deepseek (default: gemini)
 *   --model=NAME         Specific model name
 *   --resume             Resume from last saved state
 *   --dry-run            Show what would be processed without generating
 *   --max-total=N        Stop after processing N questions total
 * 
 * Environment variables:
 *   GEMINI_API_KEY       Required for Gemini provider
 *   CLAUDE_API_KEY       Required for Claude provider  
 *   DEEPSEEK_API_KEY     Required for DeepSeek provider
 *   AI_PROXY_URL         Optional proxy URL for DeepSeek
 *   AWS_REGION           AWS region (default: eu-central-1)
 * 
 * Examples:
 *   node generate-explanations-batch.cjs --resume
 *   node generate-explanations-batch.cjs --subject=1 --batch-size=20
 *   node generate-explanations-batch.cjs --provider=claude --max-total=100
 */

const { DynamoDBClient, ScanCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall, marshall } = require('@aws-sdk/util-dynamodb');
const { GoogleGenAI } = require('@google/genai');
const { Anthropic } = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

// ── Configuration ─────────────────────────────────────────────────────────────

const CONFIG = {
  region: process.env.AWS_REGION || 'eu-central-1',
  questionsTable: 'aeropilot-questions',
  explanationsTable: 'aeropilot-ai-explanations',
  stateFile: path.join(process.cwd(), '.explanation-batch-state.json'),
  logFile: path.join(process.cwd(), '.explanation-batch.log'),
  defaultBatchSize: 30,
  defaultProvider: 'gemini',
  delayMs: 1000,
  maxRetries: 3,
  retryDelayMs: 5000,
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

// ── State Management ──────────────────────────────────────────────────────────

function loadState() {
  if (fs.existsSync(CONFIG.stateFile)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf-8'));
    } catch (e) {
      console.warn('⚠️ Failed to load state file, starting fresh');
    }
  }
  return {
    processedQuestionIds: [],
    failedQuestionIds: [],
    totalGenerated: 0,
    totalFailed: 0,
    lastSubject: null,
    lastRunAt: null,
    startedAt: new Date().toISOString(),
  };
}

function saveState(state) {
  fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
}

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  process.stdout.write(line);
  fs.appendFileSync(CONFIG.logFile, line);
}

// ── AI Providers ──────────────────────────────────────────────────────────────

class GeminiProvider {
  constructor(apiKey, model = 'gemini-flash-latest') {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async generateExplanation(question, lo) {
    const prompt = buildPrompt(question, lo);
    
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    
    return cleanExplanation(response.text || '');
  }
}

class ClaudeProvider {
  constructor(apiKey, model = 'claude-haiku-4-5-20251001') {
    this.claude = new Anthropic({ apiKey, dangerouslyAllowBrowser: false });
    this.model = model;
  }

  async generateExplanation(question, lo) {
    const prompt = buildPrompt(question, lo);
    
    const response = await this.claude.messages.create({
      model: this.model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    
    return cleanExplanation((response.content[0]?.text) || '');
  }
}

class DeepSeekProvider {
  constructor(apiKey, model = 'deepseek-chat') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateExplanation(question, lo) {
    const prompt = buildPrompt(question, lo);
    
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }
    
    const data = await response.json();
    return cleanExplanation(data.choices?.[0]?.message?.content || '');
  }
}

function buildPrompt(question, lo) {
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

function cleanExplanation(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/^(Ahoj|Čau|Dobrý den|Pilote|Studente|Příteli|Kámo)[,\s]*/gi, '')
    .replace(/^(Ahoj|Čau|Dobrý den|Pilote|Studente|Příteli|Kámo)[^\n]*\n/gi, '')
    .trim();
}

function createProvider(provider, model) {
  switch (provider) {
    case 'gemini': {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error('GEMINI_API_KEY not set');
      return new GeminiProvider(key, model || 'gemini-flash-latest');
    }
    case 'claude': {
      const key = process.env.CLAUDE_API_KEY;
      if (!key) throw new Error('CLAUDE_API_KEY not set');
      return new ClaudeProvider(key, model || 'claude-haiku-4-5-20251001');
    }
    case 'deepseek': {
      const key = process.env.DEEPSEEK_API_KEY;
      if (!key) throw new Error('DEEPSEEK_API_KEY not set');
      return new DeepSeekProvider(key, model || 'deepseek-chat');
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ── Database Operations ───────────────────────────────────────────────────────

async function fetchQuestionsWithoutExplanations(dynamoClient, subjectId, existingExplanations, processedIds) {
  const questions = [];
  let lastKey = null;
  const subjectPrefix = `subject${subjectId}_`;
  
  log(`📡 Scanning questions table for subject ${subjectId}...`);
  
  do {
    const params = {
      TableName: CONFIG.questionsTable,
      ExclusiveStartKey: lastKey,
      FilterExpression: 'begins_with(questionId, :prefix) AND (attribute_not_exists(explanation) OR explanation = :empty)',
      ExpressionAttributeValues: {
        ':prefix': { S: subjectPrefix },
        ':empty': { S: '' }
      },
    };
    
    const result = await dynamoClient.send(new ScanCommand(params));
    
    for (const raw of result.Items || []) {
      const item = unmarshall(raw);
      const qid = item.questionId;
      
      if (existingExplanations.has(qid)) continue;
      if (processedIds.includes(qid)) continue;
      
      questions.push(item);
    }
    
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  
  log(`   Found ${questions.length} questions without explanations`);
  return questions;
}

async function fetchExistingExplanations(dynamoClient) {
  const explanations = new Set();
  let lastKey = null;
  
  log('📡 Loading existing explanations...');
  
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
  
  log(`   ${explanations.size} existing explanations loaded`);
  return explanations;
}

async function saveExplanation(dynamoClient, questionId, explanation, provider, model) {
  const now = new Date().toISOString();
  
  const item = {
    questionId,
    explanation,
    provider,
    model,
    createdAt: now,
    lastUsed: now,
    usageCount: 1,
  };
  
  await dynamoClient.send(new PutItemCommand({
    TableName: CONFIG.explanationsTable,
    Item: marshall(item),
  }));
}

// ── Main Processing ───────────────────────────────────────────────────────────

async function processBatch(dynamoClient, provider, questions, loCache, state, options) {
  const results = { success: 0, failed: 0, skipped: 0 };
  
  for (const question of questions) {
    const qid = question.questionId;
    
    if (options.dryRun) {
      log(`   [DRY-RUN] Would process: ${qid}`);
      results.success++;
      continue;
    }
    
    try {
      const lo = loCache.get(question.loId) || null;
      
      let explanation = null;
      let lastError = null;
      
      for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
        try {
          explanation = await provider.generateExplanation(question, lo);
          break;
        } catch (err) {
          lastError = err;
          log(`   ⚠️ Attempt ${attempt} failed for ${qid}: ${err.message}`);
          if (attempt < CONFIG.maxRetries) {
            await sleep(CONFIG.retryDelayMs * attempt);
          }
        }
      }
      
      if (!explanation) {
        throw lastError || new Error('Failed to generate explanation');
      }
      
      await saveExplanation(dynamoClient, qid, explanation, options.provider, options.model);
      
      state.processedQuestionIds.push(qid);
      state.totalGenerated++;
      results.success++;
      
      log(`   ✅ Generated for ${qid}`);
      
      await sleep(CONFIG.delayMs);
      
    } catch (err) {
      log(`   ❌ Failed ${qid}: ${err.message}`);
      state.failedQuestionIds.push({ qid, error: err.message, time: new Date().toISOString() });
      state.totalFailed++;
      results.failed++;
    }
    
    if ((results.success + results.failed) % 10 === 0) {
      saveState(state);
    }
    
    if (options.maxTotal && state.totalGenerated >= options.maxTotal) {
      log(`   🛑 Reached max total (${options.maxTotal}), stopping batch`);
      break;
    }
  }
  
  return results;
}

async function loadLOs(dynamoClient) {
  const cache = new Map();
  let lastKey = null;
  
  log('📡 Loading LOs from database...');
  
  do {
    const result = await dynamoClient.send(new ScanCommand({
      TableName: 'aeropilot-easa-objectives',
      ExclusiveStartKey: lastKey,
    }));
    
    for (const raw of result.Items || []) {
      const item = unmarshall(raw);
      if (item.loId) cache.set(item.loId, item);
    }
    
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  
  log(`   ${cache.size} LOs loaded`);
  return cache;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── CLI & Main ────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    subject: null,
    batchSize: CONFIG.defaultBatchSize,
    provider: CONFIG.defaultProvider,
    model: null,
    resume: false,
    dryRun: false,
    maxTotal: null,
  };
  
  for (const arg of args) {
    if (arg.startsWith('--subject=')) {
      options.subject = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--batch-size=')) {
      options.batchSize = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--provider=')) {
      options.provider = arg.split('=')[1];
    } else if (arg.startsWith('--model=')) {
      options.model = arg.split('=')[1];
    } else if (arg === '--resume') {
      options.resume = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--max-total=')) {
      options.maxTotal = parseInt(arg.split('=')[1]);
    }
  }
  
  return options;
}

function printUsage() {
  console.log(`
Batch Explanation Generator for PDF Questions

Usage: node generate-explanations-batch.cjs [options]

Options:
  --subject=N          Process only subject N (1-9)
  --batch-size=N       Number of questions per batch (default: ${CONFIG.defaultBatchSize})
  --provider=NAME      AI provider: gemini|claude|deepseek (default: ${CONFIG.defaultProvider})
  --model=NAME         Specific model name
  --resume             Resume from last saved state
  --dry-run            Show what would be processed without generating
  --max-total=N        Stop after processing N questions total

Environment variables:
  GEMINI_API_KEY       Required for Gemini provider
  CLAUDE_API_KEY       Required for Claude provider  
  DEEPSEEK_API_KEY     Required for DeepSeek provider
  AWS_REGION           AWS region (default: eu-central-1)

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
  const options = parseArgs();
  
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }
  
  console.log('═══════════════════════════════════════════════════');
  console.log('🛩️  Batch Explanation Generator');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Provider: ${options.provider}`);
  console.log(`Batch size: ${options.batchSize}`);
  if (options.subject) console.log(`Subject filter: ${options.subject} (${SUBJECTS[options.subject]?.name})`);
  if (options.maxTotal) console.log(`Max total: ${options.maxTotal}`);
  if (options.dryRun) console.log('⚠️ DRY RUN - no explanations will be saved');
  console.log('');
  
  try {
    createProvider(options.provider, options.model);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
  
  const dynamoClient = new DynamoDBClient({ region: CONFIG.region });
  const state = loadState();
  const provider = createProvider(options.provider, options.model);
  
  if (options.resume) {
    log(`📋 Resuming from previous state`);
    log(`   Already processed: ${state.totalGenerated}`);
    log(`   Previous failures: ${state.totalFailed}`);
  } else {
    log(`🆕 Starting fresh (use --resume to continue previous run)`);
  }
  
  const loCache = await loadLOs(dynamoClient);
  const existingExplanations = await fetchExistingExplanations(dynamoClient);
  
  const subjectsToProcess = options.subject 
    ? [options.subject]
    : Object.keys(SUBJECTS).map(Number);
  
  for (const subjectId of subjectsToProcess) {
    const subject = SUBJECTS[subjectId];
    if (!subject) continue;
    
    log(`\n📚 Processing Subject ${subjectId}: ${subject.name} (${subject.code})`);
    
    const questions = await fetchQuestionsWithoutExplanations(
      dynamoClient,
      subjectId,
      existingExplanations,
      state.processedQuestionIds
    );
    
    if (questions.length === 0) {
      log(`   ✅ No questions need explanations`);
      continue;
    }
    
    let processed = 0;
    while (processed < questions.length) {
      const batch = questions.slice(processed, processed + options.batchSize);
      
      log(`\n   Processing batch ${Math.floor(processed / options.batchSize) + 1}/${Math.ceil(questions.length / options.batchSize)} (${batch.length} questions)`);
      
      const results = await processBatch(dynamoClient, provider, batch, loCache, state, options);
      
      log(`   Batch complete: ${results.success} success, ${results.failed} failed`);
      
      processed += batch.length;
      state.lastSubject = subjectId;
      saveState(state);
      
      if (options.maxTotal && state.totalGenerated >= options.maxTotal) {
        log(`\n🛑 Reached max total (${options.maxTotal}), stopping`);
        break;
      }
    }
    
    if (options.maxTotal && state.totalGenerated >= options.maxTotal) {
      break;
    }
  }
  
  log('\n═══════════════════════════════════════════════════');
 log('🏁 BATCH GENERATION COMPLETE');
  log('═══════════════════════════════════════════════════');
  log(`Total generated: ${state.totalGenerated}`);
  log(`Total failed: ${state.totalFailed}`);
  log(`Run started: ${state.startedAt}`);
  log(`Last run: ${new Date().toISOString()}`);
  log(`State saved to: ${CONFIG.stateFile}`);
  log(`Log saved to: ${CONFIG.logFile}`);
  
  saveState(state);
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
