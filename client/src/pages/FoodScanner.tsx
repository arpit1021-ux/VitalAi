import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Upload,
  Type,
  RotateCcw,
  Package,
  Bot,
  AlertTriangle,
  ChevronDown,
  Trash2,
  X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useProfileStore } from '@/stores/profileStore';
import { scans, pantry, scansExtended } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Field, fieldAria } from '@/components/ui/field';
import { VerdictBadge, VERDICT, type Verdict } from '@/components/shared/VerdictBadge';
import { IngredientPill } from '@/components/shared/IngredientPill';
import { CitationsBar } from '@/components/shared/CitationsBar';
import { DisclaimerBanner } from '@/components/shared/DisclaimerBanner';
import { ErrorState } from '@/components/shared/ErrorState';
import { SectionBoundary } from '@/components/shared/SectionBoundary';
import { SectionIntro, hasSeenIntro } from '@/components/shared/SectionIntro';
import { describeError, type DescribedError } from '@/lib/errors';
import { rise, stagger, transition, durations } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface ScanVerdict {
  verdict?: Verdict;
  product_name?: string;
  summary?: string;
  extracted_ingredients?: string;
  flagged_ingredients?: { name: string; reason?: string; severity?: 'low' | 'moderate' | 'severe' }[];
  positive_nutrients?: { name: string; benefit?: string }[];
  recommendation?: string;
}

interface ScanSummary {
  _id: string;
  createdAt: string;
  extractedText?: string;
  aiVerdict?: ScanVerdict;
}

/** The endpoint returns a paged envelope, but older responses are a bare array. */
type ScanHistoryData = { scans?: ScanSummary[] } | ScanSummary[];

function toScans(data: ScanHistoryData | undefined): ScanSummary[] {
  if (!data) return [];
  return Array.isArray(data) ? data : data.scans ?? [];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** A section of the result: a heading, space, and a hairline. Not a card. */
function ResultSection({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t border-line pt-6">
      <h2 id={id} className="text-heading text-ink">
        {title}
      </h2>
      {note && <p className="mt-1 text-caption text-ink-muted max-w-reading">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function FoodScanner() {
  const navigate = useNavigate();
  const { activeProfile } = useProfileStore();
  const queryClient = useQueryClient();
  const [showIntro, setShowIntro] = useState(() => !hasSeenIntro('scanner'));
  const [extractedText, setExtractedText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [inputMode, setInputMode] = useState<'text' | 'upload'>('text');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanFailure, setScanFailure] = useState<DescribedError | null>(null);
  const [inventoryFailure, setInventoryFailure] = useState<DescribedError | null>(null);
  const [historyAddFailure, setHistoryAddFailure] = useState<{ id: string; error: DescribedError } | null>(null);
  const [deleteFailure, setDeleteFailure] = useState<{ id: string; error: DescribedError } | null>(null);
  const [clearAllFailure, setClearAllFailure] = useState<DescribedError | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [addedToInventory, setAddedToInventory] = useState(false);
  const [expandedScanId, setExpandedScanId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);

  const historyQuery = useQuery<ScanHistoryData>({
    queryKey: ['scanHistory', activeProfile?._id, 'food'],
    queryFn: () =>
      scansExtended.getHistoryFiltered(activeProfile!._id, { type: 'food', sort: 'newest', limit: 5 }).then((r) => r.data),
    enabled: !!activeProfile,
  });

  const { mutate: analyze, data: result, isPending, reset } = useMutation({
    mutationFn: () => scans.scanFood(extractedText, activeProfile!._id, imageFile || undefined),
    onMutate: () => setScanFailure(null),
    onSuccess: () => {
      setScanFailure(null);
      setAddedToInventory(false);
      queryClient.invalidateQueries({ queryKey: ['scanHistory'] });
    },
    onError: (err) => setScanFailure(describeError(err)),
  });

  const { mutate: addToInventory, isPending: addingToInventory } = useMutation({
    mutationFn: () => {
      const productName = result?.data?.verdict?.product_name || extractedText.split('\n')[0]?.trim() || 'Scanned food item';
      return pantry.create({
        profileId: activeProfile!._id,
        name: productName.slice(0, 100),
        quantity: 1,
        unit: 'pack',
      });
    },
    onMutate: () => setInventoryFailure(null),
    onSuccess: () => setAddedToInventory(true),
    onError: (err) => setInventoryFailure(describeError(err)),
  });

  const deleteScanMutation = useMutation({
    mutationFn: (id: string) => scansExtended.deleteScan(id),
    onMutate: () => setDeleteFailure(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanHistory'] });
      setDeleteConfirmId(null);
    },
    onError: (err, id) => setDeleteFailure({ id, error: describeError(err) }),
  });

  const clearAllMutation = useMutation({
    mutationFn: () => scansExtended.clearAllHistory(activeProfile!._id),
    onMutate: () => setClearAllFailure(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanHistory'] });
      setClearAllConfirm(false);
    },
    onError: (err) => setClearAllFailure(describeError(err)),
  });

  const [historyAddedIds, setHistoryAddedIds] = useState<Set<string>>(new Set());

  const addToInventoryFromHistory = useMutation({
    mutationFn: (scan: ScanSummary) => {
      const name = scan.aiVerdict?.product_name || scan.extractedText?.split('\n')[0]?.trim() || 'Scanned food item';
      return pantry.create({
        profileId: activeProfile!._id,
        name: name.slice(0, 100),
        quantity: 1,
        unit: 'pack',
      });
    },
    onMutate: () => setHistoryAddFailure(null),
    onSuccess: (_data, scan) => {
      setHistoryAddedIds((prev) => new Set([...prev, scan._id]));
    },
    onError: (err, scan) => setHistoryAddFailure({ id: scan._id, error: describeError(err) }),
  });

  /**
   * What the wait is actually spent on, said one step at a time.
   *
   * A single "Analyzing…" for forty seconds reads as a hang. Naming the step
   * is the difference between waiting and wondering whether it broke.
   */
  const stages = useMemo(
    () => [
      'Reading the label…',
      activeProfile ? `Checking it against ${activeProfile.name}'s profile…` : 'Checking it against your profile…',
      'Writing it up…',
    ],
    [activeProfile],
  );
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!isPending) {
      setStage(0);
      return;
    }
    const id = setInterval(() => setStage((s) => Math.min(s + 1, stages.length - 1)), 4500);
    return () => clearInterval(id);
  }, [isPending, stages.length]);

  const handleFileUpload = (file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const stopCamera = useCallback(() => {
    (videoRef.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
    setCameraActive(false);
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
      }
    } catch {
      setCameraError('We couldn’t open the camera. Allow camera access in your browser settings, or upload a photo instead.');
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
            handleFileUpload(file);
            stopCamera();
          }
        });
      }
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFileUpload(file);
  }, []);

  const resetAll = () => {
    setExtractedText('');
    setImagePreview(null);
    setImageFile(null);
    stopCamera();
    setCameraError(null);
    setScanFailure(null);
    setInventoryFailure(null);
    setAddedToInventory(false);
    reset();
  };

  const handleAskVitalBot = () => {
    const productName = result?.data?.verdict?.product_name || extractedText.split('\n')[0]?.trim() || 'food item';
    const verdict = result?.data?.verdict?.verdict || 'unknown';
    navigate(`/chat?context=${encodeURIComponent(`I just scanned "${productName}" and got a ${verdict} verdict. Can you tell me more about this product?`)}`);
  };

  const hasImage = !!imageFile;
  const canAnalyze = inputMode === 'text' ? extractedText.trim().length > 0 : hasImage;
  const who = activeProfile?.name;

  if (showIntro) {
    return (
      <SectionIntro
        id="scanner"
        title="Know what's in it before you eat it"
        body="Point your camera at the ingredient list, or paste it in. We read it against what you've told us — allergies, conditions, the things you're trying to eat less of — and say plainly whether it's a good idea for you."
        actionLabel="Scan something"
        onStart={() => setShowIntro(false)}
      />
    );
  }

  /* ---------------------------------------------------------------- result */

  if (result) {
    const v = result.data?.verdict;
    const key: Verdict = (v?.verdict as Verdict) || 'safe';
    const { icon: VerdictIcon, headline, panel, ink } = VERDICT[key];

    return (
      <motion.div
        variants={stagger()}
        initial="hidden"
        animate="visible"
        className="max-w-3xl space-y-6"
      >
        {/*
          No page title here on purpose. On this screen the verdict is the
          page: a display-weight "Food scanner" above it would compete with the
          one thing the person opened the app to read.
        */}
        <motion.section
          variants={rise}
          transition={transition(durations.enter)}
          aria-labelledby="scan-verdict"
          className={cn('rounded-md px-5 py-7 sm:px-8 sm:py-10', panel)}
        >
          {v?.product_name && (
            <p className="text-label text-ink-muted break-words">{v.product_name}</p>
          )}
          <div className="mt-2 flex items-start gap-3">
            <VerdictIcon className={cn('h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0 mt-1', ink)} aria-hidden="true" />
            <h1
              id="scan-verdict"
              className={cn('font-display text-display sm:text-display-lg text-balance break-words', ink)}
            >
              {headline}
            </h1>
          </div>

          {v?.summary && <p className="mt-5 text-body-lg text-ink max-w-reading break-words">{v.summary}</p>}

          {v?.confidence && (
            <p className="mt-4 text-caption text-ink-muted">
              How sure we are: <span className="font-mono tabular">{v.confidence}</span>
            </p>
          )}
        </motion.section>

        {v?.allergen_warnings?.length > 0 && (
          <motion.div variants={rise} transition={transition(durations.enter)}>
            <ResultSection
              id="scan-allergens"
              title="Allergens on this label"
              note="Printed on the pack. If one of these is yours, don't eat it."
            >
              <ul className="flex flex-wrap gap-2">
                {v.allergen_warnings.map((allergen: string, i: number) => (
                  <li key={i}>
                    <span className="inline-flex items-center rounded-full border border-line-strong bg-sunk px-3 py-1.5 text-label text-ink break-words">
                      {allergen}
                    </span>
                  </li>
                ))}
              </ul>
            </ResultSection>
          </motion.div>
        )}

        {v?.flagged_ingredients?.length > 0 && (
          <motion.div variants={rise} transition={transition(durations.enter)}>
            <ResultSection
              id="scan-flagged"
              title="Worth a closer look"
              note={`These are the ones that stood out against ${who ? `${who}'s` : 'your'} profile. Each one has a reason — open it to read why.`}
            >
              <div className="flex flex-wrap gap-2">
                {v.flagged_ingredients.map((ing: any, i: number) => (
                  <IngredientPill key={i} name={ing.name} reason={ing.reason} severity={ing.severity} flagged />
                ))}
              </div>
            </ResultSection>
          </motion.div>
        )}

        {v?.positive_nutrients?.length > 0 && (
          <motion.div variants={rise} transition={transition(durations.enter)}>
            <ResultSection id="scan-positives" title="In its favour">
              <div className="flex flex-wrap gap-2">
                {v.positive_nutrients.map((n: any, i: number) => (
                  <IngredientPill key={i} name={n.name} reason={n.benefit} />
                ))}
              </div>
            </ResultSection>
          </motion.div>
        )}

        {v?.recommendation && (
          <motion.div variants={rise} transition={transition(durations.enter)}>
            <ResultSection id="scan-advice" title="What we'd do">
              <p className="text-body-lg text-ink max-w-reading break-words">{v.recommendation}</p>
            </ResultSection>
          </motion.div>
        )}

        {v?.identified_items?.length > 0 && (
          <motion.div variants={rise} transition={transition(durations.enter)}>
            <ResultSection id="scan-items" title="What we found on the plate">
              <ul className="divide-y divide-line border-y border-line">
                {v.identified_items.map((item: any, i: number) => (
                  <li key={i} className="py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-body text-ink break-words">{item.name}</p>
                      {item.quantity && (
                        <span className="font-mono text-figure text-ink-muted tabular flex-shrink-0">{item.quantity}</span>
                      )}
                    </div>
                    {item.calories && (
                      <p className="mt-1 font-mono text-figure text-ink-muted tabular">{item.calories}</p>
                    )}
                    {item.key_nutrients && <p className="mt-1 text-caption text-ink-muted break-words">{item.key_nutrients}</p>}
                    {item.benefit && <p className="mt-1 text-caption text-ink-muted break-words">{item.benefit}</p>}
                    {item.concern && (
                      <p className="mt-1 flex items-start gap-1.5 text-caption text-ink break-words">
                        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-ink-faint" aria-hidden="true" />
                        {item.concern}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </ResultSection>
          </motion.div>
        )}

        {v?.extracted_ingredients && (
          <motion.div variants={rise} transition={transition(durations.enter)}>
            <ResultSection id="scan-ingredients" title="What the label says">
              <p className="text-body text-ink-muted max-w-reading whitespace-pre-wrap break-words">
                {v.extracted_ingredients}
              </p>
            </ResultSection>
          </motion.div>
        )}

        {v?.extracted_nutrition && (
          <motion.div variants={rise} transition={transition(durations.enter)}>
            <ResultSection id="scan-nutrition" title="Nutrition, as printed">
              <div className="overflow-x-auto">
                <p className="font-mono text-figure text-ink-muted tabular whitespace-pre-wrap">
                  {v.extracted_nutrition}
                </p>
              </div>
            </ResultSection>
          </motion.div>
        )}

        <motion.div variants={rise} transition={transition(durations.enter)} className="space-y-6">
          <CitationsBar sources={v?.sources_used || []} ragSources={result.data?.ragSources} />
          <DisclaimerBanner />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button
              variant="secondary"
              onClick={() => addToInventory()}
              disabled={addedToInventory}
              loading={addingToInventory}
              loadingLabel="Adding…"
            >
              <Package className="h-4 w-4" aria-hidden="true" />
              {addedToInventory ? 'In your pantry' : 'Add to pantry'}
            </Button>
            <Button variant="secondary" onClick={handleAskVitalBot}>
              <Bot className="h-4 w-4" aria-hidden="true" /> Ask about this
            </Button>
            <Button variant="secondary" onClick={resetAll}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Scan something else
            </Button>
          </div>

          {inventoryFailure && (
            <ErrorState error={inventoryFailure} onRetry={() => addToInventory()} retrying={addingToInventory} />
          )}
        </motion.div>
      </motion.div>
    );
  }

  /* --------------------------------------------------------------- capture */

  const renderHistory = (d: ScanHistoryData) => (
    <motion.section
      variants={rise}
      initial="hidden"
      animate="visible"
      transition={transition(durations.enter)}
      aria-labelledby="recent-scans"
      className="rounded-md border border-line bg-surface"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="recent-scans" className="text-heading text-ink">
          Lately
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate('/history')}>
            See all
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setClearAllConfirm(true)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Clear
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-line">
        {toScans(d).map((scan) => {
          const verdict = scan.aiVerdict?.verdict || 'safe';
          const productName = scan.aiVerdict?.product_name || scan.extractedText?.split('\n')[0]?.trim() || 'Scanned item';
          const summary = scan.aiVerdict?.summary || '';
          const isExpanded = expandedScanId === scan._id;
          const panelId = `scan-detail-${scan._id}`;
          // Scoped to the row being added: a bare `isPending` put every
          // row into "Adding…" and disabled all of them at once.
          const addingThisRow =
            addToInventoryFromHistory.isPending &&
            addToInventoryFromHistory.variables?._id === scan._id;

          return (
            <li key={scan._id}>
              <div className="flex items-start gap-1 p-2">
                <button
                  type="button"
                  onClick={() => setExpandedScanId(isExpanded ? null : scan._id)}
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                  className="flex flex-1 min-w-0 items-center gap-3 min-h-[44px] rounded px-2 text-left transition-colors duration-micro ease-entrance hover:bg-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <VerdictBadge verdict={verdict} className="flex-shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-ink">{productName}</span>
                    <span className="block text-caption text-ink-faint">{timeAgo(scan.createdAt)}</span>
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 flex-shrink-0 text-ink-faint transition-transform duration-micro ease-entrance',
                      isExpanded && 'rotate-180',
                    )}
                    aria-hidden="true"
                  />
                </button>

                <div className="flex-shrink-0">
                  {deleteConfirmId === scan._id ? (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => deleteScanMutation.mutate(scan._id)}
                        loading={deleteScanMutation.isPending}
                        loadingLabel="Deleting…"
                      >
                        Delete
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmId(null)}>
                        Keep
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(scan._id);
                      }}
                      aria-label={`Delete the scan of ${productName}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>

              {deleteFailure?.id === scan._id && (
                <div className="px-3 pb-3">
                  <ErrorState
                    error={deleteFailure.error}
                    onRetry={() => deleteScanMutation.mutate(scan._id)}
                    retrying={deleteScanMutation.isPending}
                  />
                </div>
              )}

              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    id={panelId}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={transition(durations.enter)}
                    className="overflow-hidden"
                  >
                    <div className="space-y-4 border-t border-line px-4 py-4">
                      {summary && <p className="text-body text-ink max-w-reading break-words">{summary}</p>}

                      {scan.aiVerdict?.extracted_ingredients && (
                        <div>
                          <p className="text-label text-ink-muted">What the label says</p>
                          <p className="mt-1 text-caption text-ink-muted whitespace-pre-wrap break-words">
                            {scan.aiVerdict.extracted_ingredients}
                          </p>
                        </div>
                      )}

                      {(scan.aiVerdict?.flagged_ingredients?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-label text-ink-muted">Worth a closer look</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {scan.aiVerdict!.flagged_ingredients!.map((ing, i) => (
                              <IngredientPill key={i} name={ing.name} reason={ing.reason} severity={ing.severity} flagged />
                            ))}
                          </div>
                        </div>
                      )}

                      {(scan.aiVerdict?.positive_nutrients?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-label text-ink-muted">In its favour</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {scan.aiVerdict!.positive_nutrients!.map((n, i) => (
                              <IngredientPill key={i} name={n.name} reason={n.benefit} />
                            ))}
                          </div>
                        </div>
                      )}

                      {scan.aiVerdict?.recommendation && (
                        <p className="text-caption text-ink-muted max-w-reading break-words">
                          {scan.aiVerdict.recommendation}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => addToInventoryFromHistory.mutate(scan)}
                          disabled={historyAddedIds.has(scan._id)}
                          loading={addingThisRow}
                          loadingLabel="Adding…"
                        >
                          <Package className="h-3.5 w-3.5" aria-hidden="true" />
                          {historyAddedIds.has(scan._id) ? 'In your pantry' : 'Add to pantry'}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const name = scan.aiVerdict?.product_name || 'food item';
                            const scanVerdict = scan.aiVerdict?.verdict || 'unknown';
                            navigate(
                              `/chat?context=${encodeURIComponent(`I scanned "${name}" and got a ${scanVerdict} verdict. Tell me more about this product.`)}`,
                            );
                          }}
                        >
                          <Bot className="h-3.5 w-3.5" aria-hidden="true" /> Ask about this
                        </Button>
                      </div>

                      {historyAddFailure?.id === scan._id && (
                        <ErrorState
                          error={historyAddFailure.error}
                          onRetry={() => addToInventoryFromHistory.mutate(scan)}
                          retrying={addingThisRow}
                        />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </motion.section>
  );

  return (
    <div className="space-y-8">
      <motion.header variants={rise} initial="hidden" animate="visible" transition={transition(durations.enter)}>
        <h1 className="font-display text-display sm:text-display-lg text-ink text-balance">Food scanner</h1>
        <p className="mt-3 text-body-lg text-ink-muted max-w-reading">
          Photograph the label or paste the ingredients in. We'll read it against {who ? `${who}'s` : 'your'} profile
          and tell you whether it's a good idea.
        </p>
      </motion.header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-10 items-start">
        <motion.section
          variants={rise}
          initial="hidden"
          animate="visible"
          transition={transition(durations.enter)}
          className="lg:col-span-3 space-y-5"
          aria-label="What you're scanning"
        >
          <div className="flex flex-wrap gap-2" role="group" aria-label="How to enter the label">
            <Button
              variant={inputMode === 'text' ? 'secondary' : 'ghost'}
              aria-pressed={inputMode === 'text'}
              onClick={() => setInputMode('text')}
            >
              <Type className="h-4 w-4" aria-hidden="true" /> Type it in
            </Button>
            <Button
              variant={inputMode === 'upload' ? 'secondary' : 'ghost'}
              aria-pressed={inputMode === 'upload'}
              onClick={() => setInputMode('upload')}
            >
              <Upload className="h-4 w-4" aria-hidden="true" /> Use a photo
            </Button>
          </div>

          {inputMode === 'text' && (
            <Field
              htmlFor="ingredients"
              label="Ingredient list"
              hint="Copy it as it's printed on the pack — the order matters."
              required
            >
              <Textarea
                ref={textareaRef}
                {...fieldAria('ingredients', { hint: "Copy it as it's printed on the pack — the order matters." })}
                value={extractedText}
                onChange={(e) => setExtractedText(e.target.value)}
                placeholder="Wheat flour, palm oil, sugar, salt, raising agents…"
                className="min-h-[9rem]"
              />
            </Field>
          )}

          {inputMode === 'upload' && (
            <div className="space-y-3">
              {cameraActive ? (
                <div className="relative">
                  <video ref={videoRef} className="w-full rounded-lg bg-sunk" aria-label="Camera view" />
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4">
                    <Button onClick={capturePhoto} size="icon" aria-label="Take the photo">
                      <Camera className="h-5 w-5" aria-hidden="true" />
                    </Button>
                    <Button variant="secondary" size="icon" onClick={stopCamera} aria-label="Close the camera">
                      <X className="h-5 w-5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-md border border-dashed border-line-strong bg-surface p-8 text-center transition-colors duration-micro ease-entrance hover:bg-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {imagePreview ? (
                      <img src={imagePreview} alt="The label you're about to scan" className="mx-auto max-h-48 rounded-lg" />
                    ) : (
                      <span className="block space-y-3">
                        <Camera className="mx-auto h-8 w-8 text-ink-faint" aria-hidden="true" />
                        <span className="block text-body text-ink">Drop a photo here, or choose one</span>
                        <span className="block text-caption text-ink-muted">
                          The whole ingredient list, in focus, is all we need.
                        </span>
                      </span>
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  />
                  <Button variant="secondary" onClick={startCamera} className="w-full">
                    <Camera className="h-4 w-4" aria-hidden="true" /> Open the camera
                  </Button>
                </>
              )}
            </div>
          )}

          {cameraError && (
            <div className="flex items-start gap-2 rounded-md border border-line bg-sunk p-3" role="alert">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-ink-faint" aria-hidden="true" />
              <p className="text-caption text-ink">{cameraError}</p>
            </div>
          )}

          <Button
            size="lg"
            onClick={() => analyze()}
            disabled={!canAnalyze || !activeProfile}
            loading={isPending}
            loadingLabel="Reading it…"
            className="w-full sm:w-auto"
          >
            Let's see what's in this
          </Button>

          {!activeProfile && (
            <p className="text-caption text-ink-muted">Pick who's eating first, and we'll read the label for them.</p>
          )}

          {isPending && (
            <div className="space-y-3" role="status" aria-live="polite">
              <p className="text-body text-ink">{stages[stage]}</p>
              <p className="text-caption text-ink-muted">This usually takes under a minute.</p>
              <div className="space-y-2 pt-1" aria-hidden="true">
                <div className="h-16 rounded-md bg-sunk animate-pulse" />
                <div className="h-24 rounded-md bg-sunk animate-pulse" />
              </div>
            </div>
          )}

          {scanFailure && <ErrorState error={scanFailure} onRetry={() => analyze()} retrying={isPending} />}
        </motion.section>

        <div className="lg:col-span-2">
          <SectionBoundary
            query={historyQuery}
            band="inline"
            skeleton={
              <div className="rounded-md border border-line bg-surface p-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 rounded-md bg-sunk animate-pulse" />
                ))}
              </div>
            }
            // Nothing is rendered when there is no history: the scanner form above
            // is already the call to action, and a second empty state under it
            // would say the same thing twice.
            isEmpty={(d) => toScans(d).length === 0}
          >
            {renderHistory}
          </SectionBoundary>
        </div>
      </div>

      <Dialog
        open={clearAllConfirm}
        onOpenChange={(open) => {
          setClearAllConfirm(open);
          if (!open) setClearAllFailure(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear every food scan?</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <p className="text-body text-ink-muted max-w-reading">
              This removes every food scan saved for {activeProfile?.name || 'this profile'}. Anything you already
              added to the pantry stays. There's no undo.
            </p>

            {clearAllFailure && (
              <ErrorState
                error={clearAllFailure}
                onRetry={() => clearAllMutation.mutate()}
                retrying={clearAllMutation.isPending}
              />
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setClearAllConfirm(false)}>
                Keep them
              </Button>
              <Button
                variant="danger"
                onClick={() => clearAllMutation.mutate()}
                loading={clearAllMutation.isPending}
                loadingLabel="Clearing…"
              >
                Clear all scans
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
