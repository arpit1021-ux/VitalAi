import { AlertTriangle } from 'lucide-react';

export function DisclaimerBanner() {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5 mt-4">
      <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
      <p className="text-xs text-warning/80 leading-relaxed">
        This information is for educational purposes only and is not a substitute for professional medical advice.
        Always consult your doctor or pharmacist before making any changes to your medication or health regimen.
      </p>
    </div>
  );
}
