// Import questions from JSON files to DynamoDB aeropilot-questions table
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const region = process.env.AWS_REGION || 'eu-central-1';
const identityPoolId = process.env.COGNITO_IDENTITY_POOL_ID!;

const credentials = fromCognitoIdentityPool({
  client: new CognitoIdentityClient({ region }),
  identityPoolId
});

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region, credentials }));
const TABLE_NAME = 'aeropilot-questions';

interface RawQuestion {
  id: number;
  question: string;
  answers: string[];
  correct: number;
  explanation?: string;
  lo_id?: string;
}

// Load all subject JSON files
function loadAllQuestions(): { question: any; subjectId: number }[] {
  const all: { question: any; subjectId: number }[] = [];

  for (let i = 1; i <= 9; i++) {
    const filePath = join(ROOT, `subject_${i}.json`);
    try {
      const raw: RawQuestion[] = JSON.parse(readFileSync(filePath, 'utf-8'));
      raw.forEach(q => all.push({ question: q, subjectId: i }));
      console.log(`📂 subject_${i}.json: ${raw.length} otázek`);
    } catch (e) {
      console.warn(`⚠️  subject_${i}.json nenalezen, přeskakuji`);
    }
  }

  return all;
}

// Convert raw question to DynamoDB item
function toItem(q: RawQuestion, subjectId: number) {
  const optionKeys = ['A', 'B', 'C', 'D'];
  return {
    questionId: `subject${subjectId}_q${q.id}`,
    subjectId,
    originalId: q.id,
    question: q.question,
    answers: q.answers,
    correct: q.correct,
    correctOption: optionKeys[q.correct] || 'A',
    explanation: q.explanation || null,
    loId: q.lo_id || null,
    source: 'user',           // označeno jako user-submitted
    createdAt: new Date().toISOString(),
    createdBy: 'import_script'
  };
}

// BatchWrite in chunks of 25 (DynamoDB limit)
async function batchWrite(items: any[]) {
  const CHUNK = 25;
  let written = 0;

  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const requests = chunk.map(item => ({ PutRequest: { Item: item } }));

    try {
      await docClient.send(new BatchWriteCommand({
        RequestItems: { [TABLE_NAME]: requests }
      }));
      written += chunk.length;
      process.stdout.write(`\r✏️  Zapsáno: ${written}/${items.length}`);
    } catch (e: any) {
      console.error(`\n❌ Chyba při zápisu chunk ${i}-${i + CHUNK}:`, e.message);
    }
  }

  console.log('');
}

async function main() {
  console.log('='.repeat(55));
  console.log('IMPORT OTÁZEK DO DYNAMODB');
  console.log('='.repeat(55));
  console.log(`Tabulka: ${TABLE_NAME}`);
  console.log('');

  const all = loadAllQuestions();
  console.log(`\nCelkem nalezeno: ${all.length} otázek\n`);

  const items = all.map(({ question, subjectId }) => toItem(question, subjectId));

  console.log('Zahajuji zápis do DynamoDB...');
  await batchWrite(items);

  console.log(`\n✅ Import dokončen! ${items.length} otázek uloženo.`);
  console.log(`   Tabulka: ${TABLE_NAME}`);
  console.log(`   source: "user" (označeno jako user-submitted)`);
}

main().catch(e => {
  console.error('❌ Import selhal:', e.message);
  process.exit(1);
});
