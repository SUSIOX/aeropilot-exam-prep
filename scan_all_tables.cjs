const { DynamoDBClient, ListTablesCommand, ScanCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: 'eu-central-1' });

async function scanAllTables() {
  console.log('=== PROHLEDÁVÁM VSECHNY DYNAMODB TABULKY ===\n');
  
  // 1. Získat seznam tabulek
  const listResult = await client.send(new ListTablesCommand({}));
  const tables = listResult.TableNames || [];
  console.log(`Nalezeno ${tables.length} tabulek:`, tables);
  console.log('');
  
  // 2. Prohledat kaou tabulku
  for (const tableName of tables) {
    console.log(`--- Tabulka: ${tableName} ---`);
    
    let lastKey = null;
    let scanned = 0;
    let totalItems = 0;
    let itemsWithExplanation = 0;
    let sampleItems = [];
    
    do {
      const result = await client.send(new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastKey,
        Limit: 1000
      }));
      
      const items = result.Items || [];
      scanned += (result.ScannedCount || 0);
      totalItems += items.length;
      lastKey = result.LastEvaluatedKey;
      
      // Hledat items s explanation
      for (const item of items) {
        // Check all possible explanation fields
        const hasExplanation = item.ai_explanation?.S || 
                              item.explanation?.S || 
                              item.ai_detailed_explanation?.S ||
                              item.aiExplanation?.S ||
                              item.detailedExplanation?.S;
        
        if (hasExplanation) {
          itemsWithExplanation++;
          if (sampleItems.length < 5) {
            sampleItems.push({
              questionId: item.questionId?.S || item.id?.S || 'unknown',
              hasAiExplanation: !!item.ai_explanation?.S,
              hasExplanation: !!item.explanation?.S,
              hasDetailed: !!item.ai_detailed_explanation?.S,
              provider: item.ai_explanation_provider?.S || item.provider?.S,
              model: item.ai_explanation_model?.S || item.model?.S,
              expLen: hasExplanation.length
            });
          }
        }
      }
      
      process.stdout.write(`\rScan: ${scanned} items...`);
      
    } while (lastKey);
    
    console.log(`\n  Celkem items: ${totalItems}`);
    console.log(`  Items s vysvlením: ${itemsWithExplanation}`);
    
    if (itemsWithExplanation > 0) {
      console.log('  Sample items s vysvlením:');
      sampleItems.forEach(s => {
        console.log(`    QID: ${s.questionId}`);
        console.log(`      ai_explanation: ${s.hasAiExplanation ? 'YES' : 'NO'}`);
        console.log(`      explanation: ${s.hasExplanation ? 'YES' : 'NO'}`);
        console.log(`      detailed: ${s.hasDetailed ? 'YES' : 'NO'}`);
        console.log(`      provider: ${s.provider}, model: ${s.model}`);
        console.log(`      délka: ${s.expLen}`);
        console.log('');
      });
    }
    
    console.log('');
  }
  
  console.log('=== KONEC PROHLEDÁVÁNÍ ===');
}

scanAllTables().catch(err => {
  console.error('Chyba:', err);
  process.exit(1);
});
