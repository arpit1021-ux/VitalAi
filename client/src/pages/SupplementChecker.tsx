import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Upload, Type, Loader2, RotateCcw, AlertTriangle, Eye } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useProfileStore } from '@/stores/profileStore';
import { scans } from '@/lib/api';
import { performOCR } from '@/lib/ocr';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { CitationsBar } from '@/components/shared/CitationsBar';
import { DisclaimerBanner } from '@/components/shared/DisclaimerBanner';

function ProgressRing({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? '#10B981' : score >= 40 ? '#F59E0B' : '#EF4444';

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="120" height="120" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="#1F2937" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="45"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute text-center">
        <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-text-muted block">/ 100</span>
      </div>
    </div>
  );
}

export default function SupplementChecker() {
  const { activeProfile } = useProfileStore();
  const [extractedText, setExtractedText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [inputMode, setInputMode] = useState<'text' | 'upload'>('text');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { mutate: analyze, data: result, isPending, reset } = useMutation({
    mutationFn: () => scans.scanSupplement(extractedText, activeProfile!._id),
    onError: () => {
      setError('AI analysis failed. Please try again.');
    },
  });

  const handleFileUpload = async (file: File) => {
    setImagePreview(URL.createObjectURL(file));
    setOcrLoading(true);
    setOcrError(null);
    setError(null);
    setConfidence(null);
    try {
      const { text, confidence: conf } = await performOCR(file, setOcrStatus);
      setExtractedText(text);
      setConfidence(conf);
      if (!text.trim()) {
        setOcrError('No text found in this image. Try a clearer photo of the supplement label, or enter supplement details manually using the Text tab.');
      }
    } catch (e) {
      console.error('OCR failed:', e);
      setOcrError('Could not read text from this image. Try a clearer photo, or enter supplement details manually using the Text tab.');
    } finally {
      setOcrLoading(false);
      setOcrStatus('');
    }
  };

  useEffect(() => {
    if (!ocrLoading && extractedText && inputMode === 'upload' && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [ocrLoading, extractedText, inputMode]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFileUpload(file);
  }, []);

  const resetAll = () => {
    setExtractedText('');
    setImagePreview(null);
    setError(null);
    setOcrError(null);
    setConfidence(null);
    reset();
  };

  const lowConfidence = confidence !== null && confidence < 60;

  return (
    <div className="max-w-3xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-text-primary mb-2">Supplement Checker</h1>
        <p className="text-text-muted">Evaluate supplements for your health profile</p>
      </motion.div>

      {!result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader>
              <div className="flex gap-2">
                <Button variant={inputMode === 'text' ? 'default' : 'ghost'} size="sm" onClick={() => setInputMode('text')}>
                  <Type className="h-4 w-4 mr-1" /> Text
                </Button>
                <Button variant={inputMode === 'upload' ? 'default' : 'ghost'} size="sm" onClick={() => setInputMode('upload')}>
                  <Upload className="h-4 w-4 mr-1" /> Upload
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {inputMode === 'upload' && (
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
                        <Upload className="h-10 w-10 mx-auto text-text-muted" />
                        <p className="text-sm text-text-muted">Upload supplement label image</p>
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
                  {ocrLoading && (
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                      <Loader2 className="h-4 w-4 animate-spin" /> {ocrStatus || 'Extracting text...'}
                    </div>
                  )}
                  {ocrError && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 text-warning text-sm">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      {ocrError}
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <label className="text-sm text-text-muted">
                  {inputMode === 'upload' ? 'Extracted Text (review & edit)' : 'Enter supplement details'}
                </label>
                {inputMode === 'upload' && !ocrLoading && extractedText && lowConfidence && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-warning/10 text-warning text-xs">
                    <Eye className="h-3.5 w-3.5 flex-shrink-0" />
                    This text may not be accurate ({Math.round(confidence!)}% confidence) — please review and edit before analyzing.
                  </div>
                )}
                {inputMode === 'upload' && !ocrLoading && extractedText && !lowConfidence && confidence !== null && (
                  <p className="text-xs text-text-muted">
                    Double-check the text below before analyzing — OCR isn't perfect.
                  </p>
                )}
                <Textarea
                  ref={textareaRef}
                  value={extractedText}
                  onChange={(e) => setExtractedText(e.target.value)}
                  placeholder="e.g., Vitamin D3 5000IU, Omega-3 Fish Oil, Zinc 50mg..."
                  className="min-h-[100px] bg-surface border-border text-text-primary"
                />
              </div>

              {inputMode === 'text' && error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-danger/10 text-danger text-sm">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <Button
                onClick={() => { setError(null); analyze(); }}
                disabled={!extractedText.trim() || isPending || !activeProfile}
                className="w-full"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Analyze Supplement
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {isPending && (
        <div className="space-y-4">
          <div className="h-40 rounded-2xl bg-surface animate-pulse mx-auto w-32" />
          <div className="h-48 rounded-2xl bg-surface animate-pulse" />
        </div>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <Card>
            <CardContent className="p-6 flex flex-col items-center">
              <p className="text-sm text-text-muted mb-4">Goal Alignment Score</p>
              <ProgressRing score={result.data?.verdict?.goal_alignment_score || 0} />
            </CardContent>
          </Card>

          {result.data?.verdict?.ingredient_breakdown?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Ingredient Breakdown</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 text-text-muted">Ingredient</th>
                        <th className="text-left py-2 text-text-muted">Dosage</th>
                        <th className="text-left py-2 text-text-muted">Benefit</th>
                        <th className="text-left py-2 text-text-muted">Concern</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.verdict.ingredient_breakdown.map((ing: any, i: number) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="py-2 text-text-primary">{ing.name}</td>
                          <td className="py-2 text-text-muted">{ing.dosage}</td>
                          <td className="py-2 text-text-muted">{ing.benefit}</td>
                          <td className="py-2 text-text-muted text-xs">{ing.concern || 'None'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {result.data?.verdict?.banned_substance_flags?.length > 0 && (
            <Card className="border-danger/30">
              <CardHeader>
                <CardTitle className="text-danger flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" /> Banned Substances Detected
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.data.verdict.banned_substance_flags.map((sub: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-danger/10">
                      <AlertTriangle className="h-4 w-4 text-danger" />
                      <span className="text-sm text-danger">{sub.substance}: {sub.reason}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {result.data?.verdict?.usage_protocol && (
            <Card>
              <CardHeader><CardTitle>Usage Protocol</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-text-primary leading-relaxed">{result.data.verdict.usage_protocol}</p>
              </CardContent>
            </Card>
          )}

          <CitationsBar
            sources={result.data?.verdict?.sources_used || []}
            ragSources={result.data?.ragSources}
          />
          <DisclaimerBanner />

          <Button variant="outline" onClick={resetAll} className="w-full">
            <RotateCcw className="h-4 w-4 mr-2" /> Check Another
          </Button>
        </motion.div>
      )}
    </div>
  );
}
