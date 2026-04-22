// Find duplicates in DynamoDB
const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { ScanCommand: DocScanCommand } = require('@aws-sdk/lib-dynamodb');

// AWS konfigurace
const region = 'eu-central-1';
const tableName = 'aeropilot-questions';

async function findDuplicates() {
    console.log('🔍 Hledám duplicitní otázky v DynamoDB...');
    
    const client = new DynamoDBClient({ region });
    const docClient = DynamoDBDocumentClient.from(client);
    
    try {
        // Skenuj všechny otázky
        console.log('📋 Načítám všechny otázky...');
        const scanCommand = new DocScanCommand({
            TableName: tableName,
            ProjectionExpression: 'questionId, question, answers, correct'
        });
        
        const result = await docClient.send(scanCommand);
        const questions = result.Items || [];
        
        console.log(`✅ Načteno ${questions.length} otázek`);
        
        // Najdi duplicity podle textu otázky
        const questionMap = new Map();
        const duplicates = [];
        
        questions.forEach(item => {
            // Skip items without question text
            if (!item.question) {
                console.log(`⚠️  Otázka ${item.questionId} nemá text`);
                return;
            }
            
            const normalizedQuestion = item.question.toLowerCase().trim();
            
            if (questionMap.has(normalizedQuestion)) {
                duplicates.push({
                    text: item.question,
                    ids: [questionMap.get(normalizedQuestion).questionId, item.questionId],
                    items: [questionMap.get(normalizedQuestion), item]
                });
            } else {
                questionMap.set(normalizedQuestion, item);
            }
        });
        
        if (duplicates.length > 0) {
            console.log(`\n🚨 NALEZENO ${duplicates.length} DUPLICITNÍCH OTÁZEK:\n`);
            
            duplicates.forEach((dup, index) => {
                console.log(`--- Duplicita ${index + 1} ---`);
                console.log(`Text: ${dup.text}`);
                console.log(`ID: ${dup.ids.join(', ')}`);
                
                dup.items.forEach(item => {
                    console.log(`  ${item.questionId}:`);
                    console.log(`    Správná odpověď: ${item.correct}`);
                    if (item.answers) {
                        item.answers.forEach((answer, ansIndex) => {
                            const isCorrect = ansIndex === item.correct;
                            console.log(`      [${ansIndex}] ${answer} ${isCorrect ? '✅' : '❌'}`);
                        });
                    }
                });
                console.log('');
            });
            
            // Zkontroluj, zda mají stejné správné odpovědi
            const inconsistentDuplicates = duplicates.filter(dup => {
                return dup.items[0].correct !== dup.items[1].correct;
            });
            
            if (inconsistentDuplicates.length > 0) {
                console.log(`\n⚠️  ${inconsistentDuplicates.length} duplicit má RŮZNÉ správné odpovědi!`);
                inconsistentDuplicates.forEach(dup => {
                    console.log(`  ${dup.text}: ${dup.items[0].questionId}(${dup.items[0].correct}) vs ${dup.items[1].questionId}(${dup.items[1].correct})`);
                });
            }
            
        } else {
            console.log('✅ Žádné duplicity nenalezeny');
        }
        
    } catch (error) {
        console.error('❌ Chyba při hledání duplicity:', error);
    }
}

// Spusť hledání
findDuplicates().catch(console.error);
