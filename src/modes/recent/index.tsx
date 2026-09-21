import { AnimatePresence, motion } from 'motion/react';
import { useLedgerStore } from '@/stores/ledger';
import { useMotionPresets } from '@/ui/motion';
import { FilterChips } from './components/FilterChips';
import { JourneyDetail } from './components/JourneyDetail';
import { RecentList } from './components/RecentList';

export interface RecentModeProps {
  onAsk: () => void;
  onContinueInAsk: (journeyId: string) => void;
  focusRequest: number;
}

export function RecentMode({ onAsk, onContinueInAsk, focusRequest }: RecentModeProps) {
  const m = useMotionPresets();
  const filters = useLedgerStore((s) => s.filters);
  const detailJourneyId = useLedgerStore((s) => s.detailJourneyId);
  const openDetail = useLedgerStore((s) => s.openDetail);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {detailJourneyId ? (
        <motion.div key={detailJourneyId} variants={m.fade} initial="hidden" animate="visible" exit="exit" className="h-full">
          <JourneyDetail journeyId={detailJourneyId} onContinueInAsk={onContinueInAsk} />
        </motion.div>
      ) : (
        <motion.div key="list" variants={m.fade} initial="hidden" animate="visible" exit="exit" className="h-full">
          <RecentList filters={filters} onOpenJourney={openDetail} onAsk={onAsk} focusRequest={focusRequest} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function RecentFooter() {
  const detailJourneyId = useLedgerStore((s) => s.detailJourneyId);
  if (detailJourneyId) return null;
  return <FilterChips />;
}
