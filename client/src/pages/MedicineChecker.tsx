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
import { SeverityBadge } from '@/components/shared/SeverityBadge';
import { CitationsBar } from '@/components/shared/CitationsBar';
import { DisclaimerBanner } from '@/components/shared/DisclaimerBanner';

export default function MedicineChecker() {
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
    mutationFn: () => scans.scanMedicine(extractedText, activeProfile!._id),
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
        setOcrError('No text found in this image. Try a clearer photo of the medicine strip, or enter medicine names manually using the Text tab.');
      }
    } catch (e) {
      console.error('OCR failed:', e);
      setOcrError('Could not read text from this image. Try a clearer photo, or enter medicine names manually using the Text tab.');
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
        <h1 className="text-3xl font-bold text-text-primary mb-2">Medicine Checker</h1>
        <p className="text-text-muted">Check drug interactions and safety</p>
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
                  <Upload className="h-4 w-4 mr-1" /> Upload Strip
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
                        <p className="text-sm text-text-muted">Upload medicine strip image</p>
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
                  {inputMode === 'upload' ? 'Extracted Text (review & edit)' : 'Enter medicine name(s)'}
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
                  placeholder="e.g., Metformin 500mg, Lisinopril 10mg..."
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
                Check Interactions
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {isPending && (
        <div className="space-y-4">
          <div className="h-20 rounded-2xl bg-surface animate-pulse" />
          <div className="h-32 rounded-2xl bg-surface animate-pulse" />
        </div>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Interaction Results</CardTitle>
            </CardHeader>
            <CardContent>
              {result.data?.verdict?.interactions?.length > 0 ? (
                <div className="space-y-4">
                  {result.data.verdict.interactions.map((interaction: any, i: number) => (
                    <div key={i} className="p-4 rounded-xl bg-background border border-border">
                      <div className="flex items-center gap-3 mb-2">
                        <SeverityBadge severity={interaction.severity || 'moderate'} />
                        <span className="font-medium text-text-primary">{interaction.drug || 'Interaction'}</span>
                      </div>
                      <p className="text-sm text-text-muted mb-2">{interaction.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-text-muted">No significant interactions found</p>
                </div>
              )}
            </CardContent>
          </Card>

          {result.data?.verdict?.general_advice && (
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-text-primary leading-relaxed">{result.data.verdict.general_advice}</p>
              </CardContent>
            </Card>
          )}

          <div className="flex items-start gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5">
            <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-xs text-warning/80">
              Always consult your pharmacist or doctor before making any changes to your medication.
            </p>
          </div>

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
