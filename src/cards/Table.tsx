import { Table2 } from 'lucide-react';
import type { TableCard } from '@contracts/schemas/cards';
import { cn } from '@/lib/cn';
import { t } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import { Button } from '@/ui/Button';
import { CardFrame } from './CardFrame';
import { LinkAction } from './LinkAction';

const VISIBLE_ROWS = 8;

export function TableGrid({ card, limit }: { card: TableCard; limit?: number }) {
  const rows = limit ? card.rows.slice(0, limit) : card.rows;
  if (rows.length === 0) {
    return <p className="py-3 text-sm text-fg-muted">{t('No rows.')}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-control border border-border">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead className="sticky top-0 bg-surface-sunken">
          <tr>
            {card.columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn('px-3 py-1.5 text-xs font-medium text-fg-muted', c.align === 'end' ? 'text-end' : 'text-start')}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {card.columns.map((c) => (
                <td
                  key={c.key}
                  className={cn('px-3 py-1.5 text-fg tabular', c.align === 'end' ? 'text-end' : 'text-start')}
                >
                  {r[c.key] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Table({ card }: { card: TableCard }) {
  const openSheet = useUiStore((s) => s.openTableSheet);
  const total = card.totalRows ?? card.rows.length;
  const truncated = card.rows.length > VISIBLE_ROWS || total > card.rows.length;
  return (
    <CardFrame
      title={card.title}
      icon={<Table2 />}
      agentId={card.agentId}
      footer={
        truncated || card.link ? (
          <>
            {truncated && (
              <Button size="sm" onClick={() => openSheet(card.cardId)}>
                {t('Show all ({n})', { n: total })}
              </Button>
            )}
            {card.link && <LinkAction url={card.link.url} label={card.link.label} platform={card.link.platform} variant="ghost" />}
          </>
        ) : undefined
      }
    >
      <TableGrid card={card} limit={VISIBLE_ROWS} />
    </CardFrame>
  );
}
