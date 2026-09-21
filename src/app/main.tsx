import { lazy, Suspense } from 'react';
import type { LoopAdapter } from '@/adapters/adapter';
import { isTauri } from '@/lib/env';
import { mount } from './bootstrap';
import { PanelApp } from './PanelApp';

const Harness = lazy(() => import('./Harness').then((m) => ({ default: m.Harness })));

function HarnessLoader({ adapter }: { adapter: LoopAdapter }) {
  return (
    <Suspense fallback={null}>
      <Harness adapter={adapter} />
    </Suspense>
  );
}

document.documentElement.dataset.loopWindow = 'panel';

void mount((adapter) => {
  if (isTauri()) return <PanelApp />;
  // In a browser the same code runs inside a desktop-like harness with the pill
  // and the panel side by side, driven by the mock adapter.
  return <HarnessLoader adapter={adapter} />;
});
