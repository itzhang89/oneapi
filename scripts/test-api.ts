#!/usr/bin/env node

/**
 * Test script for LLM Proxy API
 * Usage: npx tsx scripts/test-api.ts
 * Requires: GEMINI_API_KEY and NVIDIA_API_KEY environment variables
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  response?: any;
}

async function testGemini(): Promise<TestResult> {
  console.log('\n🧪 Testing Gemini...');

  try {
    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key',
      },
      body: JSON.stringify({
        model: 'gemini-pro',
        messages: [{ role: 'user', content: 'Say "Hello, Gemini!" in exactly those words.' }],
        max_tokens: 50,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        name: 'Gemini API',
        passed: false,
        error: `HTTP ${response.status}: ${JSON.stringify(data)}`,
      };
    }

    if (!data.choices?.[0]?.message?.content) {
      return {
        name: 'Gemini API',
        passed: false,
        error: `Unexpected response format: ${JSON.stringify(data)}`,
      };
    }

    return {
      name: 'Gemini API',
      passed: true,
      response: data,
    };
  } catch (error: any) {
    return {
      name: 'Gemini API',
      passed: false,
      error: error.message,
    };
  }
}

async function testNvidia(): Promise<TestResult> {
  console.log('\n🧪 Testing NVIDIA NIM...');

  try {
    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key',
      },
      body: JSON.stringify({
        model: 'nvidia/llama3-70b',
        messages: [{ role: 'user', content: 'Say "Hello, NVIDIA!" in exactly those words.' }],
        max_tokens: 50,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        name: 'NVIDIA NIM API',
        passed: false,
        error: `HTTP ${response.status}: ${JSON.stringify(data)}`,
      };
    }

    if (!data.choices?.[0]?.message?.content) {
      return {
        name: 'NVIDIA NIM API',
        passed: false,
        error: `Unexpected response format: ${JSON.stringify(data)}`,
      };
    }

    return {
      name: 'NVIDIA NIM API',
      passed: true,
      response: data,
    };
  } catch (error: any) {
    return {
      name: 'NVIDIA NIM API',
      passed: false,
      error: error.message,
    };
  }
}

async function testStream(): Promise<TestResult> {
  console.log('\n🧪 Testing Streaming (Gemini)...');

  try {
    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key',
      },
      body: JSON.stringify({
        model: 'gemini-pro',
        messages: [{ role: 'user', content: 'Count from 1 to 3.' }],
        max_tokens: 50,
        stream: true,
      }),
    });

    if (!response.ok) {
      return {
        name: 'Streaming',
        passed: false,
        error: `HTTP ${response.status}`,
      };
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('text/event-stream')) {
      return {
        name: 'Streaming',
        passed: false,
        error: `Expected text/event-stream, got ${contentType}`,
      };
    }

    // Read stream
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let chunkCount = 0;

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      if (text.includes('data:')) {
        chunkCount++;
      }
    }

    if (chunkCount === 0) {
      return {
        name: 'Streaming',
        passed: false,
        error: 'No data chunks received',
      };
    }

    return {
      name: 'Streaming',
      passed: true,
      response: { chunkCount },
    };
  } catch (error: any) {
    return {
      name: 'Streaming',
      passed: false,
      error: error.message,
    };
  }
}

async function testAdminPage(): Promise<TestResult> {
  console.log('\n🧪 Testing Admin Page...');

  try {
    const response = await fetch(`${BASE_URL}/admin`);

    if (!response.ok) {
      return {
        name: 'Admin Page',
        passed: false,
        error: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();

    if (!html.includes('LLM Proxy')) {
      return {
        name: 'Admin Page',
        passed: false,
        error: 'Page does not contain expected content',
      };
    }

    return {
      name: 'Admin Page',
      passed: true,
    };
  } catch (error: any) {
    return {
      name: 'Admin Page',
      passed: false,
      error: error.message,
    };
  }
}

async function runTests() {
  console.log('🚀 LLM Proxy Test Suite');
  console.log(`📡 Testing against: ${BASE_URL}`);
  console.log('='.repeat(50));

  const results: TestResult[] = [];

  // Check if server is running
  try {
    const health = await fetch(`${BASE_URL}/admin`);
    if (!health.ok) throw new Error('Server not responding');
  } catch (error: any) {
    console.error(`\n❌ Cannot connect to server at ${BASE_URL}`);
    console.error('   Make sure the server is running: npm run dev');
    process.exit(1);
  }

  // Run tests
  results.push(await testAdminPage());
  results.push(await testGemini());
  results.push(await testNvidia());
  results.push(await testStream());

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Results:');

  let allPassed = true;
  for (const result of results) {
    if (result.passed) {
      console.log(`  ✅ ${result.name}`);
      if (result.response) {
        console.log(`     Response: ${JSON.stringify(result.response).slice(0, 100)}...`);
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
