import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, LogIn } from 'lucide-react';
import { getFeatureInfo } from '../utils/featureInfo';

interface CognitoAuthProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (userData: { id: string; username: string; email?: string }) => void;
  feature: 'stats' | 'errors' | 'ai' | 'admin';
}

interface TokenResponse {
  access_token: string;
  id_token: string;
  refresh_token: string;
  expires_in: number;
}

export const CognitoAuth: React.FC<CognitoAuthProps> = ({ isOpen, onClose, onAuthSuccess, feature }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exchangeStarted = useRef(false);

  const { icon: FeatureIcon, title, description, benefits } = getFeatureInfo(feature);

  // Generate Cognito auth URL
  const generateAuthUrl = () => {
    const domain = process.env.COGNITO_DOMAIN;
    const clientId = process.env.COGNITO_CLIENT_ID;
    const redirectUri = process.env.COGNITO_REDIRECT_URI;
    const state = generateRandomString(32); // CSRF protection
    
    // Store state for verification
    sessionStorage.setItem('cognito_state', state);
    
    const params = new URLSearchParams({
      client_id: clientId || '',
      response_type: 'code',
      scope: 'email openid profile',
      redirect_uri: redirectUri || window.location.origin,
      state: state
    });
    
    return `https://${domain}/login?${params.toString()}`;
  };

  // Generate random string for state parameter
  const generateRandomString = (length: number) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Exchange authorization code for tokens via Lambda
  const exchangeCodeForTokens = async (code: string) => {
    try {
      const lambdaUrl = process.env.LAMBDA_TOKEN_EXCHANGE_URL;
      
      console.log('🔄 Starting token exchange...');
      console.log('📍 Lambda URL:', lambdaUrl);
      console.log('🔑 Code (first 10 chars):', code.substring(0, 10));
      
      if (!lambdaUrl) {
        console.error('❌ Lambda URL not configured!');
        throw new Error('Lambda URL not configured');
      }
      
      console.log('� Calling Lambda...');
      
      // Call Lambda function with authorization code
      const response = await fetch(lambdaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          code: code,
          redirect_uri: window.location.origin + window.location.pathname
        })
      });

      console.log('📥 Lambda response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Lambda error response:', errorData);
        throw new Error(errorData.error_description || errorData.error || 'Token exchange failed');
      }

      // First get raw text response for debugging
      const textData = await response.text();
      console.log('📥 Raw server response:', textData);
      console.log('📥 Response status:', response.status);
      console.log('📥 Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        console.error('❌ Server returned error:', response.status, textData);
        throw new Error(`Server Error ${response.status}: ${textData}`);
      }
      
      // Parse JSON only if response is OK
      let tokenData: TokenResponse;
      try {
        tokenData = JSON.parse(textData);
      } catch (parseError) {
        console.error('❌ JSON parse error:', parseError);
        console.error('❌ Failed to parse:', textData);
        throw new Error(`Invalid JSON response: ${textData}`);
      }
      
      console.log('✅ Token exchange successful');
      console.log('🎫 Tokens received:', {
        access_token: tokenData.access_token ? 'present' : 'missing',
        id_token: tokenData.id_token ? 'present' : 'missing',
        refresh_token: tokenData.refresh_token ? 'present' : 'missing',
        expires_in: tokenData.expires_in
      });
      
      // Parse JWT to get user info
      console.log('🔍 Parsing JWT token...');
      const payload = JSON.parse(atob(tokenData.id_token.split('.')[1]));
      console.log('👤 JWT payload:', payload);
      
      // Store tokens
      console.log('💾 Storing tokens to sessionStorage...');
      sessionStorage.setItem('access_token', tokenData.access_token);
      sessionStorage.setItem('id_token', tokenData.id_token);
      sessionStorage.setItem('refresh_token', tokenData.refresh_token);
      sessionStorage.setItem('token_expires_at', String(Date.now() + tokenData.expires_in * 1000));
      
      // Store user data
      const userData = {
        id: payload.sub,
        username: payload['cognito:username'] || payload.email,
        email: payload.email
      };
      
      console.log('💾 Storing user data:', userData);
      sessionStorage.setItem('user_data', JSON.stringify(userData));
      
      console.log('✅ All data stored successfully');
      return userData;
    } catch (error) {
      console.error('💥 CRITICAL ERROR in exchangeCodeForTokens:', error);
      console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
      console.error('Error message:', error instanceof Error ? error.message : String(error));
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      throw error;
    }
  };

  // Handle redirect from Cognito
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const storedState = sessionStorage.getItem('cognito_state');
    
    if (code && !exchangeStarted.current) {
      // Set auth in progress flag to prevent landing page flash
      localStorage.setItem('auth_in_progress', 'true');
      
      // Strict state validation for CSRF protection
      if (!storedState || state !== storedState) {
        console.error("❌ State validation failed - possible CSRF attack");
        setError("Authentication failed: Invalid state parameter");
        return;
      }
      exchangeStarted.current = true; // Prevent duplicate calls
      console.log('🔑 Processing Cognito callback with code:', code.substring(0, 10) + '...');
      setIsLoading(true);
      setError(null);
      
      exchangeCodeForTokens(code)
        .then(userData => {
          console.log('👤 User data received:', userData);
          console.log('🔔 Calling onAuthSuccess callback...');
          try {
            onAuthSuccess(userData);
            console.log('✅ onAuthSuccess completed');
          } catch (error) {
            console.error('❌ onAuthSuccess failed:', error);
            throw error;
          }
          console.log('🚪 Calling onClose...');
          onClose();
          // Clean URL
          console.log('🧹 Cleaning URL...');
          window.history.replaceState({}, document.title, window.location.pathname);
          console.log('✅ Callback flow completed');
        })
        .catch(error => {
          console.error('❌ Auth error:', error);
          setError(error instanceof Error ? error.message : 'Authentication failed');
        })
        .finally(() => {
          setIsLoading(false);
          sessionStorage.removeItem('cognito_state');
          // Clear auth in progress flag
          localStorage.removeItem('auth_in_progress');
        });
    } else if (code && state !== storedState) {
      console.error('❌ Security validation failed - state mismatch');
      setError('Security validation failed');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (code) {
      console.warn('⚠️ Code present but no stored state');
    }
  }, []);

  const handleLogin = () => {
    const authUrl = generateAuthUrl();
    window.location.href = authUrl;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[250] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-md bg-[var(--bg)] border border-[var(--line)] rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                  <FeatureIcon className="w-5 h-5 text-indigo-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-indigo-500">Vyžadováno přihlášení</h3>
                  <p className="text-[10px] opacity-50 uppercase tracking-widest">Pro přístup k této funkci</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-[var(--line)] rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Feature Info */}
            <div className="space-y-4 mb-6">
              <div>
                <h4 className="font-semibold mb-2">{title}</h4>
                <p className="text-sm opacity-70 leading-relaxed">{description}</p>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest opacity-50">S přihlášením získáte:</p>
                <div className="space-y-2">
                  {benefits.map((benefit, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
                      <span className="opacity-80">{benefit}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="flex flex-col items-center gap-4 py-6">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <p className="text-sm opacity-70">Přihlašuji...</p>
              </div>
            )}

            {/* Error State */}
            {error && !isLoading && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
                <p className="text-sm text-red-500">{error}</p>
              </div>
            )}

            {/* Actions */}
            {!isLoading && (
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleLogin}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  Registrovat se jako uživatel
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-2 text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
                >
                  Zpět k aplikaci
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
