const { DynamoDBClient, ListTablesCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, ScanCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: "eu-central-1" });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE = "aeropilot-questions";

// První 10 otázek z subject_1.json
const jsonQuestions = [
  { id: 1, text: "Který z následujících dokumentů musí být na palubě" },
  { id: 2, text: "Jaký prostor je možno proletět s určitými omezeními" },
  { id: 3, text: "Kde lze nalézt druh omezení pro omezený prostor" },
  { id: 4, text: "Jaké je postavení pravidel a postupů vytvořených v EASA" },
  { id: 5, text: "Jakou dobu platnosti má Osvědčení letové způsobilosti" },
  { id: 6, text: "Co znamená zkratka ARC" },
  { id: 7, text: "Osvědčení letové způsobilosti vydává stát" },
  { id: 8, text: "Průkaz pilot vydaný podle standardů ICAO je platný" },
  { id: 9, text: "Co je předmětem Anexu 1 ICAO" },
  { id: 10, text: "Jaká je doba platnosti průkazu soukromého pilota" },
];

// Různé formáty questionId které app používá
const keyFormats = (subjectId, id) => [
  `${subjectId}_${id}`,       // "1_1"
  `${id}`,                     // "1"
  `easa_${subjectId}_${id}`,  // "easa_1_1"
  `q_${subjectId}_${id}`,     // "q_1_1"
  `${String(id).padStart(5, '0')}`, // "00001"
];

async function tryGet(questionId) {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { questionId }
    }));
    return result.Item || null;
  } catch {
    return null;
  }
}

async function scanForText(textFragment) {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: "contains(#q, :t)",
      ExpressionAttributeNames: { "#q": "question" },
      ExpressionAttributeValues: { ":t": textFragment.substring(0, 30) },
      Limit: 5
    }));
    return result.Items || [];
  } catch {
    return [];
  }
}

async function main() {
  console.log("=== Hledám prvních 10 JSON otázek v DynamoDB ===\n");

  for (const q of jsonQuestions) {
    console.log(`\n--- Otázka ${q.id}: "${q.text.substring(0, 50)}..." ---`);

    // Zkus všechny formáty klíčů
    let found = null;
    let foundKey = null;
    for (const key of keyFormats(1, q.id)) {
      const item = await tryGet(key);
      if (item) {
        found = item;
        foundKey = key;
        break;
      }
    }

    if (found) {
      console.log(`  ✅ Nalezena v DynamoDB klíčem: "${foundKey}"`);
      console.log(`     questionId: ${found.questionId}`);
      console.log(`     correct: ${found.correct} / correctOption: ${found.correctOption}`);
      console.log(`     subjectId: ${found.subjectId}`);
    } else {
      // Zkus full text scan
      console.log("  ⚠️  Nenalezena přes GetItem, zkouším scan...");
      const scanResults = await scanForText(q.text);
      if (scanResults.length > 0) {
        console.log(`  ✅ Nalezena přes scan!`);
        scanResults.forEach(r => console.log(`     questionId: ${r.questionId}, correct: ${r.correct}`));
      } else {
        console.log(`  ❌ Nenalezena v DynamoDB vůbec`);
      }
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
