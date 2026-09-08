import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Upload, Type, Loader2, RotateCcw, Package, Bot, AlertTriangle, Clock, ChevronDown, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useProfileStore } from '@/stores/profileStore';
import { scans, pantry, scansExtended } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { VerdictBadge } from '@/components/shared/VerdictBadge';
import { IngredientPill } from '@/components/shared/IngredientPill';
import { CitationsBar } from '@/components/shared/CitationsBar';
import { DisclaimerBanner } from '@/components/shared/DisclaimerBanner';

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

export default function FoodScanner() {
  const navigate = useNavigate();
  const { activeProfile } = useProfileStore();
  const queryClient = useQueryClient();
  const [extractedText, setExtractedText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [inputMode, setInputMode] = useState<'text' | 'upload'>('text');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [addedToInventory, setAddedToInventory] = useState(false);
  const [expandedScanId, setExpandedScanId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);

  const { data: recentScans } = useQuery({
    queryKey: ['scanHistory', activeProfile?._id, 'food'],
    queryFn: () =>
      scansExtended.getHistoryFiltered(activeProfile!._id, { type: 'food', sort: 'newest', limit: 5 }).then((r) => r.data),
    enabled: !!activeProfile,
  });

  const { mutate: analyze, data: result, isPending, reset } = useMutation({
    mutationFn: () => scans.scanFood(extractedText, activeProfile!._id, imageFile || undefined),
    onSuccess: () => {
      setError(null);
      setAddedToInventory(false);
      queryClient.invalidateQueries({ queryKey: ['scanHistory'] });
    },
    onError: (err: any) => {
      console.error('Scan error:', err);
      const msg = err?.response?.data?.error || err?.message || 'AI analysis failed. Please try again.';
      setError(msg);
    },
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
    onSuccess: () => setAddedToInventory(true),
  });

  const deleteScanMutation = useMutation({
    mutationFn: (id: string) => scansExtended.deleteScan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanHistory'] });
      setDeleteConfirmId(null);
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () => scansExtended.clearAllHistory(activeProfile!._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanHistory'] });
      setClearAllConfirm(false);
    },
  });

  const [historyAddedIds, setHistoryAddedIds] = useState<Set<string>>(new Set());

  const addToInventoryFromHistory = useMutation({
    mutationFn: (scan: any) => {
      const name = scan.aiVerdict?.product_name || scan.extractedText?.split('\n')[0]?.trim() || 'Scanned food item';
      return pantry.create({
        profileId: activeProfile!._id,
        name: name.slice(0, 100),
        quantity: 1,
        unit: 'pack',
      });
    },
    onSuccess: (_data, scan) => {
      setHistoryAddedIds((prev) => new Set([...prev, scan._id]));
    },
  });

  const handleFileUpload = (file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
      }
    } catch {
      setError('Camera access denied. Please allow camera permissions or upload an image instead.');
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
            setCameraActive(false);
            (video.srcObject as MediaStream)?.getTracks().forEach((t) => t.stop());
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
    setCameraActive(false);
    setError(null);
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

  const scanList: any[] = recentScans?.scans ?? recentScans ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-text-primary mb-2">Food Scanner</h1>
        <p className="text-text-muted">Analyze food ingredients for health compatibility</p>
      </motion.div>

      {!result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader>
              <div className="flex gap-2">
                <Button
                  variant={inputMode === 'text' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setInputMode('text')}
                >
                  <Type className="h-4 w-4 mr-1" /> Text
                </Button>
                <Button
                  variant={inputMode === 'upload' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setInputMode('upload')}
                >
                  <Upload className="h-4 w-4 mr-1" /> Upload
                </Button>
              </div>
              {inputMode === 'upload' && (
                <p className="text-xs text-text-muted mt-2">
                  Upload a photo or take a picture — AI will read the label and analyze it directly
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {inputMode === 'upload' && (
                <>
                  {cameraActive ? (
                    <div className="relative">
                      <video ref={videoRef} className="w-full rounded-xl" />
                      <canvas ref={canvasRef} className="hidden" />
                      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                        <Button onClick={capturePhoto} className="rounded-full h-14 w-14 p-0">
                          <div className="h-10 w-10 rounded-full border-2 border-white" />
                        </Button>
                        <Button variant="ghost" onClick={() => { setCameraActive(false); (videoRef.current?.srcObject as MediaStream)?.getTracks().forEach(t => t.stop()); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {imagePreview ? (
                          <img src={imagePreview} alt="Preview" className="max-h-48 mx-auto rounded-lg" />
                        ) : (
                          <div className="space-y-3">
                            <Camera className="h-10 w-10 mx-auto text-text-muted" />
                            <p className="text-sm text-text-muted">Take a photo or upload an image of the food label</p>
                          </div>
                        )}
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                      />
                      <Button variant="outline" onClick={startCamera} className="w-full">
                        <Camera className="h-4 w-4 mr-2" /> Open Camera
                      </Button>
                    </>
                  )}
                </>
              )}

              {inputMode === 'text' && (
                <div className="space-y-2">
                  <label className="text-sm text-text-muted">Enter ingredient list</label>
                  <Textarea
                    ref={textareaRef}
                    value={extractedText}
                    onChange={(e) => setExtractedText(e.target.value)}
                    placeholder="Paste or type ingredient list here..."
                    className="min-h-[120px] bg-surface border-border text-text-primary"
                  />
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-danger/10 text-danger text-sm">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <Button
                onClick={() => { setError(null); analyze(); }}
                disabled={!canAnalyze || isPending || !activeProfile}
                className="w-full"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {isPending ? 'Analyzing...' : 'Analyze Food'}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {isPending && (
        <div className="space-y-4">
          <div className="h-20 rounded-2xl bg-surface animate-pulse" />
          <div className="h-32 rounded-2xl bg-surface animate-pulse" />
          <div className="h-24 rounded-2xl bg-surface animate-pulse" />
        </div>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <Card>
            <CardContent className="p-6 text-center">
              <VerdictBadge verdict={result.data?.verdict?.verdict || 'safe'} />
              {result.data?.verdict?.product_name && (
                <p className="mt-2 text-lg font-semibold text-text-primary">{result.data.verdict.product_name}</p>
              )}
              <p className="mt-4 text-text-primary leading-relaxed">{result.data?.verdict?.summary}</p>
              {result.data?.verdict?.confidence && (
                <p className="mt-2 text-xs text-text-muted">Confidence: {result.data.verdict.confidence}</p>
              )}
            </CardContent>
          </Card>

          {result.data?.verdict?.extracted_ingredients && (
            <Card>
              <CardHeader><CardTitle>Extracted Ingredients</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-text-primary whitespace-pre-wrap">{result.data.verdict.extracted_ingredients}</p>
              </CardContent>
            </Card>
          )}

          {result.data?.verdict?.extracted_nutrition && (
            <Card>
              <CardHeader><CardTitle>Nutritional Information</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-text-primary whitespace-pre-wrap">{result.data.verdict.extracted_nutrition}</p>
              </CardContent>
            </Card>
          )}

          {result.data?.verdict?.identified_items?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Identified Items</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {result.data.verdict.identified_items.map((item: any, i: number) => (
                  <div key={i} className="p-3 rounded-lg bg-surface border border-border">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-text-primary">{item.name}</p>
                      {item.quantity && <span className="text-xs text-text-muted">{item.quantity}</span>}
                    </div>
                    {item.calories && (
                      <p className="text-xs text-primary font-medium mb-1">{item.calories}</p>
                    )}
                    {item.key_nutrients && (
                      <p className="text-xs text-text-muted mb-1">{item.key_nutrients}</p>
                    )}
                    {item.benefit && (
                      <p className="text-xs text-primary/80">{item.benefit}</p>
                    )}
                    {item.concern && (
                      <p className="text-xs text-warning mt-1">⚠ {item.concern}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {result.data?.verdict?.allergen_warnings?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Allergen Warnings</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {result.data.verdict.allergen_warnings.map((allergen: string, i: number) => (
                    <span key={i} className="px-3 py-1 rounded-full bg-danger/10 text-danger text-sm font-medium">
                      {allergen}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {result.data?.verdict?.flagged_ingredients?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Flagged Ingredients</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {result.data.verdict.flagged_ingredients.map((ing: any, i: number) => (
                    <IngredientPill key={i} name={ing.name} reason={ing.reason} severity={ing.severity} flagged />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {result.data?.verdict?.positive_nutrients?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Positive Nutrients</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {result.data.verdict.positive_nutrients.map((n: any, i: number) => (
                    <IngredientPill key={i} name={n.name} reason={n.benefit} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {result.data?.verdict?.recommendation && (
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-text-primary leading-relaxed">{result.data.verdict.recommendation}</p>
              </CardContent>
            </Card>
          )}

          <CitationsBar sources={result.data?.verdict?.sources_used || []} ragSources={result.data?.ragSources} />
          <DisclaimerBanner />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button
              variant="outline"
              onClick={() => addToInventory()}
              disabled={addingToInventory || addedToInventory}
              className="gap-2"
            >
              {addingToInventory ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : addedToInventory ? (
                <Package className="h-4 w-4 text-primary" />
              ) : (
                <Package className="h-4 w-4" />
              )}
              {addedToInventory ? 'Added!' : 'Add to Inventory'}
            </Button>
            <Button
              variant="outline"
              onClick={handleAskVitalBot}
              className="gap-2"
            >
              <Bot className="h-4 w-4" /> Ask VitalBot
            </Button>
            <Button variant="outline" onClick={resetAll} className="gap-2">
              <RotateCcw className="h-4 w-4" /> Scan Another
            </Button>
          </div>
        </motion.div>
      )}

      {!result && scanList.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent Food Scans</CardTitle>
                <div className="flex items-center gap-2">
                  {clearAllConfirm ? (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => clearAllMutation.mutate()}
                        disabled={clearAllMutation.isPending}
                      >
                        {clearAllMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Clear all?
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setClearAllConfirm(false)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setClearAllConfirm(true)}
                        className="text-xs text-danger h-auto p-0 hover:bg-transparent hover:text-danger/80"
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Clear
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => navigate('/history')} className="text-xs text-text-muted h-auto p-0">
                        View all
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {scanList.map((scan: any) => {
                const verdict = scan.aiVerdict?.verdict || 'safe';
                const productName = scan.aiVerdict?.product_name || scan.extractedText?.split('\n')[0]?.trim() || 'Scanned item';
                const summary = scan.aiVerdict?.summary || '';
                const isExpanded = expandedScanId === scan._id;

                return (
                  <div
                    key={scan._id}
                    className="rounded-xl border border-border bg-surface/50 overflow-hidden transition-colors hover:border-border/80"
                  >
                    <div className="flex items-center gap-3 p-3">
                      <button
                        onClick={() => setExpandedScanId(isExpanded ? null : scan._id)}
                        className="flex-1 min-w-0 text-left flex items-center gap-3"
                      >
                        <VerdictBadge verdict={verdict} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">{productName}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3 text-text-muted" />
                            <span className="text-xs text-text-muted">{timeAgo(scan.createdAt)}</span>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-text-muted flex-shrink-0 rotate-180" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-text-muted flex-shrink-0" />
                        )}
                      </button>

                      <div className="flex-shrink-0">
                        {deleteConfirmId === scan._id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => deleteScanMutation.mutate(scan._id)}
                              disabled={deleteScanMutation.isPending}
                              className="h-7 text-xs"
                            >
                              Delete
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteConfirmId(null)}
                              className="h-7 text-xs"
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(scan._id); }}
                            className="h-7 w-7"
                            aria-label={`Delete scan of ${productName}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-text-muted" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 space-y-3 border-t border-border">
                            {summary && (
                              <p className="text-sm text-text-primary pt-3 leading-relaxed">{summary}</p>
                            )}

                            {scan.aiVerdict?.extracted_ingredients && (
                              <div>
                                <p className="text-xs font-medium text-text-muted mb-1">Ingredients</p>
                                <p className="text-xs text-text-primary whitespace-pre-wrap">{scan.aiVerdict.extracted_ingredients}</p>
                              </div>
                            )}

                            {scan.aiVerdict?.flagged_ingredients?.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-text-muted mb-1">Flagged</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {scan.aiVerdict.flagged_ingredients.map((ing: any, i: number) => (
                                    <IngredientPill key={i} name={ing.name} reason={ing.reason} severity={ing.severity} flagged />
                                  ))}
                                </div>
                              </div>
                            )}

                            {scan.aiVerdict?.positive_nutrients?.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-text-muted mb-1">Positive</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {scan.aiVerdict.positive_nutrients.map((n: any, i: number) => (
                                    <IngredientPill key={i} name={n.name} reason={n.benefit} />
                                  ))}
                                </div>
                              </div>
                            )}

                            {scan.aiVerdict?.recommendation && (
                              <p className="text-xs text-text-muted leading-relaxed">{scan.aiVerdict.recommendation}</p>
                            )}

                            <div className="flex gap-2 pt-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => addToInventoryFromHistory.mutate(scan)}
                                disabled={historyAddedIds.has(scan._id) || addToInventoryFromHistory.isPending}
                              >
                                {historyAddedIds.has(scan._id) ? (
                                  <><Package className="h-3 w-3 text-primary" /> Added</>
                                ) : addToInventoryFromHistory.isPending ? (
                                  <><Loader2 className="h-3 w-3 animate-spin" /> Adding...</>
                                ) : (
                                  <><Package className="h-3 w-3" /> Add to Inventory</>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => {
                                  const productName = scan.aiVerdict?.product_name || 'food item';
                                  const verdict = scan.aiVerdict?.verdict || 'unknown';
                                  navigate(`/chat?context=${encodeURIComponent(`I scanned "${productName}" and got a ${verdict} verdict. Tell me more about this product.`)}`);
                                }}
                              >
                                <Bot className="h-3 w-3" /> Ask VitalBot
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
