import type { LucideIcon } from 'lucide-react';
import { UserRound, ScanLine, MessageCircleQuestion, Refrigerator } from 'lucide-react';

/**
 * First-run onboarding: what a new account is asked to do, and the two small
 * things the browser is allowed to remember about it.
 *
 * The rule this file exists to hold: **completion is never stored.** A tick
 * written to localStorage when someone presses a button is a claim, not a
 * fact — it survives a failed scan, it lies on a second device, and it stays
 * ticked after the thing it described is deleted. A checklist that lies is
 * worse than no checklist, so `isTaskComplete` takes counts that came back
 * from the server and nothing else. The only thing remembered locally is a
 * person's decision to hide the checklist, which is genuinely local and
 * genuinely theirs.
 */

export type OnboardingTaskId = 'profile' | 'scan' | 'ask' | 'pantry';

export interface OnboardingTask {
  id: OnboardingTaskId;
  /** Sentence case, second person, what they'd call it themselves. */
  title: string;
  /** One line on why it's worth doing — not a restatement of the title. */
  description: string;
  /** Where this task gets done. */
  to: string;
  icon: LucideIcon;
}

export const ONBOARDING_TASKS: readonly OnboardingTask[] = [
  {
    id: 'profile',
    title: 'Set up your profile',
    description: 'Your allergies and conditions are what every label gets checked against.',
    to: '/profile-setup',
    icon: UserRound,
  },
  {
    id: 'scan',
    title: 'Scan your first food',
    description: "Point it at a label and we'll read the ingredients back in plain words.",
    to: '/scanner',
    icon: ScanLine,
  },
  {
    id: 'ask',
    title: 'Ask VitalBot something',
    description: 'Anything you would ask a dietitian, at any hour, with your profile in mind.',
    to: '/chat',
    icon: MessageCircleQuestion,
  },
  {
    id: 'pantry',
    title: 'Add something to your pantry',
    description: 'Tell us what you keep in, and we can suggest dinners you can actually cook.',
    to: '/pantry',
    icon: Refrigerator,
  },
] as const;

/**
 * Counts fetched from the server. Every one is a real row: a scan that was
 * saved, a conversation that was started by asking something, an item that is
 * in the pantry now.
 */
export interface OnboardingProgress {
  scans: number;
  conversations: number;
  pantryItems: number;
  /** Whether a health profile exists on this account. */
  hasProfile: boolean;
}

export function isTaskComplete(id: OnboardingTaskId, progress: OnboardingProgress): boolean {
  switch (id) {
    case 'profile':
      return progress.hasProfile;
    case 'scan':
      return progress.scans > 0;
    case 'ask':
      return progress.conversations > 0;
    case 'pantry':
      return progress.pantryItems > 0;
  }
}

export function completedCount(progress: OnboardingProgress): number {
  return ONBOARDING_TASKS.filter((task) => isTaskComplete(task.id, progress)).length;
}

export function isAllComplete(progress: OnboardingProgress): boolean {
  return completedCount(progress) === ONBOARDING_TASKS.length;
}

const DISMISSED_KEY = 'vitalai:onboarding:dismissed';
const WELCOMED_KEY = 'vitalai:onboarding:welcomed';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    // Private browsing refuses storage. Falling back to "not set" shows the
    // checklist again, which is a small annoyance; throwing here would take
    // the dashboard down with it.
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Not remembering is survivable. Blocking the action is not.
  }
}

/** Whether this person has hidden the getting-started checklist for good. */
export function isChecklistDismissed(): boolean {
  return readFlag(DISMISSED_KEY);
}

export function dismissChecklist(): void {
  writeFlag(DISMISSED_KEY);
}

/** Whether the welcome screen has already been shown on this device. */
export function hasSeenWelcome(): boolean {
  return readFlag(WELCOMED_KEY);
}

export function markWelcomeSeen(): void {
  writeFlag(WELCOMED_KEY);
}
