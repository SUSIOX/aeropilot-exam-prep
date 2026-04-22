// Delete ultimate 4 duplicates from DynamoDB
const { DynamoDBClient, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');

// AWS konfigurace
const region = 'eu-central-1';
const tableName = 'aeropilot-questions';

// Ultimate 4 duplicates to delete (second ID from each pair)
const ultimateDuplicates = [
    'ai_060.01.11.01_mstbp',  // Jaký je hlavní účel letového záznamu (flight log) v navigaci?
    'ai_020.01.06.01_bf6ne',  // Jaký je hlavní rozdíl mezi pístovým a turbovrtulovým motorem?
    'ai_080.05.02.03_pviqt',  // Jak ovlivňuje námraza výkon letounu?
    'medlanky_nav_25'         // Deviace je způsobena.
];

async function deleteUltimateDuplicates() {
    console.log('Deleting ultimate 4 duplicates from DynamoDB...');
    
    const client = new DynamoDBClient({ region});
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < ultimateDuplicates.length; i++) {
        const questionId = ultimateDuplicates[i];
        
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
    
    console.log(`\nULTIMATE CLEANUP RESULTS:`);
    console.log(`Successfully deleted: ${successCount}/4`);
    console.log(`Errors: ${errorCount}/4`);
    
    if (successCount === 4) {
        console.log(`\nAll duplicates finally eliminated!`);
        console.log(`DynamoDB is now 100% duplicate-free!`);
    } else {
        console.log(`\nSome duplicates failed to delete`);
    }
}

// Run deletion
deleteUltimateDuplicates().catch(console.error);
