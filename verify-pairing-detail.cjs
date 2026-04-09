const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({ region: "eu-central-1" });

async function verifyPairing() {
  console.log("🔍 KONTROLA PÁROVÁNÍ OTÁZEK A VYSVĚTLENÍ\n");
  
  // Get all agent-full explanations
  const result = await client.send(new ScanCommand({
    TableName: "aeropilot-ai-explanations",
    FilterExpression: "provider = :p",
    ExpressionAttributeValues: { ":p": { S: "agent-full" } }
  }));
  
  const explanations = result.Items?.map(i => unmarshall(i)) || [];
  console.log(`Nalezeno ${explanations.length} vysvětlení s provider=agent-full\n`);
  
  // Check first 5
  let matched = 0;
  let mismatched = 0;
  
  for (const exp of explanations.slice(0, 5)) {
    const qid = exp.questionId;
    console.log(`[${qid}]`);
    
    // Fetch the question
    const qResult = await client.send(new ScanCommand({
      TableName: "aeropilot-questions",
      FilterExpression: "questionId = :qid",
      ExpressionAttributeValues: { ":qid": { S: qid } }
    }));
    
    if (!qResult.Items || qResult.Items.length === 0) {
      console.log("  ❌ Otázka nenalezena v databázi");
      mismatched++;
      continue;
    }
    
    const question = unmarshall(qResult.Items[0]);
    const correctIdx = question.correctOption?.charCodeAt(0) - 65;
    const correctText = question.answers?.[correctIdx] || "";
    
    console.log("  Otázka:", question.question?.substring(0, 50) + "...");
    console.log("  Správná odpověď:", question.correctOption, "-", correctText?.substring(0, 40));
    
    // Check if explanation mentions the answer
    const expText = exp.explanation || "";
    const containsAnswer = correctText && expText.toLowerCase().includes(correctText.toLowerCase().substring(0, 20));
    
    if (containsAnswer) {
      console.log("  ✅ Vysvětlení obsahuje text správné odpovědi");
      matched++;
    } else {
      console.log("  ⚠️ Vysvětlení neobsahuje konkrétní text odpovědi (generická šablona)");
      mismatched++;
    }
    
    console.log("");
  }
  
  console.log("═══════════════════════════════════════");
  console.log("SOUHRN (vzorek 5):");
  console.log(`  ✅ Obsahuje správnou odpověď: ${matched}`);
  console.log(`  ⚠️  Generická šablona: ${mismatched}`);
  console.log(`  Celkem zkontrolováno: ${explanations.length}`);
}

verifyPairing().catch(console.error);
