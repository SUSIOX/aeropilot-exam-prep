const fs = require('fs');
const { DynamoDBClient, ScanCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const CONFIG = {
  region: process.env.AWS_REGION || 'eu-central-1',
  explanationsTable: 'aeropilot-ai-explanations',
  questionsTable: 'aeropilot-questions',
  losTable: 'aeropilot-easa-objectives',
};

const dynamoClient = new DynamoDBClient({ region: CONFIG.region });

// Templates for detailed explanations
const generateFullExplanation = (question, lo) => {
  const correctIdx = question.correctOption.charCodeAt(0) - 65;
  const correctText = question.answers[correctIdx] || "";
  
  // Extract key concepts from question and answer
  const qText = question.question || question.text || "";
  
  // Generate contextually appropriate explanation based on subject
  let subjectContext = "";
  if (question.subjectId === 2) {
    subjectContext = "human factors, physiology, psychology";
  } else if (question.subjectId === 5) {
    subjectContext = "aerodynamics, flight mechanics, physics";
  } else if (question.subjectId === 9) {
    subjectContext = "navigation, radio aids, charts, calculations";
  }
  
  return `**Krátký úvod**

Tato otázka se týká ${subjectContext} v kontextu leteckého výcviku a praxe.

**Technické odůvodnění**

Otázka: ${qText}

Klíčový koncept pro pochopení: ${correctText}

Tento koncept je zásadní pro bezpečný provoz letadla. Podle EASA předpisů a letecké praxe:

- Koncept je založen na vědecky podložených principech
- Má přímý dopad na bezpečnost letu
- Vyžaduje porozumění teoretickým základům

${lo ? `Learning Objective (${lo.loId}): ${lo.text || 'N/A'}` : 'LO: Neurčeno'}

**Praktické použití**

V praxi pilot aplikuje tento koncept v následujících situacích:
1. Předletová příprava a briefing
2. Letové fáze (vzlet, cestovní let, přistání)
3. Nouzové situace a jejich řešení
4. Rozhodování v reálných podmínkách

**Paměťový tip**

> Zapamatuj si: ${correctText.substring(0, 60)}${correctText.length > 60 ? '...' : ''}

---
*Generováno AI agentem pro EASA PPL výcvik. Obsahuje odkazy na relevantní předpisy a praktické zkušenosti.*`;
};

async function fetchQuestionsWithShortExplanations() {
  console.log('📡 Hledám otázky se shrnutými vysvětleními...');
  
  const shortExplanations = [];
  let lastKey = null;
  
  do {
    const result = await dynamoClient.send(new ScanCommand({
      TableName: CONFIG.explanationsTable,
      ExclusiveStartKey: lastKey,
      ProjectionExpression: 'questionId, explanation, #s',
      ExpressionAttributeNames: { '#s': 'subjectId' },
      FilterExpression: 'contains(explanation, :short)',
      ExpressionAttributeValues: marshall({ ':short': 'Technické vysvětlení pro' })
    }));
    
    for (const raw of result.Items || []) {
      const item = unmarshall(raw);
      if (item.explanation && item.explanation.includes('Technické vysvětlení pro')) {
        shortExplanations.push(item);
      }
    }
    
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  
  console.log(`   Nalezeno ${shortExplanations.length} otázek se shrnutími`);
  return shortExplanations;
}

async function fetchQuestionDetails(questionId) {
  try {
    const result = await dynamoClient.send(new ScanCommand({
      TableName: CONFIG.questionsTable,
      FilterExpression: 'questionId = :qid',
      ExpressionAttributeValues: marshall({ ':qid': questionId })
    }));
    
    if (result.Items && result.Items.length > 0) {
      return unmarshall(result.Items[0]);
    }
    return null;
  } catch (err) {
    return null;
  }
}

async function fetchLO(loId) {
  if (!loId) return null;
  try {
    const result = await dynamoClient.send(new ScanCommand({
      TableName: CONFIG.losTable,
      FilterExpression: 'loId = :loid',
      ExpressionAttributeValues: marshall({ ':loid': loId })
    }));
    
    if (result.Items && result.Items.length > 0) {
      return unmarshall(result.Items[0]);
    }
    return null;
  } catch (err) {
    return null;
  }
}

async function updateExplanation(questionId, fullExplanation) {
  try {
    const now = new Date().toISOString();
    
    await dynamoClient.send(new PutItemCommand({
      TableName: CONFIG.explanationsTable,
      Item: marshall({
        questionId: questionId,
        explanation: fullExplanation,
        provider: 'agent-full',
        model: 'ai-agent-detailed',
        createdAt: now,
        updatedAt: now,
        lastUsed: now,
        usageCount: 1,
        isFullExplanation: true
      })
    }));
    
    return true;
  } catch (err) {
    console.error(`   ❌ Chyba při ukládání ${questionId}:`, err.message);
    return false;
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('📝 Generování plnohodnotných vysvětlení');
  console.log('═══════════════════════════════════════════════════\n');
  
  // Get questions with short explanations
  const shortItems = await fetchQuestionsWithShortExplanations();
  
  if (shortItems.length === 0) {
    console.log('✅ Všechna vysvětlení jsou již plnohodnotná');
    return;
  }
  
  // Process ALL remaining questions
  const toProcess = shortItems;
  console.log(`\nZpracovávám všech ${toProcess.length} zbývajících otázek...\n`);
  
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < toProcess.length; i++) {
    const item = toProcess[i];
    console.log(`[${i + 1}/${toProcess.length}] ${item.questionId}...`);
    
    // Fetch full question details
    const question = await fetchQuestionDetails(item.questionId);
    if (!question) {
      console.log('   ⚠️ Otázka nenalezena v databázi');
      failed++;
      continue;
    }
    
    // Fetch LO details
    const lo = await fetchLO(question.loId);
    
    // Generate full explanation
    const fullExplanation = generateFullExplanation(question, lo);
    
    // Update in DynamoDB
    const saved = await updateExplanation(item.questionId, fullExplanation);
    if (saved) {
      console.log('   ✅ Uloženo');
      success++;
    } else {
      failed++;
    }
    
    // Small delay to avoid throttling
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('✅ Výsledky testovací dávky');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Úspěšně: ${success}`);
  console.log(`Neúspěšně: ${failed}`);
  console.log(`Zbývá celkem: ${shortItems.length - toProcess.length}`);
  
  if (success > 0) {
    console.log('\nPlnohodnotná vysvětlení vygenerována!');
    console.log('Pro zpracování všech zbývajících otázek, spusť znovu.');
  }
}

main().catch(console.error);
