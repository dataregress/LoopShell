import type { LedgerEventType } from '@contracts/schemas/ledger';
import { PLATFORMS } from '@/lib/agents';
import { t } from '@/lib/i18n';
import { hasActiveFilters, useLedgerStore } from '@/stores/ledger';
import { FilterChip } from '@/ui/Chip';
import { STATUS_LABEL } from './StatusGlyph';

const STATUSES: LedgerEventType[] = ['proposed', 'confirmed', 'executed', 'failed', 'cancelled', 'expired'];

/** Footer filter chips: platform (multi) · status (multi) · Mine / Routed to me · Clear. */
export function FilterChips() {
  const filters = useLedgerStore((s) => s.filters);
  const togglePlatform = useLedgerStore((s) => s.togglePlatform);
  const toggleStatus = useLedgerStore((s) => s.toggleStatus);
  const setScope = useLedgerStore((s) => s.setScope);
  const clear = useLedgerStore((s) => s.clearFilters);
  const active = hasActiveFilters(filters);

  return (
    <div className="border-t border-border px-3 py-2">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <FilterChip selected={filters.scope === 'mine'} onClick={() => setScope(filters.scope === 'mine' ? 'all' : 'mine')}>
          {t('Mine')}
        </FilterChip>
        <FilterChip
          selected={filters.scope === 'routed'}
          onClick={() => setScope(filters.scope === 'routed' ? 'all' : 'routed')}
        >
          {t('Routed to me')}
        </FilterChip>
        <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border" />
        {PLATFORMS.map((p) => (
          <FilterChip key={p} selected={filters.platforms.includes(p)} onClick={() => togglePlatform(p)}>
            {p}
          </FilterChip>
        ))}
        <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border" />
        {STATUSES.map((s) => (
          <FilterChip key={s} selected={filters.statuses.includes(s)} onClick={() => toggleStatus(s)}>
            {t(STATUS_LABEL[s])}
          </FilterChip>
        ))}
        {active && (
          <button type="button" onClick={clear} className="ms-1 shrink-0 text-xs font-medium text-info hover:underline">
            {t('Clear')}
          </button>
        )}
      </div>
    </div>
  );
}
