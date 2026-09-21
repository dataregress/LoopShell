import { FileBox } from 'lucide-react';
import type { RecordCard } from '@contracts/schemas/cards';
import { cn } from '@/lib/cn';
import { Chip } from '@/ui/Chip';
import { CardFrame } from './CardFrame';
import { LinkAction } from './LinkAction';

const TONE_CHIP = { neutral: 'neutral', success: 'success', failure: 'danger' } as const;

export function Record({ card }: { card: RecordCard }) {
  return (
    <CardFrame
      title={card.title}
      icon={<FileBox />}
      agentId={card.agentId}
      footer={<LinkAction url={card.link.url} platform={card.platform} />}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-medium text-fg tabular">{card.reference}</span>
        <Chip>{card.platform}</Chip>
        {card.status && <Chip tone={TONE_CHIP[card.status.tone]}>{card.status.label}</Chip>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {card.fields.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-xs text-fg-muted">{f.label}</dt>
            <dd
              className={cn(
                'truncate text-base text-fg tabular',
                f.tone === 'success' && 'text-success',
                f.tone === 'failure' && 'text-danger',
              )}
              title={f.value}
            >
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
    </CardFrame>
  );
}
