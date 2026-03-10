# AWS DynamoDB Extension Setup Guide

## 🚀 Using AWS DynamoDB Extension

Since you have the AWS DynamoDB extension, we can use it to create and manage our tables directly!

## 📋 Step-by-Step Guide

### 1. Open DynamoDB Extension
- Open your AWS DynamoDB extension in VS Code or browser
- Make sure you're logged in with your AWS credentials
- Region should be set to `eu-central-1`

### 2. Create Required Tables

#### Table 1: aeropilot-ai-explanations
```
Table Name: aeropilot-ai-explanations
Partition Key: questionId (String)
Sort Key: model (String)
Billing Mode: Pay per request
```

#### Table 2: aeropilot-learning-objectives  
```
Table Name: aeropilot-learning-objectives
Partition Key: questionId (String)
Billing Mode: Pay per request
```

#### Table 3: aeropilot-user-progress
```
Table Name: aeropilot-user-progress
Partition Key: userId (String)
Sort Key: questionId (String)
Billing Mode: Pay per request
```

#### Table 4: aeropilot-question-flags
```
Table Name: aeropilot-question-flags
Partition Key: questionId (String)
Billing Mode: Pay per request
```

### 3. Alternative Table Names (if above don't work)
Try these variations if you encounter permission issues:
- `ai-explanations` (no prefix)
- `learning-objectives`
- `user-progress` 
- `question-flags`

## 🔧 After Creating Tables

Once tables are created, run this test:
```bash
npx tsx test-existing-tables.ts
```

## 📱 Extension Features to Use

### Table Operations
- **Create Table** - Use the extension's table creation wizard
- **View Items** - Browse existing data
- **Add Items** - Manually add test data
- **Query Items** - Test queries and filters

### Test Data
You can add test data directly through the extension:

#### Test AI Explanation
```json
{
  "questionId": "test-123",
  "model": "gemini-1.5-flash", 
  "explanation": "This is a test explanation",
  "provider": "gemini",
  "usageCount": 1,
  "createdAt": "2026-03-09T19:13:00Z",
  "lastUsed": "2026-03-09T19:13:00Z"
}
```

#### Test Learning Objective
```json
{
  "questionId": "test-123",
  "objective": "Test learning objective",
  "confidence": 0.8,
  "createdAt": "2026-03-09T19:13:00Z"
}
```

## 🔍 Testing Connection

After creating tables, use the extension to:

1. **Verify table creation** - Check if tables appear in the list
2. **Add test items** - Insert sample data
3. **Query data** - Test retrieval operations
4. **Check permissions** - Verify you can read/write

## 🚀 Integration Test

Once tables are ready, our application will automatically:
- ✅ Connect to DynamoDB using your credentials
- ✅ Use tables for AI explanation caching
- ✅ Implement rate limiting and monitoring
- ✅ Fall back to localStorage if needed

## 📊 Expected Results

After successful setup:
- ✅ All 4 tables visible in extension
- ✅ Test data can be added/queried
- ✅ Our connection test passes
- ✅ Application integrates successfully

## 🛠️ Troubleshooting

### Permission Issues
If you can't create tables:
- Check your IAM permissions
- Try alternative table names
- Contact your AWS admin

### Region Issues
Make sure extension is set to:
- **Region:** `eu-central-1`
- **Profile:** Your AWS profile

### Connection Issues
- Verify AWS credentials in extension
- Check network connectivity
- Try refreshing the extension

---

**Ready to create the tables? Use your DynamoDB extension now and then we'll test the connection!** 🚀
