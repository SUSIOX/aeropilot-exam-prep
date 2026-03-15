// Cognito Authentication Service
import { CognitoIdentityClient, GetIdCommand, GetCredentialsForIdentityCommand } from '@aws-sdk/client-cognito-identity';
import { getCognitoConfig } from './awsConfig';

export interface TokenData {
  access_token: string;
  id_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface UserData {
  id: string;
  username: string;
  email?: string;
}

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
}

export type UserRole = 'admin' | 'auditor' | 'user' | 'guest';

export const ADMIN_GROUP = 'Admins';
export const AUDITOR_GROUP = 'Auditors';
export const USER_GROUP = 'Users';

export class CognitoAuthService {
  private static instance: CognitoAuthService;
  private cognitoIdentityClient: CognitoIdentityClient | null = null;
  private identityId: string | null = null;

  constructor() {
    // Lazy initialization of client
  }

  private getCognitoIdentityClient(): CognitoIdentityClient {
    if (!this.cognitoIdentityClient) {
      const config = getCognitoConfig();
      this.cognitoIdentityClient = new CognitoIdentityClient({
        region: config.region
      });
    }
    return this.cognitoIdentityClient;
  }

  static getInstance(): CognitoAuthService {
    if (!CognitoAuthService.instance) {
      CognitoAuthService.instance = new CognitoAuthService();
    }
    return CognitoAuthService.instance;
  }

  // Store tokens securely
  storeTokens(tokenData: TokenData): void {
    sessionStorage.setItem('access_token', tokenData.access_token);
    sessionStorage.setItem('id_token', tokenData.id_token);
    sessionStorage.setItem('refresh_token', tokenData.refresh_token);
    sessionStorage.setItem('token_expires_at', String(tokenData.expires_at));
  }

  // Get stored tokens
  getTokens(): TokenData | null {
    const accessToken = sessionStorage.getItem('access_token');
    const idToken = sessionStorage.getItem('id_token');
    const refreshToken = sessionStorage.getItem('refresh_token');
    const expiresAt = sessionStorage.getItem('token_expires_at');

    if (!accessToken || !idToken || !expiresAt) {
      return null;
    }

    return {
      access_token: accessToken,
      id_token: idToken,
      refresh_token: refreshToken || '',
      expires_at: parseInt(expiresAt)
    };
  }

  // Clear all tokens
  clearTokens(): void {
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('id_token');
    sessionStorage.removeItem('refresh_token');
    sessionStorage.removeItem('token_expires_at');
    sessionStorage.removeItem('user_data');
    sessionStorage.removeItem('aws_credentials');
    sessionStorage.removeItem('identity_id');
    this.identityId = null;
  }

  // Get Identity Pool identity ID (used as userId in DynamoDB)
  getIdentityId(): string | null {
    return this.identityId || sessionStorage.getItem('identity_id');
  }

  // Check if tokens are valid
  isTokenValid(): boolean {
    const tokens = this.getTokens();
    if (!tokens) return false;

    return Date.now() < tokens.expires_at;
  }

  // Parse JWT token to get user data
  parseJWT(token: string): any {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('JWT parsing error:', error);
      return null;
    }
  }

  // Get current user data from ID token
  getCurrentUser(): UserData | null {
    const tokens = this.getTokens();
    if (!tokens || !this.isTokenValid()) return null;

    const payload = this.parseJWT(tokens.id_token);
    if (!payload) return null;

    return {
      id: payload.sub,
      username: payload['cognito:username'] || payload.email || 'Unknown',
      email: payload.email
    };
  }

  // Refresh access token using refresh token via Lambda
  async refreshAccessToken(): Promise<boolean> {
    const tokens = this.getTokens();
    if (!tokens?.refresh_token) return false;

    try {
      const lambdaUrl = process.env.LAMBDA_TOKEN_EXCHANGE_URL;
      
      if (!lambdaUrl) {
        console.error('Lambda URL not configured');
        return false;
      }
      
      const response = await fetch(lambdaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token
        })
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const tokenData = await response.json();
      
      // Update stored tokens
      this.storeTokens({
        access_token: tokenData.access_token,
        id_token: tokenData.id_token || tokens.id_token,
        refresh_token: tokenData.refresh_token || tokens.refresh_token,
        expires_at: Date.now() + (tokenData.expires_in || 3600) * 1000
      });

      return true;
    } catch (error) {
      this.clearTokens();
      return false;
    }
  }

  // Get valid access token (refresh if needed)
  async getValidAccessToken(): Promise<string | null> {
    if (!this.isTokenValid()) {
      const refreshed = await this.refreshAccessToken();
      if (!refreshed) return null;
    }

    const tokens = this.getTokens();
    return tokens?.access_token || null;
  }

  // Generate logout URL
  getLogoutUrl(): string {
    const domain = process.env.COGNITO_DOMAIN;
    const clientId = process.env.COGNITO_CLIENT_ID;
    const redirectUri = process.env.COGNITO_REDIRECT_URI;

    const params = new URLSearchParams({
      client_id: clientId || '',
      logout_uri: redirectUri || window.location.origin
    });

    return `https://${domain}/logout?${params.toString()}`;
  }

  // Logout user
  async logout(): Promise<void> {
    const tokens = this.getTokens();
    if (tokens) {
      try {
        // Revoke refresh token on Cognito
        const revokeUrl = `https://${process.env.COGNITO_DOMAIN}/oauth2/revoke`;
        await fetch(revokeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            token: tokens.refresh_token,
            client_id: process.env.COGNITO_CLIENT_ID || ''
          })
        });
      } catch (error) {
        console.warn('Token revocation failed:', error);
      }
    }
    this.clearTokens();
    // Clear AWS credentials cache
    this.clearAWSCredentials();
    // Redirect to Cognito logout
    window.location.href = this.getLogoutUrl();
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return this.isTokenValid() && !!this.getCurrentUser();
  }

  // Get user role from Cognito groups in JWT
  getUserRole(): UserRole {
    if (!this.isAuthenticated()) return 'guest';

    const tokens = this.getTokens();
    if (!tokens) return 'guest';

    const payload = this.parseJWT(tokens.id_token);
    if (!payload) return 'guest';

    const groups: string[] = payload['cognito:groups'] || [];
    
    if (groups.includes(ADMIN_GROUP)) return 'admin';
    if (groups.includes(AUDITOR_GROUP)) return 'auditor';
    if (groups.includes(USER_GROUP)) return 'user';

    return 'user'; // Default role for authenticated users
  }

  isAdmin(): boolean {
    return this.getUserRole() === 'admin';
  }

  isUser(): boolean {
    const role = this.getUserRole();
    return role === 'user' || role === 'admin';
  }

  // Get AWS credentials using Cognito Identity Pool
  async getAWSCredentials(): Promise<AWSCredentials | null> {
    try {
      const tokens = this.getTokens();
      if (!tokens || !this.isTokenValid()) {
        return null;
      }

      const config = getCognitoConfig();
      const logins: { [key: string]: string } = {};
      logins[`cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`] = tokens.id_token;

      // Get identity ID
      const getIdCommand = new GetIdCommand({
        IdentityPoolId: config.identityPoolId,
        Logins: logins
      });

      const identityResponse = await this.getCognitoIdentityClient().send(getIdCommand);
      const identityId = identityResponse.IdentityId;

      if (!identityId) {
        throw new Error('Failed to get identity ID');
      }

      // Store identity ID for use as userId
      this.identityId = identityId;
      sessionStorage.setItem('identity_id', identityId);

      // Get credentials for identity
      const getCredentialsCommand = new GetCredentialsForIdentityCommand({
        IdentityId: identityId,
        Logins: logins
      });

      const credentialsResponse = await this.getCognitoIdentityClient().send(getCredentialsCommand);
      const credentials = credentialsResponse.Credentials;

      if (!credentials) {
        throw new Error('Failed to get credentials');
      }

      const awsCredentials: AWSCredentials = {
        accessKeyId: credentials.AccessKeyId!,
        secretAccessKey: credentials.SecretKey!,
        sessionToken: credentials.SessionToken,
        expiration: credentials.Expiration
      };

      // Cache credentials in sessionStorage
      sessionStorage.setItem('aws_credentials', JSON.stringify(awsCredentials));

      return awsCredentials;
    } catch (error) {
      console.error('Failed to get AWS credentials:', error);
      return null;
    }
  }

  // Get cached AWS credentials
  getCachedAWSCredentials(): AWSCredentials | null {
    const cached = sessionStorage.getItem('aws_credentials');
    if (!cached) return null;

    try {
      const credentials: AWSCredentials = JSON.parse(cached);
      // Check if credentials are still valid
      if (credentials.expiration && new Date(credentials.expiration) <= new Date()) {
        this.clearAWSCredentials();
        return null;
      }
      return credentials;
    } catch {
      this.clearAWSCredentials();
      return null;
    }
  }

  // Clear AWS credentials cache
  clearAWSCredentials(): void {
    sessionStorage.removeItem('aws_credentials');
  }

  // Get valid AWS credentials (refresh if needed)
  async getValidAWSCredentials(): Promise<AWSCredentials | null> {
    // Try cached credentials first
    let credentials = this.getCachedAWSCredentials();
    if (credentials) {
      return credentials;
    }

    // Get new credentials
    return await this.getAWSCredentials();
  }
}

export const cognitoAuthService = CognitoAuthService.getInstance();
