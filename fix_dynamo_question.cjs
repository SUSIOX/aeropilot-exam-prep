// Fix script pro DynamoDB - oprava špatné odpovědi v otázce "Deviace je způsobena"
const { DynamoDBClient, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');

// AWS konfigurace
const region = 'eu-central-1';
const tableName = 'aeropilot-questions';

async function fixQuestion() {
    console.log('🔧 Opravuji otázku "Deviace je způsobena" v DynamoDB...');
    
    // Vytvoř klienta
    const client = new DynamoDBClient({ region });
    
    try {
        // Opravit klub_q53 - změnit správnou odpověď z 0 na 2
        const updateCommand = new UpdateItemCommand({
            TableName: tableName,
            Key: {
                questionId: { S: 'klub_q53' }
            },
            UpdateExpression: 'SET correct = :correct',
            ExpressionAttributeValues: {
                ':correct': { N: '2' }
            },
            ReturnValues: 'ALL_NEW'
        });
        
        const result = await client.send(updateCommand);
        
        console.log('✅ Otázka klub_q53 úspěšně opravena:');
        console.log(`   Původní správná odpověď: 0`);
        console.log(`   Nová správná odpověď: 2`);
        console.log(`   Text otázky: ${result.Attributes.question.S}`);
        console.log(`   Odpovědi:`);
        
        result.Attributes.answers.L.forEach((answer, index) => {
            const isCorrect = index === 2;
            console.log(`     [${index}] ${answer.S} ${isCorrect ? '✅' : '❌'}`);
        });
        
        console.log('\n🎯 Teď obě verze mají stejnou správnou odpověď!');
        
    } catch (error) {
        console.error('❌ Chyba při opravě DynamoDB:', error);
        
        if (error.name === 'UnrecognizedClientException') {
            console.log('💡 Možný problém: Špatné AWS credentials nebo přístupové práva');
        } else if (error.name === 'ResourceNotFoundException') {
            console.log('💡 Tabulka neexistuje nebo je špatně zadaný název');
        } else if (error.name === 'AccessDeniedException') {
            console.log('💡 Nemáš oprávnění pro zápis do tabulky');
        }
    }
}

// Spusť opravu
fixQuestion().catch(console.error);
