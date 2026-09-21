import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { t } from '@/lib/i18n';
import { usePanelContainer } from './panel-container';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

/**
 * A sheet rendered inside the panel body (never a new window). Used for
 * Settings and the `table` "Show all" view.
 */
export function Sheet({ open, onOpenChange, title, description, children }: SheetProps) {
  const container = usePanelContainer();
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal container={container ?? undefined}>
        <RadixDialog.Overlay className="absolute inset-0 z-40 bg-surface/70 backdrop-blur-[1px]" />
        <RadixDialog.Content
          className="absolute inset-x-3 top-3 bottom-3 z-50 flex flex-col overflow-hidden rounded-card border border-border bg-surface-raised shadow-panel focus:outline-none"
          aria-describedby={description ? undefined : undefined}
        >
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-border ps-4 pe-2">
            <RadixDialog.Title className="text-lg text-fg">{title}</RadixDialog.Title>
            <RadixDialog.Close
              aria-label={t('Close')}
              className="inline-flex size-8 items-center justify-center rounded-control text-fg-muted hover:bg-surface-sunken hover:text-fg"
            >
              <X className="size-4" aria-hidden />
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className="px-4 pt-3 text-sm text-fg-muted">{description}</RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
