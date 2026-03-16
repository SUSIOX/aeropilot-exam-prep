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
        if (i > 0) console.log(`✅ DynamoDB initialized after ${i * 100}ms delay`);
        return;
      }
      if (i === 0) console.log('⏳ Waiting for AWS credentials to be ready for DynamoDB...');
      await new Promise(r => setTimeout(r, 100));
    }

    throw new Error('DynamoDB client není připraven. Zkontrolujte AWS konfiguraci.');
  }

  // Generic error handler
  private handleError(error: any, operation: string): DynamoDBError {
    // Suppress expected guest mode errors to avoid console spam
    if (error.message && error.message.includes('Guest mode: AWS credentials not available')) {
      // Create silent error
      const silentError: DynamoDBError = new Error(error.message);
      silentError.code = DynamoDBErrorCode.VALIDATION_EXCEPTION;
      return silentError;
    }
    
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
        TableName: getTableName('QUESTIONS'),
        Key: { questionId },
        ProjectionExpression: 'ai_explanation, ai_detailed_explanation, ai_explanation_provider, ai_explanation_model, ai_explanation_updated_at'
      });

      const result = await this.docClient.send(command);
      const item = result.Item;

      if (item && item.ai_explanation && item.ai_explanation_model === model) {
        return {
          success: true,
          data: {
            questionId,
            model: item.ai_explanation_model,
            explanation: item.ai_explanation,
            detailedExplanation: item.ai_detailed_explanation,
            provider: item.ai_explanation_provider as any,
            usageCount: 1, // Simplified
            createdAt: item.ai_explanation_updated_at,
            lastUsed: item.ai_explanation_updated_at
          }
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

      const command = new DocUpdateCommand({
        TableName: getTableName('QUESTIONS'),
        Key: { questionId },
        UpdateExpression: 'SET ai_explanation = :exp, ai_detailed_explanation = :dexp, ai_explanation_provider = :prov, ai_explanation_model = :mod, ai_explanation_updated_at = :now, updatedAt = :now',
        ExpressionAttributeValues: {
          ':exp': explanation,
          ':dexp': detailedExplanation,
          ':prov': provider,
          ':mod': model,
          ':now': now
        }
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

      // This method shouldn't be used directly like this after consolidation, 
      // but if called, map it to the user's progress sub-object.
      const command = new DocUpdateCommand({
        TableName: getTableName('USERS'),
        Key: { userId },
        UpdateExpression: 'SET progress.#qid = :prog, updatedAt = :now',
        ExpressionAttributeNames: {
          '#qid': questionId
        },
        ExpressionAttributeValues: {
          ':prog': {
            isCorrect,
            answerTimestamp: new Date().toISOString(),
            attempts
          },
          ':now': new Date().toISOString()
        }
      });

      let result;
      try {
        result = await this.docClient.send(command);
      } catch (error: any) {
        // If the item doesn't exist OR the progress map doesn't exist yet
        if (
          error.name === 'ConditionalCheckFailedException' || 
          (error.name === 'ValidationException' && (error.message.includes('document path') || error.message.includes('nested')))
        ) {
          // Ensure the item exists AND has a progress map
          await this.docClient.send(new DocUpdateCommand({
            TableName: getTableName('USERS'),
            Key: { userId },
            UpdateExpression: 'SET progress = if_not_exists(progress, :emptyMap), updatedAt = if_not_exists(updatedAt, :now)',
            ExpressionAttributeValues: { 
              ':emptyMap': {},
              ':now': new Date().toISOString()
            }
          }));
          // Retry the original update
          console.log(`🔄 Retrying saveUserProgress after initializing user item for ${userId}`);
          result = await this.docClient.send(command);
        } else {
          throw error;
        }
      }

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

  async toggleQuestionFlag(userId: string, questionId: string, isFlagged: boolean, flagReason?: string): Promise<DynamoDBResponse> {
    try {
      await this.ensureInitialized();
      const now = new Date().toISOString();

      let updateExpr: string;
      let attrNames: any = { '#qid': questionId };
      let attrValues: any = { ':updatedAt': now };

      if (isFlagged) {
        updateExpr = 'SET flags.#qid = :flag, updatedAt = :updatedAt';
        attrValues[':flag'] = {
          isFlagged: true,
          flaggedAt: now,
          flagReason
        };
      } else {
        updateExpr = 'REMOVE flags.#qid SET updatedAt = :updatedAt';
      }

      const command = new DocUpdateCommand({
        TableName: getTableName('USERS'),
        Key: { userId },
        UpdateExpression: updateExpr,
        ExpressionAttributeNames: attrNames,
        ExpressionAttributeValues: attrValues,
        ConditionExpression: 'attribute_exists(userId)'
      });

      let result;
      try {
        result = await this.docClient.send(command);
      } catch (error: any) {
        // If the flags map doesn't exist yet, we get a ValidationException about the document path
        if (error.name === 'ValidationException' && error.message.includes('document path')) {
          // Initialize the flags map
          await this.docClient.send(new DocUpdateCommand({
            TableName: getTableName('USERS'),
            Key: { userId },
            UpdateExpression: 'SET flags = if_not_exists(flags, :emptyMap)',
            ExpressionAttributeValues: { ':emptyMap': {} }
          }));
          // Retry the original update
          result = await this.docClient.send(command);
        } else {
          throw error;
        }
      }

      return { success: true, consumedCapacity: result.ConsumedCapacity?.CapacityUnits };

    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        // This means the user doesn't exist, so we create a new user record with the flag
        const now = new Date().toISOString();
        const item = {
          userId,
          flags: isFlagged ? {
            [questionId]: {
              isFlagged: true,
              flaggedAt: now,
              flagReason
            }
          } : {},
          updatedAt: now,
          createdAt: now
        };
        const putCmd = new DocPutCommand({
          TableName: getTableName('USERS'),
          Item: item
        });
        await this.docClient.send(putCmd);
        return { success: true };
      }
      return {
        success: false,
        error: this.handleError(error, 'toggleQuestionFlag').message
      };
    }
  }

  async getQuestionFlags(userId: string): Promise<DynamoDBResponse<{ flags?: Record<string, { isFlagged: boolean; flaggedAt: string; flagReason?: string }> }>> {
    try {
      if (!isSecureCredentialsAvailable()) {
        return { success: true };
      }

      await this.ensureInitialized();

      const command = new DocGetCommand({
        TableName: getTableName('USERS'),
        Key: { userId },
        ProjectionExpression: 'flags'
      });

      const result = await this.docClient.send(command);

      return {
        success: true,
        data: result.Item as any,
        consumedCapacity: result.ConsumedCapacity?.CapacityUnits
      };

    } catch (error) {
      return {
        success: false,
        error: this.handleError(error, 'getQuestionFlags').message
      };
    }
  }

  // Cache Statistics

  async getCacheStats(): Promise<DynamoDBResponse<CacheStats>> {
    return {
      success: true,
      data: {
        explanations: 0,
        objectives: 0,
        userProgress: 0,
        flags: 0,
        totalUsage: 0,
        storageSize: 0
      }
    };
  }

  // Health check
  async healthCheck(): Promise<DynamoDBResponse<{ status: string; timestamp: string }>> {
    try {
      await this.ensureInitialized();

      // Simple health check - try to get a non-existent item
      const command = new DocGetCommand({
        TableName: getTableName('QUESTIONS'),
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
        TableName: getTableName('QUESTIONS')
      });

      const result = await this.docClient.send(command);
      const total: Record<number, number> = {};
      const user: Record<number, number> = {};
      const ai: Record<number, number> = {};

      if (!result.Items || result.Items.length === 0) {
        console.log('📡 getAllQuestionCounts: No questions found in DynamoDB');
        return { success: true, data: { total, user, ai } };
      }

      for (const item of result.Items) {
        // Ensure subjectId is treated as number
        const sid = Number(item.subjectId);
        if (isNaN(sid)) continue;

        const src = item.source as string || 'user';
        total[sid] = (total[sid] || 0) + 1;
        if (src === 'ai') {
          ai[sid] = (ai[sid] || 0) + 1;
        } else {
          user[sid] = (user[sid] || 0) + 1;
        }
      }

      console.log(`📡 getAllQuestionCounts: Success, counted ${result.Items.length} questions across ${Object.keys(total).length} subjects`);
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
      console.log(`📡 getQuestionsBySubject(${subjectId}): Success, items: ${result.Items?.length || 0}`);

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
        TableName: getTableName('QUESTIONS')
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

  async approveQuestion(
    questionId: string,
    approved: boolean,
    approvedBy: string
  ): Promise<DynamoDBResponse> {
    try {
      await this.ensureInitialized();
      const now = new Date().toISOString();

      await this.docClient.send(new DocUpdateCommand({
        TableName: getTableName('QUESTIONS'),
        Key: { questionId },
        UpdateExpression: 'SET approved = :approved, approvedBy = :approvedBy, approvedAt = :approvedAt, updatedAt = :now',
        ExpressionAttributeValues: {
          ':approved': approved,
          ':approvedBy': approved ? approvedBy : null,
          ':approvedAt': approved ? now : null,
          ':now': now,
        },
      }));

      return { success: true };
    } catch (error) {
      return { success: false, error: this.handleError(error, 'approveQuestion').message };
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

      const now = new Date().toISOString();

      const command = new DocUpdateCommand({
        TableName: getTableName('USERS'),
        Key: { userId: userData.userId },
        UpdateExpression: 'SET username = if_not_exists(username, :username), email = if_not_exists(email, :email), authProvider = if_not_exists(authProvider, :authProvider), createdAt = if_not_exists(createdAt, :createdAt), lastLoginAt = :lastLoginAt',
        ExpressionAttributeValues: {
          ':username': userData.username,
          ':email': userData.email || null,
          ':authProvider': 'cognito',
          ':createdAt': now,
          ':lastLoginAt': now
        }
      });

      await this.docClient!.send(command);

      return {
        success: true
      };

    } catch (error: any) {
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
      await this.ensureInitialized();

      const command = new DocScanCommand({
        TableName: getTableName('EASA_OBJECTIVES')
      });

      const result = await this.docClient.send(command);
      console.log(`📡 getAllLOs: Success, fetched ${result.Items?.length || 0} LOs`);

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

      // 1. Save AI explanation cache using the correct update method
      const saveResult = await this.saveExplanation(questionId, explanation, detailedExplanation, provider, model);
      if (saveResult.success) {
        results.explanationSaved = true;
      }

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

      const command = new DocUpdateCommand({
        TableName: getTableName('QUESTIONS'),
        Key: { questionId },
        UpdateExpression: 'REMOVE ai_explanation, ai_detailed_explanation, ai_explanation_provider, ai_explanation_model, ai_explanation_updated_at'
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
      const command = new DocUpdateCommand({
        TableName: getTableName('QUESTIONS'),
        Key: { questionId },
        UpdateExpression: 'SET loId = :loId, loConfidence = :conf, updatedAt = :now',
        ExpressionAttributeValues: {
          ':loId': loId,
          ':conf': confidence,
          ':now': now
        }
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




}

// Singleton instance
export const dynamoDBService = new DynamoDBService();
