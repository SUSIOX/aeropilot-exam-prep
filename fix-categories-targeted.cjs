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

async function createDynamoClient() {
    const credentials = fromCognitoIdentityPool({
        client: new CognitoIdentityClient({ region }),
        identityPoolId
    });

    const client = new DynamoDBClient({ region, credentials });
    return DynamoDBDocumentClient.from(client);
}

async function scanAllItemsForSubject(docClient, subjectId) {
    console.log(`🔍 Skenuji Subject ${subjectId}...`);
    
    let items = [];
    let lastEvaluatedKey = null;
    
    do {
        const command = new ScanCommand({
            TableName: tableName,
            FilterExpression: 'subjectId = :sid',
            ExpressionAttributeValues: {
                ':sid': subjectId
            },
            ExclusiveStartKey: lastEvaluatedKey,
            Limit: 1000
        });
        
        try {
            const response = await docClient.send(command);
            
            if (response.Items && Array.isArray(response.Items)) {
                items = items.concat(response.Items);
                console.log(`   Načteno ${items.length} položek pro Subject ${subjectId}...`);
            }
            
            lastEvaluatedKey = response.LastEvaluatedKey;
            
        } catch (error) {
            console.error(`   ❌ Chyba při scanu Subject ${subjectId}: ${error.message}`);
            break;
        }
        
    } while (lastEvaluatedKey);
    
    console.log(`✅ Subject ${subjectId}: ${items.length} položek`);
    return items;
}

async function updateSubjectItems(docClient, items, newSubjectId, stepName) {
    if (items.length === 0) {
        console.log(`✅ Žádné položky k aktualizaci v ${stepName}`);
        return { updatedCount: 0, errorCount: 0 };
    }
    
    console.log(`\n🚀 ${stepName}: ${items.length} položek -> Subject ${newSubjectId}`);
    
    const BATCH_SIZE = 25;
    let updatedCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        
        const updatePromises = batch.map(async (item) => {
            const command = new UpdateCommand({
                TableName: tableName,
                Key: {
                    questionId: item.questionId
                },
                UpdateExpression: 'SET subjectId = :newSubjectId, updatedAt = :updatedAt',
                ExpressionAttributeValues: {
                    ':newSubjectId': newSubjectId,
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
        
        console.log(`   Aktualizováno ${updatedCount}/${items.length} položek...`);
        
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`✅ ${stepName} dokončen! Úspěšně: ${updatedCount}, Chyby: ${errorCount}`);
    return { updatedCount, errorCount };
}

async function main() {
    console.log('=== Cílená oprava kategorií v DynamoDB ===');
    console.log(`Tabulka: ${tableName}`);
    console.log('Postup: 6→67→7, 7→78→8, 8→86→6');
    console.log('');
    
    try {
        const docClient = await createDynamoClient();
        
        // 1. Původní stav
        console.log('📋 PŮVODNÍ STAV:');
        const originalItems6 = await scanAllItemsForSubject(docClient, 6);
        const originalItems7 = await scanAllItemsForSubject(docClient, 7);
        const originalItems8 = await scanAllItemsForSubject(docClient, 8);
        
        console.log(`\n📊 Původní rozdělení:`);
        console.log(`   Subject 6: ${originalItems6.length} položek`);
        console.log(`   Subject 7: ${originalItems7.length} položek`);
        console.log(`   Subject 8: ${originalItems8.length} položek`);
        
        const totalToFix = originalItems6.length + originalItems7.length + originalItems8.length;
        console.log(`   Celkem k opravě: ${totalToFix} položek`);
        
        if (totalToFix === 0) {
            console.log('✅ Žádné položky k opravě!');
            return;
        }
        
        console.log('\n⚠️  PŘIPRAVEN PROVEST OPRAVU!');
        console.log('   6→67→7, 7→78→8, 8→86→6');
        
        // Pro automatizované spuštění - odkomentuj pro manuální potvrzení
        // const readline = require('readline');
        // const rl = readline.createInterface({
        //     input: process.stdin,
        //     output: process.stdout
        // });
        
        // const answer = await new Promise(resolve => {
        //     rl.question('Pokračovat? (ano/ne): ', resolve);
        //     rl.close();
        // });
        
        // if (answer.toLowerCase() !== 'ano') {
        //     console.log('❌ Operace zrušena');
        //     return;
        // }
        
        // 2. Krok 1: Přesun na dočasné kategorie
        console.log('\n🔄 KROK 1: Přesun na dočasné kategorie');
        
        const step1_6 = await updateSubjectItems(docClient, originalItems6, 67, 'Subject 6 -> 67');
        const step1_7 = await updateSubjectItems(docClient, originalItems7, 78, 'Subject 7 -> 78');
        const step1_8 = await updateSubjectItems(docClient, originalItems8, 86, 'Subject 8 -> 86');
        
        console.log(`\n📊 Stav po Kroku 1:`);
        console.log(`   Aktualizováno: ${step1_6.updatedCount + step1_7.updatedCount + step1_8.updatedCount} položek`);
        console.log(`   Chyby: ${step1_6.errorCount + step1_7.errorCount + step1_8.errorCount} položek`);
        
        // 3. Kontrola po Kroku 1
        console.log('\n🔍 KONTROLA PO KROKU 1:');
        const tempItems67 = await scanAllItemsForSubject(docClient, 67);
        const tempItems78 = await scanAllItemsForSubject(docClient, 78);
        const tempItems86 = await scanAllItemsForSubject(docClient, 86);
        
        console.log(`   Subject 67: ${tempItems67.length} položek`);
        console.log(`   Subject 78: ${tempItems78.length} položek`);
        console.log(`   Subject 86: ${tempItems86.length} položek`);
        
        // 4. Krok 2: Přesun na finální kategorie
        console.log('\n🔄 KROK 2: Přesun na finální kategorie');
        
        const step2_67 = await updateSubjectItems(docClient, tempItems67, 7, 'Subject 67 -> 7');
        const step2_78 = await updateSubjectItems(docClient, tempItems78, 8, 'Subject 78 -> 8');
        const step2_86 = await updateSubjectItems(docClient, tempItems86, 6, 'Subject 86 -> 6');
        
        // 5. Finální kontrola
        console.log('\n🔍 FINÁLNÍ KONTROLA:');
        const finalItems6 = await scanAllItemsForSubject(docClient, 6);
        const finalItems7 = await scanAllItemsForSubject(docClient, 7);
        const finalItems8 = await scanAllItemsForSubject(docClient, 8);
        
        console.log(`\n📊 FINÁLNÍ ROZDĚLENÍ:`);
        console.log(`   Subject 6: ${finalItems6.length} položek (původní 8)`);
        console.log(`   Subject 7: ${finalItems7.length} položek (původní 6)`);
        console.log(`   Subject 8: ${finalItems8.length} položek (původní 7)`);
        
        const totalUpdated = step1_6.updatedCount + step1_7.updatedCount + step1_8.updatedCount +
                            step2_67.updatedCount + step2_78.updatedCount + step2_86.updatedCount;
        
        console.log(`\n🎉 OPERACE DOKONČENA!`);
        console.log(`✅ Celkem aktualizováno: ${totalUpdated} položek`);
        
        // 6. Detailní souhrn
        console.log(`\n📋 DETAILNÍ SOUHRN:`);
        console.log(`   Původní 6 (${originalItems6.length}) -> Finální 7 (${finalItems7.length})`);
        console.log(`   Původní 7 (${originalItems7.length}) -> Finální 8 (${finalItems8.length})`);
        console.log(`   Původní 8 (${originalItems8.length}) -> Finální 6 (${finalItems6.length})`);
        
        if (finalItems7.length === originalItems6.length && 
            finalItems8.length === originalItems7.length && 
            finalItems6.length === originalItems8.length) {
            console.log(`\n✅ VŠE V POŘÁDKU! Mapování je správné.`);
        } else {
            console.log(`\n⚠️  POZOR! Něco není v pořádku s mapováním.`);
        }
        
    } catch (error) {
        console.error('❌ Chyba:', error.message);
        process.exit(1);
    }
}

// Spuštění
main().catch(console.error);
