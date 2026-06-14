import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Upload, Type, Loader2, RotateCcw, AlertTriangle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { createWorker } from 'tesseract.js';
import { useProfileStore } from '@/stores/profileStore';
import { scans } from '@/lib/api';
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
  const [inputMode, setInputMode] = useState<'text' | 'upload'>('text');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutate: analyze, data: result, isPending, reset } = useMutation({
    mutationFn: () => scans.scanMedicine(extractedText, activeProfile!._id),
  });

  const handleFileUpload = async (file: File) => {
    setImagePreview(URL.createObjectURL(file));
    setOcrLoading(true);
    try {
      const worker = await createWorker('eng');
      const { data: { text } } = await worker.recognize(file);
      setExtractedText(text);
      await worker.terminate();
    } catch (e) {
    } finally {
      setOcrLoading(false);
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
    reset();
  };

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
                      <Loader2 className="h-4 w-4 animate-spin" /> Extracting text...
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <label className="text-sm text-text-muted">
                  {inputMode === 'upload' ? 'Extracted Text (review & edit)' : 'Enter medicine name(s)'}
                </label>
                <Textarea
                  value={extractedText}
                  onChange={(e) => setExtractedText(e.target.value)}
                  placeholder="e.g., Metformin 500mg, Lisinopril 10mg..."
                  className="min-h-[100px] bg-surface border-border text-text-primary"
                />
              </div>

              <Button
                onClick={() => analyze()}
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
              {result.data?.interactions?.length > 0 ? (
                <div className="space-y-4">
                  {result.data.interactions.map((interaction: any, i: number) => (
                    <div key={i} className="p-4 rounded-xl bg-background border border-border">
                      <div className="flex items-center gap-3 mb-2">
                        <SeverityBadge severity={interaction.severity || 'moderate'} />
                        <span className="font-medium text-text-primary">{interaction.title || 'Interaction'}</span>
                      </div>
                      <p className="text-sm text-text-muted mb-2">{interaction.description || interaction.mechanism}</p>
                      {interaction.advice && (
                        <p className="text-sm text-primary">{interaction.advice}</p>
                      )}
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

          {result.data?.advice && (
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-text-primary leading-relaxed">{result.data.advice}</p>
              </CardContent>
            </Card>
          )}

          <div className="flex items-start gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5">
            <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-xs text-warning/80">
              Always consult your pharmacist or doctor before making any changes to your medication.
            </p>
          </div>

          <CitationsBar sources={result.data?.sources || []} />
          <DisclaimerBanner />

          <Button variant="outline" onClick={resetAll} className="w-full">
            <RotateCcw className="h-4 w-4 mr-2" /> Check Another
          </Button>
        </motion.div>
      )}
    </div>
  );
}
