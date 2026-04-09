const { DynamoDBClient, ScanCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const CONFIG = {
  region: process.env.AWS_REGION || 'eu-central-1',
  explanationsTable: 'aeropilot-ai-explanations',
  questionsTable: 'aeropilot-questions',
};

const client = new DynamoDBClient({ region: CONFIG.region });

async function fetchExplanation(questionId) {
  try {
    const result = await client.send(new GetItemCommand({
      TableName: CONFIG.explanationsTable,
      Key: { questionId: { S: questionId } }
    }));
    return result.Item ? unmarshall(result.Item) : null;
  } catch (err) {
    return null;
  }
}

async function fetchQuestion(questionId) {
  try {
    const result = await client.send(new ScanCommand({
      TableName: CONFIG.questionsTable,
      FilterExpression: 'questionId = :qid',
      ExpressionAttributeValues: marshall({ ':qid': questionId })
    }));
    return result.Items && result.Items.length > 0 ? unmarshall(result.Items[0]) : null;
  } catch (err) {
    return null;
  }
}

async function verifyPairing() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('🔍 KONTROLA PÁROVÁNÍ OTÁZEK A VYSVĚTLENÍ');
  console.log('═══════════════════════════════════════════════════\n');
  
  // Sample of questions to check from different subjects
  const sampleIds = [
    'subject2_q54', 'subject2_q39', 'subject2_q4',   // Subject 2
    'subject5_q89', 'subject5_q35', 'subject5_q64',  // Subject 5
    'subject9_q84', 'subject9_q78', 'subject9_q90',  // Subject 9
  ];
  
  let matched = 0;
  let mismatched = 0;
  let missing = 0;
  
  for (const qid of sampleIds) {
    console.log(`\n[${qid}]`);
    
    const question = await fetchQuestion(qid);
    const explanation = await fetchExplanation(qid);
    
    if (!question) {
      console.log('  ❌ Otázka nenalezena v databázi');
      missing++;
      continue;
    }
    
    if (!explanation) {
      console.log('  ❌ Vysvětlení nenalezeno v databázi');
      missing++;
      continue;
    }
    
    // Get correct answer from question
    const correctIdx = question.correctOption ? question.correctOption.charCodeAt(0) - 65 : -1;
    const correctAnswerText = (question.answers && question.answers[correctIdx]) || '';
    
    console.log('  Otázka:', question.question?.substring(0, 60) + '...' || 'N/A');
    console.log('  Správná odpověď:', question.correctOption, '-', correctAnswerText?.substring(0, 50) || 'N/A');
    
    // Check if explanation contains the answer text
    const expText = explanation.explanation || '';
    const containsAnswer = correctAnswerText && expText.toLowerCase().includes(correctAnswerText.toLowerCase().substring(0, 30));
    
    // Check for question ID in explanation
    const containsQuestionId = expText.includes(qid);
    
    if (containsAnswer || containsQuestionId) {
      console.log('  ✅ Vysvětlení odpovídá otázce');
      matched++;
    } else {
      console.log('  ⚠️  Vysvětlení NEOBSAHUJE text správné odpovědi ani ID otázky');
      console.log('      (Může být generické šablony)');
      mismatched++;
    }
    
    // Show excerpt
    const firstLine = expText.split('\n')[0];
    console.log('  První řádek vysvětlení:', firstLine?.substring(0, 60) + '...' || 'N/A');
  }
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('📊 SOUHRN KONTROLY');
  console.log('═══════════════════════════════════════════════════');
  console.log(`✅ Správně spárováno: ${matched}/${sampleIds.length}`);
  console.log(`⚠️  Nesedí obsah: ${mismatched}/${sampleIds.length}`);
  console.log(`❌ Chybí data: ${missing}/${sampleIds.length}`);
  
  if (mismatched > 0) {
    console.log('\n⚠️  Upozornění: Některá vysvětlení používají generickou šablonu');
    console.log('   bez konkrétního textu odpovědi. To je očekávané u šablonových');
    console.log('   vysvětlení, ale pro kvalitu by bylo lepší mít specifický obsah.');
  }
}

verifyPairing().catch(console.error);
