import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createAdapter } from '@/adapters';
import type { LoopAdapter } from '@/adapters/adapter';
import { log } from '@/lib/log';
import { AppProviders, createQueryClient } from './providers';
import '@/ui/tokens.css';

/** Mount a window root with the adapter chosen for this environment. */
export async function mount(render: (adapter: LoopAdapter) => ReactNode): Promise<void> {
  const el = document.getElementById('root');
  if (!el) throw new Error('#root missing');
  const adapter = await createAdapter();
  log.info(`Loop Dock ${__APP_VERSION__} (${__BUILD_ID__}) · adapter=${adapter.kind}`);
  document.addEventListener('contextmenu', (e) => {
    const el = e.target;
    if (el instanceof HTMLElement && el.closest('input, textarea, [contenteditable="true"]')) return;
    e.preventDefault();
  });
  createRoot(el).render(
    <StrictMode>
      <AppProviders adapter={adapter} queryClient={createQueryClient()}>
        {render(adapter)}
      </AppProviders>
    </StrictMode>,
  );
}
