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

async function scanAllItems(docClient) {
    console.log('🔍 Skenuji všechny položky...');
    
    let items = [];
    let lastEvaluatedKey = null;
    let scanCount = 0;
    
    do {
        const command = new ScanCommand({
            TableName: tableName,
            ExclusiveStartKey: lastEvaluatedKey,
            Limit: 1000
        });
        
        try {
            const response = await docClient.send(command);
            
            if (response && response.Items && Array.isArray(response.Items)) {
                items = items.concat(response.Items);
                console.log(`   Načteno ${items.length} položek...`);
            }
            
            lastEvaluatedKey = response.LastEvaluatedKey;
            scanCount++;
            
            if (scanCount > 100) {
                console.log('   ⚠️  Překročen limit scanů');
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

async function updateItem(docClient, questionId, newSubjectId) {
    const command = new UpdateCommand({
        TableName: tableName,
        Key: {
            questionId: questionId
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
        return { success: true, questionId };
    } catch (error) {
        console.error(`❌ Chyba při aktualizaci ${questionId}:`, error.message);
        return { success: false, questionId, error: error.message };
    }
}

async function main() {
    console.log('=== Finální oprava kategorií ===');
    console.log(`Tabulka: ${tableName}`);
    console.log('Postup: 6→67→7, 7→78→8, 8→86→6');
    console.log('');
    
    try {
        const docClient = await createDynamoClient();
        
        // 1. Načtení všech položek
        console.log('📋 Krok 1: Načítání všech dat');
        const allItems = await scanAllItems(docClient);
        
        if (allItems.length === 0) {
            console.log('❌ Žádné položky v tabulce!');
            return;
        }
        
        // 2. Analýza a rozdělení
        console.log('\n📊 Analýza položek:');
        const subject6Items = [];
        const subject7Items = [];
        const subject8Items = [];
        
        for (const item of allItems) {
            if (item && typeof item.subjectId === 'number') {
                if (item.subjectId === 6) subject6Items.push(item);
                else if (item.subjectId === 7) subject7Items.push(item);
                else if (item.subjectId === 8) subject8Items.push(item);
            }
        }
        
        console.log(`   Subject 6: ${subject6Items.length} položek`);
        console.log(`   Subject 7: ${subject7Items.length} položek`);
        console.log(`   Subject 8: ${subject8Items.length} položek`);
        
        const totalToFix = subject6Items.length + subject7Items.length + subject8Items.length;
        console.log(`   Celkem k opravě: ${totalToFix} položek`);
        
        if (totalToFix === 0) {
            console.log('✅ Žádné položky k opravě!');
            return;
        }
        
        // 3. Krok 1: Přesun na dočasné kategorie
        console.log('\n🔄 KROK 1: Přesun na dočasné kategorie (67, 78, 86)');
        
        let step1Success = 0;
        let step1Errors = 0;
        
        // Subject 6 -> 67
        console.log('   Subject 6 -> 67...');
        for (const item of subject6Items) {
            const result = await updateItem(docClient, item.questionId, 67);
            if (result.success) step1Success++;
            else step1Errors++;
            
            if ((step1Success + step1Errors) % 25 === 0) {
                console.log(`     Provedeno ${step1Success + step1Errors}/${subject6Items.length}...`);
            }
        }
        
        // Subject 7 -> 78
        console.log('   Subject 7 -> 78...');
        for (const item of subject7Items) {
            const result = await updateItem(docClient, item.questionId, 78);
            if (result.success) step1Success++;
            else step1Errors++;
            
            if ((step1Success + step1Errors - subject6Items.length) % 25 === 0) {
                console.log(`     Provedeno ${step1Success + step1Errors - subject6Items.length}/${subject7Items.length}...`);
            }
        }
        
        // Subject 8 -> 86
        console.log('   Subject 8 -> 86...');
        for (const item of subject8Items) {
            const result = await updateItem(docClient, item.questionId, 86);
            if (result.success) step1Success++;
            else step1Errors++;
            
            if ((step1Success + step1Errors - subject6Items.length - subject7Items.length) % 25 === 0) {
                console.log(`     Provedeno ${step1Success + step1Errors - subject6Items.length - subject7Items.length}/${subject8Items.length}...`);
            }
        }
        
        console.log(`\n✅ Krok 1 dokončen!`);
        console.log(`   Úspěšně: ${step1Success}, Chyby: ${step1Errors}`);
        
        // 4. Kontrola po Kroku 1
        console.log('\n🔍 Kontrola po Kroku 1:');
        const itemsAfterStep1 = await scanAllItems(docClient);
        
        const temp67Items = [];
        const temp78Items = [];
        const temp86Items = [];
        
        for (const item of itemsAfterStep1) {
            if (item && typeof item.subjectId === 'number') {
                if (item.subjectId === 67) temp67Items.push(item);
                else if (item.subjectId === 78) temp78Items.push(item);
                else if (item.subjectId === 86) temp86Items.push(item);
            }
        }
        
        console.log(`   Subject 67: ${temp67Items.length} položek`);
        console.log(`   Subject 78: ${temp78Items.length} položek`);
        console.log(`   Subject 86: ${temp86Items.length} položek`);
        
        // 5. Krok 2: Přesun na finální kategorie
        console.log('\n🔄 KROK 2: Přesun na finální kategorie (7, 8, 6)');
        
        let step2Success = 0;
        let step2Errors = 0;
        
        // 67 -> 7
        console.log('   Subject 67 -> 7...');
        for (const item of temp67Items) {
            const result = await updateItem(docClient, item.questionId, 7);
            if (result.success) step2Success++;
            else step2Errors++;
            
            if ((step2Success + step2Errors) % 25 === 0) {
                console.log(`     Provedeno ${step2Success + step2Errors}/${temp67Items.length}...`);
            }
        }
        
        // 78 -> 8
        console.log('   Subject 78 -> 8...');
        for (const item of temp78Items) {
            const result = await updateItem(docClient, item.questionId, 8);
            if (result.success) step2Success++;
            else step2Errors++;
            
            if ((step2Success + step2Errors - temp67Items.length) % 25 === 0) {
                console.log(`     Provedeno ${step2Success + step2Errors - temp67Items.length}/${temp78Items.length}...`);
            }
        }
        
        // 86 -> 6
        console.log('   Subject 86 -> 6...');
        for (const item of temp86Items) {
            const result = await updateItem(docClient, item.questionId, 6);
            if (result.success) step2Success++;
            else step2Errors++;
            
            if ((step2Success + step2Errors - temp67Items.length - temp78Items.length) % 25 === 0) {
                console.log(`     Provedeno ${step2Success + step2Errors - temp67Items.length - temp78Items.length}/${temp86Items.length}...`);
            }
        }
        
        console.log(`\n✅ Krok 2 dokončen!`);
        console.log(`   Úspěšně: ${step2Success}, Chyby: ${step2Errors}`);
        
        // 6. Finální kontrola
        console.log('\n🔍 FINÁLNÍ KONTROLA:');
        const finalItems = await scanAllItems(docClient);
        
        const final6Items = [];
        const final7Items = [];
        const final8Items = [];
        
        for (const item of finalItems) {
            if (item && typeof item.subjectId === 'number') {
                if (item.subjectId === 6) final6Items.push(item);
                else if (item.subjectId === 7) final7Items.push(item);
                else if (item.subjectId === 8) final8Items.push(item);
            }
        }
        
        console.log(`\n📊 FINÁLNÍ ROZDĚLENÍ:`);
        console.log(`   Subject 6: ${final6Items.length} položek (původní 8: ${subject8Items.length})`);
        console.log(`   Subject 7: ${final7Items.length} položek (původní 6: ${subject6Items.length})`);
        console.log(`   Subject 8: ${final8Items.length} položek (původní 7: ${subject7Items.length})`);
        
        console.log(`\n🎉 OPERACE DOKONČENA!`);
        console.log(`✅ Celkem aktualizováno: ${step1Success + step2Success} položek`);
        
        // 7. Validace
        const isCorrect = 
            final7Items.length === subject6Items.length &&
            final8Items.length === subject7Items.length &&
            final6Items.length === subject8Items.length;
        
        if (isCorrect) {
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
