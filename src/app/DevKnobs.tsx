import { ChevronDown, ChevronUp, FlaskConical } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MockAdapter, MockKnobs } from '@/adapters/mock';
import { cn } from '@/lib/cn';

const SCENARIOS: { id: string; label: string }[] = [
  { id: 'attention.expense', label: 'Pop: expense claim' },
  { id: 'attention.access', label: 'Pop: Snowflake access' },
  { id: 'attention.costcentre', label: 'Pop: cost centre question' },
  { id: 'attention.auth', label: 'Pop: re-auth needed' },
  { id: 'ledger.append', label: 'Append a Ledger row' },
];

/** Dev-only strip (browser harness): mock knobs and scenario triggers. */
export function DevKnobs({ mock }: { mock: MockAdapter }) {
  const [open, setOpen] = useState(false);
  const [knobs, setKnobs] = useState<MockKnobs | null>(null);

  useEffect(() => {
    if (!open) return;
    void mock.devGetKnobs().then(setKnobs).catch(() => setKnobs(null));
  }, [open, mock]);

  async function patch(p: Partial<MockKnobs>) {
    const next = await mock.devSetKnobs(p);
    setKnobs(next);
  }

  return (
    <div
      className="absolute bottom-3 left-3 z-50 w-64 rounded-card border border-border bg-surface-raised text-sm text-fg shadow-panel"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-full items-center justify-between px-3 text-xs font-medium text-fg-muted"
      >
        <span className="inline-flex items-center gap-1.5">
          <FlaskConical className="size-3.5" aria-hidden /> Mock orchestrator
        </span>
        {open ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronUp className="size-3.5" aria-hidden />}
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-border p-3">
          {knobs ? (
            <>
              <label className="flex items-center justify-between gap-2 text-xs">
                Latency {knobs.latencyMs} ms
                <input
                  type="range"
                  min={0}
                  max={4000}
                  step={100}
                  value={knobs.latencyMs}
                  onChange={(e) => void patch({ latencyMs: Number(e.target.value) })}
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs">
                Fail next ask
                <input type="checkbox" checked={knobs.failNextAsk} onChange={(e) => void patch({ failNextAsk: e.target.checked })} />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs">
                Conflict next decision
                <input
                  type="checkbox"
                  checked={knobs.conflictNextDecision}
                  onChange={(e) => void patch({ conflictNextDecision: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs">
                Drop realtime (offline)
                <input type="checkbox" checked={knobs.dropRealtime} onChange={(e) => void patch({ dropRealtime: e.target.checked })} />
              </label>
            </>
          ) : (
            <p className="text-xs text-danger">Mock not reachable. Run `pnpm mock`.</p>
          )}
          <div className="mt-1 flex flex-col gap-1">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => void mock.devTrigger(s.id)}
                className={cn('h-7 rounded-control border border-border px-2 text-start text-xs hover:bg-surface-sunken')}
              >
                {s.label}
              </button>
            ))}
            {/* The dock reaches Settings from the tray icon only; the harness has no tray. */}
            <button
              type="button"
              onClick={() => void mock.dockOpenSettings()}
              className={cn('h-7 rounded-control border border-border px-2 text-start text-xs hover:bg-surface-sunken')}
            >
              Tray: Settings…
            </button>
          </div>
          <p className="text-[10px] text-fg-subtle">
            Try: “Raise a P2 for the payments dashboard outage” · “Status of INC0012345” · “Order 20 laptops” · “Book a room”
          </p>
        </div>
      )}
    </div>
  );
}
