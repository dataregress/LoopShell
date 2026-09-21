import { Panel } from '@/shell/Panel';

/** The `panel` window: chrome fills the HWND (no shadow margin). */
export function PanelApp() {
  return (
    <div className="h-full w-full">
      <Panel />
    </div>
  );
}
