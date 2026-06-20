export interface ProfileCompletionResult {
  percentage: number;
  completed: string[];
  missing: string[];
}

export function calculateProfileCompletion(profile: any): ProfileCompletionResult {
  const fields: [string, boolean][] = [
    ['name', !!profile.name],
    ['age', profile.age != null],
    ['gender', !!profile.gender],
    ['dietType', !!profile.dietType],
    ['allergies', Array.isArray(profile.allergies) && profile.allergies.length > 0],
    ['conditions', !!profile.conditions],
    ['medications', Array.isArray(profile.medications) && profile.medications.length > 0],
    ['fitnessGoal', !!profile.fitnessGoal],
    ['activityLevel', !!profile.activityLevel],
  ];

  const completed = fields.filter(([, filled]) => filled).map(([name]) => name);
  const missing = fields.filter(([, filled]) => !filled).map(([name]) => name);

  return {
    percentage: Math.round((completed.length / 9) * 100),
    completed,
    missing,
  };
}
