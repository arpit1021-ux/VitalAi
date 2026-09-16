import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Plus, X, Check } from 'lucide-react';
import { useProfileStore } from '@/stores/profileStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, fieldAria } from '@/components/ui/field';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState } from '@/components/shared/ErrorState';
import { describeError, type DescribedError } from '@/lib/errors';
import { rise, step as stepMotion, transition, durations } from '@/lib/motion';
import { cn } from '@/lib/utils';

const avatarEmojis = ['🍎', '💪', '🧘', '🏃‍♀️', '🧠', '❤️', '🥗', '💊', '🩺', '🥦', '🏋️', '🚴', '🧑‍⚕️', '🫀', '🦷', '🌙', '☀️', '🫁', '🦴', '👁️'];

const allergyOptions = ['Nuts', 'Gluten', 'Dairy', 'Soy', 'Shellfish', 'Eggs', 'Peanuts', 'Fish'];
const conditionOptions = ['Diabetes', 'Hypertension', 'PCOS', 'Thyroid', 'Heart Disease', 'Kidney Disease', 'Asthma', 'Arthritis'];
const dietOptions = ['vegetarian', 'vegan', 'eggetarian', 'non-veg', 'jain', 'keto', 'diabetic-friendly'];
const fitnessOptions = ['weight-loss', 'muscle-gain', 'maintenance', 'endurance'];
const activityOptions = ['sedentary', 'lightly-active', 'active', 'very-active'];

/** The same three steps as the setup wizard, named rather than numbered alone. */
const STEPS = ['Who this is for', 'Food and health', 'Day to day'] as const;

/**
 * Which step owns each field the server can reject, so a rejected field is
 * shown on a step the person can actually see.
 */
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
function GroupLabel({ children }: { children: React.ReactNode }) {
  return <legend className="mb-2 block text-label text-ink">{children}</legend>;
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
      className={cn(
        chipBase,
        selected
          ? 'bg-primary text-ink-inverse shadow-button'
          : 'bg-sunk text-ink-muted hover:text-ink border-2 border-ink/10',
      )}
    >
      {children}
    </button>
  );
}

/** Where you are in the three steps, said in words as well as in bars. */
function StepIndicator({ current }: { current: number }) {
  return (
    <div className="space-y-2">
      <p className="text-label text-ink-muted">
        Step <span className="font-mono tabular-nums">{current}</span> of{' '}
        <span className="font-mono tabular-nums">{STEPS.length}</span> · {STEPS[current - 1]}
      </p>
      <div
        className="flex gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={current}
        aria-valuetext={`Step ${current} of ${STEPS.length}: ${STEPS[current - 1]}`}
      >
        {STEPS.map((name, i) => (
          <span
            key={name}
            className={cn('h-1.5 flex-1 rounded-full', i < current ? 'bg-primary' : 'bg-sunk')}
          />
        ))}
      </div>
    </div>
  );
}

export default function EditProfilePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const profileId = searchParams.get('id');
  const { profiles, updateProfile } = useProfileStore();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<DescribedError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: '',
    age: '',
    gender: '',
    avatar: '🍎',
    dietType: 'vegetarian',
    allergies: [] as string[],
    customAllergy: '',
    conditions: [] as string[],
    customCondition: '',
    medications: [] as { name: string; dosage: string }[],
    fitnessGoal: 'maintenance',
    activityLevel: 'sedentary',
  });

  // The store hands back a new `profiles` array on every change. Without this
  // guard the effect below would re-run and overwrite whatever the person has
  // typed, so the form is seeded once per profile and then left alone.
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    if (!profileId) {
      navigate('/profile-setup');
      return;
    }
    const profile = profiles.find((p) => p._id === profileId);
    if (!profile) {
      navigate('/profile-setup');
      return;
    }
    if (seededFor.current === profileId) return;
    seededFor.current = profileId;
    setForm({
      name: profile.name || '',
      age: profile.age ? String(profile.age) : '',
      gender: profile.gender || '',
      avatar: profile.avatar || '🍎',
      dietType: profile.dietType || 'vegetarian',
      allergies: profile.allergies || [],
      customAllergy: '',
      conditions: profile.conditions || [],
      customCondition: '',
      medications: profile.medications || [],
      fitnessGoal: profile.fitnessGoal || 'maintenance',
      activityLevel: profile.activityLevel || 'sedentary',
    });
  }, [profileId, profiles, navigate]);

  const goToStep = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const toggleChip = (field: 'allergies' | 'conditions', value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v) => v !== value)
        : [...prev[field], value],
    }));
  };

  const addCustomChip = (field: 'allergies' | 'conditions') => {
    const customField = field === 'allergies' ? 'customAllergy' : 'customCondition';
    if (form[customField].trim()) {
      setForm((prev) => ({
        ...prev,
        [field]: [...prev[field], prev[customField].trim()],
        [customField]: '',
      }));
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

  const handleSave = async () => {
    if (!profileId) {
      navigate('/profile-setup');
      return;
    }
    // Previously this returned silently, so pressing Save with an empty name
    // did nothing at all and said nothing about why.
    if (!form.name.trim()) {
      setSaveFailure(null);
      setFieldErrors({ name: 'Enter a name for this profile.' });
      goToStep(1);
      return;
    }

    setSaving(true);
    setSaveFailure(null);
    setFieldErrors({});
    try {
      await updateProfile(profileId, {
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
      navigate('/');
    } catch (e) {
      const described = describeError(e);
      const fields = described.fields ?? {};
      const named = Object.keys(fields);

      // The edits stay in the form: a failed save never navigates away and
      // never resets what was typed.
      if (named.length > 0) {
        setFieldErrors(fields);
        goToStep(Math.min(...named.map((field) => stepForField[field] ?? step)));
      } else {
        setSaveFailure(described);
      }
    } finally {
      // Always cleared, so a failure never leaves the button spinning.
      setSaving(false);
    }
  };

  const stepVariants = stepMotion(direction);

  return (
    <div className="min-h-screen bg-ground px-4 py-8 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-lg space-y-6">
        <motion.header variants={rise} initial="hidden" animate="visible" transition={transition(durations.enter)}>
          <Button variant="ghost" size="sm" onClick={() => navigate('/profile-setup')} className="-ml-3">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to profiles
          </Button>
          <h1 className="mt-4 font-display text-display text-ink text-balance">
            {form.name ? `${form.name}'s details` : 'Edit this profile'}
          </h1>
          <p className="mt-3 max-w-reading text-body-lg text-ink-muted">
            Keep this up to date and everything we check — labels, medicines, recipes — stays accurate.
          </p>
        </motion.header>

        <StepIndicator current={step} />

        <AnimatePresence mode="wait" initial={false}>
          {step === 1 && (
            <motion.div
              key="step-1"
              variants={stepVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={transition()}
            >
              <Card>
                <CardContent className="space-y-6 p-5 pt-5 sm:p-6">
                  <fieldset>
                    <GroupLabel>Pick a face for this profile</GroupLabel>
                    <div className="grid grid-cols-5 gap-2">
                      {avatarEmojis.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, avatar: emoji }))}
                          className={cn(
                            'flex min-h-[44px] items-center justify-center rounded text-2xl transition-colors duration-micro ease-entrance focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                            form.avatar === emoji ? 'bg-primary-soft ring-2 ring-primary' : 'hover:bg-sunk',
                          )}
                          aria-label={`Avatar ${emoji}`}
                          aria-pressed={form.avatar === emoji}
                        >
                          <span aria-hidden="true">{emoji}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <Field htmlFor="edit-name" label="Name" required error={fieldErrors.name}>
                    <Input
                      {...fieldAria('edit-name', { error: fieldErrors.name })}
                      invalid={Boolean(fieldErrors.name)}
                      value={form.name}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, name: e.target.value }));
                        clearFieldError('name');
                      }}
                      placeholder="Whose profile is this?"
                    />
                  </Field>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field htmlFor="edit-age" label="Age" error={fieldErrors.age}>
                      <Input
                        {...fieldAria('edit-age', { error: fieldErrors.age })}
                        invalid={Boolean(fieldErrors.age)}
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={form.age}
                        onChange={(e) => {
                          setForm((p) => ({ ...p, age: e.target.value }));
                          clearFieldError('age');
                        }}
                        placeholder="Years"
                        className="font-mono tabular-nums"
                      />
                    </Field>

                    <Field htmlFor="edit-gender" label="Gender" error={fieldErrors.gender}>
                      <select
                        {...fieldAria('edit-gender', { error: fieldErrors.gender })}
                        value={form.gender}
                        onChange={(e) => {
                          setForm((p) => ({ ...p, gender: e.target.value }));
                          clearFieldError('gender');
                        }}
                        className={cn(
                          'h-12 w-full rounded border-2 bg-surface px-3 text-body text-ink transition-colors duration-micro ease-entrance focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                          fieldErrors.gender ? 'border-danger bg-danger-soft/50' : 'border-ink/15 hover:border-ink/30',
                        )}
                      >
                        <option value="">Prefer not to say</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </Field>
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
                </CardContent>
              </Card>
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
            >
              <Card>
                <CardContent className="space-y-6 p-5 pt-5 sm:p-6">
                  <fieldset>
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
                    <FieldError id="edit-diet-error" message={fieldErrors.dietType} />
                  </fieldset>

                  <fieldset className="space-y-3">
                    <GroupLabel>Allergies</GroupLabel>
                    <p className="text-caption text-ink-muted">
                      This is the first list we check every label against, so it's worth getting right.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {allergyOptions.map((allergy) => (
                        <Chip
                          key={allergy}
                          selected={form.allergies.includes(allergy)}
                          onClick={() => toggleChip('allergies', allergy)}
                        >
                          {allergy}
                        </Chip>
                      ))}
                    </div>
                    {form.allergies.filter((a) => !allergyOptions.includes(a)).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {form.allergies
                          .filter((a) => !allergyOptions.includes(a))
                          .map((allergy) => (
                            <span
                              key={allergy}
                              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-2 border-danger/25 bg-danger-soft pl-3.5 pr-1 text-body text-danger-ink"
                            >
                              <span className="max-w-[160px] truncate">{allergy}</span>
                              <button
                                type="button"
                                onClick={() => toggleChip('allergies', allergy)}
                                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-danger/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                aria-label={`Remove ${allergy}`}
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </span>
                          ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input
                        id="edit-custom-allergy"
                        aria-label="Another allergy"
                        placeholder="Something else? Type it and press enter"
                        value={form.customAllergy}
                        onChange={(e) => setForm((p) => ({ ...p, customAllergy: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomChip('allergies'))}
                        invalid={Boolean(fieldErrors.allergies)}
                        aria-describedby={fieldErrors.allergies ? 'edit-allergies-error' : undefined}
                      />
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => addCustomChip('allergies')}
                        aria-label="Add this allergy"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                    <FieldError id="edit-allergies-error" message={fieldErrors.allergies} />
                  </fieldset>

                  <fieldset className="space-y-3">
                    <GroupLabel>Anything you're managing</GroupLabel>
                    <div className="flex flex-wrap gap-2">
                      {conditionOptions.map((condition) => (
                        <Chip
                          key={condition}
                          selected={form.conditions.includes(condition)}
                          onClick={() => toggleChip('conditions', condition)}
                        >
                          {condition}
                        </Chip>
                      ))}
                    </div>
                    {form.conditions.filter((c) => !conditionOptions.includes(c)).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {form.conditions
                          .filter((c) => !conditionOptions.includes(c))
                          .map((condition) => (
                            <span
                              key={condition}
                              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-2 border-ink/10 bg-sunk pl-3.5 pr-1 text-body text-ink"
                            >
                              <span className="max-w-[160px] truncate">{condition}</span>
                              <button
                                type="button"
                                onClick={() => toggleChip('conditions', condition)}
                                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                aria-label={`Remove ${condition}`}
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </span>
                          ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input
                        id="edit-custom-condition"
                        aria-label="Another condition"
                        placeholder="Something else? Type it and press enter"
                        value={form.customCondition}
                        onChange={(e) => setForm((p) => ({ ...p, customCondition: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomChip('conditions'))}
                        invalid={Boolean(fieldErrors.conditions)}
                        aria-describedby={fieldErrors.conditions ? 'edit-conditions-error' : undefined}
                      />
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => addCustomChip('conditions')}
                        aria-label="Add this condition"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                    <FieldError id="edit-conditions-error" message={fieldErrors.conditions} />
                  </fieldset>

                  <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => goToStep(1)} className="flex-1">
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
                    </Button>
                    <Button onClick={() => goToStep(3)} className="flex-1">
                      Next <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
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
            >
              <Card>
                <CardContent className="space-y-6 p-5 pt-5 sm:p-6">
                  <fieldset className="space-y-3">
                    <GroupLabel>Medicines you take</GroupLabel>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-caption text-ink-muted">
                        We use these to flag foods and supplements that don't sit well with them.
                      </p>
                      <Button variant="ghost" size="sm" onClick={addMedication} className="flex-shrink-0">
                        <Plus className="h-4 w-4" aria-hidden="true" /> Add one
                      </Button>
                    </div>
                    {form.medications.length === 0 ? (
                      <p className="text-body text-ink-faint">Nothing listed yet.</p>
                    ) : (
                      <ul className="divide-y divide-line border-y border-line">
                        {form.medications.map((med, i) => (
                          <li key={i} className="flex flex-wrap items-center gap-2 py-3">
                            <Input
                              placeholder="Medicine name"
                              aria-label={`Medicine ${i + 1} name`}
                              value={med.name}
                              onChange={(e) => updateMedication(i, 'name', e.target.value)}
                              className="min-w-[9rem] flex-1"
                            />
                            <Input
                              placeholder="Dosage"
                              aria-label={`Medicine ${i + 1} dosage`}
                              value={med.dosage}
                              onChange={(e) => updateMedication(i, 'dosage', e.target.value)}
                              className="min-w-[6rem] flex-1 font-mono"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeMedication(i)}
                              aria-label={`Remove medicine ${med.name || i + 1}`}
                            >
                              <X className="h-4 w-4 text-danger" aria-hidden="true" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <FieldError id="edit-medications-error" message={fieldErrors.medications} />
                  </fieldset>

                  <fieldset>
                    <GroupLabel>What you're working towards</GroupLabel>
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
                    <FieldError id="edit-fitness-error" message={fieldErrors.fitnessGoal} />
                  </fieldset>

                  <fieldset>
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
                    <FieldError id="edit-activity-error" message={fieldErrors.activityLevel} />
                  </fieldset>

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
                      <Check className="h-4 w-4" aria-hidden="true" /> Save changes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
