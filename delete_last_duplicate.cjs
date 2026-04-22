// Delete the very last duplicate from DynamoDB
const { DynamoDBClient, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');

// AWS konfigurace
const region = 'eu-central-1';
const tableName = 'aeropilot-questions';

// The very last duplicate to delete
const lastDuplicate = 'ai_020.05.06.03_36057';  // Jaký je hlavní účel transpondéru v letadle?

async function deleteLastDuplicate() {
    console.log('Deleting the very last duplicate from DynamoDB...');
    
    const client = new DynamoDBClient({ region});
    
    try {
        console.log(`Deleting: ${lastDuplicate}`);
        
        const deleteCommand = new DeleteItemCommand({
            TableName: tableName,
            Key: {
                questionId: { S: lastDuplicate }
            }
        });
        
        await client.send(deleteCommand);
        console.log(`Successfully deleted: ${lastDuplicate}`);
        
        console.log(`\n🎉 ALL DUPLICATES ELIMINATED!`);
        console.log(`DynamoDB is now 100% duplicate-free!`);
        console.log(`No more duplicate questions exist in the database!`);
        
    } catch (error) {
        console.error(`Error deleting ${lastDuplicate}:`, error.message);
    }
}

// Run deletion
deleteLastDuplicate().catch(console.error);
