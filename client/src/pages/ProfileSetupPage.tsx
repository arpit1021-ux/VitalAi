import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X, ArrowRight, ArrowLeft, Check, Pencil, Trash2 } from 'lucide-react';
import { useProfileStore } from '@/stores/profileStore';
import { account } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { describeError, type DescribedError } from '@/lib/errors';
import { step as stepMotion, transition } from '@/lib/motion';

const avatarEmojis = ['🍎', '💪', '🧘', '🏃‍♀️', '🧠', '❤️', '🥗', '💊', '🩺', '🥦', '🏋️', '🚴', '🧑‍⚕️', '🫀', '🦷', '🌙', '☀️', '🫁', '🦴', '👁️'];

const presetAllergies = ['Nuts', 'Gluten', 'Dairy', 'Soy', 'Shellfish', 'Eggs', 'Peanuts', 'Fish', 'Wheat', 'Sesame'];
const conditionOptions = ['Diabetes', 'Hypertension', 'PCOS', 'Thyroid', 'Heart Disease', 'Kidney Disease', 'Asthma', 'Arthritis'];
const dietOptions = ['vegetarian', 'vegan', 'eggetarian', 'non-veg', 'jain', 'keto', 'diabetic-friendly'];
const fitnessOptions = ['weight-loss', 'muscle-gain', 'maintenance', 'endurance'];
const activityOptions = ['sedentary', 'lightly-active', 'active', 'very-active'];

/**
 * The wizard, said out loud.
 *
 * A three-step health form with no framing reads as bureaucracy — people
 * abandon it or lie to it. Each step gets a name and one line on *why* it is
 * being asked, because someone who knows what a question is for answers it
 * accurately.
 */
const STEPS = [
  {
    name: 'Who this is for',
    why: 'Just a name and a few basics, so we know whose plate we are looking at.',
  },
  {
    name: 'Food and health',
    why: 'Allergies matter most — this is what we check every label against.',
  },
  {
    name: 'Day to day',
    why: 'The last bit. It shapes the portions and the recipes we suggest.',
  },
] as const;

/**
 * Which step of the wizard owns each field the server can reject. A rejected
 * field is useless if it is announced on a step the person cannot see, so a
 * server-side validation failure sends them back to the step holding it.
 */
/** What /account/consent reports about this account's agreement. */
interface ConsentState {
  currentVersion: string;
  upToDate: boolean;
}

const stepForField: Record<string, number> = {
  name: 1,
  age: 1,
  gender: 1,
  avatar: 1,
  dietType: 2,
  allergies: 2,
  conditions: 2,
  medications: 3,
  fitnessGoal: 3,
  activityLevel: 3,
};

/** A message shown under the input it concerns, never in a banner at the top. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-caption text-danger">
      {message}
    </p>
  );
}

/** Field labels, sized and coloured like every other label in the product. */
function GroupLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-label text-ink">
      {children}
    </label>
  );
}

const chipBase =
  'inline-flex items-center justify-center min-h-[44px] px-4 rounded-full text-body transition-colors duration-micro ease-entrance focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`${chipBase} ${
        selected
          ? 'bg-primary text-ink-inverse shadow-button'
          : 'bg-sunk text-ink-muted hover:text-ink border-2 border-ink/10'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Where you are and how much is left, named rather than numbered alone.
 *
 * "Step 2 of 3" tells someone they are not lost; "Food and health" tells them
 * what they are in the middle of.
 */
function StepIndicator({ current }: { current: number }) {
  return (
    <nav aria-label="Profile setup progress" className="space-y-2">
      <p className="text-label text-ink-muted">
        <span className="font-mono tabular-nums text-ink">
          Step {current} of {STEPS.length}
        </span>
        <span className="sm:hidden"> · {STEPS[current - 1].name}</span>
      </p>
      <ol className="flex gap-1.5">
        {STEPS.map((s, i) => {
          const index = i + 1;
          const state = index < current ? 'done' : index === current ? 'current' : 'upcoming';
          return (
            <li
              key={s.name}
              className="flex-1"
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span
                className={`block h-1.5 rounded-full transition-colors duration-enter ease-entrance ${
                  state === 'upcoming' ? 'bg-sunk' : 'bg-primary'
                }`}
              />
              <span className="sr-only">
                {s.name} — {state === 'done' ? 'done' : state === 'current' ? 'current step' : 'still to come'}
              </span>
            </li>
          );
        })}
      </ol>
      <ol className="hidden sm:flex gap-1.5" aria-hidden="true">
        {STEPS.map((s, i) => (
          <li
            key={s.name}
            className={`flex-1 text-caption truncate ${
              i + 1 === current ? 'text-ink' : 'text-ink-faint'
            }`}
          >
            {s.name}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default function ProfileSetupPage() {
  const navigate = useNavigate();
  const { profiles, addProfile, removeProfile, setActiveProfile } = useProfileStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [allergyInput, setAllergyInput] = useState('');
  const [step, setStep] = useState(1);
  /** Which way the last move went, so the transition reads as travel. */
  const [direction, setDirection] = useState<1 | -1>(1);
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<DescribedError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [agreedToHealthProcessing, setAgreedToHealthProcessing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailure, setDeleteFailure] = useState<DescribedError | null>(null);
  const [form, setForm] = useState({
    name: '',
    age: '',
    gender: '',
    avatar: '🍎',
    dietType: 'vegetarian',
    allergies: [] as string[],
    conditions: [] as string[],
    medications: [] as { name: string; dosage: string }[],
    fitnessGoal: 'maintenance',
    activityLevel: 'lightly-active',
  });

  const firstRun = profiles.length === 0;

  /** Moves between steps and records the direction for the transition. */
  const goToStep = (next: number) => {
    setDirection(next >= step ? 1 : -1);
    setStep(next);
  };

  const toggleCondition = (value: string) => {
    setForm((prev) => ({
      ...prev,
      conditions: prev.conditions.includes(value)
        ? prev.conditions.filter((v) => v !== value)
        : [...prev.conditions, value],
    }));
  };

  const addAllergy = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !form.allergies.includes(trimmed)) {
      setForm((prev) => ({ ...prev, allergies: [...prev.allergies, trimmed] }));
    }
  };

  const removeAllergy = (value: string) => {
    setForm((prev) => ({ ...prev, allergies: prev.allergies.filter((a) => a !== value) }));
  };

  const handleAllergyKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ',') && allergyInput.trim()) {
      e.preventDefault();
      addAllergy(allergyInput);
      setAllergyInput('');
    }
  };

  const addMedication = () => {
    setForm((prev) => ({
      ...prev,
      medications: [...prev.medications, { name: '', dosage: '' }],
    }));
  };

  const updateMedication = (index: number, field: 'name' | 'dosage', value: string) => {
    setForm((prev) => ({
      ...prev,
      medications: prev.medications.map((m, i) => (i === index ? { ...m, [field]: value } : m)),
    }));
  };

  const removeMedication = (index: number) => {
    setForm((prev) => ({
      ...prev,
      medications: prev.medications.filter((_, i) => i !== index),
    }));
  };

  const clearFieldError = (field: string) =>
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const openWizard = () => {
    setStep(1);
    setDirection(1);
    setSaveFailure(null);
    setFieldErrors({});
    setShowCreateModal(true);
  };

  /**
   * Whether this account has agreed to the current terms.
   *
   * The server refuses to create a profile without it, and this wizard is the
   * only screen a new account can reach — ProfileGuard routes everything else
   * here until a profile exists. Asking anywhere else made consent
   * unobtainable and profile creation impossible.
   */
  const consentQuery = useQuery<ConsentState>({
    queryKey: ['consent'],
    queryFn: () => account.getConsent().then((r) => r.data as ConsentState),
  });

  const consentNeeded = consentQuery.data ? !consentQuery.data.upToDate : false;

  const handleSave = async () => {
    // Checked here rather than by disabling the button, so the reason is said
    // out loud under the field it concerns.
    if (!form.name.trim()) {
      setSaveFailure(null);
      setFieldErrors({ name: 'Enter a name for this profile.' });
      goToStep(1);
      return;
    }

    if (consentNeeded && !agreedToHealthProcessing) {
      setSaveFailure(null);
      setFieldErrors({ consent: 'Tick the box above to continue — a profile holds health information, so we need your agreement first.' });
      return;
    }

    setSaving(true);
    setSaveFailure(null);
    setFieldErrors({});
    try {
      // Recorded before the profile, because the profile is what the consent
      // is for: if this fails, no health data has been stored.
      if (consentNeeded && consentQuery.data) {
        await account.acceptConsent(consentQuery.data.currentVersion);
        await consentQuery.refetch();
      }

      await addProfile({
        name: form.name,
        age: parseInt(form.age) || 0,
        gender: form.gender,
        avatar: form.avatar,
        dietType: form.dietType,
        allergies: form.allergies,
        conditions: form.conditions,
        medications: form.medications.filter((m) => m.name),
        fitnessGoal: form.fitnessGoal,
        activityLevel: form.activityLevel,
      });
      setShowCreateModal(false);
      navigate('/');
    } catch (e) {
      const described = describeError(e);
      const fields = described.fields ?? {};
      const named = Object.keys(fields);

      // Everything typed stays on screen — the dialog is never closed and the
      // form is never cleared by a failure.
      if (named.length > 0) {
        setFieldErrors(fields);
        // Show the earliest step that holds a rejected field; a message under
        // an input on a step nobody can see is the same as no message at all.
        goToStep(Math.min(...named.map((field) => stepForField[field] ?? step)));
      } else {
        setSaveFailure(described);
      }
    } finally {
      // Always cleared, so a failure never leaves the button spinning.
      setSaving(false);
    }
  };

  const handleDelete = async (profileId: string) => {
    setDeleting(true);
    setDeleteFailure(null);
    try {
      await removeProfile(profileId);
      setShowDeleteConfirm(null);
    } catch (e) {
      setDeleteFailure(describeError(e));
    } finally {
      setDeleting(false);
    }
  };

  // Deleting the last profile would leave the account with nowhere to store
  // health data, so one must always remain.
  const canDelete = () => profiles.length > 1;

  const stepVariants = stepMotion(direction);

  return (
    <div className="min-h-screen bg-ground p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="font-display text-display text-ink text-balance">
          {firstRun ? "Let's set up your profile" : 'Health profiles'}
        </h1>
        <p className="mt-3 max-w-reading text-body-lg text-ink-muted">
          {firstRun
            ? 'This is what every label gets checked against — your allergies, anything you are managing, and how you like to eat. It takes about a minute, and you can change all of it later.'
            : 'One for each person you look after. Their guidance, their scans and their pantry stay separate.'}
        </p>

        {firstRun ? (
          <div className="mt-8">
            <Button size="lg" onClick={openWizard}>
              Start setting up
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-8">
            {profiles.map((profile) => (
              <Card key={profile._id} className="text-center relative">
                <CardContent className="p-4 pt-4">
                  <div className="flex items-center justify-between mb-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/profile/edit?id=${profile._id}`);
                      }}
                      className="flex h-11 w-11 items-center justify-center rounded hover:bg-sunk transition-colors duration-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      aria-label={`Edit ${profile.name}'s profile`}
                    >
                      <Pencil className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                    </button>
                    {canDelete() ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm(profile._id);
                        }}
                        className="flex h-11 w-11 items-center justify-center rounded hover:bg-danger-soft transition-colors duration-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        aria-label={`Delete ${profile.name}'s profile`}
                      >
                        <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />
                      </button>
                    ) : (
                      <span className="h-11 w-11" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveProfile(profile);
                      navigate('/');
                    }}
                    className="w-full rounded px-2 py-3 hover:bg-sunk/50 transition-colors duration-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <span className="text-4xl block mb-2" aria-hidden="true">{profile.avatar}</span>
                    <span className="block text-heading text-ink break-words">{profile.name}</span>
                    <span className="block text-caption text-ink-muted mt-1 break-words">
                      {profile.age ? `${profile.age} · ` : ''}{profile.dietType || 'No diet set'}
                    </span>
                  </button>
                </CardContent>
              </Card>
            ))}

            <button
              type="button"
              onClick={openWizard}
              className="min-h-[140px] rounded-md border-2 border-dashed border-line-strong/60 bg-transparent flex flex-col items-center justify-center gap-2 text-ink-muted hover:border-primary hover:text-ink transition-colors duration-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Plus className="h-6 w-6" aria-hidden="true" />
              <span className="text-label">Add someone</span>
            </button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!showDeleteConfirm}
        onOpenChange={(open) => {
          if (deleting) return;
          if (!open) {
            setShowDeleteConfirm(null);
            setDeleteFailure(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this profile?</DialogTitle>
          </DialogHeader>
          <p className="text-body text-ink-muted">
            This permanently deletes{' '}
            <span className="font-semibold text-ink">
              {profiles.find((p) => p._id === showDeleteConfirm)?.name ?? 'this profile'}
            </span>{' '}
            and everything recorded against it — health details, scans, conversations and daily
            logs. It happens immediately, cannot be undone, and there is no backup to restore from.
          </p>

          {deleteFailure && (
            <ErrorState
              error={deleteFailure}
              onRetry={() => showDeleteConfirm && void handleDelete(showDeleteConfirm)}
              retrying={deleting}
            />
          )}

          <div className="flex gap-3 mt-4">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={deleting}
              onClick={() => {
                setShowDeleteConfirm(null);
                setDeleteFailure(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={deleting}
              loadingLabel="Deleting…"
              onClick={() => showDeleteConfirm && void handleDelete(showDeleteConfirm)}
            >
              Delete profile
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Profile Dialog */}
      <Dialog
        open={showCreateModal}
        // A save in flight must not be dismissed out from under the person who
        // filled three steps of this form.
        onOpenChange={(open) => {
          if (saving) return;
          setShowCreateModal(open);
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{firstRun ? 'Your profile' : 'Add someone'}</DialogTitle>
          </DialogHeader>

          <StepIndicator current={step} />

          {/* The reason this step is being asked, in one line. Announced on
              change, because someone using a screen reader gets no equivalent
              of glancing up at it. */}
          <p className="text-body text-ink-muted" role="status">
            {STEPS[step - 1].why}
          </p>

          <AnimatePresence mode="wait" initial={false}>
            {step === 1 && (
              <motion.div
                key="step-1"
                variants={stepVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={transition()}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <GroupLabel>Pick a face for this profile</GroupLabel>
                  <div className="grid grid-cols-5 gap-2">
                    {avatarEmojis.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        aria-pressed={form.avatar === emoji}
                        aria-label={`Avatar ${emoji}`}
                        onClick={() => setForm((p) => ({ ...p, avatar: emoji }))}
                        className={`flex min-h-[44px] items-center justify-center rounded text-2xl transition-colors duration-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                          form.avatar === emoji ? 'bg-primary-soft ring-2 ring-primary' : 'hover:bg-sunk'
                        }`}
                      >
                        <span aria-hidden="true">{emoji}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <GroupLabel htmlFor="create-name">Name</GroupLabel>
                  <Input
                    id="create-name"
                    value={form.name}
                    onChange={(e) => {
                      setForm((p) => ({ ...p, name: e.target.value }));
                      clearFieldError('name');
                    }}
                    placeholder="Whose profile is this?"
                    invalid={Boolean(fieldErrors.name)}
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? 'create-name-error' : undefined}
                  />
                  <FieldError id="create-name-error" message={fieldErrors.name} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <GroupLabel htmlFor="create-age">Age</GroupLabel>
                    <Input
                      id="create-age"
                      type="number"
                      inputMode="numeric"
                      value={form.age}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, age: e.target.value }));
                        clearFieldError('age');
                      }}
                      placeholder="Years"
                      invalid={Boolean(fieldErrors.age)}
                      aria-invalid={Boolean(fieldErrors.age)}
                      aria-describedby={fieldErrors.age ? 'create-age-error' : undefined}
                    />
                    <FieldError id="create-age-error" message={fieldErrors.age} />
                  </div>
                  <div className="space-y-2">
                    <GroupLabel htmlFor="create-gender">Gender</GroupLabel>
                    <select
                      id="create-gender"
                      value={form.gender}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, gender: e.target.value }));
                        clearFieldError('gender');
                      }}
                      className="w-full h-12 rounded bg-surface px-3 text-body text-ink border-2 border-ink/15 hover:border-ink/30 transition-colors duration-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      aria-invalid={Boolean(fieldErrors.gender)}
                      aria-describedby={fieldErrors.gender ? 'create-gender-error' : undefined}
                    >
                      <option value="">Prefer not to say</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                    <FieldError id="create-gender-error" message={fieldErrors.gender} />
                  </div>
                </div>
                <Button
                  // Not disabled: a dead button explains nothing. Pressing it
                  // with no name says what is missing, under the name field.
                  onClick={() => {
                    if (!form.name.trim()) {
                      setFieldErrors((prev) => ({ ...prev, name: 'Enter a name to continue.' }));
                      return;
                    }
                    goToStep(2);
                  }}
                  className="w-full"
                >
                  Next: food and health <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                variants={stepVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={transition()}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <GroupLabel>How you eat</GroupLabel>
                  <div className="flex flex-wrap gap-2">
                    {dietOptions.map((diet) => (
                      <Chip
                        key={diet}
                        selected={form.dietType === diet}
                        onClick={() => setForm((p) => ({ ...p, dietType: diet }))}
                      >
                        {diet}
                      </Chip>
                    ))}
                  </div>
                  <FieldError id="create-diet-error" message={fieldErrors.dietType} />
                </div>
                <div className="space-y-2">
                  <GroupLabel htmlFor="create-allergies">Allergies</GroupLabel>
                  <p className="text-caption text-ink-muted">
                    Add anything you have to avoid. We check every label against this list first.
                  </p>
                  {form.allergies.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {form.allergies.map((allergy) => (
                        <span
                          key={allergy}
                          className="inline-flex items-center gap-1.5 pl-3 pr-1 min-h-[44px] rounded-full text-body bg-danger-soft text-danger-ink border-2 border-danger/25"
                        >
                          {allergy}
                          <button
                            type="button"
                            onClick={() => removeAllergy(allergy)}
                            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-danger/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            aria-label={`Remove ${allergy}`}
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {presetAllergies.filter((a) => !form.allergies.includes(a)).map((allergy) => (
                      <button
                        key={allergy}
                        type="button"
                        onClick={() => addAllergy(allergy)}
                        className={`${chipBase} bg-transparent text-ink-muted hover:text-ink border-2 border-line-strong/50 hover:border-ink/30`}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                        {allergy}
                      </button>
                    ))}
                  </div>
                  <Input
                    id="create-allergies"
                    placeholder="Something else? Type it and press enter"
                    value={allergyInput}
                    onChange={(e) => setAllergyInput(e.target.value)}
                    onKeyDown={handleAllergyKeyDown}
                    invalid={Boolean(fieldErrors.allergies)}
                    aria-invalid={Boolean(fieldErrors.allergies)}
                    aria-describedby={fieldErrors.allergies ? 'create-allergies-error' : undefined}
                  />
                  <FieldError id="create-allergies-error" message={fieldErrors.allergies} />
                </div>
                <div className="space-y-2">
                  <GroupLabel>Anything you are managing</GroupLabel>
                  <div className="flex flex-wrap gap-2">
                    {conditionOptions.map((condition) => (
                      <Chip
                        key={condition}
                        selected={form.conditions.includes(condition)}
                        onClick={() => toggleCondition(condition)}
                      >
                        {condition}
                      </Chip>
                    ))}
                  </div>
                  <FieldError id="create-conditions-error" message={fieldErrors.conditions} />
                </div>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => goToStep(1)} className="flex-1">
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
                  </Button>
                  <Button onClick={() => goToStep(3)} className="flex-1">
                    Next <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step-3"
                variants={stepVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={transition()}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <GroupLabel>Medicines you take</GroupLabel>
                    <Button variant="ghost" size="sm" onClick={addMedication}>
                      <Plus className="h-4 w-4" aria-hidden="true" /> Add one
                    </Button>
                  </div>
                  <p className="text-caption text-ink-muted">
                    We use these to flag foods and supplements that do not sit well with them.
                  </p>
                  {form.medications.map((med, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        placeholder="Medicine name"
                        aria-label={`Medicine ${i + 1} name`}
                        value={med.name}
                        onChange={(e) => updateMedication(i, 'name', e.target.value)}
                      />
                      <Input
                        placeholder="Dosage"
                        aria-label={`Medicine ${i + 1} dosage`}
                        value={med.dosage}
                        onChange={(e) => updateMedication(i, 'dosage', e.target.value)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMedication(i)}
                        aria-label={`Remove medicine ${i + 1}`}
                      >
                        <X className="h-4 w-4 text-danger" aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                  <FieldError id="create-medications-error" message={fieldErrors.medications} />
                </div>
                <div className="space-y-2">
                  <GroupLabel>What you are working towards</GroupLabel>
                  <div className="flex flex-wrap gap-2">
                    {fitnessOptions.map((goal) => (
                      <Chip
                        key={goal}
                        selected={form.fitnessGoal === goal}
                        onClick={() => setForm((p) => ({ ...p, fitnessGoal: goal }))}
                      >
                        {goal.replace('-', ' ')}
                      </Chip>
                    ))}
                  </div>
                  <FieldError id="create-fitness-error" message={fieldErrors.fitnessGoal} />
                </div>
                <div className="space-y-2">
                  <GroupLabel>How your days usually go</GroupLabel>
                  <div className="flex flex-wrap gap-2">
                    {activityOptions.map((level) => (
                      <Chip
                        key={level}
                        selected={form.activityLevel === level}
                        onClick={() => setForm((p) => ({ ...p, activityLevel: level }))}
                      >
                        {level.replace('-', ' ')}
                      </Chip>
                    ))}
                  </div>
                  <FieldError id="create-activity-error" message={fieldErrors.activityLevel} />
                </div>

                {consentNeeded && (
                  <div className="rounded-md border border-line-strong/40 bg-sunk/50 p-4 space-y-3">
                    <h3 className="text-heading text-ink">
                      Before we save this profile
                    </h3>
                    <p className="text-body text-ink-muted">
                      A profile holds health information — allergies, conditions and medications —
                      and VitalAI sends it to an AI model to work out what is safe for this person
                      to eat. It is stored encrypted, it is never sold, and you can export or
                      delete all of it at any time from settings.
                    </p>
                    <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
                      <input
                        type="checkbox"
                        checked={agreedToHealthProcessing}
                        onChange={(e) => {
                          setAgreedToHealthProcessing(e.target.checked);
                          clearFieldError('consent');
                        }}
                        aria-invalid={fieldErrors.consent ? true : undefined}
                        aria-describedby={fieldErrors.consent ? 'create-consent-error' : undefined}
                        className="mt-0.5 h-5 w-5 flex-shrink-0 rounded border-line-strong bg-surface accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      />
                      <span className="text-body text-ink">
                        I agree to VitalAI processing this health information to give personalised
                        guidance.{' '}
                        <Link
                          to="/privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 decoration-2 text-primary"
                        >
                          Read the privacy terms
                        </Link>
                        .
                      </span>
                    </label>
                    <FieldError id="create-consent-error" message={fieldErrors.consent} />
                  </div>
                )}

                {consentQuery.error && (
                  <ErrorState
                    error={describeError(consentQuery.error)}
                    onRetry={() => void consentQuery.refetch()}
                    retrying={consentQuery.isFetching}
                  />
                )}

                {/* Form-level failures sit next to the button that caused them,
                    and the retry resubmits the same answers. */}
                {saveFailure && (
                  <ErrorState error={saveFailure} onRetry={() => void handleSave()} retrying={saving} />
                )}

                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => goToStep(2)} className="flex-1" disabled={saving}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
                  </Button>
                  <Button
                    onClick={() => void handleSave()}
                    className="flex-1"
                    loading={saving}
                    loadingLabel="Saving…"
                  >
                    <Check className="h-4 w-4" aria-hidden="true" /> Save profile
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </div>
  );
}
