import { GoogleGenAI } from "@google/genai";

async function testConfig(apiKey: string, apiVersion: string) {
  console.log(`\n--- Testing API Version: ${apiVersion} ---`);
  const genAI = new GoogleGenAI({ apiKey, apiVersion });
  const models = [
    "gemini-1.5-flash", 
    "models/gemini-1.5-flash",
    "gemini-1.5-flash-latest", 
    "gemini-1.5-flash-002",
    "gemini-1.5-flash-8b",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-pro"
  ];

  for (const modelName of models) {
    try {
      const result = await genAI.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: "ping" }] }],
      });
      const text = result.text || "No text";
      console.log(`✅ Model ${modelName}: SUCCESS (${text.trim()})`);
    } catch (error: any) {
      const msg = error.message || "Unknown error";
      if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
        console.log(`❌ Model ${modelName}: QUOTA EXCEEDED (429)`);
      } else if (msg.includes("404") || msg.includes("NOT_FOUND")) {
        console.log(`❌ Model ${modelName}: NOT FOUND (404)`);
      } else {
        console.log(`❓ Model ${modelName}: ERROR - ${msg}`);
      }
    }
  }
}

async function verify() {
  // Get API key from environment variable or command line argument
  const apiKey = process.env.GOOGLE_API_KEY || process.argv[2];
  
  if (!apiKey) {
    console.error("❌ Please provide API key:");
    console.error("   Option 1: Set GOOGLE_API_KEY environment variable");
    console.error("   Option 2: Pass as argument: npm run test-key YOUR_API_KEY");
    process.exit(1);
  }
  
  await testConfig(apiKey, "v1beta");
  await testConfig(apiKey, "v1");
}

verify();
