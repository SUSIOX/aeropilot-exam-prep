const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: "eu-central-1" });
const docClient = DynamoDBDocumentClient.from(client);

async function run() {
  const result = await docClient.send(new GetCommand({
    TableName: "aeropilot-easa-objectives",
    Key: { loId: "010.02.02.01.01" }
  }));
  console.log("Get Item:", JSON.stringify(result.Item, null, 2));

  // test if any items exist with this ID
  const scan = await docClient.send(new ScanCommand({
    TableName: "aeropilot-easa-objectives",
    FilterExpression: "contains(loId, :id) OR contains(losid, :id)",
    ExpressionAttributeValues: { ":id": "010.02.02.01.01" }
  }));
  console.log("Scan:", JSON.stringify(scan.Items, null, 2));
}

run().catch(console.error);
