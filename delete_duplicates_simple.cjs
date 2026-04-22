// Delete all duplicates from DynamoDB - simple version
const { DynamoDBClient, BatchWriteItemCommand } = require('@aws-sdk/client-dynamodb');
const fs = require('fs');

// AWS konfigurace
const region = 'eu-central-1';
const tableName = 'aeropilot-questions';

async function deleteAllDuplicates() {
    console.log('Deleting all duplicates from DynamoDB...');
    
    // Find backup file
    const backupFiles = fs.readdirSync('.').filter(file => file.startsWith('duplicates_backup_') && file.endsWith('.json'));
    if (backupFiles.length === 0) {
        console.error('No backup file found! Run backup_duplicates.cjs first');
        return;
    }
    
    const latestBackup = backupFiles.sort().pop();
    console.log(`Using backup: ${latestBackup}`);
    
    const backup = JSON.parse(fs.readFileSync(latestBackup, 'utf8'));
    const duplicatesToDelete = backup.duplicates;
    
    console.log(`Deleting ${duplicatesToDelete.length} duplicate questions...`);
    
    const client = new DynamoDBClient({ region});
    let successCount = 0;
    let errorCount = 0;
    
    // Delete in batches (max 25 items per batch)
    const BATCH_SIZE = 25;
    
    for (let i = 0; i < duplicatesToDelete.length; i += BATCH_SIZE) {
        const batch = duplicatesToDelete.slice(i, i + BATCH_SIZE);
        const deleteRequests = batch.map(dup => ({
            DeleteRequest: {
                Key: {
                    questionId: { S: dup.duplicateId }
                }
            }
        }));
        
        try {
            console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(duplicatesToDelete.length/BATCH_SIZE)} (${batch.length} items)...`);
            
            const batchCommand = new BatchWriteItemCommand({
                RequestItems: {
                    [tableName]: deleteRequests
                }
            });
            
            const result = await client.send(batchCommand);
            
            // Handle unprocessed items
            if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
                console.log(`Some items not processed, retrying...`);
                
                let retries = 0;
                while (result.UnprocessedItems[tableName] && retries < 5) {
                    await new Promise(resolve => setTimeout(resolve, 200 * (retries + 1)));
                    
                    const retryCommand = new BatchWriteItemCommand({
                        RequestItems: result.UnprocessedItems
                    });
                    
                    const retryResult = await client.send(retryCommand);
                    result.UnprocessedItems = retryResult.UnprocessedItems;
                    retries++;
                }
                
                if (result.UnprocessedItems[tableName]) {
                    console.error(`${result.UnprocessedItems[tableName].length} items failed to delete after 5 retries`);
                    errorCount += result.UnprocessedItems[tableName].length;
                }
            }
            
            successCount += batch.length;
            console.log(`Batch completed successfully`);
            
        } catch (error) {
            console.error(`Error deleting batch:`, error.message);
            errorCount += batch.length;
        }
    }
    
    console.log(`\nDELETION RESULTS:`);
    console.log(`Successfully deleted: ${successCount}/${duplicatesToDelete.length}`);
    console.log(`Errors: ${errorCount}/${duplicatesToDelete.length}`);
    
    if (successCount === duplicatesToDelete.length) {
        console.log(`\nAll duplicates successfully deleted!`);
        console.log(`Original count: ${backup.totalQuestions} questions`);
        console.log(`New count: ${backup.totalQuestions - duplicatesToDelete.length} questions`);
        console.log(`Saved: ${duplicatesToDelete.length} duplicate questions`);
    } else {
        console.log(`\nSome duplicates failed to delete`);
    }
    
    // Create deletion report
    const deleteReport = {
        timestamp: new Date().toISOString(),
        backupFile: latestBackup,
        deletedCount: successCount,
        errorCount: errorCount,
        originalTotal: backup.totalQuestions,
        newTotal: backup.totalQuestions - successCount,
        deletedIds: duplicatesToDelete.map(dup => dup.duplicateId)
    };
    
    const reportFile = `delete_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(reportFile, JSON.stringify(deleteReport, null, 2));
    console.log(`Report saved to: ${reportFile}`);
}

// Run deletion
deleteAllDuplicates().catch(console.error);
