// Fix remaining 4 duplicates in DynamoDB
const { DynamoDBClient, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');

// AWS konfigurace
const region = 'eu-central-1';
const tableName = 'aeropilot-questions';

// Zbývající 4 duplicity
const remainingDuplicates = [
    {
        questionText: "Jaké nebezpečné přístupy jsou často kombinovány?",
        primaryId: "klub_q85",
        primaryCorrect: 3,
        duplicateId: "klub_q29",
        duplicateCorrect: 2
    },
    {
        questionText: "Jaký optický klam může být způsoben přiblížením na dráhu se sklonem do kopce?",
        primaryId: "klub_q74",
        primaryCorrect: 2,
        duplicateId: "klub_q18",
        duplicateCorrect: 3
    },
    {
        questionText: "Za jakých okolností je pravděpodobnější přijmutí vyššího rizika?",
        primaryId: "klub_q75",
        primaryCorrect: 1,
        duplicateId: "klub_q19",
        duplicateCorrect: 2
    },
    {
        questionText: "Který ze smyslů je nejvíce ovlivněn výškovou nemocí?",
        primaryId: "klub_q72",
        primaryCorrect: 2,
        duplicateId: "klub_q16",
        duplicateCorrect: 0
    }
];

async function fixRemainingDuplicates() {
    console.log('🔧 Opravuji zbývající 4 duplicity v DynamoDB...\n');
    
    const client = new DynamoDBClient({ region });
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < remainingDuplicates.length; i++) {
        const dup = remainingDuplicates[i];
        
        try {
            console.log(`--- ${i + 1}/4 ---`);
            console.log(`Otázka: ${dup.questionText}`);
            console.log(`Primární ID: ${dup.primaryId} (správná: ${dup.primaryCorrect})`);
            console.log(`Duplicitní ID: ${dup.duplicateId} (správná: ${dup.duplicateCorrect})`);
            
            // Opravit duplicitní otázku
            const updateCommand = new UpdateItemCommand({
                TableName: tableName,
                Key: {
                    questionId: { S: dup.duplicateId }
                },
                UpdateExpression: 'SET correct = :correct',
                ExpressionAttributeValues: {
                    ':correct': { N: dup.primaryCorrect.toString() }
                },
                ReturnValues: 'ALL_NEW'
            });
            
            const result = await client.send(updateCommand);
            
            console.log(`✅ Opraveno: ${dup.duplicateId} - správná odpověď změněna z ${dup.duplicateCorrect} na ${dup.primaryCorrect}`);
            successCount++;
            
        } catch (error) {
            console.error(`❌ Chyba při opravě ${dup.duplicateId}:`, error.message);
            errorCount++;
        }
        
        console.log(''); // Prázdný řádek pro lepší čitelnost
    }
    
    console.log(`\n🎯 VÝSLEDKY:`);
    console.log(`✅ Úspěšně opraveno: ${successCount}/4`);
    console.log(`❌ Chyby: ${errorCount}/4`);
    
    if (successCount === 4) {
        console.log(`\n🎉 Všechny zbývající duplicity byly opraveny!`);
        console.log(`🚀 DynamoDB by nyní neměla mít žádné duplicity s různými správnými odpověďmi!`);
    } else {
        console.log(`\n⚠️  Některé duplicity se nepodařilo opravit - zkontroluj chyby výše.`);
    }
}

// Spusť opravu
fixRemainingDuplicates().catch(console.error);
