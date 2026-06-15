import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, X, ArrowRight, ArrowLeft, Check, Pencil } from 'lucide-react';
import { useProfileStore } from '@/stores/profileStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const avatarEmojis = ['🍎', '💪', '🧘', '🏃‍♀️', '🧠', '❤️', '🥗', '💊', '🩺', '🥦', '🏋️', '🚴', '🧑‍⚕️', '🫀', '🦷', '🌙', '☀️', '🫁', '🦴', '👁️'];

const allergyOptions = ['Nuts', 'Gluten', 'Dairy', 'Soy', 'Shellfish', 'Eggs', 'Peanuts', 'Fish'];
const conditionOptions = ['Diabetes', 'Hypertension', 'PCOS', 'Thyroid', 'Heart Disease', 'Kidney Disease', 'Asthma', 'Arthritis'];
const dietOptions = ['vegetarian', 'vegan', 'non-veg', 'jain', 'keto', 'diabetic-friendly'];
const fitnessOptions = ['weight-loss', 'muscle-gain', 'maintenance', 'endurance'];
const activityOptions = ['sedentary', 'lightly-active', 'active', 'very-active'];

export default function ProfileSetupPage() {
  const navigate = useNavigate();
  const { profiles, addProfile, setActiveProfile } = useProfileStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [step, setStep] = useState(1);
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
    activityLevel: 'moderately-active',
  });

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
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-text-primary mb-2">Health Profiles</h1>
        <p className="text-text-muted mb-8">Create profiles for personalized health insights</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-8">
          {profiles.map((profile) => (
            <motion.div key={profile._id} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Card
                className="cursor-pointer text-center hover:border-primary/50 transition-colors relative group"
              >
                <CardContent className="p-6">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/profile/edit?id=${profile._id}`);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface"
                    aria-label={`Edit ${profile.name}'s profile`}
                  >
                    <Pencil className="h-3.5 w-3.5 text-text-muted" />
                  </button>
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
                <div className="flex flex-wrap gap-2">
                  {allergyOptions.map((allergy) => (
                    <button
                      key={allergy}
                      onClick={() => toggleChip('allergies', allergy)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                        form.allergies.includes(allergy) ? 'bg-danger text-white' : 'bg-surface text-text-muted hover:text-text-primary'
                      }`}
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
                  <Button variant="outline" size="icon" onClick={() => addCustomChip('allergies')}>
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
                      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                        form.conditions.includes(condition) ? 'bg-warning text-black' : 'bg-surface text-text-muted hover:text-text-primary'
                      }`}
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
                  <Button variant="outline" size="icon" onClick={() => addCustomChip('conditions')}>
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
