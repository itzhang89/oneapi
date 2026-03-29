#!/usr/bin/env node

/**
 * Test script for LLM Proxy API
 * Usage: npx tsx scripts/test-api.ts [options]
 *
 * Options:
 *   --direct     Also test direct provider API calls (default: false, only tests via proxy)
 *   --provider   Specific provider to test: "gemini" or "nvidia" (default: all)
 *
 * Requires: .env file with GEMINI_API_KEY, NVIDIA_API_KEY
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// Load .env file
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.warn('⚠️  .env file not found');
    return;
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    testDirect: args.includes('--direct'),
    provider: args.includes('--provider') ? args[args.indexOf('--provider') + 1] : null,
  };
}

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  response?: any;
}

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const DIRECT_GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DIRECT_NVIDIA_URL = 'https://integrate.api.nvidia.com/v1';

// Gemini test model
const GEMINI_MODEL = 'gemini-2.5-flash';
// Nvidia test model
const NVIDIA_MODEL = 'nvidia/llama3-70b';

// ============ Gemini Tests ============

async function testGeminiViaProxy(apiKey: string): Promise<TestResult> {
  console.log('\n🧪 [Gemini] Testing via proxy...');

  try {
    const response = await fetch(`${BASE_URL}/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Say "Hello, Proxy!" in exactly those words.' }] }],
        generationConfig: { maxOutputTokens: 50 },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { name: '[Gemini] via proxy', passed: false, error: `HTTP ${response.status}: ${JSON.stringify(data)}` };
    }

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      return { name: '[Gemini] via proxy', passed: false, error: `Unexpected response: ${JSON.stringify(data)}` };
    }

    return { name: '[Gemini] via proxy', passed: true, response: { content } };
  } catch (error: any) {
    return { name: '[Gemini] via proxy', passed: false, error: error.message };
  }
}

async function testGeminiDirect(apiKey: string): Promise<TestResult> {
  console.log('\n🧪 [Gemini] Testing direct API...');

  try {
    const response = await fetch(`${DIRECT_GEMINI_URL}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Say "Hello, Direct!" in exactly those words.' }] }],
        generationConfig: { maxOutputTokens: 50 },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { name: '[Gemini] direct API', passed: false, error: `HTTP ${response.status}: ${JSON.stringify(data)}` };
    }

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      return { name: '[Gemini] direct API', passed: false, error: `Unexpected response: ${JSON.stringify(data)}` };
    }

    return { name: '[Gemini] direct API', passed: true, response: { content } };
  } catch (error: any) {
    return { name: '[Gemini] direct API', passed: false, error: error.message };
  }
}

// ============ NVIDIA Tests ============

async function testNvidiaViaProxy(apiKey: string): Promise<TestResult> {
  console.log('\n🧪 [NVIDIA] Testing via proxy...');

  try {
    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [{ role: 'user', content: 'Say "Hello, Proxy!" in exactly those words.' }],
        max_tokens: 50,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { name: '[NVIDIA] via proxy', passed: false, error: `HTTP ${response.status}: ${JSON.stringify(data)}` };
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return { name: '[NVIDIA] via proxy', passed: false, error: `Unexpected response: ${JSON.stringify(data)}` };
    }

    return { name: '[NVIDIA] via proxy', passed: true, response: { content } };
  } catch (error: any) {
    return { name: '[NVIDIA] via proxy', passed: false, error: error.message };
  }
}

async function testNvidiaDirect(apiKey: string): Promise<TestResult> {
  console.log('\n🧪 [NVIDIA] Testing direct API...');

  try {
    const response = await fetch(`${DIRECT_NVIDIA_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [{ role: 'user', content: 'Say "Hello, Direct!" in exactly those words.' }],
        max_tokens: 50,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { name: '[NVIDIA] direct API', passed: false, error: `HTTP ${response.status}: ${JSON.stringify(data)}` };
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return { name: '[NVIDIA] direct API', passed: false, error: `Unexpected response: ${JSON.stringify(data)}` };
    }

    return { name: '[NVIDIA] direct API', passed: true, response: { content } };
  } catch (error: any) {
    return { name: '[NVIDIA] direct API', passed: false, error: error.message };
  }
}

// ============ Main ============

async function runTests() {
  loadEnv();
  const opts = parseArgs();

  console.log('🚀 LLM Proxy Test Suite');
  console.log(`📡 Proxy URL: ${BASE_URL}`);
  console.log(`🔑 Direct API tests: ${opts.testDirect ? 'enabled' : 'disabled'}`);
  console.log('='.repeat(50));

  const results: TestResult[] = [];

  // Check server connectivity
  try {
    const health = await fetch(`${BASE_URL}/admin`);
    if (!health.ok) throw new Error('Server not responding');
    console.log('✅ Proxy server is running');
  } catch (error: any) {
    console.error(`\n❌ Cannot connect to proxy at ${BASE_URL}`);
    console.error('   Make sure the server is running: npm run dev');
    process.exit(1);
  }

  // Gemini tests
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && (!opts.provider || opts.provider === 'gemini')) {
    if (opts.testDirect) {
      results.push(await testGeminiDirect(geminiKey));
    }
    results.push(await testGeminiViaProxy(geminiKey));
  } else if (!geminiKey) {
    console.log('\n⚠️  GEMINI_API_KEY not found in .env, skipping Gemini tests');
  }

  // NVIDIA tests
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (nvidiaKey && (!opts.provider || opts.provider === 'nvidia')) {
    if (opts.testDirect) {
      results.push(await testNvidiaDirect(nvidiaKey));
    }
    results.push(await testNvidiaViaProxy(nvidiaKey));
  } else if (!nvidiaKey) {
    console.log('\n⚠️  NVIDIA_API_KEY not found in .env, skipping NVIDIA tests');
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Results:');

  let allPassed = true;
  for (const result of results) {
    if (result.passed) {
      console.log(`  ✅ ${result.name}`);
      if (result.response?.content) {
        console.log(`     Response: "${result.response.content}"`);
      }
    } else {
      console.log(`  ❌ ${result.name}`);
      console.log(`     Error: ${result.error}`);
      allPassed = false;
    }
  }

  console.log('='.repeat(50));

  if (allPassed) {
    console.log('✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed.');
    process.exit(1);
  }
}

runTests();
