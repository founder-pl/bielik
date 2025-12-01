/**
 * Bielik MVP - Frontend Application
 * Chat interface with Polish LLM
 */

// Configuration
const API_URL = '/api/v1';
const MODULES = {
    default: { name: 'Ogólne', icon: '💬' },
    ksef: { name: 'KSeF', icon: '📄' },
    b2b: { name: 'B2B', icon: '💼' },
    zus: { name: 'ZUS', icon: '🏥' },
    vat: { name: 'VAT', icon: '💰' }
};

// State
let currentModule = 'default';
let isLoading = false;
let lastSources = [];

// DOM Elements
const elements = {
    messages: document.getElementById('messages'),
    form: document.getElementById('chat-form'),
    input: document.getElementById('user-input'),
    sendBtn: document.getElementById('send-btn'),
    status: document.getElementById('status'),
    statusText: document.querySelector('.status-text'),
    currentModule: document.getElementById('current-module'),
    charCount: document.getElementById('char-count'),
    sourcesPanel: document.getElementById('sources-panel'),
    sourcesList: document.getElementById('sources-list'),
    closeSources: document.getElementById('close-sources'),
    quickQuestions: document.getElementById('quick-questions')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initModuleButtons();
    initForm();
    initQuickQuestions();
    initSourcesPanel();
    checkHealth();
    
    // Focus input
    elements.input.focus();
});

/**
 * Module buttons
 */
function initModuleButtons() {
    document.querySelectorAll('.module-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const module = btn.dataset.module;
            setModule(module);
        });
    });
}

function setModule(module) {
    currentModule = module;
    
    // Update buttons
    document.querySelectorAll('.module-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.module === module);
    });
    
    // Update hint
    elements.currentModule.textContent = `Moduł: ${MODULES[module].name}`;
    
    // Add info message
    const messages = {
        default: 'Zadaj dowolne pytanie dotyczące prowadzenia firmy w Polsce.',
        ksef: 'Pytaj o Krajowy System e-Faktur: terminy wdrożenia, wymagania techniczne, procedury.',
        b2b: 'Pomogę ocenić ryzyko Twojej umowy B2B według kryteriów Inspekcji Pracy.',
        zus: 'Obliczę składki ZUS i wyjaśnię zasady ubezpieczeń dla przedsiębiorców.',
        vat: 'Pomogę z JPK_VAT, VAT OSS i innymi rozliczeniami podatkowymi.'
    };
    
    addMessage(messages[module], 'assistant');
    elements.input.focus();
}

/**
 * Form handling
 */
function initForm() {
    elements.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = elements.input.value.trim();
        
        if (!message || isLoading) return;
        
        await sendMessage(message);
    });
    
    // Character count
    elements.input.addEventListener('input', () => {
        const count = elements.input.value.length;
        elements.charCount.textContent = `${count}/2000`;
    });
    
    // Enter to send
    elements.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            elements.form.dispatchEvent(new Event('submit'));
        }
    });
}

/**
 * Send message to API
 */
async function sendMessage(message) {
    isLoading = true;
    setLoadingState(true);
    
    // Hide quick questions after first message
    elements.quickQuestions.style.display = 'none';
    
    // Add user message
    addMessage(message, 'user');
    elements.input.value = '';
    elements.charCount.textContent = '0/2000';
    
    // Add loading indicator
    const loadingId = addMessage('', 'assistant', true);
    
    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                module: currentModule
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // Remove loading and add response
        removeMessage(loadingId);
        addMessage(data.response, 'assistant', false, data.sources);
        
        // Store sources
        lastSources = data.sources || [];
        
    } catch (error) {
        console.error('Error:', error);
        removeMessage(loadingId);
        addMessage(
            'Przepraszam, wystąpił błąd połączenia. Sprawdź czy serwisy działają (docker compose ps) i spróbuj ponownie.',
            'assistant'
        );
    } finally {
        isLoading = false;
        setLoadingState(false);
        elements.input.focus();
    }
}

/**
 * Add message to chat
 */
function addMessage(text, role, isLoading = false, sources = null) {
    const id = `msg-${Date.now()}`;
    
    const messageDiv = document.createElement('div');
    messageDiv.id = id;
    messageDiv.className = `message ${role}${isLoading ? ' loading' : ''}`;
    
    const avatar = role === 'user' ? '👤' : '🦅';
    
    let contentHtml = formatMessage(text);
    
    // Add sources link if available
    if (sources && sources.length > 0) {
        contentHtml += `
            <div class="sources-link" onclick="showSources()">
                📚 Zobacz źródła (${sources.length})
            </div>
        `;
    }
    
    messageDiv.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">${contentHtml}</div>
    `;
    
    elements.messages.appendChild(messageDiv);
    scrollToBottom();
    
    return id;
}

/**
 * Remove message
 */
function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

/**
 * Format message text
 */
function formatMessage(text) {
    if (!text) return '';
    
    // Escape HTML
    text = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // Convert markdown-like formatting
    // Bold
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // Code blocks
    text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Inline code
    text = text.replace(/`(.+?)`/g, '<code>$1</code>');
    
    // Line breaks
    text = text.replace(/\n\n/g, '</p><p>');
    text = text.replace(/\n/g, '<br>');
    
    // Wrap in paragraph
    if (!text.startsWith('<p>')) {
        text = `<p>${text}</p>`;
    }
    
    return text;
}

/**
 * Scroll to bottom of messages
 */
function scrollToBottom() {
    elements.messages.scrollTop = elements.messages.scrollHeight;
}

/**
 * Loading state
 */
function setLoadingState(loading) {
    elements.sendBtn.disabled = loading;
    elements.input.disabled = loading;
}

/**
 * Quick questions
 */
function initQuickQuestions() {
    document.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const question = btn.dataset.question;
            const module = btn.dataset.module;
            
            if (module && module !== currentModule) {
                setModule(module);
            }
            
            elements.input.value = question;
            elements.form.dispatchEvent(new Event('submit'));
        });
    });
}

/**
 * Sources panel
 */
function initSourcesPanel() {
    elements.closeSources.addEventListener('click', hideSources);
    
    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!elements.sourcesPanel.contains(e.target) && 
            !e.target.classList.contains('sources-link')) {
            hideSources();
        }
    });
}

function showSources() {
    if (lastSources.length === 0) return;
    
    elements.sourcesList.innerHTML = lastSources.map(source => `
        <li>
            <div class="source-title">${escapeHtml(source.title)}</div>
            <div class="source-meta">
                ${escapeHtml(source.source)}
                <span class="source-similarity">${Math.round(source.similarity * 100)}%</span>
            </div>
        </li>
    `).join('');
    
    elements.sourcesPanel.classList.remove('hidden');
    elements.sourcesPanel.classList.add('visible');
}

function hideSources() {
    elements.sourcesPanel.classList.remove('visible');
    setTimeout(() => {
        elements.sourcesPanel.classList.add('hidden');
    }, 300);
}

/**
 * Health check
 */
async function checkHealth() {
    try {
        const response = await fetch(`${API_URL.replace('/api/v1', '')}/health`);
        const data = await response.json();
        
        if (data.status === 'healthy') {
            elements.status.classList.add('healthy');
            elements.status.classList.remove('unhealthy');
            elements.statusText.textContent = 'Połączono z Bielikiem';
        } else if (data.status === 'degraded') {
            elements.statusText.textContent = 'Częściowo dostępny';
            
            if (data.services?.model === 'not_loaded') {
                elements.statusText.textContent = 'Ładowanie modelu...';
            }
        } else {
            elements.status.classList.add('unhealthy');
            elements.statusText.textContent = 'Błąd połączenia';
        }
    } catch (error) {
        console.error('Health check failed:', error);
        elements.status.classList.add('unhealthy');
        elements.statusText.textContent = 'Brak połączenia';
    }
    
    // Check again in 30s
    setTimeout(checkHealth, 30000);
}

/**
 * Utility: Escape HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make showSources available globally for onclick
window.showSources = showSources;
