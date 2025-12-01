const API_URL = '/api/v1';

let isEditMode = false;
let draggedModule: HTMLElement | null = null;

function getElements() {
  return {
    panelLeft: document.getElementById('panel-left') as HTMLElement | null,
    panelRight: document.getElementById('panel-right') as HTMLElement | null,
    editToggle: document.getElementById('edit-dashboard-toggle') as HTMLElement | null,
  };
}

interface LayoutModuleConfig {
  id: string;
  column: 'left' | 'right';
  order: number;
}

export async function initDashboardLayout(): Promise<void> {
  // Tymczasowo pusta implementacja - logika w modules/frontend/js/app.js
  // Docelowo przeniesiemy tu funkcje initDashboardLayout, initDragAndDrop, saveCurrentLayout, itd.

  const modules = document.querySelectorAll<HTMLElement>('.dashboard-module');
  modules.forEach((el) => {
    // Drag tylko w trybie edycji – domyślnie wyłączony
    el.classList.add('no-drag');
  });

  try {
    const response = await fetch(`${API_URL}/layout`);
    if (response.ok) {
      const data = (await response.json()) as { modules?: LayoutModuleConfig[] };
      if (data && Array.isArray(data.modules)) {
        applyLayoutFromConfig(data.modules);
      }
    }
  } catch (error) {
    console.error('Nie udało się pobrać układu dashboardu:', error);
  }

  initDragAndDrop();
  initEditToggle();
}

function applyLayoutFromConfig(configModules: LayoutModuleConfig[]): void {
  const allModules: Record<string, HTMLElement> = {};
  document.querySelectorAll<HTMLElement>('.dashboard-module').forEach((el) => {
    const id = el.dataset.moduleId;
    if (id) {
      allModules[id] = el;
    }
  });

  const { panelLeft, panelRight } = getElements();
  if (!panelLeft || !panelRight) return;

  panelLeft.innerHTML = '';
  panelRight.innerHTML = '';

  const byColumn: Record<'left' | 'right', HTMLElement> = {
    left: panelLeft,
    right: panelRight,
  };

  configModules
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach((cfg) => {
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

function initDragAndDrop(): void {
  const modules = document.querySelectorAll<HTMLElement>('.dashboard-module');
  modules.forEach((el) => {
    el.addEventListener('dragstart', onModuleDragStart);
    el.addEventListener('dragend', onModuleDragEnd);
  });

  const { panelLeft, panelRight } = getElements();
  [panelLeft, panelRight].forEach((panel) => {
    if (!panel) return;
    panel.addEventListener('dragover', onPanelDragOver);
    panel.addEventListener('drop', onPanelDrop);
  });
}

function onModuleDragStart(event: DragEvent): void {
  if (!isEditMode) {
    event.preventDefault();
    return;
  }
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return;
  draggedModule = target;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
  draggedModule.classList.add('dragging');
}

function onModuleDragEnd(): void {
  if (draggedModule) {
    draggedModule.classList.remove('dragging');
    draggedModule = null;
  }
}

function onPanelDragOver(event: DragEvent): void {
  if (!isEditMode) return;
  event.preventDefault();
}

function onPanelDrop(event: DragEvent): void {
  if (!isEditMode) return;
  event.preventDefault();
  if (!draggedModule) return;

  const panel = event.currentTarget as HTMLElement | null;
  if (!panel) return;

  const targetElement = (event.target as HTMLElement | null)?.closest('.dashboard-module') as
    | HTMLElement
    | null;

  if (targetElement && targetElement !== draggedModule && targetElement.parentElement === panel) {
    panel.insertBefore(draggedModule, targetElement);
  } else {
    panel.appendChild(draggedModule);
  }

  draggedModule.classList.remove('dragging');
  draggedModule = null;
  saveCurrentLayout();
}

function saveCurrentLayout(): void {
  const { panelLeft, panelRight } = getElements();
  if (!panelLeft || !panelRight) return;

  const config: { modules: LayoutModuleConfig[] } = { modules: [] };

  const columns: Array<['left' | 'right', HTMLElement]> = [
    ['left', panelLeft],
    ['right', panelRight],
  ];

  columns.forEach(([column, panel]) => {
    const mods = panel.querySelectorAll<HTMLElement>('.dashboard-module');
    mods.forEach((el, index) => {
      const id = el.dataset.moduleId;
      if (!id) return;
      config.modules.push({
        id,
        column,
        order: index,
      });
    });
  });

  fetch(`${API_URL}/layout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  }).catch((err) => {
    console.error('Nie udało się zapisać układu dashboardu:', err);
  });
}

function initEditToggle(): void {
  const { editToggle } = getElements();
  if (!editToggle) return;

  editToggle.addEventListener('click', () => {
    isEditMode = !isEditMode;
    editToggle.classList.toggle('active', isEditMode);
    editToggle.setAttribute('aria-pressed', String(isEditMode));

    document.body.classList.toggle('dashboard-edit', isEditMode);

    const modules = document.querySelectorAll<HTMLElement>('.dashboard-module');
    modules.forEach((el) => {
      if (isEditMode) {
        el.classList.remove('no-drag');
        el.setAttribute('draggable', 'true');
      } else {
        el.classList.add('no-drag');
        el.removeAttribute('draggable');
      }
    });
  });
}

