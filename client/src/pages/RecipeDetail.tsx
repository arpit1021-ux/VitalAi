import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, UtensilsCrossed } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useProfileStore } from '@/stores/profileStore';
import { dashboardExtended } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CitationsBar } from '@/components/shared/CitationsBar';
import { DisclaimerBanner } from '@/components/shared/DisclaimerBanner';
import { EmptyState } from '@/components/shared/EmptyState';
import { SectionBoundary } from '@/components/shared/SectionBoundary';
import { rise, stagger, transition, durations } from '@/lib/motion';

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

interface RagSource {
  source: string;
  topic?: string;
}

interface ExpandedRecipeResponse {
  recipe?: ExpandedRecipe;
  ragSources?: RagSource[] | null;
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

  const recipeQuery = useQuery<ExpandedRecipeResponse>({
    queryKey: ['recipe-expand', activeProfile?._id, state?.name],
    queryFn: () =>
      dashboardExtended
        .expandRecipe(activeProfile!._id, state!.name, state!.description || '')
        .then((r) => r.data),
    enabled: !!activeProfile && !!state?.name,
    retry: 1,
  });

  const handleCookWithPantry = (recipe: ExpandedRecipe) => {
    navigate('/pantry', {
      state: {
        targetRecipe: {
          name: recipe.name || state?.name || '',
          ingredients: recipe.ingredients || [],
        },
      },
    });
  };

  if (!state?.name) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <motion.header variants={rise} initial="hidden" animate="visible" transition={transition(durations.enter)}>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-3 mb-4">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
        </Button>

        <div className="flex items-start gap-3">
          {/* The emoji belongs to the recipe the model wrote — it is content. */}
          {state.emoji && <span className="text-4xl leading-none">{state.emoji}</span>}
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-display text-ink text-balance break-words">{state.name}</h1>
            {state.description && (
              <p className="mt-3 max-w-reading text-body-lg text-ink-muted break-words">{state.description}</p>
            )}
          </div>
          {state.prepTime && (
            <Badge variant="neutral" className="flex-shrink-0">
              <Clock className="h-3 w-3" aria-hidden="true" />
              <span className="font-mono tabular-nums">{state.prepTime}</span>
            </Badge>
          )}
        </div>
      </motion.header>

      <SectionBoundary
        query={recipeQuery}
        band="explained"
        loadingLabel="Writing out the full recipe…"
        isEmpty={(d) => !d.recipe}
        empty={
          <EmptyState
            icon={UtensilsCrossed}
            title="We couldn't write this one out"
            description="The full version of this recipe didn't come through. Go back and pick another, or come back to this one later."
            actionLabel="Back to recipes"
            onAction={() => navigate(-1)}
          />
        }
      >
        {({ recipe, ragSources }) => recipe == null ? null : (
          <motion.div variants={stagger()} initial="hidden" animate="visible" className="space-y-6">
            {(recipe.dietary_tags?.length > 0 || recipe.serves) && (
              <motion.div
                variants={rise}
                transition={transition(durations.enter)}
                className="flex flex-wrap items-center gap-2"
              >
                {recipe.dietary_tags?.map((tag: string, j: number) => (
                  <Badge key={j} variant="outline">{tag}</Badge>
                ))}
                {recipe.serves && (
                  <span className="text-caption text-ink-muted">
                    Serves <span className="font-mono tabular-nums">{recipe.serves}</span>
                  </span>
                )}
              </motion.div>
            )}

            {recipe.ingredients?.length > 0 && (
              <motion.section
                variants={rise}
                transition={transition(durations.enter)}
                aria-labelledby="recipe-ingredients"
                className="border-t border-line pt-6"
              >
                <h2 id="recipe-ingredients" className="text-heading text-ink">What you need</h2>
                <ul className="mt-3 divide-y divide-line border-y border-line">
                  {recipe.ingredients.map((ing: string, j: number) => (
                    <li key={j} className="py-2.5 text-body-lg text-ink break-words">{ing}</li>
                  ))}
                </ul>
              </motion.section>
            )}

            {recipe.instructions?.length > 0 && (
              <motion.section
                variants={rise}
                transition={transition(durations.enter)}
                aria-labelledby="recipe-steps"
                className="border-t border-line pt-6"
              >
                <h2 id="recipe-steps" className="text-heading text-ink">How you make it</h2>
                <ol className="mt-3 space-y-4">
                  {recipe.instructions.map((stepText: string, j: number) => (
                    <li key={j} className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft font-mono text-figure text-primary-ink"
                      >
                        {j + 1}
                      </span>
                      <span className="max-w-reading text-body-lg text-ink break-words">{stepText}</span>
                    </li>
                  ))}
                </ol>
              </motion.section>
            )}

            {recipe.health_benefits && (
              <motion.section
                variants={rise}
                transition={transition(durations.enter)}
                aria-labelledby="recipe-benefits"
                className="rounded-md bg-primary-soft p-5"
              >
                <h2 id="recipe-benefits" className="text-heading text-primary-ink">Why this is good for you</h2>
                <p className="mt-2 max-w-reading text-body-lg text-ink break-words">{recipe.health_benefits}</p>
              </motion.section>
            )}

            {recipe.nutrition && (
              <motion.div
                variants={rise}
                transition={transition(durations.enter)}
                className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-4 font-mono text-figure text-ink-muted"
              >
                {recipe.nutrition.calories && <span>~{recipe.nutrition.calories} cal</span>}
                {recipe.nutrition.protein && <span>{recipe.nutrition.protein}g protein</span>}
                {recipe.nutrition.carbs && <span>{recipe.nutrition.carbs}g carbs</span>}
                {recipe.nutrition.fat && <span>{recipe.nutrition.fat}g fat</span>}
              </motion.div>
            )}

            <CitationsBar sources={[]} ragSources={ragSources} />

            <motion.div variants={rise} transition={transition(durations.enter)}>
              <Button onClick={() => handleCookWithPantry(recipe)} className="w-full" size="lg">
                Cook this from what I've got
              </Button>
            </motion.div>

            <DisclaimerBanner />
          </motion.div>
        )}
      </SectionBoundary>
    </div>
  );
}
