// Backup all duplicates before deletion
const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { ScanCommand: DocScanCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');

// AWS konfigurace
const region = 'eu-central-1';
const tableName = 'aeropilot-questions';

async function backupDuplicates() {
    console.log('💾 Zálohuji všechny duplicitní otázky...');
    
    const client = new DynamoDBClient({ region });
    const docClient = DynamoDBDocumentClient.from(client);
    
    try {
        // Načti všechny otázky
        console.log('📋 Načítám všechny otázky...');
        const scanCommand = new DocScanCommand({
            TableName: tableName
        });
        
        const result = await docClient.send(scanCommand);
        const questions = result.Items || [];
        
        console.log(`✅ Načteno ${questions.length} otázek`);
        
        // Najdi duplicity
        const questionMap = new Map();
        const duplicates = [];
        
        questions.forEach(item => {
            if (!item.question) return;
            
            const normalizedQuestion = item.question.toLowerCase().trim();
            
            if (questionMap.has(normalizedQuestion)) {
                duplicates.push({
                    text: item.question,
                    ids: [questionMap.get(normalizedQuestion).questionId, item.questionId],
                    items: [questionMap.get(normalizedQuestion), item]
                });
            } else {
                questionMap.set(normalizedQuestion, item);
            }
        });
        
        console.log(`🚨 Nalezeno ${duplicates.length} duplicitních párů`);
        
        // Vytvoř zálohu
        const backup = {
            timestamp: new Date().toISOString(),
            totalQuestions: questions.length,
            duplicatePairs: duplicates.length,
            duplicates: duplicates.map(dup => ({
                questionText: dup.text,
                primaryId: dup.items[0].questionId,
                duplicateId: dup.items[1].questionId,
                primaryCorrect: dup.items[0].correct,
                duplicateCorrect: dup.items[1].correct,
                primaryData: dup.items[0],
                duplicateData: dup.items[1]
            }))
        };
        
        // Ulož zálohu do souboru
        const backupFile = `duplicates_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
        
        console.log(`✅ Záloha uložena do: ${backupFile}`);
        console.log(`📊 Statistika zálohy:`);
        console.log(`   - Celkem otázek: ${backup.totalQuestions}`);
        console.log(`   - Duplicitních párů: ${backup.duplicatePairs}`);
        console.log(`   - Otázek ke smazání: ${backup.duplicatePairs.length}`);
        
        return backup;
        
    } catch (error) {
        console.error('❌ Chyba při záloze:', error);
        throw error;
    }
}

// Spusť zálohu
backupDuplicates().catch(console.error);
