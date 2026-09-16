import { Info } from 'lucide-react';

/**
 * The standing caveat under anything the model wrote.
 *
 * It is ink, not caution: this is not a finding about a person's health, it is
 * a note about what the product is. Tinting it would spend the caution hue —
 * which means one specific verdict — on a sentence that appears on every
 * screen, and a warning colour that is always present stops being a warning.
 */
export function DisclaimerBanner() {
  return (
    <div className="flex items-start gap-3 border-t border-line pt-4">
      <Info className="h-4 w-4 text-ink-faint flex-shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-caption text-ink-muted max-w-reading">
        This is general information, not medical advice. VitalAI reads what's on the label and what you've told it —
        it doesn't know your full history. Talk to your doctor or pharmacist before you change a medicine or start
        something new.
      </p>
    </div>
  );
}
