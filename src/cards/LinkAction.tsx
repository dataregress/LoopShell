import { ExternalLink } from 'lucide-react';
import { useAdapter } from '@/adapters/AdapterProvider';
import { t } from '@/lib/i18n';
import { Button } from '@/ui/Button';

export interface LinkActionProps {
  url: string;
  label?: string;
  platform?: string;
  variant?: 'secondary' | 'ghost';
}

/** "Open in <platform>". Opens via `open_external` (allow-listed hosts in Rust). */
export function LinkAction({ url, label, platform, variant = 'secondary' }: LinkActionProps) {
  const adapter = useAdapter();
  const text = label ?? (platform ? t('Open in {platform}', { platform }) : t('Open'));
  return (
    <Button
      size="sm"
      variant={variant}
      icon={<ExternalLink className="size-3.5" aria-hidden />}
      onClick={() => void adapter.openExternal(url)}
      title={url}
    >
      {text}
    </Button>
  );
}
