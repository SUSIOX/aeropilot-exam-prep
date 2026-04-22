// Delete remaining 5 duplicates from DynamoDB
const { DynamoDBClient, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');

// AWS konfigurace
const region = 'eu-central-1';
const tableName = 'aeropilot-questions';

// Remaining duplicates to delete (second ID from each pair)
const remainingDuplicates = [
    'ai_020.01.06.01_khii7',  // Jaký je hlavní rozdíl mezi pístovým a turbovrtulovým motorem?
    'ai_080.05.02.03_165aa',  // Jak ovlivňuje námraza výkon letounu?
    'klub_q53',               // Deviace je způsobena.
    'ai_050.01.13.03_22cim',  // Který z následujících jevů NENÍ primárním nebezpečím bouřky pro letadlo?
    'ai_050.01.13.01_roxyt'   // Které tři podmínky jsou nezbytné pro vznik bouřky?
];

async function deleteRemainingDuplicates() {
    console.log('Deleting final 5 duplicates from DynamoDB...');
    
    const client = new DynamoDBClient({ region});
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < remainingDuplicates.length; i++) {
        const questionId = remainingDuplicates[i];
        
        try {
            console.log(`Deleting ${i + 1}/5: ${questionId}`);
            
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
    
    console.log(`\nFINAL DELETION RESULTS:`);
    console.log(`Successfully deleted: ${successCount}/5`);
    console.log(`Errors: ${errorCount}/5`);
    
    if (successCount === 5) {
        console.log(`\nAll remaining duplicates successfully deleted!`);
        console.log(`DynamoDB should now be completely duplicate-free!`);
    } else {
        console.log(`\nSome duplicates failed to delete`);
    }
}

// Run deletion
deleteRemainingDuplicates().catch(console.error);
