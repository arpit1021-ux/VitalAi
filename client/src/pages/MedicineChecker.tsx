import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Upload, Type, Loader2, RotateCcw, Eye, Info } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useProfileStore } from '@/stores/profileStore';
import { scans } from '@/lib/api';
import { performOCR } from '@/lib/ocr';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Field, fieldAria } from '@/components/ui/field';
import { SeverityBadge } from '@/components/shared/SeverityBadge';
import { VERDICT, type Verdict } from '@/components/shared/VerdictBadge';
import { CitationsBar } from '@/components/shared/CitationsBar';
import { DisclaimerBanner } from '@/components/shared/DisclaimerBanner';
import { ErrorState } from '@/components/shared/ErrorState';
import { describeError, type DescribedError } from '@/lib/errors';
import { rise, stagger, transition, durations } from '@/lib/motion';
import { cn } from '@/lib/utils';

const OCR_UNREADABLE: DescribedError = {
  title: 'We could not read text from this image.',
  action: 'Try a clearer, straight-on photo of the medicine strip, or type the medicine names in instead.',
  code: 'OCR_FAILED',
  retryable: true,
  sessionEnded: false,
};

const OCR_NO_TEXT: DescribedError = {
  title: 'No text was found in this image.',
  action: 'Try a clearer, straight-on photo of the medicine strip, or type the medicine names in instead.',
  code: 'OCR_NO_TEXT',
  // Re-running the same image through the same reader gives the same result,
  // so offering a retry here would only waste the user's time.
  retryable: false,
  sessionEnded: false,
};

type Severity = 'severe' | 'moderate' | 'low' | 'none';

/** One row of the model's interaction list. Everything on it is optional. */
interface Interaction {
  severity?: string;
  drug?: string;
  description?: string;
}

const SEVERITIES: Severity[] = ['severe', 'moderate', 'low', 'none'];

function normaliseSeverity(value: unknown): Severity {
  const found = SEVERITIES.find((s) => s === String(value).toLowerCase());
  return found ?? 'moderate';
}

/**
 * The headline for a set of interactions.
 *
 * Mapped onto the same three verdict hues the scanner uses, so "severe" means
 * the same red here as "best avoided" does there. Nothing else on this screen
 * is allowed to borrow them.
 */
function verdictFor(worst: Severity): { key: Verdict; headline: string } {
  if (worst === 'severe') return { key: 'avoid', headline: "Don't take these together" };
  if (worst === 'moderate') return { key: 'caution', headline: 'Worth a closer look' };
  if (worst === 'low') return { key: 'caution', headline: 'Minor things to know about' };
  return { key: 'safe', headline: 'Nothing here clashes' };
}

export default function MedicineChecker() {
  const { activeProfile } = useProfileStore();
  const [extractedText, setExtractedText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrFraction, setOcrFraction] = useState<number | null>(null);
  const [ocrFailure, setOcrFailure] = useState<DescribedError | null>(null);
  const [lastImageFile, setLastImageFile] = useState<File | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [inputMode, setInputMode] = useState<'text' | 'upload'>('text');
  const [scanFailure, setScanFailure] = useState<DescribedError | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { mutate: analyze, data: result, isPending, reset } = useMutation({
    mutationFn: () => scans.scanMedicine(extractedText, activeProfile!._id),
    onMutate: () => setScanFailure(null),
    onSuccess: () => setScanFailure(null),
    onError: (err) => setScanFailure(describeError(err)),
  });

  const handleFileUpload = async (file: File) => {
    setImagePreview(URL.createObjectURL(file));
    setLastImageFile(file);
    setOcrLoading(true);
    setOcrFailure(null);
    setScanFailure(null);
    setConfidence(null);
    setOcrStatus('');
    setOcrFraction(null);
    try {
      const { text, confidence: conf } = await performOCR(file, ({ status, fraction }) => {
        setOcrStatus(status);
        setOcrFraction(fraction);
      });
      setExtractedText(text);
      setConfidence(conf);
      if (!text.trim()) {
        setOcrFailure(OCR_NO_TEXT);
      }
    } catch {
      // The failure is shown to the user below; OCR runs entirely in the
      // browser, so there is no server-side log a console line would pair with.
      setOcrFailure(OCR_UNREADABLE);
    } finally {
      setOcrLoading(false);
      setOcrStatus('');
      setOcrFraction(null);
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
    setLastImageFile(null);
    setScanFailure(null);
    setOcrFailure(null);
    setConfidence(null);
    reset();
  };

  const lowConfidence = confidence !== null && confidence < 60;
  const who = activeProfile ? `${activeProfile.name}'s` : 'your';

  const textareaHint =
    inputMode === 'upload'
      ? "Read it back before you check it — OCR misreads a dosage now and then."
      : 'One a line, with the dose if you know it.';

  const interactions: Interaction[] = result?.data?.verdict?.interactions ?? [];
  const worst: Severity = interactions.length
    ? SEVERITIES.find((s) => interactions.some((i) => normaliseSeverity(i.severity) === s)) ?? 'moderate'
    : 'none';
  const { key: verdictKey, headline } = verdictFor(worst);
  const { icon: VerdictIcon, panel, ink } = VERDICT[verdictKey];

  return (
    <div className="space-y-8">
      {!result && (
        <motion.header variants={rise} initial="hidden" animate="visible" transition={transition(durations.enter)}>
          <h1 className="font-display text-display sm:text-display-lg text-ink text-balance">Medicine checker</h1>
          <p className="mt-3 max-w-reading text-body-lg text-ink-muted">
            List what's being taken and we'll check them against each other and against {who} profile.
          </p>
        </motion.header>
      )}

      {!result && (
        <motion.div variants={rise} initial="hidden" animate="visible" transition={transition(durations.enter)}>
          <Card>
            <CardContent className="space-y-5 p-5 pt-5 sm:p-6">
              <div className="flex flex-wrap gap-2" role="group" aria-label="How to enter the medicines">
                <Button
                  variant={inputMode === 'text' ? 'secondary' : 'ghost'}
                  aria-pressed={inputMode === 'text'}
                  onClick={() => setInputMode('text')}
                >
                  <Type className="h-4 w-4" aria-hidden="true" /> Type them in
                </Button>
                <Button
                  variant={inputMode === 'upload' ? 'secondary' : 'ghost'}
                  aria-pressed={inputMode === 'upload'}
                  onClick={() => setInputMode('upload')}
                >
                  <Upload className="h-4 w-4" aria-hidden="true" /> Photograph the strip
                </Button>
              </div>

              {inputMode === 'upload' && (
                <>
                  <button
                    type="button"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-md border border-dashed border-line-strong bg-ground p-8 text-center transition-colors duration-micro ease-entrance hover:bg-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {imagePreview ? (
                      <img src={imagePreview} alt="The strip you're about to read" className="mx-auto max-h-48 rounded" />
                    ) : (
                      <span className="block space-y-3">
                        <Upload className="mx-auto h-8 w-8 text-ink-faint" aria-hidden="true" />
                        <span className="block text-body text-ink">Drop a photo of the strip here, or choose one</span>
                        <span className="block text-caption text-ink-muted">
                          The printed names and doses are all we need to read.
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

                  {ocrLoading && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-body text-ink-muted" role="status" aria-live="polite">
                        <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" aria-hidden="true" />
                        <span>{ocrStatus || 'Reading the image…'}</span>
                        {ocrFraction !== null && (
                          <span className="ml-auto font-mono tabular-nums">{Math.round(ocrFraction * 100)}%</span>
                        )}
                      </div>
                      {/* Only drawn once Tesseract reports a real fraction — the
                          preparation and engine-load steps have no progress signal
                          and get the named status line alone. */}
                      {ocrFraction !== null && (
                        <div
                          className="h-1.5 w-full overflow-hidden rounded-full bg-sunk"
                          role="progressbar"
                          aria-label="Reading text from the image"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(ocrFraction * 100)}
                        >
                          {/* Ink, not a hue: on this screen green, amber and red
                              belong to the interaction result and nothing else. */}
                          <div
                            className="h-full bg-ink transition-[width] duration-200"
                            style={{ width: `${Math.round(ocrFraction * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {ocrFailure && !ocrLoading && (
                    <ErrorState
                      error={ocrFailure}
                      onRetry={lastImageFile ? () => handleFileUpload(lastImageFile) : undefined}
                      retrying={ocrLoading}
                    />
                  )}
                </>
              )}

              {inputMode === 'upload' && !ocrLoading && extractedText && lowConfidence && (
                <p
                  className="flex items-start gap-2 rounded border-l-4 border-line-strong bg-sunk p-3 text-body text-ink"
                  role="status"
                >
                  <Eye className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-muted" aria-hidden="true" />
                  <span>
                    This came out blurry —{' '}
                    <span className="font-mono tabular-nums">{Math.round(confidence!)}%</span> of it read cleanly. Go
                    through it line by line before you check it.
                  </span>
                </p>
              )}

              <Field
                htmlFor="medicines"
                label={inputMode === 'upload' ? 'What we read' : 'Medicines'}
                hint={textareaHint}
                required
              >
                <Textarea
                  ref={textareaRef}
                  {...fieldAria('medicines', { hint: textareaHint })}
                  value={extractedText}
                  onChange={(e) => setExtractedText(e.target.value)}
                  placeholder={'Metformin 500mg\nLisinopril 10mg'}
                  className="min-h-[7rem]"
                />
              </Field>

              <Button
                onClick={() => analyze()}
                disabled={!extractedText.trim() || !activeProfile}
                loading={isPending}
                loadingLabel="Checking…"
                size="lg"
                className="w-full"
              >
                Check these together
              </Button>

              {/* Adjacent to the button that triggered it, and shown in both
                  input modes: the previous copy only rendered in the Text tab,
                  so a failed check from an uploaded strip looked like nothing
                  had happened at all. */}
              {scanFailure && (
                <ErrorState error={scanFailure} onRetry={() => analyze()} retrying={isPending} />
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {isPending && (
        <div className="space-y-4">
          <div
            className="flex items-start gap-3 rounded-md border border-line bg-surface p-5"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-ink" aria-hidden="true" />
            <p className="text-body text-ink-muted">
              Checking these against each other and against {who} profile. It usually takes under a minute.
            </p>
          </div>
          <div className="h-24 animate-pulse rounded-xl bg-sunk" />
          <div className="h-32 animate-pulse rounded-md bg-surface shadow-card" />
        </div>
      )}

      {result && (
        <motion.div variants={stagger()} initial="hidden" animate="visible" className="space-y-6">
          {/* The verdict is the page here, so it carries the display type and
              no page title competes with it. */}
          <motion.section
            variants={rise}
            transition={transition(durations.enter)}
            aria-labelledby="interaction-verdict"
            className={cn('rounded-xl px-5 py-7 sm:px-8 sm:py-9', panel)}
          >
            <p className={cn('text-label', ink)}>What we found</p>
            <div className="mt-2 flex items-start gap-3">
              <VerdictIcon className={cn('mt-1 h-7 w-7 flex-shrink-0 sm:h-8 sm:w-8', ink)} aria-hidden="true" />
              <h1
                id="interaction-verdict"
                className={cn('font-display text-display text-balance break-words sm:text-display-lg', ink)}
              >
                {headline}
              </h1>
            </div>
            <p className="mt-5 max-w-reading text-body-lg text-ink">
              {interactions.length > 0 ? (
                <>
                  We found <span className="font-mono tabular-nums">{interactions.length}</span>{' '}
                  {interactions.length === 1 ? 'interaction' : 'interactions'} worth reading below.
                </>
              ) : (
                <>
                  Nothing in this list works against anything else in it, as far as we can see. Keep taking them the
                  way you were told to.
                </>
              )}
            </p>
          </motion.section>

          {interactions.length > 0 && (
            <motion.section
              variants={rise}
              transition={transition(durations.enter)}
              aria-labelledby="interaction-list"
              className="border-t border-line pt-6"
            >
              <h2 id="interaction-list" className="text-heading text-ink">
                Each one, and why
              </h2>
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {interactions.map((interaction, i) => (
                  <li key={i} className="py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={normaliseSeverity(interaction.severity)} />
                      <span className="text-heading text-ink break-words">
                        {interaction.drug || 'Interaction'}
                      </span>
                    </div>
                    {interaction.description && (
                      <p className="mt-2 max-w-reading text-body-lg text-ink break-words">
                        {interaction.description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          {result.data?.verdict?.general_advice && (
            <motion.section
              variants={rise}
              transition={transition(durations.enter)}
              aria-labelledby="interaction-advice"
              className="border-t border-line pt-6"
            >
              <h2 id="interaction-advice" className="text-heading text-ink">
                What we'd do
              </h2>
              <p className="mt-3 max-w-reading text-body-lg text-ink break-words">
                {result.data.verdict.general_advice}
              </p>
            </motion.section>
          )}

          <motion.p
            variants={rise}
            transition={transition(durations.enter)}
            className="flex items-start gap-3 rounded-md border-l-4 border-line-strong bg-sunk p-4 text-body text-ink"
          >
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-muted" aria-hidden="true" />
            <span className="max-w-reading">
              Talk to your pharmacist or doctor before you change how you take any of these — including stopping one.
            </span>
          </motion.p>

          <CitationsBar
            sources={result.data?.verdict?.sources_used || []}
            ragSources={result.data?.ragSources}
          />
          <DisclaimerBanner />

          <Button variant="secondary" onClick={resetAll} size="lg" className="w-full">
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Check another
          </Button>
        </motion.div>
      )}
    </div>
  );
}
