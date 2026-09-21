import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import type { LoopAdapter } from '@/adapters/adapter';
import { AdapterProvider } from '@/adapters/AdapterProvider';
import { TooltipProvider } from '@/ui/Tooltip';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, err) => {
          const e = err as { retryable?: boolean } | undefined;
          return count < 2 && (e?.retryable ?? true);
        },
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
    },
  });
}

export function AppProviders({ adapter, queryClient, children }: { adapter: LoopAdapter; queryClient: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AdapterProvider adapter={adapter}>
        <MotionConfig reducedMotion="user">
          <TooltipProvider>{children}</TooltipProvider>
        </MotionConfig>
      </AdapterProvider>
    </QueryClientProvider>
  );
}
