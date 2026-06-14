import SignInModal from '@/components/shared/SignInModal';

interface LockOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName: string;
}

export default function LockOverlay({ open, onOpenChange, featureName }: LockOverlayProps) {
  return (
    <SignInModal
      open={open}
      onOpenChange={onOpenChange}
      message={`Sign in to access ${featureName}`}
    />
  );
}
