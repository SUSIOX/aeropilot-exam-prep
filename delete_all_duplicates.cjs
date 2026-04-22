// Delete all duplicates from DynamoDB
const { DynamoDBClient, DeleteItemCommand, BatchWriteItemCommand } = require('@aws-sdk/client-dynamodb');

// AWS konfigurace
const region = 'eu-central-1';
const tableName = 'aeropilot-questions';

// Načti zálohu a extrahuj ID ke smazání
const fs = require('fs');

async function deleteAllDuplicates() {
    console.log('🗑️  Mažu všechny duplicitní otázky z DynamoDB...');
    
    // Najdi nejnovější záložní soubor
    const backupFiles = fs.readdirSync('.').filter(file => file.startsWith('duplicates_backup_') && file.endsWith('.json'));
    if (backupFiles.length === 0) {
        console.error('❌ Nenalezen žádný záložní soubor! Spusť nejdřív backup_duplicates.cjs');
        return;
    }
    
    const latestBackup = backupFiles.sort().pop();
    console.log(`📂 Používám zálohu: ${latestBackup}`);
    
    const backup = JSON.parse(fs.readFileSync(latestBackup, 'utf8'));
    const duplicatesToDelete = backup.duplicates;
    
    console.log(`📊 K smazání: ${duplicatesToDelete.length} duplicitních otázek`);
    
    const client = new DynamoDBClient({ region, });
    let successCount = 0;
    let errorCount = 0;
    
    // Smaž po dávkách (max 25 položek na dávku)
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
            console.log(`📦 Mažu dávku ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(duplicatesToDelete.length/BATCH_SIZE)} (${batch.length} položek)...`);
            
            const batchCommand = new BatchWriteItemCommand({
                RequestItems: {
                    [tableName]: deleteRequests
                }
            });
            
            const result = await client.send(batchCommand);
            
            // Zpracuj neprocesované položky (pokud nějaké jsou)
            if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
                console.log(`⚠️  Některé položky nebyly zpracovány, opakuji...`);
                
                // Retry mechanism pro neprocesované položky
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
                    console.error(`❌ ${result.UnprocessedItems[tableName].length} položek se nepodařilo smazat po 5 pokusech`);
                    errorCount += result.UnprocessedItems[tableName].length;
                }
            }
            
            successCount += batch.length;
            console.log(`✅ Dávka dokončena`);
            
        } catch (error) {
            console.error(`❌ Chyba při mazání dávky:`, error.message);
            errorCount += batch.length;
        }
    }
    
    console.log(`\n🎯 VÝSLEDKY MAZÁNÍ:`);
    console.log(`✅ Úspěšně smazáno: ${successCount}/${duplicatesToDelete.length}`);
    console.log(`❌ Chyby: ${errorCount}/${duplicatesToDelete.length}`);
    
    if (successCount === duplicatesToDelete.length) {
        console.log(`\n🎉 Všechny duplicity byly úspěšně smazány!`);
        console.log(`📊 Původní stav: ${backup.totalQuestions} otázek`);
        console.log(`📊 Nový stav: ${backup.totalQuestions - duplicatesToDelete.length} otázek`);
        console.log(`📊 Ušetřeno: ${duplicatesToDelete.length} duplicitních otázek`);
    } else {
        console.log(`\n⚠️  Některé duplicity se nepodařilo smazat`);
    }
    
    // Vytvoř report o smazání
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
    console.log(`📄 Report uložen do: ${reportFile}`);
}

// Spusť mazání
deleteAllDuplicates().catch(console.error);
