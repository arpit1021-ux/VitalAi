import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Trash2, ScanLine, Pill, FlaskConical, Clock, SortAsc } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProfileStore } from '@/stores/profileStore';
import { scansExtended } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';

interface ScanItem {
  _id: string;
  type: string;
  verdict: string;
  summary?: string;
  extractedText?: string;
  createdAt: string;
}

const typeConfig: Record<string, { icon: typeof ScanLine; color: string }> = {
  food: { icon: ScanLine, color: '#10B981' },
  medicine: { icon: Pill, color: '#6366F1' },
  supplement: { icon: FlaskConical, color: '#F59E0B' },
};

export default function ScanHistory() {
  const { activeProfile } = useProfileStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanHistory'] });
      setDeleteConfirmId(null);
    },
  });

  const scans: ScanItem[] = data?.scans ?? data ?? [];
  const hasMore = data?.page != null && data?.totalPages != null && data.page < data.totalPages;

  return (
    <div className="space-y-6 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-text-primary mb-2">Scan History</h1>
        <p className="text-sm text-text-muted">View all your past scans and results</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-4"
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <Input
              placeholder="Search scans..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
              aria-label="Search scans"
            />
          </div>
          <div className="relative">
            <SortAsc className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="h-10 pl-9 pr-4 rounded-xl border border-border bg-surface text-sm text-text-primary focus:ring-2 focus:ring-primary/50 appearance-none"
              aria-label="Sort order"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setPage(1); }}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="food">Food</TabsTrigger>
            <TabsTrigger value="medicine">Medicine</TabsTrigger>
            <TabsTrigger value="supplement">Supplements</TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-1/3 mb-2" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : scans.length === 0 ? (
        <EmptyState
          icon={ScanLine}
          title="No scans yet"
          description="Start scanning food, medicines, or supplements to see your history here."
          actionLabel="Start Scanning"
          onAction={() => window.location.href = '/scanner'}
        />
      ) : (
        <>
          <div className="space-y-3">
            {scans.map((scan, i) => {
              const config = typeConfig[scan.type] || typeConfig.food;
              const Icon = config.icon;

              return (
                <motion.div
                  key={scan._id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="hover:border-border/80 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${config.color}20` }}
                        >
                          <Icon className="h-5 w-5" style={{ color: config.color }} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <Badge variant={
                              scan.verdict === 'safe' ? 'default' :
                              scan.verdict === 'caution' ? 'warning' : 'destructive'
                            }>
                              {scan.verdict}
                            </Badge>
                            <span className="text-xs text-text-muted capitalize">{scan.type}</span>
                          </div>
                          <p className="text-sm text-text-primary truncate">
                            {scan.summary || scan.extractedText || 'No summary available'}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3 text-text-muted" />
                            <span className="text-xs text-text-muted">
                              {new Date(scan.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex-shrink-0">
                          {deleteConfirmId === scan._id ? (
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => deleteMutation.mutate(scan._id)}
                                disabled={deleteMutation.isPending}
                              >
                                Delete
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteConfirmId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteConfirmId(scan._id)}
                              aria-label="Delete scan"
                            >
                              <Trash2 className="h-4 w-4 text-text-muted" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {hasMore && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
