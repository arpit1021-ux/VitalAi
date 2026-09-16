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
import { VERDICT, type Verdict } from '@/components/shared/VerdictBadge';
import { CitationsBar } from '@/components/shared/CitationsBar';
import { DisclaimerBanner } from '@/components/shared/DisclaimerBanner';
import { ErrorState } from '@/components/shared/ErrorState';
import { describeError, type DescribedError } from '@/lib/errors';
import { rise, stagger, transition, durations } from '@/lib/motion';
import { cn } from '@/lib/utils';

const OCR_UNREADABLE: DescribedError = {
  title: 'We could not read text from this image.',
  action: 'Try a clearer, straight-on photo of the supplement label, or type what it says in instead.',
  code: 'OCR_FAILED',
  retryable: true,
  sessionEnded: false,
};

const OCR_NO_TEXT: DescribedError = {
  title: 'No text was found in this image.',
  action: 'Try a clearer, straight-on photo of the supplement label, or type what it says in instead.',
  code: 'OCR_NO_TEXT',
  // Re-running the same image through the same reader gives the same result,
  // so offering a retry here would only waste the user's time.
  retryable: false,
  sessionEnded: false,
};

interface BreakdownRow {
  name?: string;
  dosage?: string;
  benefit?: string;
  concern?: string;
}

interface BannedFlag {
  substance?: string;
  reason?: string;
}

/**
 * The score, read as a verdict.
 *
 * It is the finding on this screen, so it takes the verdict hues and the
 * verdict wording — and nothing else here is allowed to use them.
 */
function scoreVerdict(score: number): { key: Verdict; headline: string; meter: string } {
  if (score >= 70) return { key: 'safe', headline: 'This fits what you’re after', meter: 'bg-primary' };
  if (score >= 40) return { key: 'caution', headline: 'Worth a closer look', meter: 'bg-caution' };
  return { key: 'avoid', headline: 'Not built for your goals', meter: 'bg-danger' };
}

export default function SupplementChecker() {
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
    mutationFn: () => scans.scanSupplement(extractedText, activeProfile!._id),
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
      ? "Read it back before you check it — OCR misreads a dose now and then."
      : 'The name and the amount per serving, one a line.';

  const score: number = Math.max(0, Math.min(100, Number(result?.data?.verdict?.goal_alignment_score) || 0));
  const { key: verdictKey, headline, meter } = scoreVerdict(score);
  const { icon: VerdictIcon, panel, ink } = VERDICT[verdictKey];
  const breakdown: BreakdownRow[] = result?.data?.verdict?.ingredient_breakdown ?? [];
  const banned: BannedFlag[] = result?.data?.verdict?.banned_substance_flags ?? [];

  return (
    <div className="space-y-8">
      {!result && (
        <motion.header variants={rise} initial="hidden" animate="visible" transition={transition(durations.enter)}>
          <h1 className="font-display text-display sm:text-display-lg text-ink text-balance">Supplement checker</h1>
          <p className="mt-3 max-w-reading text-body-lg text-ink-muted">
            Tell us what's in the tub and we'll say whether it's doing anything for {who} goals — and what's in there
            that shouldn't be.
          </p>
        </motion.header>
      )}

      {!result && (
        <motion.div variants={rise} initial="hidden" animate="visible" transition={transition(durations.enter)}>
          <Card>
            <CardContent className="space-y-5 p-5 pt-5 sm:p-6">
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
                      <img src={imagePreview} alt="The label you're about to read" className="mx-auto max-h-48 rounded" />
                    ) : (
                      <span className="block space-y-3">
                        <Upload className="mx-auto h-8 w-8 text-ink-faint" aria-hidden="true" />
                        <span className="block text-body text-ink">Drop a photo of the label here, or choose one</span>
                        <span className="block text-caption text-ink-muted">
                          The supplement facts panel, in focus, is the part we need.
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
                          {/* Ink, not a hue: green, amber and red belong to the
                              verdict on this screen and to nothing else. */}
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
                htmlFor="supplement"
                label={inputMode === 'upload' ? 'What we read' : "What's in it"}
                hint={textareaHint}
                required
              >
                <Textarea
                  ref={textareaRef}
                  {...fieldAria('supplement', { hint: textareaHint })}
                  value={extractedText}
                  onChange={(e) => setExtractedText(e.target.value)}
                  placeholder={'Vitamin D3 5000IU\nOmega-3 fish oil 1000mg\nZinc 50mg'}
                  className="min-h-[7rem]"
                />
              </Field>

              <Button
                onClick={() => analyze()}
                disabled={!extractedText.trim() || !activeProfile}
                loading={isPending}
                loadingLabel="Having a look…"
                size="lg"
                className="w-full"
              >
                Have a look at this
              </Button>

              {/* Adjacent to the button that triggered it, and shown in both
                  input modes: the previous copy only rendered in the Text tab,
                  so a failed analysis from an uploaded label looked like nothing
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
              Checking these ingredients against {who} profile and goals. It usually takes under a minute.
            </p>
          </div>
          <div className="h-40 animate-pulse rounded-xl bg-sunk" />
          <div className="h-48 animate-pulse rounded-md bg-surface shadow-card" />
        </div>
      )}

      {result && (
        <motion.div variants={stagger()} initial="hidden" animate="visible" className="space-y-6">
          {/* The score is the page here, so it carries the display type and the
              verdict hue, and no page title competes with it. */}
          <motion.section
            variants={rise}
            transition={transition(durations.enter)}
            aria-labelledby="supplement-verdict"
            className={cn('rounded-xl px-5 py-7 sm:px-8 sm:py-9', panel)}
          >
            <p className={cn('text-label', ink)}>How well it fits your goals</p>
            <div className="mt-2 flex items-start gap-3">
              <VerdictIcon className={cn('mt-1 h-7 w-7 flex-shrink-0 sm:h-8 sm:w-8', ink)} aria-hidden="true" />
              <h1
                id="supplement-verdict"
                className={cn('font-display text-display text-balance break-words sm:text-display-lg', ink)}
              >
                {headline}
              </h1>
            </div>

            <div className="mt-6 flex items-baseline gap-2">
              <span className={cn('font-mono text-stat', ink)}>{score}</span>
              <span className="text-body text-ink-muted">out of 100</span>
            </div>
            <div
              className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink/10"
              role="progressbar"
              aria-label="How well this fits your goals"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={score}
            >
              <div className={cn('h-full transition-[width] duration-500', meter)} style={{ width: `${score}%` }} />
            </div>
          </motion.section>

          {banned.length > 0 && (
            <motion.section
              variants={rise}
              transition={transition(durations.enter)}
              aria-labelledby="supplement-banned"
              className="rounded-md bg-danger-soft p-5"
            >
              <h2 id="supplement-banned" className="text-heading text-danger-ink">
                Things in here that shouldn't be
              </h2>
              <ul className="mt-3 space-y-2">
                {banned.map((sub, i) => (
                  <li key={i} className="text-body-lg text-ink break-words">
                    <span className="font-medium">{sub.substance}</span>
                    {sub.reason ? ` — ${sub.reason}` : null}
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          {breakdown.length > 0 && (
            <motion.section
              variants={rise}
              transition={transition(durations.enter)}
              aria-labelledby="supplement-breakdown"
              className="border-t border-line pt-6"
            >
              <h2 id="supplement-breakdown" className="text-heading text-ink">
                Ingredient by ingredient
              </h2>
              {/* Four columns will not fit a phone, so the table scrolls inside
                  its own box rather than pushing the page sideways. */}
              <div className="mt-3 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[34rem] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line-strong">
                      <th scope="col" className="py-2 pr-4 text-label text-ink-muted">Ingredient</th>
                      <th scope="col" className="py-2 pr-4 text-label text-ink-muted">Amount</th>
                      <th scope="col" className="py-2 pr-4 text-label text-ink-muted">What it's for</th>
                      <th scope="col" className="py-2 text-label text-ink-muted">Anything to note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {breakdown.map((ing, i) => (
                      <tr key={i}>
                        <th scope="row" className="py-3 pr-4 text-body font-medium text-ink align-top">
                          {ing.name}
                        </th>
                        <td className="py-3 pr-4 font-mono text-figure text-ink align-top whitespace-nowrap">
                          {ing.dosage}
                        </td>
                        <td className="py-3 pr-4 text-body text-ink-muted align-top">{ing.benefit}</td>
                        <td className="py-3 text-body text-ink-muted align-top">{ing.concern || 'Nothing'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.section>
          )}

          {result.data?.verdict?.usage_protocol && (
            <motion.section
              variants={rise}
              transition={transition(durations.enter)}
              aria-labelledby="supplement-usage"
              className="border-t border-line pt-6"
            >
              <h2 id="supplement-usage" className="text-heading text-ink">
                How to take it
              </h2>
              <p className="mt-3 max-w-reading text-body-lg text-ink break-words">
                {result.data.verdict.usage_protocol}
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
              Supplements aren't checked the way medicines are. Run anything new past your doctor if you're already
              taking something.
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
