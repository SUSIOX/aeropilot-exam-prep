// Načtení .env
require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { CognitoIdentityClient } = require('@aws-sdk/client-cognito-identity');
const { fromCognitoIdentityPool } = require('@aws-sdk/credential-provider-cognito-identity');

async function simpleScan() {
    console.log('=== Jednoduchý scan test ===');
    
    try {
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
        
        // Scan s filtrem na subjectId 6, 7, 8
        console.log('\n🔍 Hledám položky se subjectId 6, 7, 8...');
        
        for (const subjectId of [6, 7, 8]) {
            const command = new ScanCommand({
                TableName: 'aeropilot-questions',
                FilterExpression: 'subjectId = :sid',
                ExpressionAttributeValues: {
                    ':sid': subjectId
                },
                Limit: 10  // Jen prvních 10 pro test
            });
            
            try {
                const result = await docClient.send(command);
                console.log(`Subject ${subjectId}: ${result.Items ? result.Items.length : 0} položek`);
                
                if (result.Items && result.Items.length > 0) {
                    console.log(`  Ukázka: ${result.Items[0].questionId} -> subjectId: ${result.Items[0].subjectId}`);
                }
            } catch (error) {
                console.error(`❌ Chyba u Subject ${subjectId}: ${error.message}`);
            }
        }
        
        console.log('\n✅ Test dokončen');
        
    } catch (error) {
        console.error('❌ Chyba:', error.message);
    }
}

simpleScan();
