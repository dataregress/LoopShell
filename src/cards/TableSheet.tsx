import type { TableCard } from '@contracts/schemas/cards';
import { useUiStore } from '@/stores/ui';
import { Sheet } from '@/ui/Dialog';
import { TableGrid } from './Table';

/** "Show all" sheet for a `table` card, rendered inside the panel. */
export function TableSheet({ cards }: { cards: TableCard[] }) {
  const cardId = useUiStore((s) => s.tableSheetCardId);
  const close = useUiStore((s) => s.openTableSheet);
  const card = cards.find((c) => c.cardId === cardId);
  return (
    <Sheet open={!!card} onOpenChange={(o) => !o && close(null)} title={card?.title ?? ''}>
      {card && (
        <div className="p-4">
          <TableGrid card={card} />
        </div>
      )}
    </Sheet>
  );
}
