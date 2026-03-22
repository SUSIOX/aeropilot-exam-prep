/**
 * LO Generator for PPL(A) + SPL
 * 1. Generates LOs via DeepSeek (OpenRouter) → saves to JSON
 * 2. Compares with aeropilot-easa-objectives table
 * 3. Inserts only missing LOs
 *
 * Run: npx tsx lo-generator/generate-los.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { SYLLABUS, SyllabusSubject } from './easa-syllabus.js';

dotenv.config();

// ── Config ────────────────────────────────────────────────────────────────────

const REGION       = 'eu-central-1';
const TABLE_NAME   = 'aeropilot-easa-objectives';
const OUTPUT_DIR   = path.join(process.cwd(), 'lo-generator', 'output');
const MERGED_FILE  = path.join(OUTPUT_DIR, 'all-los.json');
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL        = 'deepseek/deepseek-chat';
const DELAY_MS     = 2000; // mezi voláními API

// ── Types ─────────────────────────────────────────────────────────────────────

interface GeneratedLO {
  loId: string;        // "010.01.01.01"
  subjectId: number;
  text: string;        // krátký název
  knowledgeContent: string; // obsah pro generování otázek
  appliesTo: string[]; // ['PPL', 'SPL']
  level: 1 | 2 | 3;
  version: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toLocaleTimeString('cs-CZ');
  console.log(`[${ts}] ${msg}`);
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function subjectFile(subject: SyllabusSubject): string {
  return path.join(OUTPUT_DIR, `subject-${subject.code}.json`);
}

// ── DeepSeek API call ─────────────────────────────────────────────────────────

async function callDeepSeek(prompt: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY není nastaven v .env');

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://aeropilot.app',
      'X-Title': 'AeroPilot LO Generator',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

// ── Generate LOs for one subject ──────────────────────────────────────────────

async function generateSubjectLOs(subject: SyllabusSubject): Promise<GeneratedLO[]> {
  const prompt = `You are an EASA aviation syllabus expert. Generate a COMPLETE list of Learning Objectives (LOs) for the EASA PPL(A) and SPL knowledge test subject:

Subject: ${subject.code} - ${subject.name}
Applies to: ${subject.appliesTo.join(', ')}
Target count: approximately ${subject.expectedLOs} LOs

Rules:
- Use EASA loId format: ${subject.code}.XX.XX.XX (e.g. ${subject.code}.01.01.01)
- Cover ALL topics from the official EASA PPL syllabus for this subject
- Each LO must have a short "text" (title) and "knowledgeContent" (2-4 sentences describing what the student must know)
- level: 1=Awareness, 2=Knowledge, 3=Understanding
- Be thorough - include every subtopic a PPL/SPL student needs to know

Respond with ONLY a valid JSON array, no markdown, no explanation:
[
  {
    "loId": "${subject.code}.01.01.01",
    "text": "Short LO title",
    "knowledgeContent": "Detailed content description for question generation.",
    "level": 2
  },
  ...
]`;

  log(`  📡 Volám DeepSeek pro ${subject.code} ${subject.name}...`);
  const raw = await callDeepSeek(prompt);

  // Extrahuj JSON array
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`Nepodařilo se parsovat JSON pro ${subject.code}:\n${raw.slice(0, 200)}`);

  const parsed: any[] = JSON.parse(match[0]);
  const now = new Date().toISOString();

  return parsed.map(item => ({
    loId: item.loId,
    subjectId: subject.id,
    text: item.text,
    knowledgeContent: item.knowledgeContent,
    appliesTo: subject.appliesTo,
    level: item.level ?? 2,
    version: '2021',
    source: 'deepseek-generated',
    createdAt: now,
    updatedAt: now,
  }));
}

// ── Phase 1: Generate & save to JSON ─────────────────────────────────────────

async function phase1_generate(): Promise<GeneratedLO[]> {
  ensureOutputDir();
  const allLOs: GeneratedLO[] = [];

  log('═══════════════════════════════════════════');
  log('FÁZE 1: Generování LOs přes DeepSeek');
  log('═══════════════════════════════════════════');

  for (const subject of SYLLABUS) {
    const file = subjectFile(subject);

    // Přeskoč pokud už existuje
    if (fs.existsSync(file)) {
      const cached: GeneratedLO[] = JSON.parse(fs.readFileSync(file, 'utf-8'));
      log(`  ✅ ${subject.code} ${subject.name} — načteno z cache (${cached.length} LOs)`);
      allLOs.push(...cached);
      continue;
    }

    try {
      const los = await generateSubjectLOs(subject);
      fs.writeFileSync(file, JSON.stringify(los, null, 2));
      log(`  ✅ ${subject.code} ${subject.name} — vygenerováno ${los.length} LOs → ${path.basename(file)}`);
      allLOs.push(...los);
    } catch (e: any) {
      log(`  ❌ ${subject.code} CHYBA: ${e.message}`);
    }

    await sleep(DELAY_MS);
  }

  // Ulož merged soubor
  fs.writeFileSync(MERGED_FILE, JSON.stringify(allLOs, null, 2));
  log(`\n📁 Celkem vygenerováno: ${allLOs.length} LOs → ${MERGED_FILE}`);

  return allLOs;
}

// ── Phase 2: Compare with DB ──────────────────────────────────────────────────

async function phase2_compare(
  generated: GeneratedLO[],
  docClient: DynamoDBDocumentClient
): Promise<{ missing: GeneratedLO[]; existing: Set<string> }> {
  log('\n═══════════════════════════════════════════');
  log('FÁZE 2: Porovnání s databází');
  log('═══════════════════════════════════════════');

  log(`  📡 Scanuji tabulku ${TABLE_NAME}...`);

  const existing = new Set<string>();
  let lastKey: Record<string, any> | undefined;

  do {
    const result = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      ExclusiveStartKey: lastKey,
      ProjectionExpression: 'loId',
    }));
    for (const item of result.Items ?? []) {
      if (item.loId) existing.add(item.loId);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  log(`  📊 V databázi: ${existing.size} LOs`);
  log(`  📊 Vygenerováno: ${generated.length} LOs`);

  const missing = generated.filter(lo => !existing.has(lo.loId));
  log(`  🔍 Chybí v DB: ${missing.length} LOs`);

  // Přehled po subjects
  for (const subject of SYLLABUS) {
    const gen = generated.filter(l => l.subjectId === subject.id).length;
    const inDb = generated.filter(l => l.subjectId === subject.id && existing.has(l.loId)).length;
    const miss = gen - inDb;
    const status = miss === 0 ? '✅' : '⚠️ ';
    log(`  ${status} ${subject.code} ${subject.name}: DB=${inDb}/${gen} (chybí ${miss})`);
  }

  return { missing, existing };
}

// ── Phase 3: Insert missing LOs ───────────────────────────────────────────────

async function phase3_insert(
  missing: GeneratedLO[],
  docClient: DynamoDBDocumentClient
): Promise<void> {
  log('\n═══════════════════════════════════════════');
  log(`FÁZE 3: Vkládání ${missing.length} chybějících LOs`);
  log('═══════════════════════════════════════════');

  if (missing.length === 0) {
    log('  ✅ Databáze je kompletní, nic k vložení.');
    return;
  }

  let inserted = 0;
  let failed = 0;

  for (const lo of missing) {
    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: lo,
        ConditionExpression: 'attribute_not_exists(loId)', // nepřepisuj existující
      }));
      inserted++;
      process.stdout.write(`\r  Vloženo: ${inserted}/${missing.length} (chyby: ${failed})...`);
    } catch (e: any) {
      if (e.name === 'ConditionalCheckFailedException') {
        // Už existuje - OK
        inserted++;
      } else {
        failed++;
        log(`\n  ❌ ${lo.loId}: ${e.message}`);
      }
    }

    // Malý delay aby se nepřekročil DynamoDB throughput
    if (inserted % 10 === 0) await sleep(100);
  }

  log(`\n  ✅ Hotovo: ${inserted} vloženo, ${failed} chyb`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.clear();
  log('🛩️  AeroPilot LO Generator — PPL(A) + SPL');
  log('==========================================\n');

  // DynamoDB client
  const client = new DynamoDBClient({ region: REGION });
  const docClient = DynamoDBDocumentClient.from(client);

  // Fáze 1 — generování
  const generated = await phase1_generate();

  if (generated.length === 0) {
    log('\n❌ Žádné LOs nebyly vygenerovány. Zkontroluj DEEPSEEK_API_KEY.');
    process.exit(1);
  }

  // Fáze 2 — porovnání
  const { missing } = await phase2_compare(generated, docClient);

  // Fáze 3 — vložení
  await phase3_insert(missing, docClient);

  log('\n🏁 Hotovo!');
  log(`📁 JSON výstup: ${OUTPUT_DIR}`);
  log(`📊 Celkem LOs v generátoru: ${generated.length}`);
}

main().catch(e => {
  console.error('\n💥 Fatální chyba:', e.message);
  process.exit(1);
});
