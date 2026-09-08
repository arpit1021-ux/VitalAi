import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, X, ArrowRight, ArrowLeft, Check, Pencil, Trash2 } from 'lucide-react';
import { useProfileStore } from '@/stores/profileStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const avatarEmojis = ['🍎', '💪', '🧘', '🏃‍♀️', '🧠', '❤️', '🥗', '💊', '🩺', '🥦', '🏋️', '🚴', '🧑‍⚕️', '🫀', '🦷', '🌙', '☀️', '🫁', '🦴', '👁️'];

const presetAllergies = ['Nuts', 'Gluten', 'Dairy', 'Soy', 'Shellfish', 'Eggs', 'Peanuts', 'Fish', 'Wheat', 'Sesame'];
const conditionOptions = ['Diabetes', 'Hypertension', 'PCOS', 'Thyroid', 'Heart Disease', 'Kidney Disease', 'Asthma', 'Arthritis'];
const dietOptions = ['vegetarian', 'vegan', 'eggetarian', 'non-veg', 'jain', 'keto', 'diabetic-friendly'];
const fitnessOptions = ['weight-loss', 'muscle-gain', 'maintenance', 'endurance'];
const activityOptions = ['sedentary', 'lightly-active', 'active', 'very-active'];

export default function ProfileSetupPage() {
  const navigate = useNavigate();
  const { profiles, addProfile, removeProfile, setActiveProfile } = useProfileStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [allergyInput, setAllergyInput] = useState('');
  const [step, setStep] = useState(1);
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

  const handleSave = async () => {
    try {
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
      navigate('/');
    } catch (e) {
      alert('Failed to save profile. Please try again.');
    }
  };

  const handleDelete = async (profileId: string) => {
    await removeProfile(profileId);
    setShowDeleteConfirm(null);
  };

  // Deleting the last profile would leave the account with nowhere to store
  // health data, so one must always remain.
  const canDelete = () => profiles.length > 1;

  return (
    <div className="min-h-screen bg-background p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-text-primary mb-2">Health Profiles</h1>
        <p className="text-text-muted mb-8">Create profiles for personalized health insights</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-8">
          {profiles.map((profile) => (
            <motion.div key={profile._id} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Card className="cursor-pointer text-center hover:border-primary/50 transition-colors relative group">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/profile/edit?id=${profile._id}`);
                      }}
                      className="p-1 rounded-lg hover:bg-surface transition-colors"
                      aria-label={`Edit ${profile.name}'s profile`}
                    >
                      <Pencil className="h-3.5 w-3.5 text-text-muted" />
                    </button>
                    {canDelete() ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm(profile._id);
                        }}
                        className="p-1 rounded-lg hover:bg-danger/10 transition-colors"
                        aria-label={`Delete ${profile.name}'s profile`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-danger" />
                      </button>
                    ) : (
                      <div className="w-[23px]" />
                    )}
                  </div>
                  <div
                    onClick={() => {
                      setActiveProfile(profile);
                      navigate('/');
                    }}
                    className="cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setActiveProfile(profile);
                        navigate('/');
                      }
                    }}
                  >
                    <span className="text-4xl block mb-3">{profile.avatar}</span>
                    <p className="font-medium text-text-primary">{profile.name}</p>
                    <p className="text-xs text-text-muted mt-1">
                      {profile.age ? `${profile.age} · ` : ''}{profile.dietType || 'No diet set'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}

          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Card
              className="cursor-pointer text-center border-dashed hover:border-primary/50 transition-colors min-h-[140px] flex items-center justify-center"
              onClick={() => {
                setStep(1);
                setShowCreateModal(true);
              }}
            >
              <CardContent className="p-6 flex flex-col items-center">
                <Plus className="h-8 w-8 text-text-muted mb-2" />
                <p className="text-sm text-text-muted">Add Profile</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Profile</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-muted">
            This will permanently delete this profile and all their data. This action cannot be undone.
          </p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setShowDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}
            >
              Delete Profile
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Profile Dialog */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Profile</DialogTitle>
          </DialogHeader>

          {step === 1 && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm text-text-muted">Choose Avatar</label>
                <div className="grid grid-cols-5 gap-2">
                  {avatarEmojis.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => setForm((p) => ({ ...p, avatar: emoji }))}
                      className={`text-2xl p-2 rounded-xl transition-colors ${
                        form.avatar === emoji ? 'bg-primary/20 ring-2 ring-primary' : 'hover:bg-surface'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-text-muted">Name</label>
                <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Enter name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-text-muted">Age</label>
                  <Input type="number" value={form.age} onChange={(e) => setForm((p) => ({ ...p, age: e.target.value }))} placeholder="Age" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-text-muted">Gender</label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}
                    className="flex h-10 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  >
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <Button onClick={() => setStep(2)} className="w-full" disabled={!form.name}>
                Next <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm text-text-muted">Diet Type</label>
                <div className="flex flex-wrap gap-2">
                  {dietOptions.map((diet) => (
                    <button
                      key={diet}
                      onClick={() => setForm((p) => ({ ...p, dietType: diet }))}
                      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                        form.dietType === diet ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {diet}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-text-muted">Allergies</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {form.allergies.map((allergy) => (
                    <span
                      key={allergy}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-danger/20 text-danger border border-danger/30"
                    >
                      {allergy}
                      <button onClick={() => removeAllergy(allergy)} className="hover:text-danger/80" aria-label={`Remove ${allergy}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {presetAllergies.filter((a) => !form.allergies.includes(a)).map((allergy) => (
                    <button
                      key={allergy}
                      onClick={() => addAllergy(allergy)}
                      className="px-3 py-1 rounded-full text-xs bg-surface text-text-muted hover:text-text-primary hover:border-text-muted/50 border border-border transition-colors"
                    >
                      + {allergy}
                    </button>
                  ))}
                </div>
                <Input
                  placeholder="Type allergen and press Enter"
                  value={allergyInput}
                  onChange={(e) => setAllergyInput(e.target.value)}
                  onKeyDown={handleAllergyKeyDown}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-text-muted">Conditions</label>
                <div className="flex flex-wrap gap-2">
                  {conditionOptions.map((condition) => (
                    <button
                      key={condition}
                      onClick={() => toggleCondition(condition)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                        form.conditions.includes(condition) ? 'bg-warning text-black' : 'bg-surface text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {condition}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
                <Button onClick={() => setStep(3)} className="flex-1">
                  Next <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-text-muted">Medications</label>
                  <Button variant="ghost" size="sm" onClick={addMedication}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
                {form.medications.map((med, i) => (
                  <div key={i} className="flex gap-2">
                    <Input placeholder="Medicine name" value={med.name} onChange={(e) => updateMedication(i, 'name', e.target.value)} />
                    <Input placeholder="Dosage" value={med.dosage} onChange={(e) => updateMedication(i, 'dosage', e.target.value)} />
                    <Button variant="ghost" size="icon" onClick={() => removeMedication(i)}>
                      <X className="h-4 w-4 text-danger" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <label className="text-sm text-text-muted">Fitness Goal</label>
                <div className="flex flex-wrap gap-2">
                  {fitnessOptions.map((goal) => (
                    <button
                      key={goal}
                      onClick={() => setForm((p) => ({ ...p, fitnessGoal: goal }))}
                      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                        form.fitnessGoal === goal ? 'bg-secondary text-white' : 'bg-surface text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {goal}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-text-muted">Activity Level</label>
                <div className="flex flex-wrap gap-2">
                  {activityOptions.map((level) => (
                    <button
                      key={level}
                      onClick={() => setForm((p) => ({ ...p, activityLevel: level }))}
                      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                        form.activityLevel === level ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
                <Button onClick={handleSave} className="flex-1">
                  <Check className="h-4 w-4 mr-2" /> Save Profile
                </Button>
              </div>
            </motion.div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
