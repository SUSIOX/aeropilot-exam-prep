// Načtení .env
require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { CognitoIdentityClient } = require('@aws-sdk/client-cognito-identity');
const { fromCognitoIdentityPool } = require('@aws-sdk/credential-provider-cognito-identity');

// Konfigurace
const region = process.env.AWS_REGION || 'eu-central-1';
const identityPoolId = process.env.COGNITO_IDENTITY_POOL_ID;
const tableName = 'aeropilot-questions';

// Mapování přesunů
const step1Mapping = {
    6: 67,  // Subject 6 -> 67 (dočasná)
    7: 78,  // Subject 7 -> 78 (dočasná)
    8: 86   // Subject 8 -> 86 (dočasná)
};

const step2Mapping = {
    67: 7,  // 67 -> 7 (původní 6 jde na 7)
    78: 8,  // 78 -> 8 (původní 7 jde na 8)
    86: 6   // 86 -> 6 (původní 8 jde na 6)
};

async function createDynamoClient() {
    const credentials = fromCognitoIdentityPool({
        client: new CognitoIdentityClient({ region }),
        identityPoolId
    });

    const client = new DynamoDBClient({ region, credentials });
    return DynamoDBDocumentClient.from(client);
}

async function scanAllItems(docClient) {
    console.log('🔍 Skenování všech položek v tabulce...');
    
    let items = [];
    let lastEvaluatedKey = null;
    
    do {
        const command = new ScanCommand({
            TableName: tableName,
            ExclusiveStartKey: lastEvaluatedKey
        });
        
        const response = await docClient.send(command);
        items = items.concat(response.Items);
        lastEvaluatedKey = response.LastEvaluatedKey;
        
        console.log(`   Načteno ${items.length} položek...`);
        
    } while (lastEvaluatedKey);
    
    console.log(`✅ Celkem načteno ${items.length} položek`);
    return items;
}

async function analyzeItems(items, mapping, stepName) {
    console.log(`\n📊 Analýza pro ${stepName}:`);
    
    const itemsToUpdate = [];
    const counts = {};
    
    for (const item of items) {
        if (item.subjectId && mapping[item.subjectId]) {
            itemsToUpdate.push({
                ...item,
                newSubjectId: mapping[item.subjectId],
                originalSubjectId: item.subjectId
            });
            
            counts[item.subjectId] = (counts[item.subjectId] || 0) + 1;
        }
    }
    
    console.log(`   Položky k úpravě:`);
    for (const [oldId, newId] of Object.entries(mapping)) {
        console.log(`   Subject ${oldId} -> ${newId}: ${counts[oldId] || 0} položek`);
    }
    console.log(`   Celkem: ${itemsToUpdate.length} položek`);
    
    return itemsToUpdate;
}

async function updateItems(docClient, itemsToUpdate, stepName) {
    if (itemsToUpdate.length === 0) {
        console.log(`✅ Žádné položky k úpravě v ${stepName}`);
        return;
    }
    
    console.log(`\n🚀 Provádím ${stepName}...`);
    
    const BATCH_SIZE = 25;
    let updatedCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < itemsToUpdate.length; i += BATCH_SIZE) {
        const batch = itemsToUpdate.slice(i, i + BATCH_SIZE);
        
        const updatePromises = batch.map(async (item) => {
            const command = new UpdateCommand({
                TableName: tableName,
                Key: {
                    questionId: item.questionId
                },
                UpdateExpression: 'SET subjectId = :newSubjectId, updatedAt = :updatedAt',
                ExpressionAttributeValues: {
                    ':newSubjectId': item.newSubjectId,
                    ':updatedAt': new Date().toISOString()
                },
                ReturnValues: 'UPDATED_NEW'
            });
            
            try {
                await docClient.send(command);
                return { success: true, questionId: item.questionId };
            } catch (error) {
                console.error(`❌ Chyba při aktualizaci ${item.questionId}:`, error.message);
                return { success: false, questionId: item.questionId, error: error.message };
            }
        });
        
        const results = await Promise.all(updatePromises);
        const successCount = results.filter(r => r.success).length;
        updatedCount += successCount;
        errorCount += results.filter(r => !r.success).length;
        
        console.log(`   Aktualizováno ${updatedCount}/${itemsToUpdate.length} položek...`);
        
        // Malá pauza pro vyhnutí se rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n✅ ${stepName} dokončeno!`);
    console.log(`   Úspěšně aktualizováno: ${updatedCount} položek`);
    if (errorCount > 0) {
        console.log(`   Chyby: ${errorCount} položek`);
    }
    
    return { updatedCount, errorCount };
}

async function verifyDistribution(docClient, stepName) {
    console.log(`\n🔍 Verifikace rozdělení po ${stepName}:`);
    
    try {
        const items = await scanAllItems(docClient);
        const distribution = {};
        
        for (const item of items) {
            if (item && item.subjectId) {
                distribution[item.subjectId] = (distribution[item.subjectId] || 0) + 1;
            }
        }
        
        console.log('   Aktuální rozdělení:');
        const sortedIds = Object.keys(distribution).sort((a, b) => parseInt(a) - parseInt(b));
        for (const id of sortedIds) {
            console.log(`   Subject ${id}: ${distribution[id]} položek`);
        }
        
        return distribution;
    } catch (error) {
        console.error(`❌ Chyba ve verifikaci: ${error.message}`);
        return {};
    }
}

async function main() {
    console.log('=== Oprava kategorií v DynamoDB (bezpečný postup) ===');
    console.log(`Tabulka: ${tableName}`);
    console.log('Postup: 6→67→7, 7→78→8, 8→86→6');
    console.log('');
    
    try {
        const docClient = await createDynamoClient();
        
        // 1. Původní stav
        console.log('📋 PŮVODNÍ STAV:');
        await verifyDistribution(docClient, 'začátku');
        
        // 2. Analýza kroku 1
        const allItems = await scanAllItems(docClient);
        const step1Items = await analyzeItems(allItems, step1Mapping, 'Krok 1 (dočasné kategorie)');
        
        if (step1Items.length === 0) {
            console.log('✅ Žádné položky k opravě!');
            return;
        }
        
        console.log('\n⚠️  PŘIPRAVEN PROVEST KROK 1? (ano/ne)');
        console.log('   Změna: 6→67, 7→78, 8→86');
        
        // Pro automatizované spuštění - odkomentuj
        // const readline = require('readline');
        // const rl = readline.createInterface({
        //     input: process.stdin,
        //     output: process.stdout
        // });
        
        // const answer = await new Promise(resolve => {
        //     rl.question('', resolve);
        //     rl.close();
        // });
        
        // if (answer.toLowerCase() !== 'ano') {
        //     console.log('❌ Operace zrušena');
        //     return;
        // }
        
        console.log('🚀 PROVÁDÍM KROK 1...');
        await updateItems(docClient, step1Items, 'Krok 1');
        await verifyDistribution(docClient, 'Kroku 1');
        
        // 3. Analýza kroku 2
        const step2Items = await analyzeItems(allItems, step2Mapping, 'Krok 2 (finální kategorie)');
        
        console.log('\n⚠️  PŘIPRAVEN PROVEST KROK 2? (ano/ne)');
        console.log('   Změna: 67→7, 78→8, 86→6');
        
        // Pro automatizované spuštění - odkomentuj
        // const answer2 = await new Promise(resolve => {
        //     rl.question('', resolve);
        // });
        
        // if (answer2.toLowerCase() !== 'ano') {
        //     console.log('❌ Krok 2 zrušen, ale Krok 1 již proběhl!');
        //     return;
        // }
        
        console.log('🚀 PROVÁDÍM KROK 2...');
        await updateItems(docClient, step2Items, 'Krok 2');
        
        // 4. Finální verifikace
        console.log('\n📋 FINÁLNÍ STAV:');
        await verifyDistribution(docClient, 'konce');
        
        console.log('\n✅ VŠE DOKONČENO!');
        
    } catch (error) {
        console.error('❌ Chyba:', error.message);
        process.exit(1);
    }
}

// Spuštění
main().catch(console.error);
