// AWS DynamoDB Service - LAZY INITIALIZATION VERSION
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, DeleteItemCommand, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand as DocGetCommand, PutCommand as DocPutCommand, UpdateCommand as DocUpdateCommand, DeleteCommand as DocDeleteCommand, QueryCommand as DocQueryCommand, ScanCommand as DocScanCommand, BatchWriteCommand as DocBatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { awsConfig, getTableName, TABLE_NAMES, getSecureDynamoClient, getSecureDocClient, isSecureCredentialsAvailable } from './awsConfig';
import { 
  DynamoDBResponse, 
  ExplanationItem, 
  ObjectiveItem, 
  UserProgressItem, 
  UserSettingsItem,
  QuestionFlagItem,
  LOItem,
  QuestionObjective,
  EasaObjective,
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

  // Call this after switching credentials (e.g. guest → authenticated)
  public reinitialize(): void {
    this.isInitialized = false;
    this.isInitializing = false;
    this.client = null;
    this.docClient = null;
    this.tryInitialize();
  }

  // Metoda, kterou zavoláš před každým dotazem do DB
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized && this.client && this.docClient) {
      return;
    }

    // Check if we're in guest mode (no AWS credentials)
    if (!isSecureCredentialsAvailable()) {
      throw new Error('Guest mode: AWS credentials not available. Using local storage only.');
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
        TableName: getTableName('EASA_OBJECTIVES'),
        Key: { loId: `q_${questionId}` }
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
        loId: `q_${questionId}`,
        objective,
        confidence,
        createdAt: new Date().toISOString()
      };

      const command = new DocPutCommand({
        TableName: getTableName('EASA_OBJECTIVES'),
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

  // User Settings Operations

  async saveUserSettings(
    userId: string,
    settings: {
      sorting: 'default' | 'random' | 'hardest_first' | 'least_practiced';
      immediateFeedback: boolean;
      showExplanationOnDemand: boolean;
    }
  ): Promise<DynamoDBResponse> {
    try {
      await this.ensureInitialized();

      // Update existing user record in USERS table with settings
      const command = new DocUpdateCommand({
        TableName: getTableName('USERS'),
        Key: { userId },
        UpdateExpression: 'SET settings = :settings, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':settings': settings,
          ':updatedAt': new Date().toISOString()
        },
        ConditionExpression: 'attribute_exists(userId)' // Only update if user exists
      });

      const result = await this.docClient!.send(command);

      return {
        success: true,
        consumedCapacity: result.ConsumedCapacity?.CapacityUnits
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'saveUserSettings').message
      };
    }
  }

  async getUserSettings(userId: string): Promise<{success: boolean, settings?: any, error?: string}> {
    try {
      await this.ensureInitialized();

      // Get user record from USERS table and extract settings
      const command = new DocGetCommand({
        TableName: getTableName('USERS'),
        Key: { userId }
      });

      const result = await this.docClient.send(command);

      if (result.Item && result.Item.settings) {
        return {
          success: true,
          settings: result.Item.settings
        };
      } else {
        return {
          success: false,
          error: 'User settings not found'
        };
      }

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'getUserSettings').message
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

      // Count cached objectives (q_ prefixed records in EASA_OBJECTIVES)
      const objectivesCommand = new DocScanCommand({
        TableName: getTableName('EASA_OBJECTIVES'),
        Select: 'COUNT',
        FilterExpression: 'begins_with(loId, :prefix)',
        ExpressionAttributeValues: { ':prefix': 'q_' }
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
      // Check if we're in guest mode
      if (!isSecureCredentialsAvailable()) {
        console.log('Guest mode: returning empty question counts');
        return {
          success: true,
          data: { total: {}, user: {}, ai: {} }
        };
      }

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
        TableName: getTableName('QUESTIONS'),
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
        questionId: `subject${subjectId}_${question.source || 'user'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        subjectId,
        question: question.question,
        answers: question.answers,
        correct: question.correct,
        correctOption: optionKeys[question.correct] || 'A',
        explanation: question.explanation || null,
        loId: question.lo_id || null,
        source: question.source || 'user',
        createdAt: new Date().toISOString(),
        createdBy: question.source === 'ai' ? 'ai_generator' : 'user_import'
      };

      await this.docClient.send(new DocPutCommand({
        TableName: getTableName('QUESTIONS'),
        Item: item
      }));

      return { success: true };
    } catch (error) {
      return { success: false, error: this.handleError(error, 'saveQuestion').message };
    }
  }

  async deleteQuestion(questionId: string): Promise<DynamoDBResponse> {
    try {
      await this.ensureInitialized();

      await this.docClient.send(new DocDeleteCommand({
        TableName: getTableName('QUESTIONS'),
        Key: {
          questionId: questionId
        }
      }));

      return { success: true };
    } catch (error) {
      return { success: false, error: this.handleError(error, 'deleteQuestion').message };
    }
  }

  async deleteQuestionsBySubject(subjectId: number): Promise<DynamoDBResponse> {
    try {
      await this.ensureInitialized();

      // First get all questions for this subject
      const questions = await this.getQuestionsBySubject(subjectId);
      if (!questions.success || !questions.data) {
        return { success: false, error: 'Failed to get questions to delete' };
      }

      // Delete all questions in batch
      const deletePromises = questions.data.map((q: any) => 
        this.deleteQuestion(q.questionId)
      );
      
      const results = await Promise.all(deletePromises);
      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;

      return { 
        success: failed === 0, 
        data: { deleted: successful, failed },
        error: failed > 0 ? `Failed to delete ${failed} questions` : undefined
      };
    } catch (error) {
      return { success: false, error: this.handleError(error, 'deleteQuestionsBySubject').message };
    }
  }

  async updateQuestion(questionId: string, updatedQuestion: any): Promise<DynamoDBResponse> {
    try {
      await this.ensureInitialized();

      const optionKeys = ['A', 'B', 'C', 'D'];
      const updateExpression = `
        SET question = :question,
            answers = :answers,
            correct = :correct,
            correctOption = :correctOption,
            explanation = :explanation,
            loId = :loId,
            updatedAt = :now
      `;

      await this.docClient.send(new DocUpdateCommand({
        TableName: getTableName('QUESTIONS'),
        Key: {
          questionId: questionId
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: {
          ':question': updatedQuestion.question,
          ':answers': updatedQuestion.answers,
          ':correct': updatedQuestion.correct,
          ':correctOption': optionKeys[updatedQuestion.correct] || 'A',
          ':explanation': updatedQuestion.explanation || null,
          ':loId': updatedQuestion.lo_id || null,
          ':now': new Date().toISOString()
        }
      }));

      return { success: true };
    } catch (error) {
      return { success: false, error: this.handleError(error, 'updateQuestion').message };
    }
  }

  // Set or update the loId on an existing question (links question → EasaObjective)
  async updateQuestionLO(questionId: string, loId: string): Promise<DynamoDBResponse> {
    try {
      await this.ensureInitialized();

      const command = new DocUpdateCommand({
        TableName: getTableName('QUESTIONS'),
        Key: { questionId },
        UpdateExpression: 'SET loId = :loId, updatedAt = :now',
        ExpressionAttributeValues: {
          ':loId': loId,
          ':now': new Date().toISOString()
        }
      });

      await this.docClient.send(command);

      return { success: true };
    } catch (error) {
      return { success: false, error: this.handleError(error, 'updateQuestionLO').message };
    }
  }

  // Get a question together with its linked EasaObjective (single read + join)
  async getQuestionWithLO(questionId: string): Promise<DynamoDBResponse<{ question: any; objective: EasaObjective | null }>> {
    try {
      await this.ensureInitialized();

      // 1. Fetch the question
      const qCmd = new DocGetCommand({
        TableName: getTableName('QUESTIONS'),
        Key: { questionId }
      });
      const qResult = await this.docClient.send(qCmd);
      const question = qResult.Item;

      if (!question) {
        return { success: false, error: 'Question not found' };
      }

      // 2. If question has loId, fetch the EasaObjective
      let objective: EasaObjective | null = null;
      if (question.loId) {
        const loCmd = new DocGetCommand({
          TableName: getTableName('EASA_OBJECTIVES'),
          Key: { loId: question.loId }
        });
        const loResult = await this.docClient.send(loCmd);
        objective = (loResult.Item as EasaObjective) || null;
      }

      return { success: true, data: { question, objective } };

    } catch (error) {
      return { success: false, error: this.handleError(error, 'getQuestionWithLO').message };
    }
  }

  // Bulk-link questions to EasaObjectives based on their existing loId field
  async syncQuestionLOs(questionIds: string[]): Promise<DynamoDBResponse<{ linked: number; skipped: number }>> {
    try {
      await this.ensureInitialized();

      let linked = 0;
      let skipped = 0;

      for (const questionId of questionIds) {
        const qCmd = new DocGetCommand({
          TableName: getTableName('QUESTIONS'),
          Key: { questionId }
        });
        const qResult = await this.docClient.send(qCmd);
        const question = qResult.Item;

        if (!question?.loId) { skipped++; continue; }

        // Verify the EasaObjective exists
        const loCmd = new DocGetCommand({
          TableName: getTableName('EASA_OBJECTIVES'),
          Key: { loId: question.loId }
        });
        const loResult = await this.docClient.send(loCmd);

        if (loResult.Item) {
          // Link via QuestionObjectives table
          await this.linkQuestionToLO(questionId, question.loId, 1.0, 'sync');
          linked++;
        } else {
          skipped++;
        }
      }

      return { success: true, data: { linked, skipped } };

    } catch (error) {
      return { success: false, error: this.handleError(error, 'syncQuestionLOs').message };
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
        TableName: getTableName('USERS'),
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
        TableName: getTableName('USERS'),
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
        TableName: getTableName('USERS'),
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
        TableName: getTableName('USERS'),
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

  // Learning Objectives Operations

  async getLOById(losid: string): Promise<DynamoDBResponse<LOItem>> {
    try {
      await this.ensureInitialized();

      const command = new DocGetCommand({
        TableName: getTableName('EASA_OBJECTIVES'),
        Key: { loId: losid }
      });

      const result = await this.docClient.send(command);

      return {
        success: true,
        data: result.Item as LOItem,
        consumedCapacity: result.ConsumedCapacity?.CapacityUnits
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'getLOById').message
      };
    }
  }

  async getLOsBySubject(subjectId: number): Promise<DynamoDBResponse<LOItem[]>> {
    try {
      await this.ensureInitialized();

      const command = new DocScanCommand({
        TableName: getTableName('EASA_OBJECTIVES'),
        FilterExpression: 'subjectId = :sid',
        ExpressionAttributeValues: { ':sid': subjectId }
      });

      const result = await this.docClient.send(command);

      return {
        success: true,
        data: result.Items as LOItem[] || [],
        consumedCapacity: result.ConsumedCapacity?.CapacityUnits
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'getLOsBySubject').message
      };
    }
  }

  async batchImportLOs(los: (LOItem | EasaObjective | any)[]): Promise<DynamoDBResponse<{ imported: number; failed: number; errors: string[] }>> {
    try {
      await this.ensureInitialized();

      const batchSize = 25; // DynamoDB batch write limit
      let imported = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let i = 0; i < los.length; i += batchSize) {
        const batch = los.slice(i, i + batchSize);
        
        const writeRequests = batch.map(lo => ({
          PutRequest: { Item: lo }
        }));

        const command = new DocBatchWriteCommand({
          RequestItems: {
            [getTableName('EASA_OBJECTIVES')]: writeRequests
          }
        });

        try {
          const result = await this.docClient.send(command);
          
          // Check for unprocessed items
          const losTableName = getTableName('EASA_OBJECTIVES');
          if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
            failed += Object.keys(result.UnprocessedItems[losTableName] || []).length;
            errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${Object.keys(result.UnprocessedItems[losTableName] || []).length} items failed`);
          } else {
            imported += batch.length;
          }
        } catch (batchError) {
          failed += batch.length;
          errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${batchError.message}`);
        }
      }

      return {
        success: true,
        data: { imported, failed, errors }
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'batchImportLOs').message
      };
    }
  }

  async saveLO(lo: Omit<LOItem, 'createdAt' | 'updatedAt' | 'version'> & { losid: string; text: string; subject_id: number }): Promise<DynamoDBResponse> {
    try {
      await this.ensureInitialized();

      const now = new Date().toISOString();
      const item: LOItem = {
        ...lo,
        createdAt: now,
        updatedAt: now,
        version: 1
      };

      const command = new DocPutCommand({
        TableName: getTableName('EASA_OBJECTIVES'),
        Item: item
      });

      await this.docClient.send(command);

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'saveLO').message
      };
    }
  }

  async getAllLOs(): Promise<DynamoDBResponse<LOItem[]>> {
    try {
      // Check if we're in guest mode
      if (!isSecureCredentialsAvailable()) {
        console.log('Guest mode: returning empty LOs');
        return {
          success: true,
          data: []
        };
      }

      await this.ensureInitialized();

      const command = new DocScanCommand({
        TableName: getTableName('EASA_OBJECTIVES')
      });

      const result = await this.docClient.send(command);

      return {
        success: true,
        data: result.Items as LOItem[] || [],
        consumedCapacity: result.ConsumedCapacity?.CapacityUnits
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'getAllLOs').message
      };
    }
  }

  async getLOCount(): Promise<DynamoDBResponse<number>> {
    try {
      await this.ensureInitialized();

      const command = new DocScanCommand({
        TableName: getTableName('EASA_OBJECTIVES'),
        Select: 'COUNT'
      });

      const result = await this.docClient.send(command);

      return {
        success: true,
        data: result.Count || 0,
        consumedCapacity: result.ConsumedCapacity?.CapacityUnits
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'getLOCount').message
      };
    }
  }

  // Batch operation: save explanation + link question → EasaObjective
  async saveExplanationWithObjective(
    questionId: string,
    explanation: string,
    detailedExplanation: string | null,
    loId: string | null,               // EasaObjective.loId (e.g. "010.01.01.01")
    provider: 'gemini' | 'claude',
    model: string,
    confidence: number = 0.8
  ): Promise<DynamoDBResponse<{ explanationSaved: boolean; loLinked: boolean }>> {
    try {
      await this.ensureInitialized();

      const now = new Date().toISOString();
      const results = { explanationSaved: false, loLinked: false };

      // 1. Save AI explanation cache
      const explanationItem = {
        questionId,
        model,
        explanation,
        ...(detailedExplanation && { detailedExplanation }),
        provider,
        usageCount: 1,
        createdAt: now,
        lastUsed: now
      };

      await this.docClient.send(new DocPutCommand({
        TableName: getTableName('AI_EXPLANATIONS'),
        Item: explanationItem
      }));
      results.explanationSaved = true;

      // 2. If loId provided, link question → EasaObjective in both places
      if (loId) {
        // 2a. Update loId directly on the question record
        await this.updateQuestionLO(questionId, loId).catch(() => {});

        // 2b. Create M:N record in question-objectives table
        await this.linkQuestionToLO(questionId, loId, confidence, `ai-${provider}`).catch(() => {});

        results.loLinked = true;
      }

      return { success: true, data: results };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'saveExplanationWithObjective').message
      };
    }
  }

  // Cache refresh - force regeneration of explanation
  async refreshExplanation(
    questionId: string,
    model: string
  ): Promise<DynamoDBResponse> {
    try {
      await this.ensureInitialized();

      const command = new DocDeleteCommand({
        TableName: getTableName('AI_EXPLANATIONS'),
        Key: { questionId, model }
      });

      await this.docClient.send(command);

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'refreshExplanation').message
      };
    }
  }
// QuestionObjectives Operations (Many-to-Many)
  
  async linkQuestionToLO(
    questionId: string, 
    loId: string, 
    confidence: number = 0.8,
    matchedBy: string = 'ai-gemini'
  ): Promise<DynamoDBResponse> {
    try {
      await this.ensureInitialized();

      const now = new Date().toISOString();
      const item = {
        questionId,
        loId,
        confidence,
        matchedBy,
        createdAt: now,
        updatedAt: now
      };

      const command = new DocPutCommand({
        TableName: getTableName('QUESTION_OBJECTIVES'),
        Item: item
      });

      await this.docClient.send(command);

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'linkQuestionToLO').message
      };
    }
  }

  async getQuestionLOs(questionId: string): Promise<DynamoDBResponse<QuestionObjective[]>> {
    try {
      await this.ensureInitialized();

      const command = new DocQueryCommand({
        TableName: getTableName('QUESTION_OBJECTIVES'),
        KeyConditionExpression: 'questionId = :qid',
        ExpressionAttributeValues: { ':qid': questionId }
      });

      const result = await this.docClient.send(command);

      return {
        success: true,
        data: result.Items as QuestionObjective[] || [],
        consumedCapacity: result.ConsumedCapacity?.CapacityUnits
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'getQuestionLOs').message
      };
    }
  }

  async getLOQuestions(loId: string): Promise<DynamoDBResponse<QuestionObjective[]>> {
    try {
      await this.ensureInitialized();

      const command = new DocScanCommand({
        TableName: getTableName('QUESTION_OBJECTIVES'),
        FilterExpression: 'loId = :loid',
        ExpressionAttributeValues: { ':loid': loId }
      });

      const result = await this.docClient.send(command);

      return {
        success: true,
        data: result.Items as QuestionObjective[] || [],
        consumedCapacity: result.ConsumedCapacity?.CapacityUnits
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'getLOQuestions').message
      };
    }
  }
}

// Singleton instance
export const dynamoDBService = new DynamoDBService();
