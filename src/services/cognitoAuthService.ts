// Cognito Authentication Service
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

export class CognitoAuthService {
  private static instance: CognitoAuthService;

  static getInstance(): CognitoAuthService {
    if (!CognitoAuthService.instance) {
      CognitoAuthService.instance = new CognitoAuthService();
    }
    return CognitoAuthService.instance;
  }

  // Store tokens securely
  storeTokens(tokenData: TokenData): void {
    localStorage.setItem('access_token', tokenData.access_token);
    localStorage.setItem('id_token', tokenData.id_token);
    localStorage.setItem('refresh_token', tokenData.refresh_token);
    localStorage.setItem('token_expires_at', String(tokenData.expires_at));
  }

  // Get stored tokens
  getTokens(): TokenData | null {
    const accessToken = localStorage.getItem('access_token');
    const idToken = localStorage.getItem('id_token');
    const refreshToken = localStorage.getItem('refresh_token');
    const expiresAt = localStorage.getItem('token_expires_at');

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
    localStorage.removeItem('access_token');
    localStorage.removeItem('id_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token_expires_at');
    localStorage.removeItem('user_data');
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
      console.error('Token refresh error:', error);
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
      logout_uri: redirectUri || window.location.origin,
      response_type: 'code'
    });

    return `https://${domain}/logout?${params.toString()}`;
  }

  // Logout user
  logout(): void {
    this.clearTokens();
    // Redirect to Cognito logout
    window.location.href = this.getLogoutUrl();
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return this.isTokenValid() && !!this.getCurrentUser();
  }
}

export const cognitoAuthService = CognitoAuthService.getInstance();
