import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, AlertTriangle, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useProfileStore } from '@/stores/profileStore';
import { dashboardExtended } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CitationsBar } from '@/components/shared/CitationsBar';
import { DisclaimerBanner } from '@/components/shared/DisclaimerBanner';

interface RecipeState {
  name: string;
  description: string;
  emoji?: string;
  prepTime?: string;
}

interface ExpandedRecipe {
  name: string;
  description: string;
  ingredients: string[];
  instructions: string[];
  health_benefits: string;
  preparation_time: string;
  serves: string;
  dietary_tags: string[];
  nutrition: {
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
  };
}

function LoadingSkeleton() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Skeleton className="h-8 w-32" />
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
          <div className="flex gap-2 mt-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RecipeDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeProfile } = useProfileStore();

  const state = location.state as RecipeState | null;

  useEffect(() => {
    if (!state?.name) {
      navigate('/dashboard', { replace: true });
    }
  }, [state, navigate]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['recipe-expand', activeProfile?._id, state?.name],
    queryFn: () =>
      dashboardExtended
        .expandRecipe(activeProfile!._id, state!.name, state!.description || '')
        .then((r) => r.data),
    enabled: !!activeProfile && !!state?.name,
    retry: 1,
  });

  const recipe: ExpandedRecipe | undefined = data?.recipe;
  const ragSources = data?.ragSources;

  const handleCookWithPantry = () => {
    navigate('/pantry', {
      state: {
        targetRecipe: {
          name: recipe?.name || state?.name || '',
          ingredients: recipe?.ingredients || [],
        },
      },
    });
  };

  if (!state?.name) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-4 gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <div className="flex items-center gap-3 mb-2">
          {state.emoji && <span className="text-4xl">{state.emoji}</span>}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-text-primary">{state.name}</h1>
            {state.description && (
              <p className="text-text-muted mt-1">{state.description}</p>
            )}
          </div>
          {state.prepTime && (
            <Badge variant="outline" className="text-xs flex-shrink-0">⏱️ {state.prepTime}</Badge>
          )}
        </div>
      </motion.div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : error ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardContent className="p-6 text-center">
              <AlertTriangle className="h-10 w-10 text-warning mx-auto mb-3" />
              <p className="text-text-primary font-medium mb-1">Failed to load recipe details</p>
              <p className="text-sm text-text-muted mb-4">
                We couldn't expand this recipe. Please try again.
              </p>
              <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-2">
                <RefreshCw className="h-4 w-4" /> Retry
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : recipe ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4"
        >
          <Card>
            <CardHeader>
              {recipe.dietary_tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {recipe.dietary_tags.map((tag: string, j: number) => (
                    <Badge key={j} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {recipe.serves && (
                <p className="text-xs text-text-muted">Serves {recipe.serves}</p>
              )}

              {recipe.ingredients?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-text-muted mb-2">Ingredients</p>
                  <ul className="text-sm text-text-primary space-y-1">
                    {recipe.ingredients.map((ing: string, j: number) => (
                      <li key={j} className="flex items-start gap-2">
                        <span className="text-primary mt-1">•</span>
                        {ing}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {recipe.instructions?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-text-muted mb-2">Steps</p>
                  <ol className="text-sm text-text-primary space-y-2">
                    {recipe.instructions.map((step: string, j: number) => (
                      <li key={j} className="flex items-start gap-3">
                        <span className="h-5 w-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-medium">
                          {j + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {recipe.health_benefits && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-xs font-medium text-primary mb-1">Why this is good for you</p>
                  <p className="text-sm text-text-primary">{recipe.health_benefits}</p>
                </div>
              )}

              {recipe.nutrition && (
                <div className="flex gap-4 text-xs text-text-muted">
                  {recipe.nutrition.calories && <span>~{recipe.nutrition.calories} cal</span>}
                  {recipe.nutrition.protein && <span>{recipe.nutrition.protein}g protein</span>}
                  {recipe.nutrition.carbs && <span>{recipe.nutrition.carbs}g carbs</span>}
                  {recipe.nutrition.fat && <span>{recipe.nutrition.fat}g fat</span>}
                </div>
              )}
            </CardContent>
          </Card>

          <CitationsBar sources={[]} ragSources={ragSources} />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Button onClick={handleCookWithPantry} className="w-full" size="lg">
              Cook using my pantry
            </Button>
          </motion.div>

          <DisclaimerBanner />
        </motion.div>
      ) : null}
    </div>
  );
}
