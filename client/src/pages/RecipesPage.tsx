import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChefHat, Search, Trash2, Filter, Clock, Bookmark, Plus } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProfileStore } from '@/stores/profileStore';
import { savedRecipes } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';

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

const dietFilters = ['all', 'vegetarian', 'vegan', 'eggetarian', 'non-veg'];

export default function RecipesPage() {
  const { activeProfile } = useProfileStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dietFilter, setDietFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['savedRecipes', activeProfile?._id, dietFilter, search],
    queryFn: () =>
      savedRecipes
        .getAll(activeProfile!._id, {
          diet: dietFilter === 'all' ? undefined : dietFilter,
          search: search || undefined,
        })
        .then((r) => r.data),
    enabled: !!activeProfile,
  });

  const { mutate: deleteRecipe } = useMutation({
    mutationFn: (id: string) => savedRecipes.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['savedRecipes'] }),
  });

  const recipes: Recipe[] = data?.recipes || [];

  return (
    <div className="max-w-4xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Recipes & List</h1>
            <p className="text-text-muted">Browse and save your favorite recipes</p>
          </div>
          <Badge variant="secondary" className="gap-1">
            <Bookmark className="h-3 w-3" /> {recipes.length} saved
          </Badge>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-4"
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <Input
              placeholder="Search recipes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <Tabs value={dietFilter} onValueChange={setDietFilter}>
          <TabsList>
            {dietFilters.map((d) => (
              <TabsTrigger key={d} value={d} className="capitalize">
                {d === 'all' ? 'All' : d}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </motion.div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-5 w-40 mb-3" />
                <Skeleton className="h-3 w-full mb-2" />
                <Skeleton className="h-3 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : recipes.length === 0 ? (
        <EmptyState
          icon={ChefHat}
          title="No saved recipes yet"
          description="Generate recipes from your pantry or dinner ideas, then save them here."
          actionLabel="Go to Pantry"
          onAction={() => (window.location.href = '/pantry')}
        />
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {recipes.map((recipe, i) => (
              <motion.div
                key={recipe._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {recipe.emoji && (
                          <span className="text-2xl">{recipe.emoji}</span>
                        )}
                        <div>
                          <CardTitle className="text-base">{recipe.name}</CardTitle>
                          {recipe.description && (
                            <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{recipe.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {recipe.prepTime && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Clock className="h-3 w-3" /> {recipe.prepTime}
                          </Badge>
                        )}
                        <button
                          onClick={() => deleteRecipe(recipe._id)}
                          className="p-1.5 rounded-lg hover:bg-danger/10 transition-colors"
                          aria-label="Remove recipe"
                        >
                          <Trash2 className="h-4 w-4 text-danger" />
                        </button>
                      </div>
                    </div>
                    {recipe.dietaryTags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {recipe.dietaryTags.map((tag, j) => (
                          <Badge key={j} variant="secondary" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="pt-0">
                    <button
                      onClick={() => setExpandedId(expandedId === recipe._id ? null : recipe._id)}
                      className="text-xs text-primary hover:text-primary/80 transition-colors"
                    >
                      {expandedId === recipe._id ? 'Hide details' : 'Show details'}
                    </button>

                    <AnimatePresence>
                      {expandedId === recipe._id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 space-y-4">
                            {recipe.serves && (
                              <p className="text-xs text-text-muted">Serves {recipe.serves}</p>
                            )}

                            {recipe.ingredients?.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-text-muted mb-2">Ingredients</p>
                                <ul className="text-sm text-text-primary space-y-1">
                                  {recipe.ingredients.map((ing, j) => (
                                    <li key={j} className="flex items-start gap-2">
                                      <span className="text-primary mt-1">•</span> {ing}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {recipe.instructions?.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-text-muted mb-2">Steps</p>
                                <ol className="text-sm text-text-primary space-y-2">
                                  {recipe.instructions.map((step, j) => (
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

                            {recipe.healthBenefits && (
                              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                                <p className="text-xs font-medium text-primary mb-1">Why this is good for you</p>
                                <p className="text-sm text-text-primary">{recipe.healthBenefits}</p>
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
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
