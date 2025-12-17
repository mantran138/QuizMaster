/**
 * Quiz Master - Gemini API Proxy Server
 * 
 * This simple Node.js server acts as a proxy to hide your Gemini API key
 * from the client-side code. Use this for production deployments.
 * 
 * SETUP:
 * 1. Install dependencies: npm install express cors dotenv
 * 2. Create a .env file with: GEMINI_API_KEY=your_key_here
 * 3. Run: node server/proxy.js
 * 4. Update chatbot.js config: useProxy = true
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Get API key from environment
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error('❌ ERROR: GEMINI_API_KEY not found in .env file');
    console.log('Create a .env file in the root directory with:');
    console.log('GEMINI_API_KEY=your_api_key_here');
    process.exit(1);
}

// Gemini API endpoint
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * POST /api/chat
 * Proxy endpoint for Gemini API calls
 */
app.post('/api/chat', async (req, res) => {
    try {
        const { contents, generationConfig } = req.body;

        if (!contents) {
            return res.status(400).json({ error: 'Missing contents in request body' });
        }

        console.log('📨 Proxying request to Gemini API...');

        const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents,
                generationConfig: generationConfig || {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 2048,
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('❌ Gemini API Error:', error);
            return res.status(response.status).json(error);
        }

        const data = await response.json();
        console.log('✅ Response received from Gemini');
        
        res.json(data);

    } catch (error) {
        console.error('❌ Proxy Error:', error.message);
        res.status(500).json({ 
            error: { 
                message: 'Internal server error', 
                details: error.message 
            } 
        });
    }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Quiz Master API Proxy is running',
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /
 * Root endpoint with info
 */
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Quiz Master API Proxy</title>
                <style>
                    body { 
                        font-family: system-ui; 
                        max-width: 600px; 
                        margin: 50px auto; 
                        padding: 20px;
                        background: #0a0a1a;
                        color: #fff;
                    }
                    h1 { color: #00f5ff; }
                    code { 
                        background: rgba(0,245,255,0.1); 
                        padding: 2px 8px; 
                        border-radius: 4px;
                    }
                    .status { 
                        background: rgba(0,255,136,0.2); 
                        border: 1px solid #00ff88;
                        padding: 15px;
                        border-radius: 8px;
                        margin: 20px 0;
                    }
                </style>
            </head>
            <body>
                <h1>🤖 Quiz Master API Proxy</h1>
                <div class="status">✅ Server is running on port ${PORT}</div>
                <h3>Endpoints:</h3>
                <ul>
                    <li><code>POST /api/chat</code> - Proxy Gemini API requests</li>
                    <li><code>GET /api/health</code> - Health check</li>
                </ul>
                <h3>Usage:</h3>
                <p>Update <code>chatbot.js</code> config:</p>
                <pre style="background:#1a1a2e;padding:15px;border-radius:8px;">
this.config = {
    useProxy: true,
    proxyUrl: 'http://localhost:${PORT}/api/chat',
    // ...
};</pre>
            </body>
        </html>
    `);
});

// Start server
app.listen(PORT, () => {
    console.log('');
    console.log('🚀 ════════════════════════════════════════');
    console.log('   Quiz Master API Proxy Server');
    console.log('   ════════════════════════════════════════');
    console.log(`   📡 Running on: http://localhost:${PORT}`);
    console.log(`   🔑 API Key: ${GEMINI_API_KEY.substring(0, 8)}...`);
    console.log('   ════════════════════════════════════════');
    console.log('');
});
