# 🔐 Cloudflare Worker Setup Guide

This guide will help you set up a **FREE** and **SECURE** API proxy for Quiz Master AI.

## Why This Works

- Your API key is stored on Cloudflare's servers (not in your code)
- Users can't see or steal your API key
- Free tier: 100,000 requests/day
- No server maintenance required

---

## Step-by-Step Setup (5 minutes)

### 1️⃣ Create Cloudflare Account

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/)
2. Sign up for a **free account** (no credit card needed)

### 2️⃣ Create a Worker

1. In the Cloudflare dashboard, click **"Workers & Pages"** in the left sidebar
2. Click **"Create"** button
3. Select **"Create Worker"**
4. Give it a name like `quiz-ai` (this becomes part of your URL)
5. Click **"Deploy"**

### 3️⃣ Add Your Code

1. After deployment, click **"Edit code"**
2. Delete all the default code
3. Copy and paste the entire contents of `worker.js` from this folder
4. Click **"Deploy"** (top right)

### 4️⃣ Add Your API Key

1. Go back to your Worker's overview page
2. Click **"Settings"** tab
3. Click **"Variables"** in the left menu
4. Under "Environment Variables", click **"Add variable"**
5. Set:
   - **Variable name:** `GEMINI_API_KEY`
   - **Value:** Your Gemini API key (the one from your GitHub secret)
6. Click **"Encrypt"** (important for security!)
7. Click **"Deploy"**

### 5️⃣ Get Your Worker URL

Your Worker URL looks like:
```
https://quiz-ai.YOUR-SUBDOMAIN.workers.dev
```

You can find it on the Worker's overview page.

### 6️⃣ Update Your Code

Open `assets/js/chatbot.js` and update line 9:

```javascript
proxyUrl: 'https://quiz-ai.YOUR-SUBDOMAIN.workers.dev',
```

Replace with your actual Worker URL.

### 7️⃣ Update Allowed Origins (Important!)

In the Worker code (`worker.js`), update the `ALLOWED_ORIGINS` array to include your GitHub Pages URL:

```javascript
const ALLOWED_ORIGINS = [
  'https://mantran138.github.io',  // Your GitHub Pages
  'http://localhost:8000',          // Local development
  // Add any other domains you use
];
```

Re-deploy the worker after making changes.

---

## ✅ Test It

1. Push your changes to GitHub
2. Visit your GitHub Pages site
3. Open the AI chatbot
4. Type `/ai hello!`
5. If it responds, everything is working! 🎉

---

## 🔧 Troubleshooting

### "Origin not allowed" error
- Make sure your GitHub Pages URL is in the `ALLOWED_ORIGINS` array in the Worker
- Re-deploy the Worker after changes

### "API key not configured" error
- Check that `GEMINI_API_KEY` is set in Worker Settings → Variables
- Make sure you clicked "Encrypt" and "Deploy"

### No response / timeout
- Check the Cloudflare Worker logs (Workers → your worker → Logs)
- Verify your Gemini API key is valid at [aistudio.google.com](https://aistudio.google.com/)

---

## 📊 Monitor Usage

In Cloudflare dashboard:
- **Workers & Pages** → Your worker → **Metrics**
- See requests, errors, and usage

Free tier limit: 100,000 requests/day (more than enough!)

---

## 🔒 Security Notes

- ✅ API key is encrypted and stored on Cloudflare's servers
- ✅ Only your allowed origins can use the proxy
- ✅ Key is never exposed in browser/code
- ✅ Cloudflare provides DDoS protection
