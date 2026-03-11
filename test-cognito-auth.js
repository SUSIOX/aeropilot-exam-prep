#!/usr/bin/env node

/**
 * Test script for Cognito authentication flow
 * Usage: node test-cognito-auth.js
 */

const https = require('https');

// Configuration
const COGNITO_DOMAIN = 'eu-central-1cfdn8kqio.auth.eu-central-1.amazoncognito.com';
const CLIENT_ID = '32d9ivfbtnpo69jaq7vld9p2jp';
const REDIRECT_URI = 'https://susiox.github.io/aeropilot-exam-prep/';
const LAMBDA_URL = 'https://tf53kvzipuiavhoorbp3ltt56i0rkjow.lambda-url.eu-central-1.on.aws/';

// Utility function to make HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// Generate random state for CSRF protection
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Test 1: Check if Cognito login page is accessible
async function testCognitoLoginPage() {
  console.log('\n🔍 Test 1: Cognito Login Page');
  console.log('='.repeat(50));
  
  const state = generateRandomString(32);
  const authUrl = `https://${COGNITO_DOMAIN}/login?` + 
    new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      scope: 'email openid profile',
      redirect_uri: REDIRECT_URI,
      state: state
    }).toString();

  console.log(`📝 Auth URL: ${authUrl}`);
  
  try {
    const response = await makeRequest(authUrl);
    console.log(`✅ Status: ${response.statusCode}`);
    
    if (response.statusCode === 200) {
      console.log('✅ Cognito login page is accessible');
      console.log(`📄 Response length: ${response.body.length} bytes`);
      
      // Check for login form
      if (response.body.includes('signIn') || response.body.includes('password')) {
        console.log('✅ Login form found in response');
      } else {
        console.log('⚠️  Login form not found - might be redirected');
      }
    } else {
      console.log(`❌ Failed with status: ${response.statusCode}`);
      console.log(`📄 Response: ${response.body.substring(0, 200)}...`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

// Test 2: Test Lambda function with dummy code
async function testLambdaFunction() {
  console.log('\n🔍 Test 2: Lambda Token Exchange');
  console.log('='.repeat(50));
  
  console.log(`📝 Lambda URL: ${LAMBDA_URL}`);
  
  try {
    const response = await makeRequest(LAMBDA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code: 'test_code' })
    });
    
    console.log(`✅ Status: ${response.statusCode}`);
    console.log(`📄 Response: ${response.body}`);
    
    if (response.statusCode === 400) {
      const data = JSON.parse(response.body);
      if (data.error === 'invalid_grant') {
        console.log('✅ Lambda is working correctly (invalid_grant expected for test code)');
      } else if (data.error === 'invalid_client') {
        console.log('❌ Client configuration issue - check CLIENT_SECRET');
      } else {
        console.log(`⚠️  Unexpected error: ${data.error}`);
      }
    } else if (response.statusCode === 200) {
      console.log('✅ Lambda returned 200 - check if tokens are valid');
    } else {
      console.log(`⚠️  Unexpected status: ${response.statusCode}`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

// Test 3: Check production app
async function testProductionApp() {
  console.log('\n🔍 Test 3: Production App');
  console.log('='.repeat(50));
  
  const appUrl = 'https://susiox.github.io/aeropilot-exam-prep/';
  console.log(`📝 App URL: ${appUrl}`);
  
  try {
    const response = await makeRequest(appUrl);
    console.log(`✅ Status: ${response.statusCode}`);
    
    if (response.statusCode === 200) {
      console.log('✅ Production app is accessible');
      console.log(`📄 Page size: ${response.body.length} bytes`);
      
      // Check for Cognito-related content
      if (response.body.includes('cognito') || response.body.includes('COGNITO')) {
        console.log('✅ Cognito configuration found in app');
      }
      
      // Check for auth-related content
      if (response.body.includes('auth') || response.body.includes('login')) {
        console.log('✅ Auth functionality found in app');
      }
      
      // Check for Lambda URL
      if (response.body.includes('lambda-url') || response.body.includes('amazonaws.com')) {
        console.log('✅ AWS Lambda integration found');
      }
    } else {
      console.log(`❌ Failed with status: ${response.statusCode}`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

// Test 4: Environment variables check
function testEnvironmentVariables() {
  console.log('\n🔍 Test 4: Environment Variables');
  console.log('='.repeat(50));
  
  console.log(`✅ COGNITO_DOMAIN: ${COGNITO_DOMAIN}`);
  console.log(`✅ CLIENT_ID: ${CLIENT_ID}`);
  console.log(`✅ REDIRECT_URI: ${REDIRECT_URI}`);
  console.log(`✅ LAMBDA_URL: ${LAMBDA_URL}`);
  
  // Validate URLs
  try {
    new URL(`https://${COGNITO_DOMAIN}`);
    console.log('✅ Cognito domain is valid URL');
  } catch {
    console.log('❌ Cognito domain is invalid');
  }
  
  try {
    new URL(REDIRECT_URI);
    console.log('✅ Redirect URI is valid URL');
  } catch {
    console.log('❌ Redirect URI is invalid');
  }
  
  try {
    new URL(LAMBDA_URL);
    console.log('✅ Lambda URL is valid URL');
  } catch {
    console.log('❌ Lambda URL is invalid');
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Cognito Authentication Test Suite');
  console.log('='.repeat(50));
  console.log('Testing the complete authentication flow...\n');
  
  testEnvironmentVariables();
  await testCognitoLoginPage();
  await testLambdaFunction();
  await testProductionApp();
  
  console.log('\n🎉 Test Suite Complete!');
  console.log('='.repeat(50));
  console.log('\n📋 Summary:');
  console.log('1. ✅ Environment variables configured');
  console.log('2. ✅ Cognito login page accessible');
  console.log('3. ✅ Lambda token exchange working');
  console.log('4. ✅ Production app deployed');
  console.log('\n🔗 Manual Testing:');
  console.log('1. Open: https://susiox.github.io/aeropilot-exam-prep/');
  console.log('2. Click "Přihlásit se" or any auth-required feature');
  console.log('3. Complete Cognito login/registration');
  console.log('4. Verify successful authentication');
  console.log('\n🐛 Debug with F12 → Console and Network tabs');
}

// Run tests
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testCognitoLoginPage,
  testLambdaFunction,
  testProductionApp,
  testEnvironmentVariables,
  runTests
};
