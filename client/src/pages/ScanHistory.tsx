import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Trash2, ScanLine, Pill, FlaskConical, SortAsc } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProfileStore } from '@/stores/profileStore';
import { scansExtended } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { SectionBoundary } from '@/components/shared/SectionBoundary';
import { VerdictBadge, type Verdict } from '@/components/shared/VerdictBadge';
import { describeError, type DescribedError } from '@/lib/errors';
import { rise, stagger, transition, durations } from '@/lib/motion';

interface ScanItem {
  _id: string;
  type: string;
  verdict: string;
  summary?: string;
  extractedText?: string;
  createdAt: string;
}

/** The endpoint returns a paged envelope, but older responses are a bare array. */
type ScanHistoryData = { scans?: ScanItem[]; page?: number; totalPages?: number } | ScanItem[];

function toScans(data: ScanHistoryData): ScanItem[] {
  return Array.isArray(data) ? data : data.scans ?? [];
}

function hasMorePages(data: ScanHistoryData): boolean {
  if (Array.isArray(data)) return false;
  return data.page != null && data.totalPages != null && data.page < data.totalPages;
}

/**
 * What was scanned, told apart by icon and word.
 *
 * The icons used to carry their own colours — an emerald, an indigo and an
 * amber from no palette in this product — which put three more hues beside a
 * verdict chip that means something. The verdict is the only colour in a row.
 */
const typeConfig: Record<string, { icon: typeof ScanLine; label: string }> = {
  food: { icon: ScanLine, label: 'Food' },
  medicine: { icon: Pill, label: 'Medicine' },
  supplement: { icon: FlaskConical, label: 'Supplement' },
};

const VERDICTS: Verdict[] = ['safe', 'caution', 'avoid'];

function toVerdict(value: string): Verdict {
  return VERDICTS.find((v) => v === value) ?? 'caution';
}

export default function ScanHistory() {
  const navigate = useNavigate();
  const { activeProfile } = useProfileStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteFailure, setDeleteFailure] = useState<{ id: string; error: DescribedError } | null>(null);

  const historyQuery = useQuery<ScanHistoryData>({
    queryKey: ['scanHistory', activeProfile?._id, activeTab, search, sort, page],
    queryFn: () =>
      scansExtended.getHistoryFiltered(activeProfile!._id, {
        type: activeTab === 'all' ? undefined : activeTab,
        search: search || undefined,
        sort,
        page,
        limit: 10,
      }).then((r) => r.data),
    enabled: !!activeProfile,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => scansExtended.deleteScan(id),
    onMutate: () => {
      setDeleteFailure(null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanHistory'] });
      setDeleteConfirmId(null);
      setDeleteFailure(null);
    },
    onError: (err, id) => {
      setDeleteFailure({ id, error: describeError(err) });
    },
  });

  return (
    <div className="space-y-8">
      <motion.header variants={rise} initial="hidden" animate="visible" transition={transition(durations.enter)}>
        <h1 className="font-display text-display sm:text-display-lg text-ink text-balance">Everything you've scanned</h1>
        <p className="mt-3 max-w-reading text-body-lg text-ink-muted">
          Every label, strip and tub you've put in front of us, and what we said about it.
        </p>
      </motion.header>

      <motion.div
        variants={rise}
        initial="hidden"
        animate="visible"
        transition={transition(durations.enter)}
        className="space-y-4 border-b border-line pb-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
            <Input
              placeholder="Search what you've scanned"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-10"
              aria-label="Search what you've scanned"
            />
          </div>
          <div className="relative">
            <SortAsc
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="h-12 w-full appearance-none rounded border-2 border-ink/15 bg-surface pl-10 pr-4 text-body text-ink transition-colors duration-micro ease-entrance hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-auto"
              aria-label="Sort order"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
        </div>

        {/* Four tabs will not fit 360px in one row, so the strip scrolls
            rather than squeezing each label to nothing. */}
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setPage(1); }}>
            <TabsList className="h-auto bg-sunk p-1">
              <TabsTrigger value="all" className="min-h-[44px] rounded px-4">All</TabsTrigger>
              <TabsTrigger value="food" className="min-h-[44px] rounded px-4">Food</TabsTrigger>
              <TabsTrigger value="medicine" className="min-h-[44px] rounded px-4">Medicines</TabsTrigger>
              <TabsTrigger value="supplement" className="min-h-[44px] rounded px-4">Supplements</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </motion.div>

      <SectionBoundary
        query={historyQuery}
        band="inline"
        skeleton={
          <div className="divide-y divide-line border-y border-line">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-4">
                <Skeleton className="h-10 w-10 rounded" />
                <div className="flex-1">
                  <Skeleton className="mb-2 h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        }
        isEmpty={(d) => toScans(d).length === 0}
        empty={
          <EmptyState
            icon={ScanLine}
            title="Nothing scanned yet"
            description="Scan a label, a strip or a tub and it'll be here afterwards, with what we made of it."
            actionLabel="Scan something"
            onAction={() => navigate('/scanner')}
          />
        }
      >
        {(d) => (
          <>
            {/* A plain ruled list, not a stack of cards: these are records to
                read down, not objects to pick up one at a time. */}
            <motion.ul
              variants={stagger()}
              initial="hidden"
              animate="visible"
              className="divide-y divide-line border-y border-line"
            >
              {toScans(d).map((scan) => {
                const config = typeConfig[scan.type] || typeConfig.food;
                const Icon = config.icon;
                const deletingThis = deleteMutation.isPending && deleteMutation.variables === scan._id;

                return (
                  <motion.li
                    key={scan._id}
                    variants={rise}
                    transition={transition(durations.enter)}
                    className="py-4"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-sunk"
                      >
                        <Icon className="h-5 w-5 text-ink-muted" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <VerdictBadge verdict={toVerdict(scan.verdict)} />
                          <span className="text-label text-ink-muted">{config.label}</span>
                          <span className="text-caption text-ink-faint">
                            <span className="sr-only">Scanned on </span>
                            {new Date(scan.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="mt-1 max-w-reading text-body text-ink break-words">
                          {scan.summary || scan.extractedText || 'Nothing was written down for this one.'}
                        </p>
                      </div>

                      <div className="flex-shrink-0">
                        {deleteConfirmId === scan._id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => deleteMutation.mutate(scan._id)}
                              loading={deletingThis}
                              loadingLabel="Deleting…"
                            >
                              Delete it
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmId(null)}>
                              Keep it
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteConfirmId(scan._id)}
                            aria-label={`Delete this ${config.label.toLowerCase()} scan`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {deleteFailure?.id === scan._id && (
                      <div className="mt-3">
                        <ErrorState
                          error={deleteFailure.error}
                          onRetry={() => deleteMutation.mutate(scan._id)}
                          retrying={deletingThis}
                        />
                      </div>
                    )}
                  </motion.li>
                );
              })}
            </motion.ul>

            {hasMorePages(d) && (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="secondary"
                  onClick={() => setPage((p) => p + 1)}
                  loading={historyQuery.isFetching}
                  loadingLabel="Loading…"
                >
                  Show me more
                </Button>
              </div>
            )}
          </>
        )}
      </SectionBoundary>
    </div>
  );
}
