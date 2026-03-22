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
    let lastKey = null;
    let scanCount = 0;
    
    do {
        const command = new ScanCommand({
            TableName: tableName,
            ExclusiveStartKey: lastKey,
            ProjectionExpression: 'questionId, subjectId'  // Jen potřebná pole
        });
        
        try {
            const result = await docClient.send(command);
            
            if (result && result.Items && Array.isArray(result.Items)) {
                items = items.concat(result.Items);
                console.log(`   Načteno ${items.length} položek...`);
            }
            
            lastKey = result.LastEvaluatedKey;
            scanCount++;
            
            if (scanCount > 100) {
                console.log('   ⚠️  Překročen limit scanů');
                break;
            }
            
        } catch (error) {
            console.error(`   ❌ Chyba při scanu: ${error.message}`);
            break;
        }
        
    } while (lastKey);
    
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
    console.log('=== Oprava kategorií (pracovní verze) ===');
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
        
        // 2. Analýza
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
        
        console.log('\n⚠️  PŘIPRAVEN PROVEST OPRAVU!');
        console.log('   6→67→7, 7→78→8, 8→86→6');
        
        // 3. Krok 1: Přesun na dočasné kategorie
        console.log('\n🔄 KROK 1: 6→67, 7→78, 8→86');
        
        let step1Success = 0;
        let step1Errors = 0;
        
        // Subject 6 -> 67
        if (subject6Items.length > 0) {
            console.log(`   Subject 6 -> 67 (${subject6Items.length} položek)...`);
            for (let i = 0; i < subject6Items.length; i++) {
                const item = subject6Items[i];
                const result = await updateItem(docClient, item.questionId, 67);
                if (result.success) step1Success++;
                else step1Errors++;
                
                if ((i + 1) % 10 === 0) {
                    console.log(`     Provedeno ${i + 1}/${subject6Items.length}...`);
                }
            }
        }
        
        // Subject 7 -> 78
        if (subject7Items.length > 0) {
            console.log(`   Subject 7 -> 78 (${subject7Items.length} položek)...`);
            for (let i = 0; i < subject7Items.length; i++) {
                const item = subject7Items[i];
                const result = await updateItem(docClient, item.questionId, 78);
                if (result.success) step1Success++;
                else step1Errors++;
                
                if ((i + 1) % 10 === 0) {
                    console.log(`     Provedeno ${i + 1}/${subject7Items.length}...`);
                }
            }
        }
        
        // Subject 8 -> 86
        if (subject8Items.length > 0) {
            console.log(`   Subject 8 -> 86 (${subject8Items.length} položek)...`);
            for (let i = 0; i < subject8Items.length; i++) {
                const item = subject8Items[i];
                const result = await updateItem(docClient, item.questionId, 86);
                if (result.success) step1Success++;
                else step1Errors++;
                
                if ((i + 1) % 10 === 0) {
                    console.log(`     Provedeno ${i + 1}/${subject8Items.length}...`);
                }
            }
        }
        
        console.log(`\n✅ Krok 1 dokončen!`);
        console.log(`   Úspěšně: ${step1Success}, Chyby: ${step1Errors}`);
        
        // 4. Kontrola po Kroku 1
        console.log('\n🔍 Kontrola po Kroku 1:');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Počkáme na konzistenci
        
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
        console.log('\n🔄 KROK 2: 67→7, 78→8, 86→6');
        
        let step2Success = 0;
        let step2Errors = 0;
        
        // 67 -> 7
        if (temp67Items.length > 0) {
            console.log(`   Subject 67 -> 7 (${temp67Items.length} položek)...`);
            for (let i = 0; i < temp67Items.length; i++) {
                const item = temp67Items[i];
                const result = await updateItem(docClient, item.questionId, 7);
                if (result.success) step2Success++;
                else step2Errors++;
                
                if ((i + 1) % 10 === 0) {
                    console.log(`     Provedeno ${i + 1}/${temp67Items.length}...`);
                }
            }
        }
        
        // 78 -> 8
        if (temp78Items.length > 0) {
            console.log(`   Subject 78 -> 8 (${temp78Items.length} položek)...`);
            for (let i = 0; i < temp78Items.length; i++) {
                const item = temp78Items[i];
                const result = await updateItem(docClient, item.questionId, 8);
                if (result.success) step2Success++;
                else step2Errors++;
                
                if ((i + 1) % 10 === 0) {
                    console.log(`     Provedeno ${i + 1}/${temp78Items.length}...`);
                }
            }
        }
        
        // 86 -> 6
        if (temp86Items.length > 0) {
            console.log(`   Subject 86 -> 6 (${temp86Items.length} položek)...`);
            for (let i = 0; i < temp86Items.length; i++) {
                const item = temp86Items[i];
                const result = await updateItem(docClient, item.questionId, 6);
                if (result.success) step2Success++;
                else step2Errors++;
                
                if ((i + 1) % 10 === 0) {
                    console.log(`     Provedeno ${i + 1}/${temp86Items.length}...`);
                }
            }
        }
        
        console.log(`\n✅ Krok 2 dokončen!`);
        console.log(`   Úspěšně: ${step2Success}, Chyby: ${step2Errors}`);
        
        // 6. Finální kontrola
        console.log('\n🔍 FINÁLNÍ KONTROLA:');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
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
