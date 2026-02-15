/**
 * WhatsApp Test Server
 *
 * Simulates WhatsApp messaging with a real chat UI.
 * - POST /api/send — send message (text or image)
 * - POST /api/send-media — send image with caption
 * - GET  /api/messages — get all messages
 * - DELETE /api/messages — clear all messages
 *
 * Run: node server.js
 * Open: http://localhost:3099
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// Storage
const messages = [];
let msgId = 1;
const uploadsDir = join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Multer for image uploads
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, `${Date.now()}${extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Middleware
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// ==================== API ====================

// Send text message
app.post('/api/send', (req, res) => {
  const { phone, message, partyName, direction } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const msg = {
    id: msgId++,
    phone: phone || '9779800000000',
    partyName: partyName || phone || 'Unknown',
    direction: direction || 'outgoing',
    type: 'text',
    body: message,
    status: 'sent',
    timestamp: new Date().toISOString()
  };
  messages.push(msg);
  io.emit('message', msg);
  res.json({ success: true, message: msg });
});

// Send media (image/file) via multipart form
app.post('/api/send-media', upload.single('file'), (req, res) => {
  const { phone, caption, partyName, direction } = req.body;
  if (!req.file) return res.status(400).json({ error: 'file required' });

  const msg = {
    id: msgId++,
    phone: phone || '9779800000000',
    partyName: partyName || phone || 'Unknown',
    direction: direction || 'outgoing',
    type: 'image',
    body: caption || '',
    mediaUrl: `/uploads/${req.file.filename}`,
    mediaName: req.file.originalname,
    status: 'sent',
    timestamp: new Date().toISOString()
  };
  messages.push(msg);
  io.emit('message', msg);
  res.json({ success: true, message: msg });
});

// Send media via URL (no file upload)
app.post('/api/send-media-url', (req, res) => {
  const { phone, caption, partyName, direction, imageUrl } = req.body;
  if (!imageUrl) return res.status(400).json({ error: 'imageUrl required' });

  const msg = {
    id: msgId++,
    phone: phone || '9779800000000',
    partyName: partyName || phone || 'Unknown',
    direction: direction || 'outgoing',
    type: 'image',
    body: caption || '',
    mediaUrl: imageUrl,
    mediaName: 'image',
    status: 'sent',
    timestamp: new Date().toISOString()
  };
  messages.push(msg);
  io.emit('message', msg);
  res.json({ success: true, message: msg });
});

// Get all messages
app.get('/api/messages', (req, res) => {
  res.json({ success: true, messages });
});

// Clear all messages
app.delete('/api/messages', (req, res) => {
  messages.length = 0;
  msgId = 1;
  io.emit('clear');
  res.json({ success: true });
});

// ==================== FRONTEND ====================

app.get('/', (req, res) => {
  res.send(HTML);
});

// ==================== START ====================

const PORT = 3099;
httpServer.listen(PORT, () => {
  console.log(`\n  WhatsApp Test Server`);
  console.log(`  ====================`);
  console.log(`  UI:  http://localhost:${PORT}`);
  console.log(`  API: http://localhost:${PORT}/api/send`);
  console.log(`\n  Try: curl -X POST http://localhost:${PORT}/api/send \\`);
  console.log(`         -H "Content-Type: application/json" \\`);
  console.log(`         -d '{"phone":"9841234567","message":"Hello *bold* _italic_","partyName":"Test Shop"}'`);
  console.log();
});

// ==================== HTML ====================

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WhatsApp Test</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --wa-bg: #0b141a;
    --wa-chat-bg: #0b141a;
    --wa-sidebar: #111b21;
    --wa-header: #1f2c34;
    --wa-green: #00a884;
    --wa-green-dark: #005c4b;
    --wa-bubble-out: #005c4b;
    --wa-bubble-in: #202c33;
    --wa-text: #e9edef;
    --wa-text2: #8696a0;
    --wa-border: #2a3942;
    --wa-input-bg: #2a3942;
    --wa-hover: #202c33;
  }

  body {
    font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
    background: var(--wa-bg);
    color: var(--wa-text);
    height: 100vh;
    display: flex;
    overflow: hidden;
  }

  /* Sidebar */
  .sidebar {
    width: 340px;
    background: var(--wa-sidebar);
    border-right: 1px solid var(--wa-border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }
  .sidebar-header {
    padding: 12px 16px;
    background: var(--wa-header);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .sidebar-header h3 { font-size: 16px; font-weight: 500; }
  .sidebar-tools {
    padding: 8px;
    border-bottom: 1px solid var(--wa-border);
    display: flex;
    gap: 6px;
  }
  .sidebar-tools button {
    flex: 1;
    padding: 8px 4px;
    background: var(--wa-input-bg);
    border: none;
    color: var(--wa-text2);
    border-radius: 8px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    transition: all 0.15s;
  }
  .sidebar-tools button:hover { background: var(--wa-green-dark); color: #fff; }
  .sidebar-tools button.active { background: var(--wa-green-dark); color: #fff; }

  .contacts-list {
    flex: 1;
    overflow-y: auto;
  }
  .contact-item {
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    border-bottom: 1px solid rgba(134,150,160,0.08);
    transition: background 0.1s;
  }
  .contact-item:hover, .contact-item.active { background: var(--wa-hover); }
  .contact-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--wa-green-dark);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 600;
    color: #fff;
    flex-shrink: 0;
  }
  .contact-info { flex: 1; min-width: 0; }
  .contact-name { font-size: 15px; font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .contact-last { font-size: 13px; color: var(--wa-text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
  .contact-meta { text-align: right; flex-shrink: 0; }
  .contact-time { font-size: 11px; color: var(--wa-text2); }
  .contact-badge {
    display: inline-block;
    background: var(--wa-green);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    text-align: center;
    line-height: 20px;
    margin-top: 4px;
  }

  /* Chat Area */
  .chat-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--wa-chat-bg);
    position: relative;
  }
  .chat-area::before {
    content: '';
    position: absolute;
    inset: 0;
    background: url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 10 L50 30 L30 50 L10 30Z' fill='none' stroke='%23ffffff' stroke-width='0.3' opacity='0.03'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 0;
  }

  .chat-header {
    padding: 10px 16px;
    background: var(--wa-header);
    display: flex;
    align-items: center;
    gap: 12px;
    z-index: 1;
    border-bottom: 1px solid var(--wa-border);
  }
  .chat-header .contact-avatar { width: 38px; height: 38px; font-size: 15px; }
  .chat-header-info h4 { font-size: 15px; font-weight: 500; }
  .chat-header-info span { font-size: 12px; color: var(--wa-text2); }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px 60px;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* Message Bubbles */
  .msg-row {
    display: flex;
    margin-bottom: 2px;
  }
  .msg-row.out { justify-content: flex-end; }
  .msg-row.in { justify-content: flex-start; }

  .msg-bubble {
    max-width: 65%;
    padding: 6px 8px 6px 9px;
    border-radius: 8px;
    position: relative;
    word-wrap: break-word;
    white-space: pre-wrap;
    line-height: 1.35;
    font-size: 14.2px;
  }
  .msg-row.out .msg-bubble {
    background: var(--wa-bubble-out);
    border-top-right-radius: 0;
  }
  .msg-row.in .msg-bubble {
    background: var(--wa-bubble-in);
    border-top-left-radius: 0;
  }

  .msg-bubble .msg-media {
    border-radius: 6px;
    max-width: 330px;
    max-height: 300px;
    display: block;
    margin-bottom: 4px;
    cursor: pointer;
  }

  .msg-text { margin-bottom: 0; }
  .msg-text b { font-weight: 600; }
  .msg-text i { font-style: italic; }
  .msg-text s { text-decoration: line-through; }
  .msg-text code {
    font-family: 'SF Mono', 'Cascadia Code', monospace;
    background: rgba(0,0,0,0.2);
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 13px;
  }

  .msg-meta {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 4px;
    margin-top: 2px;
    float: right;
    margin-left: 12px;
    position: relative;
    top: 4px;
  }
  .msg-time { font-size: 11px; color: rgba(255,255,255,0.45); }
  .msg-check { font-size: 12px; color: rgba(255,255,255,0.35); }
  .msg-check.read { color: #53bdeb; }

  /* Day separator */
  .day-sep {
    text-align: center;
    margin: 12px 0;
  }
  .day-sep span {
    background: #182229;
    color: var(--wa-text2);
    padding: 5px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
  }

  /* Input bar */
  .chat-input-bar {
    padding: 8px 16px;
    background: var(--wa-header);
    display: flex;
    align-items: flex-end;
    gap: 8px;
    z-index: 1;
  }
  .chat-input-bar textarea {
    flex: 1;
    padding: 10px 14px;
    background: var(--wa-input-bg);
    border: none;
    border-radius: 8px;
    color: var(--wa-text);
    font-size: 14px;
    font-family: inherit;
    resize: none;
    min-height: 42px;
    max-height: 120px;
    line-height: 1.4;
    outline: none;
  }
  .chat-input-bar textarea::placeholder { color: var(--wa-text2); }
  .chat-input-bar button {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    border: none;
    background: var(--wa-green);
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  .chat-input-bar button:hover { background: #06cf9c; }
  .attach-btn {
    background: transparent !important;
    color: var(--wa-text2) !important;
    font-size: 20px !important;
  }
  .attach-btn:hover { color: var(--wa-text) !important; background: transparent !important; }

  /* API Panel */
  .api-panel {
    display: none;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--wa-sidebar);
    z-index: 10;
    flex-direction: column;
    overflow-y: auto;
  }
  .api-panel.show { display: flex; }
  .api-panel-header {
    padding: 12px 16px;
    background: var(--wa-header);
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--wa-border);
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .api-panel-header button {
    background: none;
    border: none;
    color: var(--wa-text);
    font-size: 20px;
    cursor: pointer;
    padding: 4px;
  }
  .api-section {
    padding: 16px;
    border-bottom: 1px solid var(--wa-border);
  }
  .api-section h4 {
    font-size: 13px;
    color: var(--wa-green);
    margin-bottom: 8px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .api-code {
    background: #0d1117;
    padding: 12px;
    border-radius: 8px;
    font-family: 'SF Mono', 'Cascadia Code', monospace;
    font-size: 12px;
    line-height: 1.5;
    color: #c9d1d9;
    overflow-x: auto;
    white-space: pre;
    position: relative;
  }
  .api-code .kw { color: #ff7b72; }
  .api-code .str { color: #a5d6ff; }
  .api-code .cmt { color: #8b949e; }
  .copy-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    padding: 4px 10px;
    background: rgba(255,255,255,0.08);
    border: none;
    color: var(--wa-text2);
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
  }
  .copy-btn:hover { background: rgba(255,255,255,0.15); }

  /* Template buttons */
  .template-btns {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }
  .template-btn {
    padding: 8px 14px;
    background: var(--wa-input-bg);
    border: 1px solid var(--wa-border);
    color: var(--wa-text);
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.15s;
  }
  .template-btn:hover { background: var(--wa-green-dark); border-color: var(--wa-green); }

  /* Image modal */
  .img-modal {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.9);
    z-index: 100;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .img-modal.show { display: flex; }
  .img-modal img { max-width: 90%; max-height: 90%; border-radius: 4px; }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

  /* Responsive */
  @media (max-width: 768px) {
    .sidebar { width: 100%; position: absolute; z-index: 5; }
    .sidebar.hidden { display: none; }
    .chat-messages { padding: 12px 16px; }
    .msg-bubble { max-width: 85%; }
  }
</style>
</head>
<body>

<!-- Sidebar -->
<div class="sidebar" id="sidebar">
  <div class="sidebar-header">
    <h3>WhatsApp Test</h3>
    <span style="font-size: 12px; color: var(--wa-text2)">localhost:3099</span>
  </div>
  <div class="sidebar-tools">
    <button onclick="showApiPanel()" id="btnApi">API Docs</button>
    <button onclick="showTemplates()" id="btnTemplates">Templates</button>
    <button onclick="clearAll()" style="color: #ef4444">Clear</button>
  </div>
  <div class="contacts-list" id="contactsList">
    <div style="padding: 40px 20px; text-align: center; color: var(--wa-text2); font-size: 13px;">
      Send a message via API or type below to see contacts appear here.
    </div>
  </div>
</div>

<!-- Chat Area -->
<div class="chat-area" id="chatArea">
  <!-- No chat selected -->
  <div id="emptyState" style="flex:1; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:12px; z-index:1;">
    <div style="font-size: 48px; opacity: 0.3;">💬</div>
    <div style="font-size: 18px; color: var(--wa-text2); font-weight: 300;">WhatsApp Test Server</div>
    <div style="font-size: 13px; color: var(--wa-text2); max-width: 380px; text-align: center; line-height: 1.6;">
      Send messages via the API or type in the chat. Messages render with WhatsApp formatting.
    </div>
    <div style="margin-top: 12px; display: flex; gap: 8px;">
      <button onclick="showApiPanel()" style="padding: 8px 20px; background: var(--wa-green-dark); border: none; color: #fff; border-radius: 8px; cursor: pointer; font-size: 13px;">View API</button>
      <button onclick="quickDemo()" style="padding: 8px 20px; background: var(--wa-input-bg); border: 1px solid var(--wa-border); color: var(--wa-text); border-radius: 8px; cursor: pointer; font-size: 13px;">Quick Demo</button>
    </div>
  </div>

  <!-- Active chat -->
  <div id="activeChat" style="display:none; flex:1; display:flex; flex-direction:column;">
    <div class="chat-header" id="chatHeader">
      <div class="contact-avatar" id="chatAvatar">?</div>
      <div class="chat-header-info">
        <h4 id="chatName">-</h4>
        <span id="chatPhone">-</span>
      </div>
      <div style="margin-left:auto; display:flex; gap:8px;">
        <button onclick="selectChat(null)" style="background:none; border:none; color:var(--wa-text2); font-size:12px; cursor:pointer; padding:6px 10px; border-radius:6px; background:var(--wa-input-bg);">All Chats</button>
      </div>
    </div>

    <div class="chat-messages" id="chatMessages"></div>

    <div class="chat-input-bar">
      <button class="attach-btn" onclick="document.getElementById('fileInput').click()" title="Attach image">📎</button>
      <input type="file" id="fileInput" accept="image/*" style="display:none" onchange="handleFileSelect(event)">
      <textarea id="msgInput" placeholder="Type a message" rows="1"
        oninput="autoGrow(this)"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendFromUI()}"></textarea>
      <button onclick="sendFromUI()" title="Send">➤</button>
    </div>
  </div>

  <!-- API Panel -->
  <div class="api-panel" id="apiPanel">
    <div class="api-panel-header">
      <button onclick="hideApiPanel()">←</button>
      <h4 style="font-size: 15px; font-weight: 500;">API Documentation</h4>
    </div>

    <div class="api-section">
      <h4>POST /api/send — Text Message</h4>
      <div class="api-code"><button class="copy-btn" onclick="copyCode(this)">Copy</button><span class="kw">curl</span> -X POST http://localhost:3099/api/send \\
  -H <span class="str">"Content-Type: application/json"</span> \\
  -d <span class="str">'{
  "phone": "9841234567",
  "partyName": "Saroj Enterprises",
  "message": "*Payment Reminder*\\n\\nDear Saroj,\\nYour outstanding: Rs 5,00,000\\n\\n_Please clear at earliest._",
  "direction": "outgoing"
}'</span></div>
    </div>

    <div class="api-section">
      <h4>POST /api/send — Incoming Message</h4>
      <div class="api-code"><button class="copy-btn" onclick="copyCode(this)">Copy</button><span class="kw">curl</span> -X POST http://localhost:3099/api/send \\
  -H <span class="str">"Content-Type: application/json"</span> \\
  -d <span class="str">'{
  "phone": "9841234567",
  "partyName": "Saroj Enterprises",
  "message": "Ji bhai, kal payment kar dunga",
  "direction": "incoming"
}'</span></div>
    </div>

    <div class="api-section">
      <h4>POST /api/send-media — Image with Caption</h4>
      <div class="api-code"><button class="copy-btn" onclick="copyCode(this)">Copy</button><span class="kw">curl</span> -X POST http://localhost:3099/api/send-media \\
  -F <span class="str">"phone=9841234567"</span> \\
  -F <span class="str">"partyName=Saroj Enterprises"</span> \\
  -F <span class="str">"caption=Cheque photo"</span> \\
  -F <span class="str">"file=@/path/to/cheque.jpg"</span></div>
    </div>

    <div class="api-section">
      <h4>GET /api/messages — All Messages</h4>
      <div class="api-code"><button class="copy-btn" onclick="copyCode(this)">Copy</button><span class="kw">curl</span> http://localhost:3099/api/messages</div>
    </div>

    <div class="api-section">
      <h4>DELETE /api/messages — Clear All</h4>
      <div class="api-code"><button class="copy-btn" onclick="copyCode(this)">Copy</button><span class="kw">curl</span> -X DELETE http://localhost:3099/api/messages</div>
    </div>

    <div class="api-section">
      <h4>Message Format Reference</h4>
      <div style="font-size: 13px; color: var(--wa-text2); line-height: 1.8;">
        <code>*bold*</code> → <b>bold</b><br>
        <code>_italic_</code> → <i>italic</i><br>
        <code>~strikethrough~</code> → <s>strikethrough</s><br>
        <code>\`\`\`code\`\`\`</code> → <code>code</code><br>
        <code>\\n</code> → newline
      </div>
    </div>

    <div class="api-section">
      <h4>Connect from Main Server</h4>
      <div style="font-size: 13px; color: var(--wa-text2); line-height: 1.6; margin-bottom: 8px;">
        Point your main app's WhatsApp service to this test server instead of real WhatsApp:
      </div>
      <div class="api-code"><button class="copy-btn" onclick="copyCode(this)">Copy</button><span class="cmt">// In your app, call:</span>
<span class="kw">fetch</span>(<span class="str">'http://localhost:3099/api/send'</span>, {
  method: <span class="str">'POST'</span>,
  headers: { <span class="str">'Content-Type'</span>: <span class="str">'application/json'</span> },
  body: JSON.stringify({
    phone: <span class="str">'9841234567'</span>,
    partyName: <span class="str">'Test Party'</span>,
    message: <span class="str">'Hello from my app!'</span>
  })
})</div>
    </div>
  </div>
</div>

<!-- Image Modal -->
<div class="img-modal" id="imgModal" onclick="this.classList.remove('show')">
  <img id="imgModalSrc" src="">
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
const contacts = {}; // phone → { partyName, messages[], unread }
let activePhone = null;

// Socket events
socket.on('message', msg => {
  addMessage(msg);
});
socket.on('clear', () => {
  Object.keys(contacts).forEach(k => delete contacts[k]);
  activePhone = null;
  renderContacts();
  renderChat();
});

// Load existing messages
fetch('/api/messages').then(r => r.json()).then(data => {
  if (data.messages) data.messages.forEach(m => addMessage(m, true));
  renderContacts();
  if (activePhone) renderChat();
});

function addMessage(msg, batch = false) {
  if (!contacts[msg.phone]) {
    contacts[msg.phone] = { partyName: msg.partyName, phone: msg.phone, messages: [], unread: 0 };
  }
  const c = contacts[msg.phone];
  c.partyName = msg.partyName || c.partyName;
  // Avoid duplicates
  if (!c.messages.find(m => m.id === msg.id)) {
    c.messages.push(msg);
  }
  if (!batch) {
    if (activePhone !== msg.phone && msg.direction === 'incoming') c.unread++;
    renderContacts();
    if (activePhone === msg.phone) {
      renderChat();
      scrollChat();
    } else if (!activePhone) {
      selectChat(msg.phone);
    }
  }
}

function selectChat(phone) {
  activePhone = phone;
  if (phone && contacts[phone]) contacts[phone].unread = 0;
  document.getElementById('emptyState').style.display = phone ? 'none' : 'flex';
  document.getElementById('activeChat').style.display = phone ? 'flex' : 'none';
  renderContacts();
  renderChat();
  scrollChat();
}

function renderContacts() {
  const list = document.getElementById('contactsList');
  const sorted = Object.values(contacts).sort((a, b) => {
    const la = a.messages[a.messages.length - 1]?.timestamp || '';
    const lb = b.messages[b.messages.length - 1]?.timestamp || '';
    return lb.localeCompare(la);
  });
  if (sorted.length === 0) {
    list.innerHTML = '<div style="padding:40px 20px; text-align:center; color:var(--wa-text2); font-size:13px;">No conversations yet.<br>Send a message via API.</div>';
    return;
  }
  list.innerHTML = sorted.map(c => {
    const last = c.messages[c.messages.length - 1];
    const time = last ? new Date(last.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const preview = last?.type === 'image' ? '📷 Photo' : (last?.body || '').split('\\n')[0].slice(0, 40);
    const initial = (c.partyName || '?')[0].toUpperCase();
    const isActive = activePhone === c.phone;
    return \`
      <div class="contact-item \${isActive ? 'active' : ''}" onclick="selectChat('\${c.phone}')">
        <div class="contact-avatar">\${initial}</div>
        <div class="contact-info">
          <div class="contact-name">\${esc(c.partyName || c.phone)}</div>
          <div class="contact-last">\${last?.direction === 'outgoing' ? '✓ ' : ''}\${esc(preview)}</div>
        </div>
        <div class="contact-meta">
          <div class="contact-time">\${time}</div>
          \${c.unread > 0 ? \`<div class="contact-badge">\${c.unread}</div>\` : ''}
        </div>
      </div>
    \`;
  }).join('');
}

function renderChat() {
  if (!activePhone || !contacts[activePhone]) return;
  const c = contacts[activePhone];
  document.getElementById('chatAvatar').textContent = (c.partyName || '?')[0].toUpperCase();
  document.getElementById('chatName').textContent = c.partyName || c.phone;
  document.getElementById('chatPhone').textContent = '+' + c.phone.replace(/^977/, '977 ');

  const container = document.getElementById('chatMessages');
  let html = '';
  let lastDate = '';

  for (const m of c.messages) {
    const d = new Date(m.timestamp);
    const dateStr = d.toLocaleDateString();
    if (dateStr !== lastDate) {
      lastDate = dateStr;
      const today = new Date().toLocaleDateString();
      const label = dateStr === today ? 'TODAY' : dateStr;
      html += \`<div class="day-sep"><span>\${label}</span></div>\`;
    }

    const dir = m.direction === 'incoming' ? 'in' : 'out';
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const checks = m.direction === 'outgoing' ? \`<span class="msg-check read">✓✓</span>\` : '';

    let body = '';
    if (m.type === 'image' && m.mediaUrl) {
      body += \`<img class="msg-media" src="\${m.mediaUrl}" onclick="showImage('\${m.mediaUrl}')" loading="lazy">\`;
    }
    if (m.body) {
      body += \`<div class="msg-text">\${formatWA(m.body)}</div>\`;
    }

    html += \`
      <div class="msg-row \${dir}">
        <div class="msg-bubble">
          \${body}
          <div class="msg-meta">
            <span class="msg-time">\${time}</span>
            \${checks}
          </div>
        </div>
      </div>
    \`;
  }
  container.innerHTML = html;
}

function scrollChat() {
  setTimeout(() => {
    const el = document.getElementById('chatMessages');
    if (el) el.scrollTop = el.scrollHeight;
  }, 50);
}

// WhatsApp text formatting
function formatWA(text) {
  let s = esc(text);
  // Code blocks (triple backtick)
  s = s.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<code>$1</code>');
  // Inline code
  s = s.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
  // Bold
  s = s.replace(/\\*(.*?)\\*/g, '<b>$1</b>');
  // Italic
  s = s.replace(/_(.*?)_/g, '<i>$1</i>');
  // Strikethrough
  s = s.replace(/~(.*?)~/g, '<s>$1</s>');
  return s;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// Send from UI
function sendFromUI() {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (!text || !activePhone) return;
  fetch('/api/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: activePhone, partyName: contacts[activePhone]?.partyName, message: text, direction: 'outgoing' })
  });
  input.value = '';
  autoGrow(input);
}

// File upload from UI
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file || !activePhone) return;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('phone', activePhone);
  fd.append('partyName', contacts[activePhone]?.partyName || '');
  fd.append('caption', '');
  fd.append('direction', 'outgoing');
  fetch('/api/send-media', { method: 'POST', body: fd });
  e.target.value = '';
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function showImage(url) {
  document.getElementById('imgModalSrc').src = url;
  document.getElementById('imgModal').classList.add('show');
}

function showApiPanel() {
  document.getElementById('apiPanel').classList.add('show');
}
function hideApiPanel() {
  document.getElementById('apiPanel').classList.remove('show');
}

function copyCode(btn) {
  const code = btn.parentElement.textContent.replace('Copy', '').trim();
  navigator.clipboard.writeText(code);
  btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = 'Copy', 1500);
}

function clearAll() {
  if (!confirm('Clear all messages?')) return;
  fetch('/api/messages', { method: 'DELETE' });
}

// Templates
function showTemplates() {
  if (!activePhone) {
    // Create a demo contact first
    selectChat(null);
    quickDemo();
    return;
  }
  const templates = [
    { name: 'Payment Reminder', msg: \`*Payment Reminder*\\n\\nDear \${contacts[activePhone]?.partyName || 'Customer'},\\n\\nYour outstanding balance is *Rs 5,00,000*.\\nPlease arrange payment at the earliest.\\n\\nTotal Bills: 3\\nOldest Bill: 45 days\\n\\n_Thank you for your business._\\n— Rush Wholesale\` },
    { name: 'Receipt Confirmation', msg: \`*Receipt Confirmation* ✓\\n\\nDear \${contacts[activePhone]?.partyName || 'Customer'},\\n\\nPayment received successfully!\\n\\nReceipt #: RCV-2026-0451\\nAmount: *Rs 1,50,000*\\nDate: 15-Feb-2026\\n\\nPayment Modes:\\n  Cash: Rs 50,000\\n  Cheque: Rs 1,00,000\\n\\nRemaining Balance: *Rs 3,50,000*\\n\\n_Thank you!_\\n— Rush Wholesale\` },
    { name: 'Outstanding Report', msg: \`*Outstanding Report*\\n\\n\${contacts[activePhone]?.partyName || 'Customer'}\\nAs of: 15-Feb-2026\\n\\nBill          Amount       Due     Days\\n─────────────────────────\\nSLS/2025-2881   1,50,000   01-Dec   76\\nSLS/2025-3012   2,00,000   15-Dec   62\\nSLS/2026-0102   1,50,000   15-Jan   31\\n─────────────────────────\\n*Total: Rs 5,00,000*\\n\\n_Please arrange payment at earliest._\\n— Rush Wholesale\` },
    { name: 'Cheque Notification', msg: \`*Cheque Details* ✓\\n\\nDear \${contacts[activePhone]?.partyName || 'Customer'},\\n\\nCheque received and recorded:\\n\\nBank: Nepal Bank Ltd\\nCheque #: 0045892\\nAmount: *Rs 1,00,000*\\nDate: 15-Mar-2026\\n\\n_We will deposit on the given date._\\n— Rush Wholesale\` }
  ];

  const panel = document.getElementById('apiPanel');
  panel.innerHTML = \`
    <div class="api-panel-header">
      <button onclick="hideApiPanel()">←</button>
      <h4 style="font-size: 15px; font-weight: 500;">Message Templates</h4>
    </div>
    \${templates.map(t => \`
      <div class="api-section" style="cursor: pointer;" onclick="sendTemplate(this)" data-msg="\${esc(t.msg)}">
        <h4>\${t.name}</h4>
        <div style="background: var(--wa-bubble-out); padding: 10px 12px; border-radius: 0 8px 8px 8px; font-size: 13.5px; line-height: 1.4; white-space: pre-wrap; max-height: 200px; overflow: hidden; position: relative;">
          \${formatWA(t.msg)}
          <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 40px; background: linear-gradient(transparent, var(--wa-sidebar));"></div>
        </div>
        <div style="margin-top: 8px; text-align: right;">
          <button class="template-btn" style="font-size: 13px;">Send This →</button>
        </div>
      </div>
    \`).join('')}
  \`;
  panel.classList.add('show');
}

function sendTemplate(el) {
  const msg = el.dataset.msg;
  if (!msg || !activePhone) return;
  fetch('/api/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: activePhone, partyName: contacts[activePhone]?.partyName, message: msg, direction: 'outgoing' })
  });
  hideApiPanel();
}

// Quick demo
function quickDemo() {
  const demoData = [
    { phone: '9841234567', partyName: 'Saroj Enterprises', message: '*Payment Reminder*\\n\\nDear Saroj Enterprises,\\n\\nYour outstanding balance is *Rs 5,00,000*.\\nPlease arrange payment at the earliest.\\n\\nTotal Bills: 3\\nOldest Bill: 45 days\\n\\n_Thank you for your business._\\n— Rush Wholesale', direction: 'outgoing' },
    { phone: '9841234567', partyName: 'Saroj Enterprises', message: 'Ji bhai, kal payment kar dunga. 2 lakh cash and 3 lakh cheque.', direction: 'incoming' },
    { phone: '9841234567', partyName: 'Saroj Enterprises', message: 'Ok ji, thank you. We will keep the receipt ready.', direction: 'outgoing' },
    { phone: '9860000111', partyName: 'Krishna Traders', message: '*Receipt Confirmation* ✓\\n\\nDear Krishna Traders,\\n\\nPayment received successfully!\\n\\nReceipt #: RCV-2026-0451\\nAmount: *Rs 1,50,000*\\nDate: 15-Feb-2026\\n\\n_Thank you!_\\n— Rush Wholesale', direction: 'outgoing' },
    { phone: '9860000111', partyName: 'Krishna Traders', message: 'Thank you bhai, receipt mila 👍', direction: 'incoming' }
  ];

  demoData.forEach((d, i) => {
    setTimeout(() => {
      fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d)
      });
    }, i * 400);
  });
}
</script>
</body>
</html>`;
