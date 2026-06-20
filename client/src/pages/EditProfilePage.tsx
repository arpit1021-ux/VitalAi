import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Plus, X, Check, Loader2 } from 'lucide-react';
import { useProfileStore } from '@/stores/profileStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

const avatarEmojis = ['🍎', '💪', '🧘', '🏃‍♀️', '🧠', '❤️', '🥗', '💊', '🩺', '🥦', '🏋️', '🚴', '🧑‍⚕️', '🫀', '🦷', '🌙', '☀️', '🫁', '🦴', '👁️'];

const allergyOptions = ['Nuts', 'Gluten', 'Dairy', 'Soy', 'Shellfish', 'Eggs', 'Peanuts', 'Fish'];
const conditionOptions = ['Diabetes', 'Hypertension', 'PCOS', 'Thyroid', 'Heart Disease', 'Kidney Disease', 'Asthma', 'Arthritis'];
const dietOptions = ['vegetarian', 'vegan', 'eggetarian', 'non-veg', 'jain', 'keto', 'diabetic-friendly'];
const fitnessOptions = ['weight-loss', 'muscle-gain', 'maintenance', 'endurance'];
const activityOptions = ['sedentary', 'lightly-active', 'active', 'very-active'];

export default function EditProfilePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const profileId = searchParams.get('id');
  const { profiles, updateProfile } = useProfileStore();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
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

  const handleSave = async () => {
    if (!profileId || !form.name.trim()) return;
    setSaving(true);
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
    } catch {
      alert('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 lg:p-8">
      <div className="max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <button
            onClick={() => navigate('/profile-setup')}
            className="flex items-center gap-2 text-text-muted hover:text-text-primary mb-6 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to profiles
          </button>
          <h1 className="text-3xl font-bold text-text-primary mb-2">Edit Profile</h1>
          <p className="text-text-muted mb-8">Update health information for better recommendations</p>
        </motion.div>

        {step === 1 && (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <Card>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm text-text-muted">Choose Avatar</label>
                  <div className="grid grid-cols-5 gap-2">
                    {avatarEmojis.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => setForm((p) => ({ ...p, avatar: emoji }))}
                        className={`text-2xl p-2 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                          form.avatar === emoji ? 'bg-primary/20 ring-2 ring-primary' : 'hover:bg-surface'
                        }`}
                        aria-label={`Select ${emoji} as avatar`}
                        aria-pressed={form.avatar === emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="edit-name" className="text-sm text-text-muted">Name</label>
                  <Input
                    id="edit-name"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Enter name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="edit-age" className="text-sm text-text-muted">Age</label>
                    <Input
                      id="edit-age"
                      type="number"
                      value={form.age}
                      onChange={(e) => setForm((p) => ({ ...p, age: e.target.value }))}
                      placeholder="Age"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="edit-gender" className="text-sm text-text-muted">Gender</label>
                    <select
                      id="edit-gender"
                      value={form.gender}
                      onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}
                      className="flex h-10 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <Button onClick={() => setStep(2)} className="w-full" disabled={!form.name.trim()}>
                  Next <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <Card>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm text-text-muted">Diet Type</label>
                  <div className="flex flex-wrap gap-2">
                    {dietOptions.map((diet) => (
                      <button
                        key={diet}
                        onClick={() => setForm((p) => ({ ...p, dietType: diet }))}
                        className={`px-3 py-1.5 rounded-full text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                          form.dietType === diet ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:text-text-primary'
                        }`}
                        aria-pressed={form.dietType === diet}
                      >
                        {diet}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-text-muted">Allergies</label>
                  <div className="flex flex-wrap gap-2">
                    {allergyOptions.map((allergy) => (
                      <button
                        key={allergy}
                        onClick={() => toggleChip('allergies', allergy)}
                        className={`px-3 py-1.5 rounded-full text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                          form.allergies.includes(allergy) ? 'bg-danger text-white' : 'bg-surface text-text-muted hover:text-text-primary'
                        }`}
                        aria-pressed={form.allergies.includes(allergy)}
                      >
                        {allergy}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Custom allergy"
                      value={form.customAllergy}
                      onChange={(e) => setForm((p) => ({ ...p, customAllergy: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomChip('allergies'))}
                    />
                    <Button variant="outline" size="icon" onClick={() => addCustomChip('allergies')} aria-label="Add custom allergy">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-text-muted">Conditions</label>
                  <div className="flex flex-wrap gap-2">
                    {conditionOptions.map((condition) => (
                      <button
                        key={condition}
                        onClick={() => toggleChip('conditions', condition)}
                        className={`px-3 py-1.5 rounded-full text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                          form.conditions.includes(condition) ? 'bg-warning text-black' : 'bg-surface text-text-muted hover:text-text-primary'
                        }`}
                        aria-pressed={form.conditions.includes(condition)}
                      >
                        {condition}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Custom condition"
                      value={form.customCondition}
                      onChange={(e) => setForm((p) => ({ ...p, customCondition: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomChip('conditions'))}
                    />
                    <Button variant="outline" size="icon" onClick={() => addCustomChip('conditions')} aria-label="Add custom condition">
                      <Plus className="h-4 w-4" />
                    </Button>
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
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <Card>
              <CardContent className="p-6 space-y-6">
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
                      <Button variant="ghost" size="icon" onClick={() => removeMedication(i)} aria-label={`Remove medication ${med.name || i + 1}`}>
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
                        className={`px-3 py-1.5 rounded-full text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                          form.fitnessGoal === goal ? 'bg-secondary text-white' : 'bg-surface text-text-muted hover:text-text-primary'
                        }`}
                        aria-pressed={form.fitnessGoal === goal}
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
                        className={`px-3 py-1.5 rounded-full text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                          form.activityLevel === level ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:text-text-primary'
                        }`}
                        aria-pressed={form.activityLevel === level}
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
                  <Button onClick={handleSave} className="flex-1" disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" /> Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
