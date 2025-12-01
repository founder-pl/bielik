const API_URL = '/api/v1';

type ModuleId = 'default' | 'ksef' | 'b2b' | 'zus' | 'vat';

const MODULES: Record<ModuleId, { name: string; icon: string }> = {
  default: { name: 'Ogólne', icon: '💬' },
  ksef: { name: 'KSeF', icon: '📄' },
  b2b: { name: 'B2B', icon: '💼' },
  zus: { name: 'ZUS', icon: '🏥' },
  vat: { name: 'VAT', icon: '💰' },
};

type ChatRole = 'user' | 'assistant';

interface ChatSource {
  title: string;
  source: string;
  similarity: number;
}

function initChannels(): void {
  const channelItems = document.querySelectorAll<HTMLElement>('.channel-item');
  if (!channelItems.length) return;

  channelItems.forEach((item) => {
    item.addEventListener('click', () => {
      const moduleId = item.dataset.module as ModuleId | undefined;
      if (!moduleId) return;

      channelItems.forEach((i) => i.classList.remove('active'));
      item.classList.add('active');
      setModule(moduleId);
    });
  });
}

interface ChatResponse {
  response: string;
  sources?: ChatSource[];
}

interface ChatElements {
  messages: HTMLElement | null;
  form: HTMLFormElement | null;
  input: HTMLTextAreaElement | HTMLInputElement | null;
  sendBtn: HTMLButtonElement | null;
  status: HTMLElement | null;
  statusText: HTMLElement | null;
  currentModule: HTMLElement | null;
  charCount: HTMLElement | null;
  sourcesPanel: HTMLElement | null;
  sourcesList: HTMLUListElement | null;
  closeSources: HTMLElement | null;
  quickQuestions: HTMLElement | null;
}

const elements: ChatElements = {
  messages: document.getElementById('messages'),
  form: document.getElementById('chat-form') as HTMLFormElement | null,
  input: document.getElementById('user-input') as HTMLTextAreaElement | HTMLInputElement | null,
  sendBtn: document.getElementById('send-btn') as HTMLButtonElement | null,
  status: document.getElementById('status'),
  statusText: document.querySelector('.status-text') as HTMLElement | null,
  currentModule: document.getElementById('current-module'),
  charCount: document.getElementById('char-count'),
  sourcesPanel: document.getElementById('sources-panel'),
  sourcesList: document.getElementById('sources-list') as HTMLUListElement | null,
  closeSources: document.getElementById('close-sources'),
  quickQuestions: document.getElementById('quick-questions'),
};

let currentModule: ModuleId = 'default';
let isLoading = false;
let lastSources: ChatSource[] = [];

export function initChat(): void {
  if (!elements.form || !elements.input || !elements.messages) return;

  initModuleButtons();
  initChannels();
  initForm();
  initQuickQuestions();
  initSourcesPanel();
  void checkHealth();

  elements.input.focus();
}

function initModuleButtons(): void {
  const buttons = document.querySelectorAll<HTMLElement>('.module-btn');
  buttons.forEach((btn) => {
    const moduleId = btn.dataset.module as ModuleId | undefined;
    if (!moduleId) return; // pomiń przycisk Edycji
    btn.addEventListener('click', () => {
      setModule(moduleId);
    });
  });
}

function initForm(): void {
  const { form, input, charCount } = elements;
  if (!form || !input) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message || isLoading) return;
    await sendMessage(message);
  });

  input.addEventListener('input', () => {
    if (!charCount) return;
    const count = input.value.length;
    charCount.textContent = `${count}/2000`;
  });

  input.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });
}

async function sendMessage(message: string): Promise<void> {
  isLoading = true;
  setLoadingState(true);

  if (elements.quickQuestions) {
    elements.quickQuestions.style.display = 'none';
  }

  addMessage(message, 'user');
  if (elements.input && elements.charCount) {
    elements.input.value = '';
    elements.charCount.textContent = '0/2000';
  }

  const loadingId = addMessage('', 'assistant', true);

  try {
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        module: currentModule,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as ChatResponse;
    removeMessage(loadingId);
    addMessage(data.response, 'assistant', false, data.sources || []);
    lastSources = data.sources || [];
  } catch (error) {
    console.error('Error:', error);
    removeMessage(loadingId);
    addMessage(
      'Przepraszam, wystąpił błąd połączenia. Sprawdź czy serwisy działają (docker compose ps) i spróbuj ponownie.',
      'assistant',
    );
  } finally {
    isLoading = false;
    setLoadingState(false);
    elements.input?.focus();
  }
}

function addMessage(text: string, role: ChatRole, isLoadingMsg = false, sources?: ChatSource[] | null): string {
  const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (!elements.messages) return id;

  const messageDiv = document.createElement('div');
  messageDiv.id = id;
  messageDiv.className = `message ${role}${isLoadingMsg ? ' loading' : ''}`;

  const avatar = role === 'user' ? '👤' : '🦅';

  let contentHtml = formatMessage(text);

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

function removeMessage(id: string): void {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function formatMessage(text: string): string {
  if (!text) return '';

  let safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  safe = safe.replace(/`(.+?)`/g, '<code>$1</code>');
  safe = safe.replace(/\n\n/g, '</p><p>');
  safe = safe.replace(/\n/g, '<br>');

  if (!safe.startsWith('<p>')) {
    safe = `<p>${safe}</p>`;
  }

  return safe;
}

function scrollToBottom(): void {
  if (!elements.messages) return;
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function setLoadingState(loading: boolean): void {
  if (elements.sendBtn) elements.sendBtn.disabled = loading;
  if (elements.input) elements.input.disabled = loading;
}

function initQuickQuestions(): void {
  const buttons = document.querySelectorAll<HTMLElement>('.quick-btn');
  if (!buttons.length) return;

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const question = btn.dataset.question || '';
      const moduleId = btn.dataset.module as ModuleId | undefined;

      if (moduleId && moduleId !== currentModule) {
        setModule(moduleId);
      }

      if (elements.input) {
        elements.input.value = question;
        elements.form?.dispatchEvent(new Event('submit'));
      }
    });
  });
}

function initSourcesPanel(): void {
  if (elements.closeSources) {
    elements.closeSources.addEventListener('click', hideSources);
  }

  document.addEventListener('click', (e) => {
    if (!elements.sourcesPanel) return;

    const target = e.target as HTMLElement | null;
    if (!target) return;

    const clickedInsidePanel = elements.sourcesPanel.contains(target);
    const isSourcesLink = target.classList.contains('sources-link');

    if (!clickedInsidePanel && !isSourcesLink) {
      hideSources();
    }
  });
}

function showSources(): void {
  if (!elements.sourcesPanel || !elements.sourcesList) return;
  if (!lastSources.length) return;

  elements.sourcesList.innerHTML = lastSources
    .map(
      (source) => `
        <li>
            <div class="source-title">${escapeHtml(source.title)}</div>
            <div class="source-meta">
                ${escapeHtml(source.source)}
                <span class="source-similarity">${Math.round(source.similarity * 100)}%</span>
            </div>
        </li>
    `,
    )
    .join('');

  elements.sourcesPanel.classList.remove('hidden');
  elements.sourcesPanel.classList.add('visible');
}

function hideSources(): void {
  if (!elements.sourcesPanel) return;
  elements.sourcesPanel.classList.remove('visible');
  setTimeout(() => {
    elements.sourcesPanel && elements.sourcesPanel.classList.add('hidden');
  }, 300);
}

async function checkHealth(): Promise<void> {
  try {
    const baseUrl = API_URL.replace('/api/v1', '');
    const response = await fetch(`${baseUrl}/health`);
    const data = await response.json();

    if (!elements.status || !elements.statusText) return;

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
    if (elements.status && elements.statusText) {
      elements.status.classList.add('unhealthy');
      elements.statusText.textContent = 'Brak połączenia';
    }
  } finally {
    setTimeout(() => {
      void checkHealth();
    }, 30000);
  }
}

function setModule(module: ModuleId): void {
  currentModule = module;

  document.querySelectorAll<HTMLElement>('.module-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.module === module);
  });

  if (elements.currentModule) {
    const info = MODULES[module];
    elements.currentModule.textContent = `Moduł: ${info.name}`;
  }

  const messages: Record<ModuleId, string> = {
    default: 'Zadaj dowolne pytanie dotyczące prowadzenia firmy w Polsce.',
    ksef: 'Pytaj o Krajowy System e-Faktur: terminy wdrożenia, wymagania techniczne, procedury.',
    b2b: 'Pomogę ocenić ryzyko Twojej umowy B2B według kryteriów Inspekcji Pracy.',
    zus: 'Obliczę składki ZUS i wyjaśnię zasady ubezpieczeń dla przedsiębiorców.',
    vat: 'Pomogę z JPK_VAT, VAT OSS i innymi rozliczeniami podatkowymi.',
  };

  addMessage(messages[module], 'assistant');
  elements.input?.focus();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Utrzymanie kompatybilności z istniejącym HTML i innymi modułami
declare global {
  interface Window {
    showSources?: () => void;
    setModule?: (module: ModuleId) => void;
  }
}

if (typeof window !== 'undefined') {
  window.showSources = showSources;
  window.setModule = setModule;
}

