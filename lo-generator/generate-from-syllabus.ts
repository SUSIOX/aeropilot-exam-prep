/**
 * Targeted LO Generator - uses exact LO IDs from ECQB PDF syllabus
 * Generates knowledgeContent for each LO via DeepSeek
 * Run: npx tsx lo-generator/generate-from-syllabus.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config(); // root (pokud spusten z root)
dotenv.config({ path: path.join(__dirname, '..', '.env') }); // parent dir

const REGION     = 'eu-central-1';
const TABLE_NAME = 'aeropilot-easa-objectives';
const SYLLABUS_FILE = '/tmp/syllabus_los.json';
const OUTPUT_DIR = path.join(__dirname, 'output');  // lo-generator/output
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL      = 'deepseek/deepseek-chat';
const BATCH_SIZE = 10; // LOs per API call (free tier limit)
const DELAY_MS   = 1500;

interface SyllabusLO { loId: string; text: string; }
interface GeneratedLO {
  loId: string; subjectId: number; text: string;
  knowledgeContent: string; appliesTo: string[];
  level: number; version: string; source: string;
  createdAt: string; updatedAt: string;
}

const SUBJECT_MAP: Record<string, { id: number; name: string }> = {
  ALW: { id: 1,  name: 'Air Law' },
  HPL: { id: 2,  name: 'Human Performance' },
  MET: { id: 3,  name: 'Meteorology' },
  COM: { id: 9,  name: 'Communications' },
  PFA: { id: 5,  name: 'Principles of Flight' },
  FPP: { id: 3,  name: 'Flight Performance and Planning' },
  AGK: { id: 7,  name: 'Aircraft General Knowledge' },
  NAV: { id: 6,  name: 'Navigation' },
  OPR: { id: 8,  name: 'Operational Procedures' },
};

// Override subject IDs to match our DB structure
const SUBJECT_ID_MAP: Record<string, number> = {
  ALW: 1, HPL: 2, MET: 3, COM: 4, PFA: 5, FPP: 6, AGK: 7, OPR: 8, NAV: 9,
};

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function log(msg: string) { console.log(`[${new Date().toLocaleTimeString('cs-CZ')}] ${msg}`); }

async function callDeepSeek(prompt: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY neni nastaven');
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
      temperature: 0.2,
      max_tokens: 1500,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

async function generateBatch(
  group: string, los: SyllabusLO[], subjectId: number
): Promise<GeneratedLO[]> {
  const loList = los.map(lo => `{"loId":"${lo.loId}","text":${JSON.stringify(lo.text)}}`).join(',\n');

  const prompt = `You are an EASA PPL aviation knowledge expert.
For each Learning Objective below, write a "knowledgeContent" field: 2-4 sentences describing exactly what a PPL(A) student must know for this LO.
Be specific, technical, and accurate per EASA standards.

Input LOs (subject: ${group}):
[${loList}]

Respond with ONLY a valid JSON array with the same loIds plus knowledgeContent and level (1-3):
[{"loId":"...","knowledgeContent":"...","level":2},...]`;

  const raw = await callDeepSeek(prompt);
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`Cannot parse JSON for batch ${los[0].loId}`);

  const parsed: any[] = JSON.parse(match[0]);
  const now = new Date().toISOString();
  const loMap = new Map(los.map(l => [l.loId, l.text]));

  return parsed.map(item => ({
    loId: item.loId,
    subjectId,
    text: loMap.get(item.loId) ?? item.loId,
    knowledgeContent: item.knowledgeContent ?? '',
    appliesTo: ['PPL', 'SPL'],
    level: item.level ?? 2,
    version: '2021',
    source: 'ecqb-syllabus-v23.1',
    createdAt: now,
    updatedAt: now,
  }));
}

async function getExistingLoIds(docClient: DynamoDBDocumentClient): Promise<Set<string>> {
  const existing = new Set<string>();
  let lastKey: any;
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
  return existing;
}

async function main() {
  log('🛩️  Targeted LO Generator — z ECQB PDF syllabu');
  log('================================================\n');

  const syllabus: Record<string, [string, string][]> = JSON.parse(fs.readFileSync(SYLLABUS_FILE, 'utf-8'));
  const client = new DynamoDBClient({ region: REGION });
  const docClient = DynamoDBDocumentClient.from(client);

  log('📡 Nacitam existujici LOs z DB...');
  const existing = await getExistingLoIds(docClient);
  log(`   V DB: ${existing.size} LOs\n`);

  // Zpracuj kazdy subject
  const groups = ['COM'];

  for (const group of groups) {
    const rawLos = syllabus[group] ?? [];
    const subjectId = SUBJECT_ID_MAP[group];
    const cacheFile = path.join(OUTPUT_DIR, `syllabus-${group.toLowerCase()}.json`);

    // Filtruj jen chybejici
    const missing = rawLos
      .map(([loId, text]) => ({ loId, text }))
      .filter(lo => !existing.has(lo.loId));

    if (missing.length === 0) {
      log(`✅ ${group}: vse v DB (${rawLos.length} LOs)`);
      continue;
    }

    log(`⚙️  ${group}: ${missing.length} chybejicich z ${rawLos.length} celkem`);

    // Nacti cache pokud existuje
    let cached: GeneratedLO[] = [];
    if (fs.existsSync(cacheFile)) {
      cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      log(`   Cache: ${cached.length} LOs`);
    }
    const cachedIds = new Set(cached.map(l => l.loId));
    const toGenerate = missing.filter(lo => !cachedIds.has(lo.loId));

    // Generuj po davkach
    if (toGenerate.length > 0) {
      log(`   Generuji ${toGenerate.length} LOs po davkach ${BATCH_SIZE}...`);
      for (let i = 0; i < toGenerate.length; i += BATCH_SIZE) {
        const batch = toGenerate.slice(i, i + BATCH_SIZE);
        try {
          const generated = await generateBatch(group, batch, subjectId);
          cached.push(...generated);
          fs.writeFileSync(cacheFile, JSON.stringify(cached, null, 2));
          process.stdout.write(`\r   Vygenerovano: ${Math.min(i + BATCH_SIZE, toGenerate.length)}/${toGenerate.length}`);
          await sleep(DELAY_MS);
        } catch (e: any) {
          log(`\n   ❌ Chyba v davce ${i}: ${e.message}`);
          await sleep(3000);
        }
      }
      console.log();
    }

    // Vloz do DB
    const toInsert = cached.filter(lo => !existing.has(lo.loId));
    log(`   Vkladam ${toInsert.length} LOs do DB...`);
    let inserted = 0, failed = 0;
    for (const lo of toInsert) {
      try {
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: lo,
          ConditionExpression: 'attribute_not_exists(loId)',
        }));
        existing.add(lo.loId);
        inserted++;
      } catch (e: any) {
        if (e.name === 'ConditionalCheckFailedException') {
          existing.add(lo.loId);
          inserted++;
        } else {
          failed++;
        }
      }
      if (inserted % 10 === 0) await sleep(100);
    }
    log(`   ✅ ${group}: ${inserted} vlozeno, ${failed} chyb\n`);
  }

  log('🏁 Hotovo!');
  log(`📊 DB nyni obsahuje: ${existing.size} LOs`);
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
