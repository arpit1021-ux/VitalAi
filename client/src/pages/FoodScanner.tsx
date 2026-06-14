import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Camera, Upload, Type, Loader2, RotateCcw } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { createWorker } from 'tesseract.js';
import { useProfileStore } from '@/stores/profileStore';
import { scans } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { VerdictBadge } from '@/components/shared/VerdictBadge';
import { IngredientPill } from '@/components/shared/IngredientPill';
import { CitationsBar } from '@/components/shared/CitationsBar';
import { DisclaimerBanner } from '@/components/shared/DisclaimerBanner';

export default function FoodScanner() {
  const { activeProfile } = useProfileStore();
  const [extractedText, setExtractedText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [inputMode, setInputMode] = useState<'text' | 'upload'>('text');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const { mutate: analyze, data: result, isPending, reset } = useMutation({
    mutationFn: () => scans.scanFood(extractedText, activeProfile!._id, imageFile || undefined),
    onSuccess: (res) => {},
  });

  const handleFileUpload = async (file: File) => {
    setImageFile(file);
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

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
      }
    } catch (e) {
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
        canvas.toBlob(async (blob) => {
          if (blob) {
            const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
            await handleFileUpload(file);
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
    reset();
  };

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
                            <Upload className="h-10 w-10 mx-auto text-text-muted" />
                            <p className="text-sm text-text-muted">Drop an image or click to upload</p>
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
                  {ocrLoading && (
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                      <Loader2 className="h-4 w-4 animate-spin" /> Extracting text...
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <label className="text-sm text-text-muted">
                  {inputMode === 'upload' ? 'Extracted Text (review & edit)' : 'Enter ingredient list'}
                </label>
                <Textarea
                  value={extractedText}
                  onChange={(e) => setExtractedText(e.target.value)}
                  placeholder="Paste or type ingredient list here..."
                  className="min-h-[120px] bg-surface border-border text-text-primary"
                />
              </div>

              <Button
                onClick={() => analyze()}
                disabled={!extractedText.trim() || isPending || !activeProfile}
                className="w-full"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Analyze Food
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
              <VerdictBadge verdict={result.data?.verdict || 'safe'} />
              <p className="mt-4 text-text-primary leading-relaxed">{result.data?.summary}</p>
            </CardContent>
          </Card>

          {result.data?.flaggedIngredients?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Flagged Ingredients</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {result.data.flaggedIngredients.map((ing: any, i: number) => (
                    <IngredientPill key={i} name={ing.name} reason={ing.reason} severity={ing.severity} flagged />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {result.data?.positiveNutrients?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Positive Nutrients</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {result.data.positiveNutrients.map((n: any, i: number) => (
                    <IngredientPill key={i} name={n.name} reason={n.reason} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {result.data?.recommendation && (
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-text-primary leading-relaxed">{result.data.recommendation}</p>
              </CardContent>
            </Card>
          )}

          <CitationsBar sources={result.data?.sources || []} />
          <DisclaimerBanner />

          <Button variant="outline" onClick={resetAll} className="w-full">
            <RotateCcw className="h-4 w-4 mr-2" /> Scan Another
          </Button>
        </motion.div>
      )}
    </div>
  );
}
