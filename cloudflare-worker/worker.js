/**
 * Quiz Master AI Proxy - Cloudflare Worker
 * 
 * This worker securely proxies requests to the Gemini API
 * without exposing your API key to the frontend.
 * 
 * SETUP:
 * 1. Go to https://dash.cloudflare.com/
 * 2. Create a free account (if you don't have one)
 * 3. Go to Workers & Pages → Create Worker
 * 4. Paste this code
 * 5. Go to Settings → Variables → Add Environment Variable:
 *    - Name: GEMINI_API_KEY
 *    - Value: Your API key (paste from GitHub secret)
 * 6. Deploy and copy your worker URL (e.g., https://quiz-ai.your-name.workers.dev)
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Allowed origins (update with your GitHub Pages URL)
const ALLOWED_ORIGINS = [
  'https://mantran138.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }

    // Only allow POST requests
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check origin
    const origin = request.headers.get('Origin');
    if (!isAllowedOrigin(origin)) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      // Get API key from environment variable (set in Cloudflare dashboard)
      const apiKey = env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'API key not configured' }), {
          status: 500,
          headers: getCORSHeaders(origin)
        });
      }

      // Get request body
      const body = await request.json();

      // Forward to Gemini API
      const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      });

      const data = await geminiResponse.json();

      // Return response with CORS headers
      return new Response(JSON.stringify(data), {
        status: geminiResponse.status,
        headers: getCORSHeaders(origin)
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: 'Proxy error: ' + error.message }), {
        status: 500,
        headers: getCORSHeaders(origin)
      });
    }
  }
};

function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
}

function getCORSHeaders(origin) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function handleCORS(request) {
  const origin = request.headers.get('Origin');
  return new Response(null, {
    status: 204,
    headers: getCORSHeaders(origin)
  });
}
