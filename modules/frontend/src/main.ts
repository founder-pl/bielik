import { initChat } from './ui/chat';
import { initDocumentsPanel } from './ui/documents';
import { initProjectsPanel } from './ui/projects';
import { initDashboardLayout } from './ui/dashboard';

export function bootstrap() {
  document.addEventListener('DOMContentLoaded', () => {
    try {
      initChat();
      initDocumentsPanel();
      initProjectsPanel();
      initDashboardLayout();
    } catch (e) {
      console.error('Błąd inicjalizacji frontendu (TS):', e);
    }
  });
}

bootstrap();
