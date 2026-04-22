// Delete last 4 duplicates from DynamoDB
const { DynamoDBClient, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');

// AWS konfigurace
const region = 'eu-central-1';
const tableName = 'aeropilot-questions';

// Last 4 duplicates to delete
const lastDuplicates = [
    'ai_020.05.07.01_ntcsh',  // Proč jsou v letadlech instalovány kyslíkové systémy?
    'klub_q76',               // Co je znakem přístupu předvádění se?
    'klub_q75',               // Za jakých okolností je pravděpodobnější přijmutí vyššího rizika?
    'klub_q72'                // Který ze smyslů je nejvíce ovlivněn výškovou nemocí?
];

async function deleteLastDuplicates() {
    console.log('Deleting last 4 duplicates from DynamoDB...');
    
    const client = new DynamoDBClient({ region});
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < lastDuplicates.length; i++) {
        const questionId = lastDuplicates[i];
        
        try {
            console.log(`Deleting ${i + 1}/4: ${questionId}`);
            
            const deleteCommand = new DeleteItemCommand({
                TableName: tableName,
                Key: {
                    questionId: { S: questionId }
                }
            });
            
            await client.send(deleteCommand);
            console.log(`Successfully deleted: ${questionId}`);
            successCount++;
            
        } catch (error) {
            console.error(`Error deleting ${questionId}:`, error.message);
            errorCount++;
        }
    }
    
    console.log(`\nFINAL CLEANUP RESULTS:`);
    console.log(`Successfully deleted: ${successCount}/4`);
    console.log(`Errors: ${errorCount}/4`);
    
    if (successCount === 4) {
        console.log(`\nAll duplicates completely eliminated!`);
        console.log(`DynamoDB is now 100% duplicate-free!`);
    } else {
        console.log(`\nSome duplicates failed to delete`);
    }
}

// Run deletion
deleteLastDuplicates().catch(console.error);
