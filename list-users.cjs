#!/usr/bin/env node
/**
 * Skript pro načtení všech registrovaných uživatelů z DynamoDB
 * Pouze zobrazí uživatele v konzoli, neukládá do souboru
 */

const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand: DocScanCommand } = require('@aws-sdk/lib-dynamodb');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Konfigurace
const REGION = 'eu-central-1';
const TABLE_PREFIX = 'aeropilot-';
const USERS_TABLE = `${TABLE_PREFIX}users`;

async function getCredentials() {
  // Zkusíme načíst z .env souboru
  const fs = require('fs');
  const path = require('path');
  
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    const env = {};
    for (const line of lines) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        env[match[1]] = match[2].trim();
      }
    }
    return env;
  }
  return {};
}

async function listAllUsers() {
  console.log('🔍 Načítám uživatele z DynamoDB...\n');
  
  const env = await getCredentials();
  
  // Konfigurace klienta
  const config = {
    region: REGION,
  };
  
  // Pokud máme AWS credentials v env
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY
    };
    console.log('✅ Používám credentials z .env souboru');
  } else {
    console.log('⚠️  AWS credentials nenalezeny v .env, zkouším defaultní AWS profil...');
  }
  
  const client = new DynamoDBClient(config);
  const docClient = DynamoDBDocumentClient.from(client);
  
  const users = [];
  let lastKey = undefined;
  let scannedCount = 0;
  
  try {
    do {
      const command = new DocScanCommand({
        TableName: USERS_TABLE,
        Limit: 100,
        ExclusiveStartKey: lastKey
      });
      
      const result = await docClient.send(command);
      
      if (result.Items) {
        users.push(...result.Items);
        scannedCount += result.ScannedCount || 0;
      }
      
      lastKey = result.LastEvaluatedKey;
      
      if (lastKey) {
        console.log(`⏳ Načteno ${users.length} uživatelů... (pokračuji)`);
      }
      
    } while (lastKey);
    
    console.log('\n' + '='.repeat(80));
    console.log(`📊 CELKOVÝ POČET UŽIVATELŮ: ${users.length}`);
    console.log('='.repeat(80) + '\n');
    
    // Zobrazení uživatelů
    users.forEach((user, index) => {
      const userId = user.userId || user.PK || 'N/A';
      const email = user.email || user.userEmail || 'N/A';
      const createdAt = user.createdAt || 'N/A';
      const updatedAt = user.updatedAt || 'N/A';
      const flags = user.flags ? Object.keys(user.flags).length : 0;
      const settings = user.settings ? '✓' : '✗';
      
      console.log(`${(index + 1).toString().padStart(3)}. ${userId}`);
      console.log(`    Email: ${email}`);
      console.log(`    Vytvořen: ${createdAt}`);
      console.log(`    Aktualizován: ${updatedAt}`);
      console.log(`    Nastavení: ${settings} | Příznaky: ${flags}`);
      console.log('-'.repeat(60));
    });
    
    // Statistika
    const withEmail = users.filter(u => u.email || u.userEmail).length;
    const withSettings = users.filter(u => u.settings).length;
    const withFlags = users.filter(u => u.flags && Object.keys(u.flags).length > 0).length;
    
    console.log('\n' + '='.repeat(80));
    console.log('📈 STATISTIKA:');
    console.log(`   • S emailovou adresou: ${withEmail}/${users.length}`);
    console.log(`   • S nastavením: ${withSettings}/${users.length}`);
    console.log(`   • S příznaky (flags): ${withFlags}/${users.length}`);
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ Chyba při načítání uživatelů:', error.message);
    if (error.name === 'ResourceNotFoundException') {
      console.error(`   Tabulka ${USERS_TABLE} neexistuje!`);
    } else if (error.name === 'UnrecognizedClientException') {
      console.error('   Neplatné AWS credentials!');
    }
    process.exit(1);
  }
}

// Hlavní spuštění
listAllUsers().then(() => {
  console.log('\n✅ Hotovo');
  rl.close();
}).catch(err => {
  console.error('❌ Chyba:', err);
  rl.close();
  process.exit(1);
});
