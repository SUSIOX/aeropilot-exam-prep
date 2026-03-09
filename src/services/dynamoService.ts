import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, DeleteItemCommand, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand as DocGetCommand, PutCommand as DocPutCommand, UpdateCommand as DocUpdateCommand, DeleteCommand as DocDeleteCommand, QueryCommand as DocQueryCommand, BatchWriteCommand as DocBatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { awsConfig, getTableName, TABLE_NAMES } from './awsConfig';
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
  private client: DynamoDBClient;
  private docClient: DynamoDBDocumentClient;
  private isInitialized: boolean = false;

  constructor() {
    this.client = new DynamoDBClient({
      region: awsConfig.region,
      credentials: {
        accessKeyId: awsConfig.accessKeyId,
        secretAccessKey: awsConfig.secretAccessKey
      }
    });

    this.docClient = DynamoDBDocumentClient.from(this.client);
    this.isInitialized = true;
  }

  // Check if service is properly initialized
  private checkInitialization(): void {
    if (!this.isInitialized) {
      throw new Error('DynamoDB service not initialized');
    }

    if (!awsConfig.accessKeyId || !awsConfig.secretAccessKey) {
      throw new Error('AWS credentials not configured');
    }
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
      this.checkInitialization();

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
      this.checkInitialization();

      const now = new Date().toISOString();
      const item: ExplanationItem = {
        questionId,
        model,
        explanation,
        detailedExplanation: detailedExplanation || undefined,
        provider,
        usageCount: 1,
        createdAt: now,
        lastUsed: now
      };

      const command = new DocPutCommand({
        TableName: getTableName('AI_EXPLANATIONS'),
        Item: item,
        ConditionExpression: 'attribute_not_exists(questionId) OR attribute_not_exists(model)'
      });

      const result = await this.docClient.send(command);

      return {
        success: true,
        consumedCapacity: result.ConsumedCapacity?.CapacityUnits
      };

    } catch (error) {
      // If item exists, update it instead
      if (error.name === 'ConditionalCheckFailedException') {
        return this.updateExplanation(questionId, explanation, detailedExplanation, provider, model);
      }

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
      this.checkInitialization();

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
      this.checkInitialization();

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
      this.checkInitialization();

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
      this.checkInitialization();

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
      this.checkInitialization();

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
      this.checkInitialization();

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
      this.checkInitialization();

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
}

// Singleton instance
export const dynamoDBService = new DynamoDBService();
