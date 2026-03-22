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
    console.log('🔍 Skenování všech položek...');
    
    let items = [];
    let lastEvaluatedKey = null;
    let scanCount = 0;
    
    do {
        const command = new ScanCommand({
            TableName: tableName,
            ExclusiveStartKey: lastEvaluatedKey,
            Limit: 1000  // Omezení pro jednu dávku
        });
        
        try {
            const response = await docClient.send(command);
            
            if (response.Items && Array.isArray(response.Items)) {
                items = items.concat(response.Items);
                console.log(`   Načteno ${items.length} položek...`);
            }
            
            lastEvaluatedKey = response.LastEvaluatedKey;
            scanCount++;
            
            // Ochrana proti nekonečné smyčce
            if (scanCount > 100) {
                console.log('   ⚠️  Překročen limit scanů, přerušuji');
                break;
            }
            
        } catch (error) {
            console.error(`   ❌ Chyba při scanu: ${error.message}`);
            break;
        }
        
    } while (lastEvaluatedKey);
    
    console.log(`✅ Celkem načteno ${items.length} položek`);
    return items;
}

async function analyzeAndFix() {
    console.log('=== Oprava kategorií v DynamoDB ===');
    console.log(`Tabulka: ${tableName}`);
    console.log('Postup: 6→67→7, 7→78→8, 8→86→6');
    console.log('');
    
    try {
        const docClient = await createDynamoClient();
        
        // 1. Načtení všech položek
        console.log('📋 Krok 1: Načítání dat');
        const allItems = await scanAllItems(docClient);
        
        if (allItems.length === 0) {
            console.log('❌ Žádné položky v tabulce!');
            return;
        }
        
        // 2. Analýza původního stavu
        console.log('\n📊 Původní stav:');
        const originalDistribution = {};
        for (const item of allItems) {
            if (item && item.subjectId) {
                originalDistribution[item.subjectId] = (originalDistribution[item.subjectId] || 0) + 1;
            }
        }
        
        for (const [id, count] of Object.entries(originalDistribution).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
            console.log(`   Subject ${id}: ${count} položek`);
        }
        
        // 3. Analýza položek k opravě (Krok 1)
        console.log('\n📊 Položky k opravě (Krok 1):');
        const step1Items = [];
        const step1Counts = {};
        
        for (const item of allItems) {
            if (item && item.subjectId && step1Mapping[item.subjectId]) {
                step1Items.push({
                    ...item,
                    newSubjectId: step1Mapping[item.subjectId],
                    originalSubjectId: item.subjectId
                });
                
                step1Counts[item.subjectId] = (step1Counts[item.subjectId] || 0) + 1;
            }
        }
        
        for (const [oldId, newId] of Object.entries(step1Mapping)) {
            console.log(`   Subject ${oldId} -> ${newId}: ${step1Counts[oldId] || 0} položek`);
        }
        console.log(`   Celkem k úpravě: ${step1Items.length} položek`);
        
        if (step1Items.length === 0) {
            console.log('✅ Žádné položky k opravě!');
            return;
        }
        
        // 4. Provedení Kroku 1
        console.log('\n🚀 Provádím Krok 1: 6→67, 7→78, 8→86');
        
        const BATCH_SIZE = 25;
        let updatedCount = 0;
        
        for (let i = 0; i < step1Items.length; i += BATCH_SIZE) {
            const batch = step1Items.slice(i, i + BATCH_SIZE);
            
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
            
            console.log(`   Aktualizováno ${updatedCount}/${step1Items.length} položek...`);
            
            // Malá pauza
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log(`\n✅ Krok 1 dokončen! Aktualizováno: ${updatedCount}/${step1Items.length} položek`);
        
        // 5. Analýza položek k opravě (Krok 2)
        console.log('\n📊 Položky k opravě (Krok 2):');
        
        // Znovu načteme data pro aktuální stav
        const currentItems = await scanAllItems(docClient);
        const step2Items = [];
        const step2Counts = {};
        
        for (const item of currentItems) {
            if (item && item.subjectId && step2Mapping[item.subjectId]) {
                step2Items.push({
                    ...item,
                    newSubjectId: step2Mapping[item.subjectId],
                    originalSubjectId: item.subjectId
                });
                
                step2Counts[item.subjectId] = (step2Counts[item.subjectId] || 0) + 1;
            }
        }
        
        for (const [oldId, newId] of Object.entries(step2Mapping)) {
            console.log(`   Subject ${oldId} -> ${newId}: ${step2Counts[oldId] || 0} položek`);
        }
        console.log(`   Celkem k úpravě: ${step2Items.length} položek`);
        
        // 6. Provedení Kroku 2
        console.log('\n🚀 Provádím Krok 2: 67→7, 78→8, 86→6');
        
        let updatedCount2 = 0;
        
        for (let i = 0; i < step2Items.length; i += BATCH_SIZE) {
            const batch = step2Items.slice(i, i + BATCH_SIZE);
            
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
            updatedCount2 += successCount;
            
            console.log(`   Aktualizováno ${updatedCount2}/${step2Items.length} položek...`);
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log(`\n✅ Krok 2 dokončen! Aktualizováno: ${updatedCount2}/${step2Items.length} položek`);
        
        // 7. Finální verifikace
        console.log('\n📋 Finální stav:');
        const finalItems = await scanAllItems(docClient);
        const finalDistribution = {};
        
        for (const item of finalItems) {
            if (item && item.subjectId) {
                finalDistribution[item.subjectId] = (finalDistribution[item.subjectId] || 0) + 1;
            }
        }
        
        for (const [id, count] of Object.entries(finalDistribution).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
            console.log(`   Subject ${id}: ${count} položek`);
        }
        
        console.log('\n🎉 VŠE DOKONČENO!');
        console.log(`✅ Celkem aktualizováno: ${updatedCount + updatedCount2} položek`);
        
    } catch (error) {
        console.error('❌ Chyba:', error.message);
        process.exit(1);
    }
}

// Spuštění
analyzeAndFix().catch(console.error);
