export interface ProfileCompletionResult {
  percentage: number;
  completed: string[];
  missing: string[];
}

export function calculateProfileCompletion(profile: any): ProfileCompletionResult {
  // An empty array is not a filled-in field: `!!profile.conditions` is true for
  // `[]`, so a profile that had never recorded a condition was counted as
  // having answered that question.
  const filledList = (value: unknown): boolean => Array.isArray(value) && value.length > 0;

  const fields: [string, boolean][] = [
    ['name', !!profile.name],
    ['age', profile.age != null],
    ['gender', !!profile.gender],
    ['dietType', !!profile.dietType],
    ['allergies', filledList(profile.allergies)],
    ['conditions', filledList(profile.conditions)],
    ['medications', filledList(profile.medications)],
    ['fitnessGoal', !!profile.fitnessGoal],
    ['activityLevel', !!profile.activityLevel],
  ];

  const completed = fields.filter(([, filled]) => filled).map(([name]) => name);
  const missing = fields.filter(([, filled]) => !filled).map(([name]) => name);

  return {
    percentage: Math.round((completed.length / fields.length) * 100),
    completed,
    missing,
  };
}
