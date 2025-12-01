"use strict";
(() => {
  // src/ui/chat.ts
  var API_URL = "/api/v1";
  var MODULES = {
    default: { name: "Og\xF3lne", icon: "\u{1F4AC}" },
    ksef: { name: "KSeF", icon: "\u{1F4C4}" },
    b2b: { name: "B2B", icon: "\u{1F4BC}" },
    zus: { name: "ZUS", icon: "\u{1F3E5}" },
    vat: { name: "VAT", icon: "\u{1F4B0}" }
  };
  function initChannels() {
    const channelItems = document.querySelectorAll(".channel-item");
    if (!channelItems.length) return;
    channelItems.forEach((item) => {
      item.addEventListener("click", () => {
        const moduleId = item.dataset.module;
        if (!moduleId) return;
        channelItems.forEach((i) => i.classList.remove("active"));
        item.classList.add("active");
        setModule(moduleId);
      });
    });
  }
  var elements = {
    messages: document.getElementById("messages"),
    form: document.getElementById("chat-form"),
    input: document.getElementById("user-input"),
    sendBtn: document.getElementById("send-btn"),
    status: document.getElementById("status"),
    statusText: document.querySelector(".status-text"),
    currentModule: document.getElementById("current-module"),
    charCount: document.getElementById("char-count"),
    sourcesPanel: document.getElementById("sources-panel"),
    sourcesList: document.getElementById("sources-list"),
    closeSources: document.getElementById("close-sources"),
    quickQuestions: document.getElementById("quick-questions")
  };
  var currentModule = "default";
  var isLoading = false;
  var lastSources = [];
  function initChat() {
    if (!elements.form || !elements.input || !elements.messages) return;
    initModuleButtons();
    initChannels();
    initForm();
    initQuickQuestions();
    initSourcesPanel();
    void checkHealth();
    elements.input.focus();
  }
  function initModuleButtons() {
    const buttons = document.querySelectorAll(".module-btn");
    buttons.forEach((btn) => {
      const moduleId = btn.dataset.module;
      if (!moduleId) return;
      btn.addEventListener("click", () => {
        setModule(moduleId);
      });
    });
  }
  function initForm() {
    const { form, input, charCount } = elements;
    if (!form || !input) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const message = input.value.trim();
      if (!message || isLoading) return;
      await sendMessage(message);
    });
    input.addEventListener("input", () => {
      if (!charCount) return;
      const count = input.value.length;
      charCount.textContent = `${count}/2000`;
    });
    input.addEventListener("keydown", (e) => {
      const ev = e;
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        form.dispatchEvent(new Event("submit"));
      }
    });
  }
  async function sendMessage(message) {
    isLoading = true;
    setLoadingState(true);
    if (elements.quickQuestions) {
      elements.quickQuestions.style.display = "none";
    }
    addMessage(message, "user");
    if (elements.input && elements.charCount) {
      elements.input.value = "";
      elements.charCount.textContent = "0/2000";
    }
    const loadingId = addMessage("", "assistant", true);
    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          module: currentModule
        })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      removeMessage(loadingId);
      addMessage(data.response, "assistant", false, data.sources || []);
      lastSources = data.sources || [];
    } catch (error) {
      console.error("Error:", error);
      removeMessage(loadingId);
      addMessage(
        "Przepraszam, wyst\u0105pi\u0142 b\u0142\u0105d po\u0142\u0105czenia. Sprawd\u017A czy serwisy dzia\u0142aj\u0105 (docker compose ps) i spr\xF3buj ponownie.",
        "assistant"
      );
    } finally {
      isLoading = false;
      setLoadingState(false);
      elements.input?.focus();
    }
  }
  function addMessage(text, role, isLoadingMsg = false, sources) {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (!elements.messages) return id;
    const messageDiv = document.createElement("div");
    messageDiv.id = id;
    messageDiv.className = `message ${role}${isLoadingMsg ? " loading" : ""}`;
    const avatar = role === "user" ? "\u{1F464}" : "\u{1F985}";
    let contentHtml = formatMessage(text);
    if (sources && sources.length > 0) {
      contentHtml += `
            <div class="sources-link" onclick="showSources()">
                \u{1F4DA} Zobacz \u017Ar\xF3d\u0142a (${sources.length})
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
  function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }
  function formatMessage(text) {
    if (!text) return "";
    let safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    safe = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
    safe = safe.replace(/`(.+?)`/g, "<code>$1</code>");
    safe = safe.replace(/\n\n/g, "</p><p>");
    safe = safe.replace(/\n/g, "<br>");
    if (!safe.startsWith("<p>")) {
      safe = `<p>${safe}</p>`;
    }
    return safe;
  }
  function scrollToBottom() {
    if (!elements.messages) return;
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }
  function setLoadingState(loading) {
    if (elements.sendBtn) elements.sendBtn.disabled = loading;
    if (elements.input) elements.input.disabled = loading;
  }
  function initQuickQuestions() {
    const buttons = document.querySelectorAll(".quick-btn");
    if (!buttons.length) return;
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const question = btn.dataset.question || "";
        const moduleId = btn.dataset.module;
        if (moduleId && moduleId !== currentModule) {
          setModule(moduleId);
        }
        if (elements.input) {
          elements.input.value = question;
          elements.form?.dispatchEvent(new Event("submit"));
        }
      });
    });
  }
  function initSourcesPanel() {
    if (elements.closeSources) {
      elements.closeSources.addEventListener("click", hideSources);
    }
    document.addEventListener("click", (e) => {
      if (!elements.sourcesPanel) return;
      const target = e.target;
      if (!target) return;
      const clickedInsidePanel = elements.sourcesPanel.contains(target);
      const isSourcesLink = target.classList.contains("sources-link");
      if (!clickedInsidePanel && !isSourcesLink) {
        hideSources();
      }
    });
  }
  function showSources() {
    if (!elements.sourcesPanel || !elements.sourcesList) return;
    if (!lastSources.length) return;
    elements.sourcesList.innerHTML = lastSources.map(
      (source) => `
        <li>
            <div class="source-title">${escapeHtml(source.title)}</div>
            <div class="source-meta">
                ${escapeHtml(source.source)}
                <span class="source-similarity">${Math.round(source.similarity * 100)}%</span>
            </div>
        </li>
    `
    ).join("");
    elements.sourcesPanel.classList.remove("hidden");
    elements.sourcesPanel.classList.add("visible");
  }
  function hideSources() {
    if (!elements.sourcesPanel) return;
    elements.sourcesPanel.classList.remove("visible");
    setTimeout(() => {
      elements.sourcesPanel && elements.sourcesPanel.classList.add("hidden");
    }, 300);
  }
  async function checkHealth() {
    try {
      const baseUrl = API_URL.replace("/api/v1", "");
      const response = await fetch(`${baseUrl}/health`);
      const data = await response.json();
      if (!elements.status || !elements.statusText) return;
      if (data.status === "healthy") {
        elements.status.classList.add("healthy");
        elements.status.classList.remove("unhealthy");
        elements.statusText.textContent = "Po\u0142\u0105czono z Bielikiem";
      } else if (data.status === "degraded") {
        elements.statusText.textContent = "Cz\u0119\u015Bciowo dost\u0119pny";
        if (data.services?.model === "not_loaded") {
          elements.statusText.textContent = "\u0141adowanie modelu...";
        }
      } else {
        elements.status.classList.add("unhealthy");
        elements.statusText.textContent = "B\u0142\u0105d po\u0142\u0105czenia";
      }
    } catch (error) {
      console.error("Health check failed:", error);
      if (elements.status && elements.statusText) {
        elements.status.classList.add("unhealthy");
        elements.statusText.textContent = "Brak po\u0142\u0105czenia";
      }
    } finally {
      setTimeout(() => {
        void checkHealth();
      }, 3e4);
    }
  }
  function setModule(module) {
    currentModule = module;
    document.querySelectorAll(".module-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.module === module);
    });
    if (elements.currentModule) {
      const info = MODULES[module];
      elements.currentModule.textContent = `Modu\u0142: ${info.name}`;
    }
    const messages = {
      default: "Zadaj dowolne pytanie dotycz\u0105ce prowadzenia firmy w Polsce.",
      ksef: "Pytaj o Krajowy System e-Faktur: terminy wdro\u017Cenia, wymagania techniczne, procedury.",
      b2b: "Pomog\u0119 oceni\u0107 ryzyko Twojej umowy B2B wed\u0142ug kryteri\xF3w Inspekcji Pracy.",
      zus: "Oblicz\u0119 sk\u0142adki ZUS i wyja\u015Bni\u0119 zasady ubezpiecze\u0144 dla przedsi\u0119biorc\xF3w.",
      vat: "Pomog\u0119 z JPK_VAT, VAT OSS i innymi rozliczeniami podatkowymi."
    };
    addMessage(messages[module], "assistant");
    elements.input?.focus();
  }
  function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  if (typeof window !== "undefined") {
    window.showSources = showSources;
    window.setModule = setModule;
  }

  // src/ui/documents.ts
  var API_URL2 = "/api/v1";
  var currentDocumentId = null;
  function getElements() {
    return {
      documentsList: document.getElementById("documents-list"),
      documentsRefresh: document.getElementById("documents-refresh"),
      docTitle: document.getElementById("doc-title"),
      docCategory: document.getElementById("doc-category"),
      docContent: document.getElementById("doc-content"),
      docNew: document.getElementById("doc-new"),
      docDelete: document.getElementById("doc-delete"),
      docSave: document.getElementById("doc-save"),
      documentEvents: document.getElementById("document-events")
    };
  }
  function initDocumentsPanel() {
    const els = getElements();
    if (!els.documentsList) return;
    els.documentsRefresh?.addEventListener("click", loadDocuments);
    els.docNew?.addEventListener("click", () => {
      currentDocumentId = null;
      clearDocumentEditor();
    });
    els.docSave?.addEventListener("click", saveDocument);
    els.docDelete?.addEventListener("click", deleteDocument);
    void loadDocuments();
  }
  async function loadDocuments() {
    const els = getElements();
    if (!els.documentsList) return;
    try {
      const resp = await fetch(`${API_URL2.replace("/api/v1", "")}/api/v1/documents?limit=50`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const docs = await resp.json();
      renderDocumentsList(docs || []);
    } catch (err) {
      console.error("Nie uda\u0142o si\u0119 pobra\u0107 dokument\xF3w:", err);
    }
  }
  function renderDocumentsList(docs) {
    const els = getElements();
    if (!els.documentsList) return;
    els.documentsList.innerHTML = "";
    docs.forEach((doc) => {
      const li = document.createElement("li");
      li.className = "document-item";
      li.dataset.id = String(doc.id);
      li.textContent = `${doc.title} (${doc.category})`;
      li.addEventListener("click", () => {
        selectDocument(doc, li);
      });
      els.documentsList.appendChild(li);
    });
  }
  function selectDocument(doc, element) {
    currentDocumentId = doc.id;
    document.querySelectorAll(".document-item").forEach((li) => li.classList.remove("active"));
    if (element) element.classList.add("active");
    const els = getElements();
    if (els.docTitle) els.docTitle.value = doc.title || "";
    if (els.docCategory) els.docCategory.value = doc.category || "";
    if (els.docContent) els.docContent.value = doc.content || "";
    void loadDocumentEvents(doc.id);
  }
  function clearDocumentEditor() {
    document.querySelectorAll(".document-item").forEach((li) => li.classList.remove("active"));
    const els = getElements();
    if (els.docTitle) els.docTitle.value = "";
    if (els.docCategory) els.docCategory.value = "";
    if (els.docContent) els.docContent.value = "";
    if (els.documentEvents) {
      els.documentEvents.innerHTML = "";
    }
  }
  async function loadDocumentEvents(documentId) {
    const els = getElements();
    if (!els.documentEvents) return;
    try {
      const resp = await fetch(`${API_URL2}/events/documents/${documentId}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const events = await resp.json();
      renderDocumentEvents(events || []);
    } catch (err) {
      console.error("Nie uda\u0142o si\u0119 pobra\u0107 historii dokumentu:", err);
    }
  }
  function renderDocumentEvents(events) {
    const els = getElements();
    if (!els.documentEvents) return;
    els.documentEvents.innerHTML = events.map((ev) => {
      const ts = ev.created_at || ev.createdAt;
      const when = ts ? new Date(ts).toLocaleString("pl-PL") : "";
      const type = ev.event_type || ev.eventType || "";
      return `<li>[${when}] ${escapeHtml2(type)}</li>`;
    }).join("");
  }
  async function saveDocument() {
    const els = getElements();
    if (!els.docTitle || !els.docCategory || !els.docContent) return;
    const title = els.docTitle.value.trim();
    const category = els.docCategory.value.trim() || "default";
    const content = els.docContent.value.trim();
    if (!title || !content) {
      alert("Tytu\u0142 i tre\u015B\u0107 dokumentu nie mog\u0105 by\u0107 puste.");
      return;
    }
    const payload = { title, category, content, source: null };
    try {
      let url;
      let body;
      if (currentDocumentId) {
        url = `${API_URL2}/commands/documents/update`;
        body = {
          id: currentDocumentId,
          title,
          source: null,
          category,
          content
        };
      } else {
        url = `${API_URL2}/commands/documents/create`;
        body = payload;
      }
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const doc = await resp.json();
      currentDocumentId = doc.id;
      await loadDocuments();
    } catch (err) {
      console.error("Nie uda\u0142o si\u0119 zapisa\u0107 dokumentu:", err);
      alert("Nie uda\u0142o si\u0119 zapisa\u0107 dokumentu. Sprawd\u017A logi API.");
    }
  }
  async function deleteDocument() {
    if (!currentDocumentId) return;
    if (!confirm("Na pewno usun\u0105\u0107 ten dokument?")) return;
    try {
      const resp = await fetch(`${API_URL2}/commands/documents/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentDocumentId })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      currentDocumentId = null;
      clearDocumentEditor();
      await loadDocuments();
    } catch (err) {
      console.error("Nie uda\u0142o si\u0119 usun\u0105\u0107 dokumentu:", err);
      alert("Nie uda\u0142o si\u0119 usun\u0105\u0107 dokumentu.");
    }
  }
  function escapeHtml2(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // src/ui/projects.ts
  var API_URL3 = "/api/v1";
  var currentProjectId = null;
  var currentFileId = null;
  var currentContact = null;
  function getElements2() {
    return {
      projectsList: document.getElementById("projects-list"),
      filesList: document.getElementById("files-list")
    };
  }
  function initProjectsPanel() {
    const els = getElements2();
    if (!els.projectsList || !els.filesList) return;
    const contactItems = document.querySelectorAll(".contact-item");
    contactItems.forEach((item) => {
      item.addEventListener("click", () => {
        contactItems.forEach((i) => i.classList.remove("active"));
        item.classList.add("active");
        currentContact = item.textContent?.trim() || null;
        void loadProjects();
      });
    });
    void loadProjects();
  }
  async function loadProjects() {
    const els = getElements2();
    if (!els.projectsList) return;
    try {
      let url = `${API_URL3}/projects?limit=50`;
      if (currentContact) {
        const encoded = encodeURIComponent(currentContact);
        url = `${API_URL3}/projects?contact=${encoded}&limit=50`;
      }
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const projects = await resp.json();
      renderProjects(projects || []);
    } catch (err) {
      console.error("Nie uda\u0142o si\u0119 pobra\u0107 projekt\xF3w:", err);
    }
  }
  function renderProjects(projects) {
    const els = getElements2();
    if (!els.projectsList || !els.filesList) return;
    els.projectsList.innerHTML = "";
    currentProjectId = null;
    currentFileId = null;
    els.filesList.innerHTML = "";
    projects.forEach((project) => {
      const li = document.createElement("li");
      li.className = "project-item";
      li.dataset.projectId = String(project.id);
      const name = project.name || `Projekt ${project.id}`;
      const icon = getProjectIcon(name);
      li.innerHTML = `<span class="project-icon">${icon}</span> ${escapeHtml3(name)}`;
      li.addEventListener("click", () => {
        document.querySelectorAll(".project-item").forEach((i) => i.classList.remove("active"));
        li.classList.add("active");
        currentProjectId = project.id;
        void loadProjectFiles(project.id);
        void updateContextChannels();
      });
      els.projectsList.appendChild(li);
    });
  }
  async function loadProjectFiles(projectId) {
    const els = getElements2();
    if (!els.filesList) return;
    try {
      const resp = await fetch(`${API_URL3}/projects/${projectId}/files`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const files = await resp.json();
      renderFiles(files || []);
    } catch (err) {
      console.error("Nie uda\u0142o si\u0119 pobra\u0107 plik\xF3w projektu:", err);
    }
  }
  function renderFiles(files) {
    const els = getElements2();
    if (!els.filesList) return;
    els.filesList.innerHTML = "";
    currentFileId = null;
    files.forEach((file) => {
      const li = document.createElement("li");
      li.className = "file-item";
      li.dataset.fileId = String(file.id);
      const icon = getFileIcon(file.filename || "");
      li.innerHTML = `${icon} ${escapeHtml3(file.filename || "")}`;
      li.addEventListener("click", () => {
        document.querySelectorAll(".file-item").forEach((i) => i.classList.remove("active"));
        li.classList.add("active");
        currentFileId = file.id;
        void updateContextChannels();
      });
      els.filesList.appendChild(li);
    });
  }
  function getFileIcon(filename) {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    const icons = {
      pdf: "\u{1F4D1}",
      doc: "\u{1F4DD}",
      docx: "\u{1F4DD}",
      xls: "\u{1F4CA}",
      xlsx: "\u{1F4CA}",
      txt: "\u{1F4C4}",
      png: "\u{1F5BC}\uFE0F",
      jpg: "\u{1F5BC}\uFE0F",
      jpeg: "\u{1F5BC}\uFE0F",
      gif: "\u{1F5BC}\uFE0F",
      zip: "\u{1F4E6}",
      rar: "\u{1F4E6}"
    };
    return icons[ext] || "\u{1F4C4}";
  }
  function getProjectIcon(name) {
    const lower = (name || "").toLowerCase();
    if (lower.includes("ksef") || lower.includes("faktur")) return "\u{1F4CB}";
    if (lower.includes("b2b") || lower.includes("umowa") || lower.includes("kontrakt")) return "\u{1F4BC}";
    if (lower.includes("zus") || lower.includes("sk\u0142adk")) return "\u{1F3E5}";
    if (lower.includes("vat") || lower.includes("jpk")) return "\u{1F4B0}";
    return "\u{1F4C1}";
  }
  async function updateContextChannels() {
    try {
      const params = new URLSearchParams();
      if (currentContact) params.append("contact", currentContact);
      if (currentProjectId != null) params.append("project_id", String(currentProjectId));
      if (currentFileId != null) params.append("file_id", String(currentFileId));
      if (![...params.keys()].length) {
        resetContextChannels();
        return;
      }
      const resp = await fetch(`${API_URL3}/context/channels?${params.toString()}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const channels = data.channels || [];
      if (channels.length === 0) {
        resetContextChannels();
        return;
      }
      const first = channels[0];
      if (first?.id && window.setModule) {
        window.setModule(first.id);
      }
      const recommendedIds = new Set(channels.map((c) => c.id));
      document.querySelectorAll(".channel-item").forEach((item) => {
        const mod = item.dataset.module;
        if (!mod) return;
        item.classList.toggle("recommended", recommendedIds.has(mod));
      });
    } catch (err) {
      console.error("Nie uda\u0142o si\u0119 pobra\u0107 kana\u0142\xF3w kontekstowych:", err);
      resetContextChannels();
    }
  }
  function resetContextChannels() {
    if (window.setModule) {
      window.setModule("default");
    }
    document.querySelectorAll(".channel-item").forEach((item) => {
      const mod = item.dataset.module;
      if (!mod) return;
      item.classList.remove("recommended");
      item.classList.toggle("active", mod === "default");
    });
  }
  function escapeHtml3(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // src/ui/dashboard.ts
  var API_URL4 = "/api/v1";
  var isEditMode = false;
  var draggedModule = null;
  function getElements3() {
    return {
      panelLeft: document.getElementById("panel-left"),
      panelRight: document.getElementById("panel-right"),
      editToggle: document.getElementById("edit-dashboard-toggle")
    };
  }
  async function initDashboardLayout() {
    const modules = document.querySelectorAll(".dashboard-module");
    modules.forEach((el) => {
      el.classList.add("no-drag");
    });
    try {
      const response = await fetch(`${API_URL4}/layout`);
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.modules)) {
          applyLayoutFromConfig(data.modules);
        }
      }
    } catch (error) {
      console.error("Nie uda\u0142o si\u0119 pobra\u0107 uk\u0142adu dashboardu:", error);
    }
    initDragAndDrop();
    initEditToggle();
  }
  function applyLayoutFromConfig(configModules) {
    const allModules = {};
    document.querySelectorAll(".dashboard-module").forEach((el) => {
      const id = el.dataset.moduleId;
      if (id) {
        allModules[id] = el;
      }
    });
    const { panelLeft, panelRight } = getElements3();
    if (!panelLeft || !panelRight) return;
    panelLeft.innerHTML = "";
    panelRight.innerHTML = "";
    const byColumn = {
      left: panelLeft,
      right: panelRight
    };
    configModules.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((cfg) => {
      const el = allModules[cfg.id];
      const panel = byColumn[cfg.column] || panelLeft;
      if (el && panel) {
        panel.appendChild(el);
      }
    });
    Object.keys(allModules).forEach((id) => {
      const el = allModules[id];
      if (el && !el.parentElement) {
        panelLeft.appendChild(el);
      }
    });
  }
  function initDragAndDrop() {
    const modules = document.querySelectorAll(".dashboard-module");
    modules.forEach((el) => {
      el.addEventListener("dragstart", onModuleDragStart);
      el.addEventListener("dragend", onModuleDragEnd);
    });
    const { panelLeft, panelRight } = getElements3();
    [panelLeft, panelRight].forEach((panel) => {
      if (!panel) return;
      panel.addEventListener("dragover", onPanelDragOver);
      panel.addEventListener("drop", onPanelDrop);
    });
  }
  function onModuleDragStart(event) {
    if (!isEditMode) {
      event.preventDefault();
      return;
    }
    const target = event.currentTarget;
    if (!target) return;
    draggedModule = target;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
    draggedModule.classList.add("dragging");
  }
  function onModuleDragEnd() {
    if (draggedModule) {
      draggedModule.classList.remove("dragging");
      draggedModule = null;
    }
  }
  function onPanelDragOver(event) {
    if (!isEditMode) return;
    event.preventDefault();
  }
  function onPanelDrop(event) {
    if (!isEditMode) return;
    event.preventDefault();
    if (!draggedModule) return;
    const panel = event.currentTarget;
    if (!panel) return;
    const targetElement = event.target?.closest(".dashboard-module");
    if (targetElement && targetElement !== draggedModule && targetElement.parentElement === panel) {
      panel.insertBefore(draggedModule, targetElement);
    } else {
      panel.appendChild(draggedModule);
    }
    draggedModule.classList.remove("dragging");
    draggedModule = null;
    saveCurrentLayout();
  }
  function saveCurrentLayout() {
    const { panelLeft, panelRight } = getElements3();
    if (!panelLeft || !panelRight) return;
    const config = { modules: [] };
    const columns = [
      ["left", panelLeft],
      ["right", panelRight]
    ];
    columns.forEach(([column, panel]) => {
      const mods = panel.querySelectorAll(".dashboard-module");
      mods.forEach((el, index) => {
        const id = el.dataset.moduleId;
        if (!id) return;
        config.modules.push({
          id,
          column,
          order: index
        });
      });
    });
    fetch(`${API_URL4}/layout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config)
    }).catch((err) => {
      console.error("Nie uda\u0142o si\u0119 zapisa\u0107 uk\u0142adu dashboardu:", err);
    });
  }
  function initEditToggle() {
    const { editToggle } = getElements3();
    if (!editToggle) return;
    editToggle.addEventListener("click", () => {
      isEditMode = !isEditMode;
      editToggle.classList.toggle("active", isEditMode);
      editToggle.setAttribute("aria-pressed", String(isEditMode));
      document.body.classList.toggle("dashboard-edit", isEditMode);
      const modules = document.querySelectorAll(".dashboard-module");
      modules.forEach((el) => {
        if (isEditMode) {
          el.classList.remove("no-drag");
          el.setAttribute("draggable", "true");
        } else {
          el.classList.add("no-drag");
          el.removeAttribute("draggable");
        }
      });
    });
  }

  // src/main.ts
  function bootstrap() {
    document.addEventListener("DOMContentLoaded", () => {
      try {
        initChat();
        initDocumentsPanel();
        initProjectsPanel();
        initDashboardLayout();
      } catch (e) {
        console.error("B\u0142\u0105d inicjalizacji frontendu (TS):", e);
      }
    });
  }
  bootstrap();
})();
//# sourceMappingURL=app.js.map
