import * as Dropdown from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Menu = Dropdown.Root;
export const MenuTrigger = Dropdown.Trigger;
export const MenuPortal = Dropdown.Portal;
export const MenuSeparator = () => <Dropdown.Separator className="my-1 h-px bg-border" />;

export function MenuContent({
  children,
  className,
  ...rest
}: Dropdown.DropdownMenuContentProps & { children: ReactNode }) {
  return (
    <Dropdown.Content
      sideOffset={6}
      collisionPadding={8}
      className={cn(
        'z-50 min-w-52 rounded-card border border-border bg-surface-raised p-1 text-sm text-fg shadow-panel',
        className,
      )}
      {...rest}
    >
      {children}
    </Dropdown.Content>
  );
}

export function MenuItem({
  children,
  shortcut,
  danger,
  className,
  ...rest
}: Dropdown.DropdownMenuItemProps & { shortcut?: string; danger?: boolean }) {
  return (
    <Dropdown.Item
      className={cn(
        'flex h-8 cursor-default items-center justify-between gap-4 rounded-control px-2 outline-none select-none',
        'data-[highlighted]:bg-surface-sunken data-[disabled]:opacity-50',
        danger && 'text-danger',
        className,
      )}
      {...rest}
    >
      <span className="truncate">{children}</span>
      {shortcut && <span className="text-xs text-fg-subtle">{shortcut}</span>}
    </Dropdown.Item>
  );
}
