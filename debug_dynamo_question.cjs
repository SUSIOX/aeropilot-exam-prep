// Debug script pro DynamoDB - načtení otázky "Deviace je způsobena"
const { DynamoDBClient, GetItemCommand, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { ScanCommand: DocScanCommand } = require('@aws-sdk/lib-dynamodb');

// AWS konfigurace
const region = 'eu-central-1';
const tableName = 'aeropilot-questions';

async function debugDynamoQuestion() {
    console.log('🔍 Hledám otázku "Deviace je způsobena" v DynamoDB...');
    
    // Vytvoř klienty
    const client = new DynamoDBClient({ region });
    const docClient = DynamoDBDocumentClient.from(client);
    
    try {
        // 1. Nejprve skenuj celou tabulku a hledej otázku
        console.log('📋 Skenování tabulky...');
        const scanCommand = new DocScanCommand({
            TableName: tableName,
            FilterExpression: 'contains(question, :text)',
            ExpressionAttributeValues: {
                ':text': 'Deviace je způsobena'
            },
            ProjectionExpression: 'questionId, question, answers, correct'
        });
        
        const scanResult = await docClient.send(scanCommand);
        
        if (scanResult.Items && scanResult.Items.length > 0) {
            console.log(`✅ Nalezeno ${scanResult.Items.length} otázek:`);
            
            scanResult.Items.forEach((item, index) => {
                console.log(`\n--- Otázka ${index + 1} ---`);
                console.log(`ID: ${item.questionId}`);
                console.log(`Text: ${item.question}`);
                console.log(`Správná odpověď (index): ${item.correct}`);
                console.log(`Odpovědi:`);
                
                if (item.answers) {
                    item.answers.forEach((answer, ansIndex) => {
                        const isCorrect = ansIndex === item.correct;
                        console.log(`  [${ansIndex}] ${answer} ${isCorrect ? '✅' : '❌'}`);
                    });
                }
            });
        } else {
            console.log('❌ Žádná otázka s textem "Deviace je způsobena" nenalezena v DynamoDB');
            
            // 2. Hledej podobné otázky s "deviace"
            console.log('\n🔍 Hledám otázky obsahující "deviace"...');
            const deviaceScanCommand = new DocScanCommand({
                TableName: tableName,
                FilterExpression: 'contains(question, :text)',
                ExpressionAttributeValues: {
                    ':text': 'deviace'
                },
                ProjectionExpression: 'questionId, question, answers, correct',
                Limit: 10
            });
            
            const deviaceResult = await docClient.send(deviaceScanCommand);
            
            if (deviaceResult.Items && deviaceResult.Items.length > 0) {
                console.log(`✅ Nalezeno ${deviaceResult.Items.length} otázek s "deviace":`);
                
                deviaceResult.Items.forEach((item, index) => {
                    console.log(`\n--- Otázka ${index + 1} ---`);
                    console.log(`ID: ${item.questionId}`);
                    console.log(`Text: ${item.question}`);
                    console.log(`Správná odpověď (index): ${item.correct}`);
                });
            } else {
                console.log('❌ Žádné otázky s "deviace" nenalezeny');
            }
        }
        
    } catch (error) {
        console.error('❌ Chyba při přístupu k DynamoDB:', error);
        
        if (error.name === 'UnrecognizedClientException') {
            console.log('💡 Možný problém: Špatné AWS credentials nebo přístupové práva');
        } else if (error.name === 'ResourceNotFoundException') {
            console.log('💡 Tabulka neexistuje nebo je špatně zadaný název');
        }
    }
}

// Spusť debug
debugDynamoQuestion().catch(console.error);
