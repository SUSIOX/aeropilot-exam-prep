// AWS DynamoDB specific types
export interface DynamoDBItem {
  [key: string]: any;
}

export interface ExplanationItem extends DynamoDBItem {
  questionId: string;
  model: string;
  explanation: string;
  detailedExplanation?: string;
  provider: 'gemini' | 'claude';
  usageCount: number;
  createdAt: string;
  lastUsed: string;
}

export interface QuestionObjective extends DynamoDBItem {
  questionId: string;      // Foreign key to Questions
  loId: string;           // Foreign key to EasaObjective
  confidence: number;      // AI confidence score 0-1
  matchedBy: string;       // "ai-gemini", "ai-claude", "manual"
  createdAt: string;
  updatedAt: string;
}

export interface ObjectiveItem extends DynamoDBItem {
  questionId: string;
  objective: string;
  confidence: number;
  createdAt: string;
}

export interface UserProgressItem extends DynamoDBItem {
  userId: string;
  questionId: string;
  isCorrect: boolean;
  answerTimestamp: string;
  attempts: number;
}

export interface QuestionFlagItem extends DynamoDBItem {
  questionId: string;
  isFlagged: boolean;
  flaggedAt: string;
  flagReason?: string;
}

export interface EasaObjective extends DynamoDBItem {
  loId: string;              // PK: "010.01.01.01" (Subject.Topic.Subtopic.LO)
  subjectId: number;         // 1-9 — index pro filtrování
  text: string;              // Název LO: "Chicago Convention"
  knowledgeContent: string;  // Obsah ze kterého AI tvoří otázky (EASA AMC/GM text)
  appliesTo: string[];       // ['PPL', 'SPL', 'CPL', 'ATPL']
  level: 1 | 2 | 3;         // 1=Awareness, 2=Knowledge, 3=Understanding
  version: string;           // EASA syllabus verze, např. "2021"
  context?: string;          // Legacy - zachováno pro kompatibilitu
  createdAt: string;
  updatedAt: string;
  source?: string;           // "easa-import", "manual", "mock-import"
}

// Legacy interface for backward compatibility
export interface LOItem extends DynamoDBItem {
  losid: string;           // "010.01.01.01" (PK)
  text: string;           // "International Agreements..."
  context?: string;       // "The Convention..."
  subject_id: number;     // 1-9
  applies_to?: string[];  // ["PPL", "SPL"]
  createdAt: string;      // ISO timestamp
  updatedAt: string;      // ISO timestamp
  source?: string;        // "easa-import", "manual"
  version?: number;       // Pro aktualizace
}

export interface CacheStats {
  explanations: number;
  objectives: number;
  userProgress: number;
  flags: number;
  totalUsage: number;
  storageSize: number;
}

export interface DynamoDBResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  consumedCapacity?: number;
}

export interface BatchWriteParams {
  RequestItems: {
    [tableName: string]: Array<{
      PutRequest?: { Item: DynamoDBItem };
      DeleteRequest?: { Key: DynamoDBItem };
      UpdateRequest?: { Key: DynamoDBItem; UpdateExpression: string; ExpressionAttributeValues?: DynamoDBItem };
    }>;
  };
}

export interface QueryParams {
  TableName: string;
  KeyConditionExpression?: string;
  FilterExpression?: string;
  ExpressionAttributeNames?: { [name: string]: string };
  ExpressionAttributeValues?: { [value: string]: any };
  Limit?: number;
  ExclusiveStartKey?: DynamoDBItem;
  ScanIndexForward?: boolean;
  ConsistentRead?: boolean;
  ProjectionExpression?: string;
}

export interface PutParams {
  TableName: string;
  Item: DynamoDBItem;
  ConditionExpression?: string;
  ExpressionAttributeNames?: { [name: string]: string };
  ExpressionAttributeValues?: { [value: string]: any };
  ReturnValues?: 'NONE' | 'ALL_OLD' | 'UPDATED_OLD' | 'ALL_NEW' | 'UPDATED_NEW';
}

export interface GetParams {
  TableName: string;
  Key: DynamoDBItem;
  ConsistentRead?: boolean;
  ProjectionExpression?: string;
}

export interface UpdateParams {
  TableName: string;
  Key: DynamoDBItem;
  UpdateExpression: string;
  ExpressionAttributeNames?: { [name: string]: string };
  ExpressionAttributeValues?: { [value: string]: any };
  ConditionExpression?: string;
  ReturnValues?: 'NONE' | 'ALL_OLD' | 'UPDATED_OLD' | 'ALL_NEW' | 'UPDATED_NEW';
}

export interface DeleteParams {
  TableName: string;
  Key: DynamoDBItem;
  ConditionExpression?: string;
  ExpressionAttributeNames?: { [name: string]: string };
  ExpressionAttributeValues?: { [value: string]: any };
  ReturnValues?: 'NONE' | 'ALL_OLD' | 'UPDATED_OLD' | 'ALL_NEW' | 'UPDATED_NEW';
}

// Error types
export enum DynamoDBErrorCode {
  CONDITION_CHECK_FAILED = 'ConditionalCheckFailedException',
  PROVISIONED_THROUGHPUT_EXCEEDED = 'ProvisionedThroughputExceededException',
  RESOURCE_NOT_FOUND = 'ResourceNotFoundException',
  VALIDATION_EXCEPTION = 'ValidationException',
  ITEM_COLLECTION_SIZE_EXCEEDED = 'ItemCollectionSizeLimitExceededException',
  TRANSACTION_CONFLICT = 'TransactionConflictException',
  REQUEST_LIMIT_EXCEEDED = 'RequestLimitExceeded',
  INTERNAL_SERVER_ERROR = 'InternalServerError'
}

export interface DynamoDBError extends Error {
  code?: DynamoDBErrorCode;
  message: string;
  statusCode?: number;
  retryable?: boolean;
}

// Helper function to create DynamoDB error
export const createDynamoDBError = (error: any): DynamoDBError => {
  const dynamoError: DynamoDBError = new Error(error.message || 'Unknown DynamoDB error');
  dynamoError.code = error.code;
  dynamoError.statusCode = error.statusCode;
  dynamoError.retryable = error.retryable || false;
  return dynamoError;
};
