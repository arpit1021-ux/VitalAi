import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown } from 'lucide-react';

interface RagSource {
  source: string;
  topic?: string;
}

interface CitationsBarProps {
  sources: string[];
  ragSources?: RagSource[] | null;
}

export function CitationsBar({ sources, ragSources }: CitationsBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (!ragSources || ragSources.length === 0) return null;

  const uniqueTopics = [...new Set(ragSources.map((r) => r.topic).filter(Boolean))];

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
      >
        <span className="text-sm">📚</span>
        <span className="font-medium">Grounded in:</span>
        {ragSources.map((r, i) => (
          <span key={i}>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {r.source}
              {r.topic && <span className="text-text-muted ml-1">({r.topic})</span>}
            </Badge>
          </span>
        ))}
        <ChevronDown
          className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="mt-2 pl-4 border-l-2 border-border space-y-1.5">
          {ragSources.map((r, i) => (
            <div key={i} className="text-[11px] text-text-muted">
              <span className="font-medium text-text-primary">{r.source}</span>
              {r.topic && (
                <span className="ml-1 px-1 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
                  {r.topic}
                </span>
              )}
            </div>
          ))}
          {uniqueTopics.length > 0 && (
            <div className="text-[10px] text-text-muted pt-1 border-t border-border/50">
              Topics: {uniqueTopics.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
