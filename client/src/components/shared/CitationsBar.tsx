import { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { BookOpen, ChevronDown } from 'lucide-react';

interface RagSource {
  source: string;
  topic?: string;
}

interface CitationsBarProps {
  /** Flat source names, used when the caller has no topic detail. */
  sources?: string[];
  /** Preferred: source plus the knowledge-base topic it came from. */
  ragSources?: RagSource[] | null;
}

/**
 * Where an answer came from.
 *
 * Collapsed by default and set in caption type: the sources matter for trust,
 * but they are not the finding, and a wall of chips above the answer reads as
 * more important than the answer.
 */
export function CitationsBar({ sources, ragSources }: CitationsBarProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  // Callers supply either shape: the scan routes return `ragSources` with
  // topics, while some screens only have the flat `sources` list. Rendering
  // only when `ragSources` existed meant medicine and supplement scans showed
  // no citations at all, even when the answer was grounded.
  const citations: RagSource[] =
    ragSources && ragSources.length > 0
      ? ragSources
      : [...new Set(sources ?? [])].map((source) => ({ source }));

  if (citations.length === 0) return null;

  const uniqueTopics = [...new Set(citations.map((r) => r.topic).filter(Boolean))];

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0 sm:py-1 text-caption text-ink-muted hover:text-ink transition-colors duration-micro ease-entrance rounded"
      >
        <BookOpen className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span>
          Grounded in {citations.length} {citations.length === 1 ? 'source' : 'sources'}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-micro ease-entrance ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      <div id={panelId} hidden={!expanded}>
        <ul className="mt-2 pl-4 border-l border-line space-y-1.5">
          {citations.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 text-caption text-ink">
              <span className="break-words">{r.source}</span>
              {r.topic && <Badge variant="neutral">{r.topic}</Badge>}
            </li>
          ))}
        </ul>
        {uniqueTopics.length > 0 && (
          <p className="mt-2 pl-4 text-caption text-ink-faint break-words">Topics: {uniqueTopics.join(', ')}</p>
        )}
      </div>
    </div>
  );
}
