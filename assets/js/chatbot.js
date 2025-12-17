/* ============================================
   QUIZ MASTER - AI CHATBOT LOGIC
   Powered by Google Gemini 2.0 Flash
   ============================================ */

class QuizMasterChatbot {
    constructor() {
        // Configuration
        this.config = {
            // For development: use direct API (not recommended for production)
            // For production: use proxy server
            useProxy: false,
            proxyUrl: 'http://localhost:3001/api/chat',
            apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
            apiKey: 'AIzaSyDfArqrTXwC7pGIQpySaWIEy1N25Lv2zmI' // Pre-configured API key
        };

        // State
        this.currentMode = null; // 'ai', 'q', 'qJson'
        this.chatHistory = [];
        this.pendingFile = null;
        this.isProcessing = false;

        // System prompts
        this.systemPrompts = {
            ai: `You are Quiz Master AI, a helpful and friendly tutor assistant for a quiz application. 
                
IMPORTANT RULES:
1. NEVER give direct answers to quiz questions. If a user asks for an answer, provide hints, explanations, or guide them to think through the problem.
2. Be encouraging and supportive in your responses.
3. Use emojis occasionally to be friendly.
4. Keep responses concise but helpful.
5. If asked about topics, explain concepts without giving away answers.

When users ask for quiz answers, say something like: "I can't give you the answer directly, but let me help you understand the concept..." and then provide guidance.`,

            q: `You are a quiz question parser. Your job is to extract quiz questions from the provided text, file content, or image.

For each question found, identify:
- The question text
- All answer options (if multiple choice)
- The correct answer (if indicated)

Format your response clearly listing each question found. If you can't find questions, explain what you need instead.`,

            qJson: `You are a quiz JSON generator. Convert the provided questions into this exact JSON format:

{
  "questions": [
    {
      "question": "Question text here",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 0
    }
  ]
}

Rules:
1. "correct" is the zero-based index of the correct answer in the options array
2. Always include exactly 4 options if possible
3. Return ONLY valid JSON, no additional text
4. If you can't parse questions, return: {"error": "Description of the issue"}`
        };

        // DOM Elements
        this.elements = {};
        
        // Initialize
        this.init();
    }

    init() {
        // Wait for DOM
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        this.cacheElements();
        this.bindEvents();
        this.loadChatHistory();
        this.checkApiKey();
    }

    cacheElements() {
        this.elements = {
            chatMessages: document.getElementById('chatMessages'),
            chatInput: document.getElementById('chatInput'),
            sendBtn: document.getElementById('sendBtn'),
            fileInput: document.getElementById('fileInput'),
            attachBtn: document.getElementById('attachBtn'),
            filePreview: document.getElementById('filePreview'),
            fileName: document.getElementById('fileName'),
            fileSize: document.getElementById('fileSize'),
            removeFile: document.getElementById('removeFile'),
            typingIndicator: document.getElementById('typingIndicator'),
            commandSuggestions: document.getElementById('commandSuggestions'),
            // Floating button elements (for embedded chat)
            floatBtn: document.getElementById('chatFloatBtn'),
            chatWindow: document.getElementById('chatWindow'),
            chatCloseBtn: document.getElementById('chatCloseBtn')
        };
    }

    bindEvents() {
        // Send message
        if (this.elements.sendBtn) {
            this.elements.sendBtn.addEventListener('click', () => this.handleSend());
        }

        // Enter key
        if (this.elements.chatInput) {
            this.elements.chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSend();
                }
            });

            // Show command suggestions on /
            this.elements.chatInput.addEventListener('input', (e) => {
                this.handleInputChange(e.target.value);
            });
        }

        // File attachment
        if (this.elements.attachBtn) {
            this.elements.attachBtn.addEventListener('click', () => {
                this.elements.fileInput?.click();
            });
        }

        if (this.elements.fileInput) {
            this.elements.fileInput.addEventListener('change', (e) => {
                this.handleFileSelect(e.target.files[0]);
            });
        }

        // Remove file
        if (this.elements.removeFile) {
            this.elements.removeFile.addEventListener('click', () => {
                this.clearFile();
            });
        }

        // Command chips
        document.querySelectorAll('.cmd-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const cmd = chip.dataset.cmd;
                if (this.elements.chatInput) {
                    this.elements.chatInput.value = cmd + ' ';
                    this.elements.chatInput.focus();
                }
            });
        });

        // Floating chat button (if exists)
        if (this.elements.floatBtn) {
            this.elements.floatBtn.addEventListener('click', () => this.toggleChatWindow());
        }

        if (this.elements.chatCloseBtn) {
            this.elements.chatCloseBtn.addEventListener('click', () => this.toggleChatWindow());
        }
    }

    // ============================================
    // API KEY MANAGEMENT
    // ============================================
    
    checkApiKey() {
        // Try to load from localStorage first
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) {
            this.config.apiKey = savedKey;
            return true;
        }
        return false;
    }

    async promptForApiKey() {
        const key = prompt(
            '🔑 Enter your Gemini API Key:\n\n' +
            'Get your free key at: https://aistudio.google.com/app/apikey\n\n' +
            '(Your key will be saved locally in this browser)'
        );
        
        if (key && key.trim()) {
            this.config.apiKey = key.trim();
            localStorage.setItem('gemini_api_key', key.trim());
            this.addMessage('ai', '✅ API Key saved! You can now use all AI features.');
            return true;
        }
        return false;
    }

    // ============================================
    // MESSAGE HANDLING
    // ============================================

    async handleSend() {
        const input = this.elements.chatInput?.value.trim();
        if (!input && !this.pendingFile) return;
        if (this.isProcessing) return;

        // Clear input
        if (this.elements.chatInput) {
            this.elements.chatInput.value = '';
        }

        // Check for commands
        if (input.startsWith('/')) {
            await this.handleCommand(input);
        } else if (this.currentMode) {
            await this.processInCurrentMode(input);
        } else {
            // No mode selected, suggest using a command
            this.addMessage('user', input);
            this.addMessage('ai', 
                "👋 Hi! Please use a command to get started:\n\n" +
                "• `/ai` - Chat with me freely\n" +
                "• `/q` - Input quiz questions\n" +
                "• `/qJson` - Generate JSON from questions\n" +
                "• `/help` - See all commands"
            );
        }
    }

    async handleCommand(input) {
        const parts = input.split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');

        switch (command) {
            case '/ai':
                this.currentMode = 'ai';
                this.addMessage('user', input);
                this.addMessage('ai', 
                    "💬 **AI Chat Mode Activated!**\n\n" +
                    "I'm here to help you learn! Ask me anything about:\n" +
                    "• Quiz topics and concepts\n" +
                    "• Study tips and explanations\n" +
                    "• General questions\n\n" +
                    "_Note: I won't give direct quiz answers, but I'll help you understand!_"
                );
                if (args) {
                    await this.processInCurrentMode(args);
                }
                break;

            case '/q':
                this.currentMode = 'q';
                this.addMessage('user', input);
                this.addMessage('ai', 
                    "📝 **Quiz Input Mode Activated!**\n\n" +
                    "Send me questions in any of these ways:\n" +
                    "• Paste text containing questions\n" +
                    "• Upload a file (.txt, .pdf, .docx)\n" +
                    "• Upload an image of questions\n\n" +
                    "I'll extract and organize them for you!"
                );
                if (args) {
                    await this.processInCurrentMode(args);
                }
                break;

            case '/qjson':
                this.currentMode = 'qJson';
                this.addMessage('user', input);
                this.addMessage('ai', 
                    "📦 **JSON Generator Mode Activated!**\n\n" +
                    "Send me quiz questions and I'll convert them to the JSON format needed by Quiz Master.\n\n" +
                    "You can:\n" +
                    "• Paste questions as text\n" +
                    "• Upload a file or image\n\n" +
                    "I'll generate downloadable JSON!"
                );
                if (args) {
                    await this.processInCurrentMode(args);
                }
                break;

            case '/aboutus':
                this.addMessage('user', input);
                this.addMessage('ai', 
                    "🎓 **Welcome to Quiz Master!**\n\n" +
                    "We're a modern quiz platform designed to make learning fun and interactive.\n\n" +
                    "**Features:**\n" +
                    "• 🎮 Solo Practice Mode\n" +
                    "• ⚔️ Real-time Multiplayer Battles\n" +
                    "• 🤖 AI-Powered Assistance\n" +
                    "• 🔥 Streak & Points System\n\n" +
                    "_Developed with ❤️ by Man Tran_"
                );
                break;

            case '/help':
                this.addMessage('user', input);
                this.addMessage('ai', 
                    "📚 **Available Commands:**\n\n" +
                    "| Command | Description |\n" +
                    "|---------|-------------|\n" +
                    "| `/ai` | 💬 Chat freely with AI (tutor mode) |\n" +
                    "| `/q` | 📝 Input questions (text/file/image) |\n" +
                    "| `/qJson` | 📦 Generate JSON from questions |\n" +
                    "| `/aboutus` | ℹ️ About Quiz Master |\n" +
                    "| `/help` | ❓ Show this help message |\n" +
                    "| `/clear` | 🗑️ Clear chat history |\n\n" +
                    "_Tip: After selecting a mode, just type normally!_"
                );
                break;

            case '/clear':
                this.clearChat();
                this.addMessage('system', '🗑️ Chat history cleared!');
                break;

            case '/key':
                this.addMessage('user', input);
                await this.promptForApiKey();
                break;

            default:
                this.addMessage('user', input);
                this.addMessage('ai', 
                    `❓ Unknown command: \`${command}\`\n\nType \`/help\` to see available commands.`
                );
        }
    }

    async processInCurrentMode(input) {
        // Add user message
        this.addMessage('user', input, this.pendingFile?.name);

        // Show typing indicator
        this.showTyping(true);
        this.isProcessing = true;

        try {
            let response;
            
            if (this.pendingFile) {
                // Process with file
                response = await this.sendToGeminiWithFile(input, this.pendingFile);
                this.clearFile();
            } else {
                // Text only
                response = await this.sendToGemini(input);
            }

            this.showTyping(false);
            
            // Handle JSON mode specially
            if (this.currentMode === 'qJson' && response) {
                this.handleJsonResponse(response);
            } else {
                this.addMessage('ai', response);
            }

        } catch (error) {
            this.showTyping(false);
            console.error('Gemini API Error:', error);
            this.addMessage('error', `⚠️ Oops! Something went wrong.\n\nWe're working on fixing this as soon as possible. Please try again in a moment!`);
        }

        this.isProcessing = false;
    }

    // ============================================
    // GEMINI API INTEGRATION
    // ============================================

    async sendToGemini(text) {
        const systemPrompt = this.systemPrompts[this.currentMode] || this.systemPrompts.ai;
        
        const requestBody = {
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: systemPrompt + "\n\nUser message: " + text }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 2048,
            }
        };

        const response = await fetch(`${this.config.apiUrl}?key=${this.config.apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'API request failed');
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
    }

    async sendToGeminiWithFile(text, file) {
        const systemPrompt = this.systemPrompts[this.currentMode] || this.systemPrompts.ai;
        
        // Convert file to base64
        const base64Data = await this.fileToBase64(file);
        const mimeType = file.type || 'application/octet-stream';

        const parts = [
            { text: systemPrompt + "\n\nUser message: " + (text || "Please analyze this file.") }
        ];

        // Add file as inline data
        if (mimeType.startsWith('image/')) {
            parts.push({
                inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                }
            });
        } else {
            // For text-based files, try to read as text
            const textContent = await this.readFileAsText(file);
            if (textContent) {
                parts[0].text += "\n\nFile content:\n" + textContent;
            }
        }

        const requestBody = {
            contents: [
                {
                    role: "user",
                    parts: parts
                }
            ],
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 2048,
            }
        };

        const response = await fetch(`${this.config.apiUrl}?key=${this.config.apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'API request failed');
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
    }

    // ============================================
    // FILE HANDLING
    // ============================================

    handleFileSelect(file) {
        if (!file) return;

        // Validate file type
        const allowedTypes = [
            'text/plain',
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/png',
            'image/jpeg',
            'image/jpg'
        ];

        const isAllowed = allowedTypes.some(type => file.type.includes(type.split('/')[1]));
        
        if (!isAllowed) {
            this.addMessage('error', '❌ File type not supported. Please use: .txt, .pdf, .docx, .png, .jpg');
            return;
        }

        // Check file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            this.addMessage('error', '❌ File too large. Maximum size is 10MB.');
            return;
        }

        this.pendingFile = file;
        this.showFilePreview(file);
    }

    showFilePreview(file) {
        if (!this.elements.filePreview) return;

        const icons = {
            'pdf': '📕',
            'docx': '📘',
            'txt': '📄',
            'png': '🖼️',
            'jpg': '🖼️',
            'jpeg': '🖼️'
        };

        const ext = file.name.split('.').pop().toLowerCase();
        const icon = icons[ext] || '📎';

        this.elements.filePreview.querySelector('.file-preview-icon').textContent = icon;
        this.elements.fileName.textContent = file.name;
        this.elements.fileSize.textContent = this.formatFileSize(file.size);
        this.elements.filePreview.classList.add('active');
    }

    clearFile() {
        this.pendingFile = null;
        if (this.elements.filePreview) {
            this.elements.filePreview.classList.remove('active');
        }
        if (this.elements.fileInput) {
            this.elements.fileInput.value = '';
        }
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsText(file);
        });
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // ============================================
    // JSON RESPONSE HANDLING
    // ============================================

    handleJsonResponse(response) {
        // Try to extract JSON from response
        let jsonData = null;
        
        try {
            // Try direct parse
            jsonData = JSON.parse(response);
        } catch {
            // Try to find JSON in response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    jsonData = JSON.parse(jsonMatch[0]);
                } catch {
                    // Not valid JSON
                }
            }
        }

        if (jsonData && jsonData.questions) {
            // Format nice display
            const questionCount = jsonData.questions.length;
            const preview = JSON.stringify(jsonData, null, 2);
            
            let messageHtml = `✅ **Generated ${questionCount} question(s)!**\n\n`;
            messageHtml += "```json\n" + preview.substring(0, 500);
            if (preview.length > 500) messageHtml += "\n...";
            messageHtml += "\n```";

            this.addMessage('ai', messageHtml);
            
            // Add download button
            this.addDownloadButton(jsonData);
        } else if (jsonData?.error) {
            this.addMessage('ai', `⚠️ ${jsonData.error}\n\nPlease provide clearer question content.`);
        } else {
            this.addMessage('ai', response);
        }
    }

    addDownloadButton(jsonData) {
        const messagesDiv = this.elements.chatMessages;
        if (!messagesDiv) return;

        const buttonContainer = document.createElement('div');
        buttonContainer.style.padding = '0 20px 15px';
        
        const button = document.createElement('button');
        button.className = 'download-json-btn';
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            Download JSON
        `;
        
        button.addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'quiz_questions.json';
            a.click();
            URL.revokeObjectURL(url);
        });

        buttonContainer.appendChild(button);
        messagesDiv.appendChild(buttonContainer);
        this.scrollToBottom();
    }

    // ============================================
    // UI HELPERS
    // ============================================

    addMessage(type, content, fileName = null) {
        const messagesDiv = this.elements.chatMessages;
        if (!messagesDiv) return;

        // Remove welcome message if exists
        const welcome = messagesDiv.querySelector('.welcome-message');
        if (welcome) welcome.remove();

        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${type}`;

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Custom AI Robot SVG Avatar
        const aiAvatarSVG = `
            <svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <!-- Background Circle with Gradient -->
                <defs>
                    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#6366f1"/>
                        <stop offset="50%" style="stop-color:#8b5cf6"/>
                        <stop offset="100%" style="stop-color:#a855f7"/>
                    </linearGradient>
                    <linearGradient id="faceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#1e1b4b"/>
                        <stop offset="100%" style="stop-color:#312e81"/>
                    </linearGradient>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                        <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                </defs>
                
                <!-- Main Circle -->
                <circle cx="50" cy="50" r="48" fill="url(#bgGrad)"/>
                
                <!-- Robot Head -->
                <rect x="22" y="25" width="56" height="45" rx="10" fill="url(#faceGrad)" stroke="#818cf8" stroke-width="2"/>
                
                <!-- Antenna -->
                <line x1="50" y1="25" x2="50" y2="15" stroke="#818cf8" stroke-width="3" stroke-linecap="round"/>
                <circle cx="50" cy="12" r="5" fill="#22d3ee" filter="url(#glow)">
                    <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite"/>
                </circle>
                
                <!-- Eyes -->
                <ellipse cx="36" cy="42" rx="8" ry="9" fill="#0f172a"/>
                <ellipse cx="64" cy="42" rx="8" ry="9" fill="#0f172a"/>
                
                <!-- Eye Glow -->
                <ellipse cx="36" cy="42" rx="5" ry="6" fill="#22d3ee" filter="url(#glow)">
                    <animate attributeName="opacity" values="1;0.7;1" dur="3s" repeatCount="indefinite"/>
                </ellipse>
                <ellipse cx="64" cy="42" rx="5" ry="6" fill="#22d3ee" filter="url(#glow)">
                    <animate attributeName="opacity" values="1;0.7;1" dur="3s" repeatCount="indefinite"/>
                </ellipse>
                
                <!-- Eye Highlights -->
                <circle cx="38" cy="40" r="2" fill="#fff" opacity="0.8"/>
                <circle cx="66" cy="40" r="2" fill="#fff" opacity="0.8"/>
                
                <!-- Mouth/Speaker Grille -->
                <rect x="35" y="55" width="30" height="8" rx="4" fill="#0f172a"/>
                <line x1="40" y1="55" x2="40" y2="63" stroke="#22d3ee" stroke-width="1.5" opacity="0.6"/>
                <line x1="45" y1="55" x2="45" y2="63" stroke="#22d3ee" stroke-width="1.5" opacity="0.8"/>
                <line x1="50" y1="55" x2="50" y2="63" stroke="#22d3ee" stroke-width="1.5"/>
                <line x1="55" y1="55" x2="55" y2="63" stroke="#22d3ee" stroke-width="1.5" opacity="0.8"/>
                <line x1="60" y1="55" x2="60" y2="63" stroke="#22d3ee" stroke-width="1.5" opacity="0.6"/>
                
                <!-- Side Ear Panels -->
                <rect x="15" y="38" width="7" height="16" rx="3" fill="#818cf8"/>
                <rect x="78" y="38" width="7" height="16" rx="3" fill="#818cf8"/>
                
                <!-- Decorative Dots -->
                <circle cx="28" cy="32" r="2" fill="#f472b6"/>
                <circle cx="72" cy="32" r="2" fill="#f472b6"/>
                
                <!-- Bottom Chin Detail -->
                <path d="M 35 70 Q 50 80 65 70" stroke="#818cf8" stroke-width="2" fill="none"/>
            </svg>
        `;

        if (type === 'user') {
            messageDiv.innerHTML = `
                <div class="message-content">
                    ${fileName ? `<div style="font-size: 11px; color: var(--chat-neon-cyan); margin-bottom: 5px;">📎 ${fileName}</div>` : ''}
                    <div class="message-bubble">${this.escapeHtml(content)}</div>
                    <span class="message-time">${time}</span>
                </div>
                <div class="message-avatar user-avatar">👤</div>
            `;
        } else if (type === 'ai') {
            messageDiv.innerHTML = `
                <div class="message-avatar ai-avatar">${aiAvatarSVG}</div>
                <div class="message-content">
                    <div class="message-bubble">${this.formatMessage(content)}</div>
                    <span class="message-time">${time}</span>
                </div>
            `;
        } else if (type === 'system') {
            messageDiv.innerHTML = `
                <div class="message-content" style="width: 100%; text-align: center;">
                    <div class="message-bubble" style="display: inline-block;">${content}</div>
                </div>
            `;
        } else if (type === 'error') {
            messageDiv.className = 'chat-message ai error';
            messageDiv.innerHTML = `
                <div class="message-avatar ai-avatar">${aiAvatarSVG}</div>
                <div class="message-content">
                    <div class="message-bubble">${this.formatMessage(content)}</div>
                    <span class="message-time">${time}</span>
                </div>
            `;
        }

        messagesDiv.appendChild(messageDiv);
        this.scrollToBottom();
        this.saveChatHistory();
    }

    formatMessage(text) {
        // Convert markdown-like syntax to HTML
        let html = this.escapeHtml(text);
        
        // Bold
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Italic
        html = html.replace(/_(.*?)_/g, '<em>$1</em>');
        
        // Code blocks
        html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
        
        // Inline code
        html = html.replace(/`(.*?)`/g, '<code>$1</code>');
        
        // Line breaks
        html = html.replace(/\n/g, '<br>');
        
        // Simple table conversion
        if (html.includes('|')) {
            html = this.convertTable(html);
        }

        return html;
    }

    convertTable(html) {
        const lines = html.split('<br>');
        let inTable = false;
        let result = [];

        for (const line of lines) {
            if (line.includes('|') && line.trim().startsWith('|')) {
                if (!inTable) {
                    result.push('<table style="width:100%;font-size:12px;margin:10px 0;">');
                    inTable = true;
                }
                
                // Skip separator line
                if (line.includes('---')) continue;
                
                const cells = line.split('|').filter(c => c.trim());
                const tag = result.length === 1 ? 'th' : 'td';
                const row = `<tr>${cells.map(c => `<${tag} style="padding:5px;border:1px solid rgba(255,255,255,0.2);">${c.trim()}</${tag}>`).join('')}</tr>`;
                result.push(row);
            } else {
                if (inTable) {
                    result.push('</table>');
                    inTable = false;
                }
                result.push(line);
            }
        }

        if (inTable) result.push('</table>');
        return result.join('');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showTyping(show) {
        if (this.elements.typingIndicator) {
            this.elements.typingIndicator.classList.toggle('hidden', !show);
        }
        if (show) this.scrollToBottom();
    }

    scrollToBottom() {
        if (this.elements.chatMessages) {
            this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
        }
    }

    handleInputChange(value) {
        // Show/hide command suggestions based on input
        if (this.elements.commandSuggestions) {
            if (value.startsWith('/') && value.length < 10) {
                this.elements.commandSuggestions.classList.remove('hidden');
            }
        }
    }

    // ============================================
    // CHAT WINDOW TOGGLE (for floating button)
    // ============================================

    toggleChatWindow() {
        if (this.elements.chatWindow) {
            this.elements.chatWindow.classList.toggle('active');
        }
        if (this.elements.floatBtn) {
            this.elements.floatBtn.classList.toggle('active');
        }
    }

    // ============================================
    // PERSISTENCE
    // ============================================

    saveChatHistory() {
        // Save to sessionStorage (clears on tab close)
        const messages = this.elements.chatMessages?.innerHTML || '';
        sessionStorage.setItem('quizmaster_chat', messages);
        sessionStorage.setItem('quizmaster_mode', this.currentMode || '');
    }

    loadChatHistory() {
        const saved = sessionStorage.getItem('quizmaster_chat');
        const mode = sessionStorage.getItem('quizmaster_mode');
        
        if (saved && this.elements.chatMessages) {
            // Only load if there's actual content beyond welcome
            if (saved.includes('chat-message')) {
                this.elements.chatMessages.innerHTML = saved;
                this.currentMode = mode || null;
            }
        }
    }

    clearChat() {
        if (this.elements.chatMessages) {
            this.elements.chatMessages.innerHTML = `
                <div class="welcome-message">
                    <h4>👋 Welcome to Quiz Master AI!</h4>
                    <p>I'm your intelligent quiz assistant. Use slash commands to get started:</p>
                    <div class="welcome-commands">
                        <button class="cmd-chip" data-cmd="/ai">💬 /ai - Chat Mode</button>
                        <button class="cmd-chip" data-cmd="/q">📝 /q - Input Questions</button>
                        <button class="cmd-chip" data-cmd="/qJson">📦 /qJson - Generate JSON</button>
                        <button class="cmd-chip" data-cmd="/help">❓ /help - Commands</button>
                    </div>
                </div>
            `;
            
            // Re-bind command chips
            this.elements.chatMessages.querySelectorAll('.cmd-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    const cmd = chip.dataset.cmd;
                    if (this.elements.chatInput) {
                        this.elements.chatInput.value = cmd + ' ';
                        this.elements.chatInput.focus();
                    }
                });
            });
        }
        
        this.currentMode = null;
        this.chatHistory = [];
        sessionStorage.removeItem('quizmaster_chat');
        sessionStorage.removeItem('quizmaster_mode');
    }
}

// ============================================
// FLOATING CHAT WIDGET (for embedding in other pages)
// ============================================

function initFloatingChat() {
    // Check if floating button exists
    const floatBtn = document.getElementById('chatFloatBtn');
    if (!floatBtn) return;

    const chatWindow = document.getElementById('chatWindow');
    const closeBtn = document.getElementById('chatCloseBtn');

    if (floatBtn && chatWindow) {
        floatBtn.addEventListener('click', () => {
            chatWindow.classList.toggle('active');
            floatBtn.classList.toggle('active');
        });
    }

    if (closeBtn && chatWindow && floatBtn) {
        closeBtn.addEventListener('click', () => {
            chatWindow.classList.remove('active');
            floatBtn.classList.remove('active');
        });
    }
}

// ============================================
// INITIALIZE
// ============================================

// Create global instance
const quizMasterChat = new QuizMasterChatbot();

// Also init floating chat if on other pages
document.addEventListener('DOMContentLoaded', initFloatingChat);
