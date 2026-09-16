import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChefHat, Search, Trash2, Clock, Bookmark, ChevronDown, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProfileStore } from '@/stores/profileStore';
import { savedRecipes } from '@/lib/api';

import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { SectionBoundary } from '@/components/shared/SectionBoundary';
import { describeError, isCancellation } from '@/lib/errors';
import { Skeleton } from '@/components/ui/skeleton';
import { rise, stagger, transition, durations } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface Recipe {
  _id: string;
  name: string;
  description?: string;
  emoji?: string;
  prepTime?: string;
  serves?: string;
  dietaryTags: string[];
  ingredients: string[];
  instructions: string[];
  healthBenefits?: string;
  nutrition?: { calories?: number; protein?: number; carbs?: number; fat?: number };
  source: string;
  createdAt: string;
}

interface SavedRecipes {
  recipes?: Recipe[];
}

const dietFilters = ['all', 'vegetarian', 'vegan', 'eggetarian', 'non-veg'];

function RecipeListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5 pt-5 sm:p-6">
            <Skeleton className="mb-3 h-5 w-40" />
            <Skeleton className="mb-2 h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function RecipesPage() {
  const navigate = useNavigate();
  const { activeProfile } = useProfileStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dietFilter, setDietFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteFailure, setDeleteFailure] = useState<{ id: string; error: unknown } | null>(null);

  const recipesQuery = useQuery<SavedRecipes>({
    queryKey: ['savedRecipes', activeProfile?._id, dietFilter, search],
    queryFn: () =>
      savedRecipes
        .getAll(activeProfile!._id, {
          diet: dietFilter === 'all' ? undefined : dietFilter,
          search: search || undefined,
        })
        .then((r) => r.data as SavedRecipes),
    enabled: !!activeProfile,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => savedRecipes.delete(id),
    onMutate: (id) => setDeleteFailure((current) => (current?.id === id ? null : current)),
    onSuccess: () => {
      setDeleteFailure(null);
      queryClient.invalidateQueries({ queryKey: ['savedRecipes'] });
    },
    // Removing a recipe is the user's own action, so a failure belongs next to
    // the card they pressed delete on, not in a toast they may never see.
    onError: (error, id) => {
      if (isCancellation(error)) return;
      setDeleteFailure({ id, error });
    },
  });

  const savedCount = recipesQuery.data?.recipes?.length;

  return (
    <div className="space-y-8">
      <motion.header
        variants={rise}
        initial="hidden"
        animate="visible"
        transition={transition(durations.enter)}
        className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <h1 className="font-display text-display sm:text-display-lg text-ink text-balance">Recipes you've kept</h1>
          <p className="mt-3 max-w-reading text-body-lg text-ink-muted">
            Everything you've saved from the pantry and from dinner ideas, in one place.
          </p>
        </div>
        {savedCount !== undefined && (
          <Badge variant="neutral" className="flex-shrink-0 self-start sm:self-auto">
            <Bookmark className="h-3 w-3" aria-hidden="true" />
            <span className="font-mono tabular-nums">{savedCount}</span> saved
          </Badge>
        )}
      </motion.header>

      <motion.div
        variants={rise}
        initial="hidden"
        animate="visible"
        transition={transition(durations.enter)}
        className="space-y-4 border-b border-line pb-4"
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            aria-hidden="true"
          />
          <Input
            placeholder="Search what you've saved"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            aria-label="Search what you've saved"
          />
        </div>

        {/* Five filters do not fit 360px, so the strip scrolls in its own box. */}
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Tabs value={dietFilter} onValueChange={setDietFilter}>
            <TabsList className="h-auto bg-sunk p-1">
              {dietFilters.map((d) => (
                <TabsTrigger key={d} value={d} className="min-h-[44px] rounded px-4 capitalize">
                  {d === 'all' ? 'Everything' : d}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </motion.div>

      <SectionBoundary
        query={recipesQuery}
        skeleton={<RecipeListSkeleton />}
        isEmpty={(saved) => (saved.recipes?.length ?? 0) === 0}
        empty={
          <EmptyState
            icon={ChefHat}
            title="Nothing saved yet"
            description="Build a few recipes from what's in your pantry, then keep the ones you'd make again."
            actionLabel="Go to the pantry"
            onAction={() => navigate('/pantry')}
          />
        }
      >
        {(saved) => (
          <motion.ul variants={stagger()} initial="hidden" animate="visible" className="space-y-4">
            <AnimatePresence>
              {(saved.recipes ?? []).map((recipe) => {
                const expanded = expandedId === recipe._id;
                const deletingThis = deleteMutation.isPending && deleteMutation.variables === recipe._id;

                return (
                  <motion.li key={recipe._id} variants={rise} transition={transition(durations.enter)}>
                    <Card className="overflow-hidden">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            {/* The emoji comes from the recipe itself — it is
                                content, not an icon we chose. */}
                            {recipe.emoji && <span className="text-2xl leading-none">{recipe.emoji}</span>}
                            <div className="min-w-0">
                              <CardTitle className="break-words">{recipe.name}</CardTitle>
                              {recipe.description && (
                                <p className="mt-1 line-clamp-2 text-body text-ink-muted break-words">
                                  {recipe.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-2">
                            {recipe.prepTime && (
                              <Badge variant="neutral">
                                <Clock className="h-3 w-3" aria-hidden="true" />
                                <span className="font-mono tabular-nums">{recipe.prepTime}</span>
                              </Badge>
                            )}
                            <button
                              type="button"
                              onClick={() => deleteMutation.mutate(recipe._id)}
                              disabled={deletingThis}
                              className="flex h-11 w-11 items-center justify-center rounded text-danger transition-colors duration-micro ease-entrance hover:bg-danger-soft disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                              aria-label={`Remove ${recipe.name}`}
                            >
                              {deletingThis ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                              ) : (
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              )}
                            </button>
                          </div>
                        </div>

                        {recipe.dietaryTags?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {recipe.dietaryTags.map((tag, j) => (
                              <Badge key={j} variant="outline">{tag}</Badge>
                            ))}
                          </div>
                        )}

                        {deleteFailure?.id === recipe._id && (
                          <div className="mt-3">
                            <ErrorState
                              error={describeError(deleteFailure.error)}
                              onRetry={() => deleteMutation.mutate(recipe._id)}
                              retrying={deletingThis}
                            />
                          </div>
                        )}
                      </CardHeader>

                      <CardContent className="pt-0">
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : recipe._id)}
                          aria-expanded={expanded}
                          aria-controls={`recipe-${recipe._id}-details`}
                          className="-ml-2 inline-flex min-h-[44px] items-center gap-1.5 rounded px-2 text-label text-primary transition-colors duration-micro ease-entrance hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          {expanded ? 'Hide how it goes' : 'How it goes'}
                          <ChevronDown
                            className={cn('h-3.5 w-3.5 transition-transform duration-micro', expanded && 'rotate-180')}
                            aria-hidden="true"
                          />
                        </button>

                        <AnimatePresence initial={false}>
                          {expanded && (
                            <motion.div
                              id={`recipe-${recipe._id}-details`}
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={transition(durations.enter)}
                              className="overflow-hidden"
                            >
                              <div className="mt-4 space-y-5">
                                {recipe.serves && (
                                  <p className="text-caption text-ink-muted">
                                    Serves <span className="font-mono tabular-nums">{recipe.serves}</span>
                                  </p>
                                )}

                                {recipe.ingredients?.length > 0 && (
                                  <div>
                                    <p className="text-label text-ink-muted">Ingredients</p>
                                    <ul className="mt-2 divide-y divide-line border-t border-line">
                                      {recipe.ingredients.map((ing, j) => (
                                        <li key={j} className="py-2 text-body text-ink break-words">
                                          {ing}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {recipe.instructions?.length > 0 && (
                                  <div>
                                    <p className="text-label text-ink-muted">Steps</p>
                                    <ol className="mt-2 space-y-3">
                                      {recipe.instructions.map((stepText, j) => (
                                        <li key={j} className="flex items-start gap-3">
                                          <span
                                            aria-hidden="true"
                                            className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft font-mono text-caption text-primary-ink"
                                          >
                                            {j + 1}
                                          </span>
                                          <span className="text-body-lg text-ink break-words">{stepText}</span>
                                        </li>
                                      ))}
                                    </ol>
                                  </div>
                                )}

                                {recipe.healthBenefits && (
                                  <div className="rounded-md bg-primary-soft p-4">
                                    <p className="text-label text-primary-ink">Why this is good for you</p>
                                    <p className="mt-1 text-body text-ink break-words">{recipe.healthBenefits}</p>
                                  </div>
                                )}

                                {recipe.nutrition && (
                                  <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-figure text-ink-muted">
                                    {recipe.nutrition.calories && <span>~{recipe.nutrition.calories} cal</span>}
                                    {recipe.nutrition.protein && <span>{recipe.nutrition.protein}g protein</span>}
                                    {recipe.nutrition.carbs && <span>{recipe.nutrition.carbs}g carbs</span>}
                                    {recipe.nutrition.fat && <span>{recipe.nutrition.fat}g fat</span>}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </CardContent>
                    </Card>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </motion.ul>
        )}
      </SectionBoundary>
    </div>
  );
}
