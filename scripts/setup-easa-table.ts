/**
 * Setup script: creates aeropilot-easa-objectives table and imports mockLOs.
 * Run: npx tsx scripts/setup-easa-table.ts
 *
 * Credentials: uses Cognito Identity Pool (unauthenticated) — same as app.
 * If CreateTable fails due to permissions, run with AWS_PROFILE or AWS_ACCESS_KEY_ID env vars.
 */

import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand, ResourceInUseException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockLOs } from '../src/services/aiService';

const REGION = 'eu-central-1';
const IDENTITY_POOL_ID = 'eu-central-1:b30b46cc-5882-4d11-ab16-00cc715a793d';
const TABLE_NAME = 'aeropilot-easa-objectives';

async function getClient() {
  // Prefer explicit env credentials (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY or AWS_PROFILE)
  // Fallback to Cognito unauthenticated identity
  const hasEnvCreds = process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE;

  if (hasEnvCreds) {
    console.log('Using env/profile AWS credentials');
    return new DynamoDBClient({ region: REGION });
  }

  console.log('Using Cognito unauthenticated credentials');
  const credentials = fromCognitoIdentityPool({
    client: new CognitoIdentityClient({ region: REGION }),
    identityPoolId: IDENTITY_POOL_ID,
  });
  return new DynamoDBClient({ region: REGION, credentials });
}

async function createTable(client: DynamoDBClient) {
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    console.log(`✅ Table '${TABLE_NAME}' already exists — skipping creation.`);
    return true;
  } catch {
    // Table doesn't exist, create it
  }

  console.log(`Creating table '${TABLE_NAME}'...`);
  try {
    await client.send(new CreateTableCommand({
      TableName: TABLE_NAME,
      KeySchema: [{ AttributeName: 'loId', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'loId', AttributeType: 'S' }],
      BillingMode: 'PAY_PER_REQUEST',
    }));
    console.log('⏳ Waiting for table to become ACTIVE...');
    // Poll until active
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const desc = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
      if (desc.Table?.TableStatus === 'ACTIVE') {
        console.log(`✅ Table '${TABLE_NAME}' is ACTIVE.`);
        return true;
      }
      process.stdout.write('.');
    }
    console.error('Timed out waiting for table to become active.');
    return false;
  } catch (e: any) {
    if (e.name === 'ResourceInUseException') {
      console.log('Table already exists (concurrent create).');
      return true;
    }
    console.error('❌ CreateTable failed:', e.message);
    console.error('   → Create the table manually in AWS Console with partition key: loId (String)');
    return false;
  }
}

async function importLOs(docClient: DynamoDBDocumentClient) {
  const now = new Date().toISOString();
  const items = mockLOs.map(lo => ({
    loId: lo.id,
    text: lo.text,
    knowledgeContent: lo.knowledgeContent || lo.context,
    context: lo.context,
    level: lo.level ?? 2,
    subjectId: lo.subject_id,
    appliesTo: lo.applies_to ?? ['PPL', 'SPL'],
    source: 'mock-import',
    version: '2021',
    approved: false,
    approvedBy: null,
    approvedAt: null,
    createdAt: now,
    updatedAt: now,
  }));

  const BATCH = 25; // DynamoDB batch write limit
  let imported = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    try {
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: chunk.map(item => ({ PutRequest: { Item: item } })),
        },
      }));
      imported += chunk.length;
      process.stdout.write(`\r  Imported ${imported}/${items.length}...`);
    } catch (e: any) {
      console.error(`\n  ❌ Batch ${i}-${i + BATCH} failed:`, e.message);
      failed += chunk.length;
    }
  }

  console.log(`\n✅ Import complete: ${imported} LOs imported, ${failed} failed.`);
}

async function main() {
  console.log('=== EASA LO Table Setup ===');
  console.log(`Target: ${TABLE_NAME} (${REGION})`);
  console.log(`LOs to import: ${mockLOs.length}`);

  const client = await getClient();
  const docClient = DynamoDBDocumentClient.from(client);

  const tableReady = await createTable(client);
  if (!tableReady) {
    process.exit(1);
  }

  await importLOs(docClient);
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
