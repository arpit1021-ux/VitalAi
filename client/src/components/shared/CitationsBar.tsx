import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';

interface CitationsBarProps {
  sources: string[];
}

export function CitationsBar({ sources }: CitationsBarProps) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {sources.map((source, i) => (
        <Badge key={i} variant="outline" className="gap-1 text-xs">
          <ExternalLink className="h-3 w-3" />
          {source}
        </Badge>
      ))}
    </div>
  );
}
