// Načtení .env
require('dotenv').config();

const { DynamoDBClient, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { CognitoIdentityClient } = require('@aws-sdk/client-cognito-identity');
const { fromCognitoIdentityPool } = require('@aws-sdk/credential-provider-cognito-identity');

async function testConnection() {
    console.log('=== Test DynamoDB připojení ===');
    console.log('AWS Region:', process.env.AWS_REGION);
    console.log('Identity Pool ID:', process.env.COGNITO_IDENTITY_POOL_ID);
    console.log('');
    
    try {
        // Vytvoření klienta
        const credentials = fromCognitoIdentityPool({
            client: new CognitoIdentityClient({ region: process.env.AWS_REGION }),
            identityPoolId: process.env.COGNITO_IDENTITY_POOL_ID
        });

        const client = new DynamoDBClient({ 
            region: process.env.AWS_REGION, 
            credentials 
        });
        
        const docClient = DynamoDBDocumentClient.from(client);
        
        console.log('✅ Klient vytvořen');
        
        // Test 1: Scan aeropilot-questions
        console.log('\n📋 Test: Scan aeropilot-questions');
        const scanCommand = new ScanCommand({
            TableName: 'aeropilot-questions',
            Limit: 5
        });
        
        const scanResult = await docClient.send(scanCommand);
        console.log('Načteno položek:', scanResult.Items.length);
        
        if (scanResult.Items.length > 0) {
            console.log('Ukázka položky:', JSON.stringify(scanResult.Items[0], null, 2));
        }
        
        console.log('\n✅ Připojení funkční!');
        
    } catch (error) {
        console.error('❌ Chyba připojení:', error.message);
        console.error('Detail:', error);
    }
}

testConnection();
