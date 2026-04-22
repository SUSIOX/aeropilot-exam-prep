// Delete final 3 duplicates from DynamoDB
const { DynamoDBClient, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');

// AWS konfigurace
const region = 'eu-central-1';
const tableName = 'aeropilot-questions';

// Final 3 duplicates to delete (second ID from each pair)
const final3Duplicates = [
    'ai_030.04.02.01_wsly2',  // Jaký je primární vliv těžiště letadla na jeho stabilitu?
    'ai_030.02.02.01_utdmi',  // Který typ odporu vzniká v důsledku tvorby vztlaku a roste s úhlem náběhu?
    'ai_050.01.13.01_zpur4'   // Které tři podmínky jsou nezbytné pro vznik bouřky?
];

async function deleteFinal3Duplicates() {
    console.log('Deleting final 3 duplicates from DynamoDB...');
    
    const client = new DynamoDBClient({ region});
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < final3Duplicates.length; i++) {
        const questionId = final3Duplicates[i];
        
        try {
            console.log(`Deleting ${i + 1}/3: ${questionId}`);
            
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
    
    console.log(`\nFINAL 3 CLEANUP RESULTS:`);
    console.log(`Successfully deleted: ${successCount}/3`);
    console.log(`Errors: ${errorCount}/3`);
    
    if (successCount === 3) {
        console.log(`\nAll duplicates finally eliminated!`);
        console.log(`DynamoDB is now 100% duplicate-free!`);
    } else {
        console.log(`\nSome duplicates failed to delete`);
    }
}

// Run deletion
deleteFinal3Duplicates().catch(console.error);
