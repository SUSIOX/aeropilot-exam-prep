/**
 * AI Proxy Lambda — forwards requests to OpenRouter using a server-side API key.
 * The key is stored as a Lambda environment variable, never exposed to the client.
 *
 * Deploy: Lambda Function URL, auth type = NONE (protected by Cognito JWT check below)
 * Env vars required:
 *   DEEPSEEK_KEY         — e.g. sk-...
 *   ALLOWED_ORIGIN       — e.g. https://susiox.github.io
 *   COGNITO_REGION       — e.g. eu-central-1
 *   COGNITO_USER_POOL_ID — e.g. eu-central-1_XXXXXXX
 */

const https = require('https');

const REGION = process.env.COGNITO_REGION || 'eu-central-1';

function getDeepSeekKey() {
  const key = process.env.DEEPSEEK_KEY;
  if (!key) throw new Error('DEEPSEEK_KEY env var not set');
  return key;
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || 'https://susiox.github.io')
  .split(',').map(o => o.trim());

// Always allow localhost for development
const DEV_ORIGINS = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'];
const ALL_ALLOWED = [...ALLOWED_ORIGINS, ...DEV_ORIGINS];

function getCorsHeaders(requestOrigin) {
  const origin = ALL_ALLOWED.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Content-Type': 'application/json',
  };
}

async function verifyCognitoJwt(token) {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) throw new Error('COGNITO_USER_POOL_ID not set');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const decodeB64 = (str) => Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

  const header = JSON.parse(decodeB64(parts[0]));
  const payload = JSON.parse(decodeB64(parts[1]));

  const jwksUrl = `https://cognito-idp.${REGION}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
  const jwks = await fetchJson(jwksUrl);
  const key = jwks.keys.find(k => k.kid === header.kid);
  if (!key) throw new Error('JWT key not found in JWKS');

  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');

  return payload;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

// NEW: Balance endpoint handler
async function handleBalance(requestOrigin) {
  const CORS_HEADERS = getCorsHeaders(requestOrigin);
  
  try {
    const apiKey = getDeepSeekKey();
    const response = await fetch('https://api.deepseek.com/user/balance', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: CORS_HEADERS,
        body: JSON.stringify(data)
      };
    }
    
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(data)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message })
    };
  }
}

/* global awslambda */
exports.handler = awslambda.streamifyResponse(async (event, responseStream, _context) => {
  const requestOrigin = event.headers?.origin || event.headers?.Origin || '';
  const CORS_HEADERS = getCorsHeaders(requestOrigin);

  // Handle OPTIONS request
  if (event.requestContext?.http?.method === 'OPTIONS') {
    responseStream = awslambda.HttpResponseStream.from(responseStream, { statusCode: 200, headers: CORS_HEADERS });
    responseStream.write('');
    responseStream.end();
    return;
  }

  // NEW: Handle GET /balance endpoint
  if (event.requestContext?.http?.method === 'GET' && event.requestContext?.http?.path === '/balance') {
    try {
      const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (!token) {
        responseStream = awslambda.HttpResponseStream.from(responseStream, { statusCode: 401, headers: CORS_HEADERS });
        responseStream.write(JSON.stringify({ error: 'Missing token' }));
        responseStream.end();
        return;
      }

      try {
        await verifyCognitoJwt(token);
      } catch (authErr) {
        responseStream = awslambda.HttpResponseStream.from(responseStream, { statusCode: 401, headers: CORS_HEADERS });
        responseStream.write(JSON.stringify({ error: authErr.message }));
        responseStream.end();
        return;
      }

      const apiKey = getDeepSeekKey();
      const response = await fetch('https://api.deepseek.com/user/balance', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        responseStream = awslambda.HttpResponseStream.from(responseStream, { statusCode: response.status, headers: CORS_HEADERS });
        responseStream.write(JSON.stringify(data));
        responseStream.end();
        return;
      }
      
      responseStream = awslambda.HttpResponseStream.from(responseStream, { statusCode: 200, headers: CORS_HEADERS });
      responseStream.write(JSON.stringify(data));
      responseStream.end();
      return;
    } catch (err) {
      console.error('Balance error:', err);
      responseStream = awslambda.HttpResponseStream.from(responseStream, { statusCode: 500, headers: CORS_HEADERS });
      responseStream.write(JSON.stringify({ error: err.message }));
      responseStream.end();
      return;
    }
  }

  // Original chat completions handler
  try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      responseStream = awslambda.HttpResponseStream.from(responseStream, { statusCode: 401, headers: CORS_HEADERS });
      responseStream.write(JSON.stringify({ error: 'Missing token' }));
      responseStream.end();
      return;
    }

    try {
      await verifyCognitoJwt(token);
    } catch (authErr) {
      responseStream = awslambda.HttpResponseStream.from(responseStream, { statusCode: 401, headers: CORS_HEADERS });
      responseStream.write(JSON.stringify({ error: authErr.message }));
      responseStream.end();
      return;
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    const { model = 'deepseek/deepseek-chat', messages, max_tokens = 2000, response_format } = body;

    if (!messages?.length) {
      responseStream = awslambda.HttpResponseStream.from(responseStream, { statusCode: 400, headers: CORS_HEADERS });
      responseStream.write(JSON.stringify({ error: 'Missing messages' }));
      responseStream.end();
      return;
    }

    const apiKey = getDeepSeekKey();
    const wantsStream = event.queryStringParameters?.stream === '1' || body.stream === true;
    const payload = { model, messages, max_tokens, ...(response_format && { response_format }), ...(wantsStream && { stream: true }) };

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json();
      console.error('DeepSeek error:', response.status, data);
      responseStream = awslambda.HttpResponseStream.from(responseStream, { statusCode: response.status, headers: CORS_HEADERS });
      responseStream.write(JSON.stringify({ error: data.error?.message || 'DeepSeek error' }));
      responseStream.end();
      return;
    }

    if (wantsStream) {
      const sseHeaders = { ...CORS_HEADERS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' };
      responseStream = awslambda.HttpResponseStream.from(responseStream, { statusCode: 200, headers: sseHeaders });
      
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        responseStream.write(value);
      }
      responseStream.end();
    } else {
      const data = await response.json();
      responseStream = awslambda.HttpResponseStream.from(responseStream, { statusCode: 200, headers: CORS_HEADERS });
      responseStream.write(JSON.stringify(data));
      responseStream.end();
    }

  } catch (err) {
    console.error('Proxy error:', err);
    responseStream = awslambda.HttpResponseStream.from(responseStream, { statusCode: 500, headers: CORS_HEADERS });
    responseStream.write(JSON.stringify({ error: err.message }));
    responseStream.end();
  }
});
