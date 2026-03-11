// AWS DynamoDB Service - LAZY INITIALIZATION VERSION
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, DeleteItemCommand, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand as DocGetCommand, PutCommand as DocPutCommand, UpdateCommand as DocUpdateCommand, DeleteCommand as DocDeleteCommand, QueryCommand as DocQueryCommand, ScanCommand as DocScanCommand, BatchWriteCommand as DocBatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { awsConfig, getTableName, TABLE_NAMES, getSecureDynamoClient, getSecureDocClient, isSecureCredentialsAvailable } from './awsConfig';
import { 
  DynamoDBResponse, 
  ExplanationItem, 
  ObjectiveItem, 
  UserProgressItem, 
  QuestionFlagItem,
  CacheStats,
  DynamoDBError,
  createDynamoDBError,
  DynamoDBErrorCode
} from '../types/aws';

export class DynamoDBService {
  private client: DynamoDBClient | null = null;
  private docClient: DynamoDBDocumentClient | null = null;
  private isInitialized: boolean = false;
  private isInitializing: boolean = false;

  constructor() {
    // Už žádné throw new Error()! 
    // Jen zkusíme tichou inicializaci při startu.
    this.tryInitialize();
  }

  private tryInitialize() {
    if (this.isInitializing || this.isInitialized) {
      return;
    }

    this.isInitializing = true;

    try {
      if (!isSecureCredentialsAvailable()) {
        return;
      }

      this.client = getSecureDynamoClient();
      this.docClient = getSecureDocClient();
      this.isInitialized = true;
      
    } catch (error) {
      // Silent fail - initialization will be retried
    } finally {
      this.isInitializing = false;
    }
  }

  // Metoda, kterou zavoláš před každým dotazem do DB
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized && this.client && this.docClient) {
      return;
    }

    // Retry up to 50x with 100ms delay (5 seconds total) waiting for credentials
    for (let i = 0; i < 50; i++) {
      this.tryInitialize();
      if (this.isInitialized && this.client && this.docClient) {
        return;
      }
      await new Promise(r => setTimeout(r, 100));
    }

    throw new Error('DynamoDB client není připraven. Zkontrolujte AWS konfiguraci.');
  }

  // Generic error handler
  private handleError(error: any, operation: string): DynamoDBError {
    console.error(`DynamoDB ${operation} error:`, error);
    
    const dynamoError = createDynamoDBError(error);
    
    // Handle specific error cases
    switch (dynamoError.code) {
      case DynamoDBErrorCode.PROVISIONED_THROUGHPUT_EXCEEDED:
        console.warn('DynamoDB throughput exceeded, implementing backoff');
        break;
      case DynamoDBErrorCode.RESOURCE_NOT_FOUND:
        console.error('DynamoDB resource not found:', error.message);
        break;
      case DynamoDBErrorCode.VALIDATION_EXCEPTION:
        console.error('DynamoDB validation error:', error.message);
        break;
    }

    return dynamoError;
  }

  // AI Explanations Cache Operations
  
  async getCachedExplanation(questionId: string, model: string): Promise<DynamoDBResponse<ExplanationItem>> {
    try {
      await this.ensureInitialized();

      const command = new DocGetCommand({
        TableName: getTableName('AI_EXPLANATIONS'),
        Key: {
          questionId,
          model
        }
      });

      const result = await this.docClient.send(command);

      if (result.Item) {
        // Update usage count
        await this.updateExplanationUsage(questionId, model);
        
        return {
          success: true,
          data: result.Item as ExplanationItem,
          consumedCapacity: result.ConsumedCapacity?.CapacityUnits
        };
      }

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'getCachedExplanation').message
      };
    }
  }

  async saveExplanation(
    questionId: string,
    explanation: string,
    detailedExplanation: string | null,
    provider: 'gemini' | 'claude',
    model: string
  ): Promise<DynamoDBResponse> {
    try {
      await this.ensureInitialized();

      const now = new Date().toISOString();
      const item = {
        questionId,
        model,
        explanation,
        ...(detailedExplanation ? { detailedExplanation } : {}),
        provider,
        usageCount: 1,
        createdAt: now,
        lastUsed: now
      };

      const command = new DocPutCommand({
        TableName: getTableName('AI_EXPLANATIONS'),
        Item: item
      });

      await this.docClient.send(command);

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'saveExplanation').message
      };
    }
  }

  private async updateExplanationUsage(questionId: string, model: string): Promise<void> {
    try {
      const command = new DocUpdateCommand({
        TableName: getTableName('AI_EXPLANATIONS'),
        Key: { questionId, model },
        UpdateExpression: 'ADD usageCount :inc SET lastUsed = :now',
        ExpressionAttributeValues: {
          ':inc': 1,
          ':now': new Date().toISOString()
        }
      });

      await this.docClient.send(command);
    } catch (error) {
      console.warn('Failed to update explanation usage:', error);
    }
  }

  private async updateExplanation(
    questionId: string,
    explanation: string,
    detailedExplanation: string | null,
    provider: 'gemini' | 'claude',
    model: string
  ): Promise<DynamoDBResponse> {
    try {
      const command = new DocUpdateCommand({
        TableName: getTableName('AI_EXPLANATIONS'),
        Key: { questionId, model },
        UpdateExpression: 'SET explanation = :exp, detailedExplanation = :detail, provider = :prov, lastUsed = :now',
        ExpressionAttributeValues: {
          ':exp': explanation,
          ':detail': detailedExplanation,
          ':prov': provider,
          ':now': new Date().toISOString()
        }
      });

      const result = await this.docClient.send(command);

      return {
        success: true,
        consumedCapacity: result.ConsumedCapacity?.CapacityUnits
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'updateExplanation').message
      };
    }
  }

  // Learning Objectives Cache Operations

  async getCachedObjective(questionId: string): Promise<DynamoDBResponse<ObjectiveItem>> {
    try {
      await this.ensureInitialized();

      const command = new DocGetCommand({
        TableName: getTableName('LEARNING_OBJECTIVES'),
        Key: { questionId }
      });

      const result = await this.docClient.send(command);

      return {
        success: true,
        data: result.Item as ObjectiveItem,
        consumedCapacity: result.ConsumedCapacity?.CapacityUnits
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'getCachedObjective').message
      };
    }
  }

  async saveObjective(questionId: string, objective: string, confidence: number = 0.8): Promise<DynamoDBResponse> {
    try {
      await this.ensureInitialized();

      const item: ObjectiveItem = {
        questionId,
        objective,
        confidence,
        createdAt: new Date().toISOString()
      };

      const command = new DocPutCommand({
        TableName: getTableName('LEARNING_OBJECTIVES'),
        Item: item
      });

      const result = await this.docClient.send(command);

      return {
        success: true,
        consumedCapacity: result.ConsumedCapacity?.CapacityUnits
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'saveObjective').message
      };
    }
  }

  // User Progress Operations

  async saveUserProgress(
    userId: string,
    questionId: string,
    isCorrect: boolean,
    attempts: number = 1
  ): Promise<DynamoDBResponse> {
    try {
      await this.ensureInitialized();

      const item: UserProgressItem = {
        userId,
        questionId,
        isCorrect,
        answerTimestamp: new Date().toISOString(),
        attempts
      };

      const command = new DocPutCommand({
        TableName: getTableName('USER_PROGRESS'),
        Item: item
      });

      const result = await this.docClient.send(command);

      return {
        success: true,
        consumedCapacity: result.ConsumedCapacity?.CapacityUnits
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'saveUserProgress').message
      };
    }
  }

  // Question Flags Operations

  async toggleQuestionFlag(questionId: string, isFlagged: boolean, flagReason?: string): Promise<DynamoDBResponse> {
    try {
      await this.ensureInitialized();

      if (isFlagged) {
        const item: QuestionFlagItem = {
          questionId,
          isFlagged: true,
          flaggedAt: new Date().toISOString(),
          flagReason
        };

        const command = new DocPutCommand({
          TableName: getTableName('QUESTION_FLAGS'),
          Item: item
        });

        const result = await this.docClient.send(command);

        return {
          success: true,
          consumedCapacity: result.ConsumedCapacity?.CapacityUnits
        };
      } else {
        // Remove the flag
        const command = new DocDeleteCommand({
          TableName: getTableName('QUESTION_FLAGS'),
          Key: { questionId }
        });

        const result = await this.docClient.send(command);

        return {
          success: true,
          consumedCapacity: result.ConsumedCapacity?.CapacityUnits
        };
      }

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'toggleQuestionFlag').message
      };
    }
  }

  async getQuestionFlag(questionId: string): Promise<DynamoDBResponse<QuestionFlagItem>> {
    try {
      await this.ensureInitialized();

      const command = new DocGetCommand({
        TableName: getTableName('QUESTION_FLAGS'),
        Key: { questionId }
      });

      const result = await this.docClient.send(command);

      return {
        success: true,
        data: result.Item as QuestionFlagItem,
        consumedCapacity: result.ConsumedCapacity?.CapacityUnits
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'getQuestionFlag').message
      };
    }
  }

  // Cache Statistics

  async getCacheStats(): Promise<DynamoDBResponse<CacheStats>> {
    try {
      await this.ensureInitialized();

      // For simplicity, we'll do basic counts. In production, you might want
      // to use DynamoDB streams or CloudWatch for better performance
      const stats: CacheStats = {
        explanations: 0,
        objectives: 0,
        userProgress: 0,
        flags: 0,
        totalUsage: 0,
        storageSize: 0
      };

      // Count explanations (simplified - would use scan in production)
      const explanationsCommand = new DocQueryCommand({
        TableName: getTableName('AI_EXPLANATIONS'),
        Select: 'COUNT'
      });

      const explanationsResult = await this.docClient.send(explanationsCommand);
      stats.explanations = explanationsResult.Count || 0;

      // Count objectives
      const objectivesCommand = new DocQueryCommand({
        TableName: getTableName('LEARNING_OBJECTIVES'),
        Select: 'COUNT'
      });

      const objectivesResult = await this.docClient.send(objectivesCommand);
      stats.objectives = objectivesResult.Count || 0;

      // Count flags
      const flagsCommand = new DocQueryCommand({
        TableName: getTableName('QUESTION_FLAGS'),
        Select: 'COUNT'
      });

      const flagsResult = await this.docClient.send(flagsCommand);
      stats.flags = flagsResult.Count || 0;

      return {
        success: true,
        data: stats
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'getCacheStats').message
      };
    }
  }

  // Health check
  async healthCheck(): Promise<DynamoDBResponse<{ status: string; timestamp: string }>> {
    try {
      await this.ensureInitialized();

      // Simple health check - try to get a non-existent item
      const command = new DocGetCommand({
        TableName: getTableName('AI_EXPLANATIONS'),
        Key: { questionId: 'health-check', model: 'test' }
      });

      await this.docClient.send(command);

      return {
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      // 404 is expected for health check
      if (error.name === 'ResourceNotFoundException') {
        return {
          success: true,
          data: {
            status: 'healthy',
            timestamp: new Date().toISOString()
          }
        };
      }

      return {
        success: false,
        error: this.handleError(error, 'healthCheck').message
      };
    }
  }

  // Questions Operations
  async getAllQuestionCounts(): Promise<DynamoDBResponse<{
    total: Record<number, number>;
    user: Record<number, number>;
    ai: Record<number, number>;
  }>> {
    try {
      await this.ensureInitialized();

      const command = new DocScanCommand({
        TableName: 'aeropilot-questions'
      });

      const result = await this.docClient.send(command);
      const total: Record<number, number> = {};
      const user: Record<number, number> = {};
      const ai: Record<number, number> = {};

      for (const item of result.Items || []) {
        const sid = item.subjectId as number;
        const src = item.source as string || 'user'; // Missing source = user
        total[sid] = (total[sid] || 0) + 1;
        if (src === 'ai') {
          ai[sid] = (ai[sid] || 0) + 1;
        } else {
          user[sid] = (user[sid] || 0) + 1;
        }
      }

      return { success: true, data: { total, user, ai } };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'getAllQuestionCounts').message
      };
    }
  }

  async getQuestionsBySubject(subjectId: number): Promise<DynamoDBResponse<any[]>> {
    try {
      await this.ensureInitialized();

      const command = new DocScanCommand({
        TableName: 'aeropilot-questions',
        FilterExpression: 'subjectId = :sid',
        ExpressionAttributeValues: { ':sid': subjectId }
      });

      const result = await this.docClient.send(command);

      return {
        success: true,
        data: result.Items as any[] || []
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'getQuestionsBySubject').message
      };
    }
  }

  async getAllQuestions(): Promise<DynamoDBResponse<any[]>> {
    try {
      await this.ensureInitialized();

      const command = new DocScanCommand({
        TableName: 'aeropilot-questions'
      });

      const result = await this.docClient.send(command);

      return {
        success: true,
        data: result.Items as any[] || []
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'getAllQuestions').message
      };
    }
  }

  async saveQuestion(subjectId: number, question: any): Promise<DynamoDBResponse> {
    try {
      await this.ensureInitialized();

      const optionKeys = ['A', 'B', 'C', 'D'];
      const item = {
        questionId: `subject${subjectId}_ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        subjectId,
        question: question.question,
        answers: question.answers,
        correct: question.correct,
        correctOption: optionKeys[question.correct] || 'A',
        explanation: question.explanation || null,
        loId: question.lo_id || null,
        source: 'ai',
        createdAt: new Date().toISOString(),
        createdBy: 'ai_generator'
      };

      await this.docClient.send(new DocPutCommand({
        TableName: 'aeropilot-questions',
        Item: item
      }));

      return { success: true };
    } catch (error) {
      return { success: false, error: this.handleError(error, 'saveQuestion').message };
    }
  }

  // User Profile Operations
  async saveUserProfile(username: string, password?: string): Promise<DynamoDBResponse> {
    try {
      await this.ensureInitialized();

      const item = {
        userId: username,
        username,
        ...(password && { password }), // Only include password if provided
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      };

      const command = new DocPutCommand({
        TableName: 'aeropilot-users',
        Item: item
      });

      const result = await this.docClient.send(command);

      return {
        success: true,
        consumedCapacity: result.ConsumedCapacity?.CapacityUnits
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'saveUserProfile').message
      };
    }
  }

  // Cognito User Profile Operations
  async saveCognitoUserProfile(userData: {
    userId: string;
    username: string;
    email?: string;
  }): Promise<DynamoDBResponse> {
    try {
      await this.ensureInitialized();

      const item = {
        userId: userData.userId, // Cognito UUID
        username: userData.username, // cognito:username
        email: userData.email,
        authProvider: 'cognito',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      };

      const command = new DocPutCommand({
        TableName: 'aeropilot-users',
        Item: item,
        ConditionExpression: 'attribute_not_exists(userId)' // Only create if doesn't exist
      });

      await this.docClient!.send(command);

      return {
        success: true
      };

    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        // User already exists - just update last login
        return this.updateUserLastLogin(userData.userId);
      }
      return {
        success: false,
        error: this.handleError(error, 'saveCognitoUserProfile').message
      };
    }
  }

  async updateUserLastLogin(userId: string): Promise<DynamoDBResponse> {
    try {
      await this.ensureInitialized();

      const command = new DocUpdateCommand({
        TableName: 'aeropilot-users',
        Key: { userId },
        UpdateExpression: 'SET lastLoginAt = :lastLoginAt',
        ExpressionAttributeValues: {
          ':lastLoginAt': new Date().toISOString()
        }
      });

      await this.docClient!.send(command);

      return {
        success: true
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'updateUserLastLogin').message
      };
    }
  }

  async getCognitoUserProfile(userId: string): Promise<DynamoDBResponse & { data?: any }> {
    try {
      await this.ensureInitialized();

      const command = new DocGetCommand({
        TableName: 'aeropilot-users',
        Key: {
          userId: userId // Cognito UUID
        }
      });

      const result = await this.docClient.send(command);

      return {
        success: true,
        data: result.Item
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'getUserProfile').message
      };
    }
  }
}

// Singleton instance
export const dynamoDBService = new DynamoDBService();
