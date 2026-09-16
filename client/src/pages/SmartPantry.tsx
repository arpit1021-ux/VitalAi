import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus,
  Trash2,
  ChefHat,
  Loader2,
  Package,
  Users,
  User,
  Check,
  Bookmark,
  Wheat,
  Milk,
  Salad,
  Drumstick,
  Soup,
  ShoppingBasket,
  Clock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProfileStore } from '@/stores/profileStore';
import { pantry, savedRecipes } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, fieldAria } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { SectionBoundary } from '@/components/shared/SectionBoundary';
import { DisclaimerBanner } from '@/components/shared/DisclaimerBanner';
import { CitationsBar } from '@/components/shared/CitationsBar';
import { describeError, type DescribedError } from '@/lib/errors';
import { rise, stagger, transition, durations } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface PantryItem {
  _id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  expiryDate: string;
}

/** The endpoint returns an envelope, but older responses are a bare array. */
type PantryData = { items?: PantryItem[] } | PantryItem[];

function toItems(data: PantryData | undefined): PantryItem[] {
  if (!data) return [];
  return Array.isArray(data) ? data : data.items ?? [];
}

/** Icons, not emoji: an emoji is someone else's typeface at someone else's size. */
const categories: { value: string; label: string; Icon: LucideIcon }[] = [
  { value: 'grains', label: 'Grains', Icon: Wheat },
  { value: 'dairy', label: 'Dairy', Icon: Milk },
  { value: 'produce', label: 'Produce', Icon: Salad },
  { value: 'protein', label: 'Protein', Icon: Drumstick },
  { value: 'spices', label: 'Spices', Icon: Soup },
  { value: 'other', label: 'Other', Icon: Package },
];

function parseIngredientName(ingredient: string): string {
  const cleaned = ingredient
    .replace(/\(.*?\)/g, '')
    .replace(/\b(to taste|as needed|or to taste|optional)\b/gi, '')
    .replace(/\b(\d+\/\d+|\d+)\s*(cup|cups|tbsp|tsp|tablespoon|teaspoon|oz|ounce|grams?|kg|ml|litre|liter|pound|lb|pinch|piece|pieces|clove|cloves|bunch|stalk|stalks|can|cans|slice|slices|medium|large|small)\b/gi, '')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();

  if (cleaned.length > 2) {
    const words = cleaned.split(/\s+/).filter((w: string) => w.length > 1);
    if (words.length <= 3) return words.join(' ');
    return words.slice(0, 3).join(' ');
  }

  const fallback = ingredient.replace(/\(.*?\)/g, '').replace(/^\d[\d\s/]*\w*\s*/i, '').trim();
  return fallback.length > 2 ? fallback.slice(0, 30) : ingredient.slice(0, 30);
}

export default function SmartPantry() {
  const location = useLocation();
  const { activeProfile } = useProfileStore();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [recipeFailure, setRecipeFailure] = useState<DescribedError | null>(null);
  const [addFailure, setAddFailure] = useState<DescribedError | null>(null);
  const [deleteFailure, setDeleteFailure] = useState<{ id: string; error: DescribedError } | null>(null);
  const [saveFailure, setSaveFailure] = useState<{ index: number; error: DescribedError } | null>(null);
  const [form, setForm] = useState({ name: '', quantity: '', unit: 'pieces', category: 'other', expiryDate: '' });
  const [addPrefill, setAddPrefill] = useState<string | null>(null);

  const targetRecipe = useMemo(() => {
    const state = location.state as { targetRecipe?: { name: string; ingredients: string[] } } | null;
    return state?.targetRecipe || null;
  }, [location.state]);

  const [dismissedBanner, setDismissedBanner] = useState(false);
  const showBanner = targetRecipe && !dismissedBanner;

  const pantryQuery = useQuery<PantryData>({
    queryKey: ['pantry', activeProfile?._id],
    queryFn: () => pantry.getAll(activeProfile!._id).then((r) => r.data),
    enabled: !!activeProfile,
  });

  const { mutate: addItem, isPending: adding } = useMutation({
    mutationFn: () => pantry.create({
      profileId: activeProfile!._id,
      name: form.name,
      unit: form.unit,
      category: form.category,
      quantity: Number(form.quantity) || undefined,
      // An untouched date input holds an empty string, which is not a date and
      // is not a value the server should have to interpret. Optional means
      // absent, so absent is what gets sent.
      expiryDate: form.expiryDate || undefined,
    }),
    onMutate: () => setAddFailure(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pantry', activeProfile?._id] });
      setShowAddForm(false);
      setAddPrefill(null);
      setForm({ name: '', quantity: '', unit: 'pieces', category: 'other', expiryDate: '' });
    },
    onError: (err) => setAddFailure(describeError(err)),
  });

  const {
    mutate: deleteItem,
    isPending: deleting,
    variables: deletingId,
  } = useMutation({
    mutationFn: (id: string) => pantry.delete(id),
    onMutate: () => setDeleteFailure(null),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['pantry', activeProfile?._id] });
      setSelectedItems((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    onError: (err, id) => setDeleteFailure({ id, error: describeError(err) }),
  });

  const {
    mutate: generateRecipes,
    data: recipes,
    isPending: generatingRecipes,
    variables: lastRecipeScope,
  } = useMutation({
    mutationFn: (scope: 'me' | 'family') => {
      const ids = selectedItems.size > 0 ? Array.from(selectedItems) : undefined;
      return pantry.generateRecipes(activeProfile!._id, scope, ids).then((r) => r.data);
    },
    onMutate: () => setRecipeFailure(null),
    onSuccess: () => setRecipeFailure(null),
    onError: (err) => setRecipeFailure(describeError(err)),
  });

  const [savedRecipeIds, setSavedRecipeIds] = useState<Set<number>>(new Set());

  const {
    mutate: saveRecipe,
    isPending: savingRecipe,
    variables: savingVariables,
  } = useMutation({
    mutationFn: (recipe: any) =>
      savedRecipes.save({
        profileId: activeProfile!._id,
        name: recipe.name,
        description: recipe.description,
        prepTime: recipe.preparation_time,
        serves: recipe.serves,
        dietaryTags: recipe.dietary_tags || [],
        ingredients: recipe.ingredients || [],
        instructions: recipe.instructions || [],
        healthBenefits: recipe.health_benefits,
        nutrition: recipe.nutrition,
        source: 'pantry',
      }),
    onMutate: () => setSaveFailure(null),
    onSuccess: (_data, recipe) => {
      const idx = (recipes?.recipes || recipes || []).findIndex((r: any) => r.name === recipe.name);
      if (idx >= 0) setSavedRecipeIds((prev) => new Set([...prev, idx]));
    },
    onError: (err, recipe) => {
      const idx = (recipes?.recipes || recipes || []).findIndex((r: { name?: string }) => r.name === recipe.name);
      setSaveFailure({ index: idx, error: describeError(err) });
    },
  });

  const items: PantryItem[] = toItems(pantryQuery.data);
  const sortedItems = [...items].sort((a, b) => {
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
  });

  const { matchedItemIds, missingIngredients } = useMemo(() => {
    if (!targetRecipe?.ingredients?.length) {
      return { matchedItemIds: new Set<string>(), missingIngredients: [] as string[] };
    }

    if (!items.length) {
      return { matchedItemIds: new Set<string>(), missingIngredients: targetRecipe.ingredients };
    }

    const matched = new Set<string>();
    const missing: string[] = [];

    for (const ingredient of targetRecipe.ingredients) {
      const ingredientLower = ingredient.toLowerCase();
      let found = false;

      for (const item of items) {
        const itemNameLower = item.name.toLowerCase();
        if (
          ingredientLower.includes(itemNameLower) ||
          itemNameLower.includes(ingredientLower) ||
          ingredientLower.split(/\s+/).some((word: string) => word.length > 2 && itemNameLower.includes(word))
        ) {
          matched.add(item._id);
          found = true;
          break;
        }
      }

      if (!found) {
        missing.push(ingredient);
      }
    }

    return { matchedItemIds: matched, missingIngredients: missing };
  }, [targetRecipe, items]);

  useEffect(() => {
    if (matchedItemIds.size > 0 && showBanner) {
      setSelectedItems(matchedItemIds);
    }
  }, [matchedItemIds, showBanner]);

  const allMatched = targetRecipe && missingIngredients.length === 0 && targetRecipe.ingredients.length > 0;

  const openAddWithPrefill = useCallback((ingredient: string) => {
    const name = parseIngredientName(ingredient);
    setAddPrefill(ingredient);
    setForm((p) => ({ ...p, name, category: 'other' }));
    setShowAddForm(true);
  }, []);

  const getExpiryInfo = (date: string) => {
    if (!date) return { color: 'border-l-line-strong', chip: null as string | null, chipVariant: 'outline' as const };
    const days = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return { color: 'border-l-danger', chip: 'Past its date', chipVariant: 'danger' as const };
    if (days < 3) return { color: 'border-l-caution', chip: days === 0 ? 'Use it today' : `${days}d left`, chipVariant: 'caution' as const };
    return { color: 'border-l-primary', chip: null, chipVariant: 'outline' as const };
  };

  const toggleItemSelect = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map((i) => i._id)));
    }
  };

  const nameError = addFailure?.fields?.name;
  const quantityError = addFailure?.fields?.quantity;
  const expiryError = addFailure?.fields?.expiryDate;

  return (
    <div className="space-y-8">
      <motion.header
        variants={rise}
        initial="hidden"
        animate="visible"
        transition={transition(durations.enter)}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <h1 className="font-display text-display sm:text-display-lg text-ink text-balance">Smart pantry</h1>
          <p className="mt-3 text-body-lg text-ink-muted max-w-reading">
            What's in the house, and what needs using up first. Pick a few things and we'll build dinner around them.
          </p>
        </div>
        <Button onClick={() => setShowAddForm(true)} className="flex-shrink-0 self-start sm:self-auto">
          <Plus className="h-4 w-4" aria-hidden="true" /> Add an item
        </Button>
      </motion.header>

      {showBanner && (
        <motion.section
          variants={rise}
          initial="hidden"
          animate="visible"
          transition={transition(durations.enter)}
          aria-label="Ingredients for the recipe you came from"
          className="rounded-lg border border-primary/25 bg-primary-soft p-4 sm:p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-heading text-ink">
                <ChefHat className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
                <span className="break-words">Cooking {targetRecipe.name}</span>
              </p>
              {items.length === 0 ? (
                <p className="mt-1 text-body text-ink-muted">Starting from nothing — here's what you'll need.</p>
              ) : (
                <p className="mt-1 text-body text-ink-muted">
                  We've picked out{' '}
                  <span className="font-mono tabular-nums">{matchedItemIds.size}</span>{' '}
                  {matchedItemIds.size === 1 ? 'thing' : 'things'} you already have.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setDismissedBanner(true)}
              className="-m-2 flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded p-2 text-label text-ink-muted transition-colors duration-micro ease-entrance hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Dismiss
            </button>
          </div>

          {missingIngredients.length > 0 && (
            <div className="mt-4 border-t border-primary/20 pt-4">
              <p className="flex items-center gap-2 text-label text-ink-muted">
                <ShoppingBasket className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                Still to buy — tap one to add it
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {missingIngredients.map((ing, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => openAddWithPrefill(ing)}
                    className="group inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-2 border-ink/15 bg-surface px-3.5 py-1.5 text-body text-ink transition-colors duration-micro ease-entrance hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <span className="max-w-[160px] truncate">{ing}</span>
                    <Plus className="h-3.5 w-3.5 flex-shrink-0 text-ink-muted group-hover:text-primary" aria-hidden="true" />
                    <span className="sr-only">Add {parseIngredientName(ing)} to your pantry</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.section>
      )}

      <SectionBoundary
        query={pantryQuery}
        band="inline"
        skeleton={
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-md bg-surface shadow-card animate-pulse" />
            ))}
          </div>
        }
        isEmpty={(d) => toItems(d).length === 0}
        empty={
          <EmptyState
            icon={Package}
            title="Nothing in here yet"
            description="Add what you've got in and we'll keep an eye on the dates — and suggest things to cook with it."
            actionLabel="Add the first thing"
            onAction={() => setShowAddForm(true)}
          />
        }
      >
        {() => (
          <section aria-label="What's in your pantry" className="space-y-3">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
              <p className="text-label text-ink-muted" aria-live="polite">
                {selectedItems.size > 0 ? (
                  <>
                    <span className="font-mono tabular-nums">{selectedItems.size}</span> of{' '}
                    <span className="font-mono tabular-nums">{items.length}</span> picked
                  </>
                ) : (
                  <>
                    <span className="font-mono tabular-nums">{items.length}</span>{' '}
                    {items.length === 1 ? 'item' : 'items'}
                  </>
                )}
              </p>
              <Button variant="ghost" size="sm" onClick={selectAll} className="min-h-[44px] sm:min-h-0">
                {selectedItems.size === items.length ? 'Clear the selection' : 'Pick everything'}
              </Button>
            </div>

            <motion.ul
              variants={stagger()}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              {sortedItems.map((item) => {
                const expiry = getExpiryInfo(item.expiryDate);
                const isSelected = selectedItems.has(item._id);
                const cat = categories.find((c) => c.value === item.category);
                const CatIcon = cat?.Icon ?? Package;
                const deletingThis = deleting && deletingId === item._id;

                return (
                  <motion.li key={item._id} variants={rise} transition={transition(durations.enter)}>
                    <div
                      className={cn(
                        'flex items-stretch overflow-hidden rounded-md border border-ink/[0.07] border-l-4 bg-surface shadow-card transition-shadow duration-micro ease-entrance',
                        expiry.color,
                        isSelected && 'ring-2 ring-primary',
                      )}
                    >
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleItemSelect(item._id)}
                        className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 p-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm border-2 transition-colors duration-micro ease-entrance',
                            isSelected ? 'border-primary bg-primary' : 'border-ink/30',
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3 text-ink-inverse" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <CatIcon className="h-3.5 w-3.5 flex-shrink-0 text-ink-faint" aria-hidden="true" />
                            <span className="truncate text-heading text-ink">{item.name}</span>
                          </span>
                          <span className="mt-0.5 block text-caption text-ink-muted">
                            {item.quantity ? (
                              <span className="font-mono tabular-nums">
                                {item.quantity} {item.unit}
                              </span>
                            ) : null}
                            {item.expiryDate && (
                              <>
                                {item.quantity ? ' · ' : ''}
                                use by {new Date(item.expiryDate).toLocaleDateString()}
                              </>
                            )}
                          </span>
                        </span>
                      </button>

                      {expiry.chip && (
                        <div className="flex items-center pr-2">
                          <Badge variant={expiry.chipVariant}>{expiry.chip}</Badge>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => deleteItem(item._id)}
                        disabled={deletingThis}
                        className="flex w-12 flex-shrink-0 items-center justify-center border-l border-line text-danger transition-colors duration-micro ease-entrance hover:bg-danger-soft disabled:opacity-40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                        aria-label={`Remove ${item.name} from your pantry`}
                      >
                        {deletingThis ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>

                    {deleteFailure?.id === item._id && (
                      <div className="mt-2">
                        <ErrorState
                          error={deleteFailure.error}
                          onRetry={() => deleteItem(item._id)}
                          retrying={deletingThis}
                        />
                      </div>
                    )}
                  </motion.li>
                );
              })}
            </motion.ul>
          </section>
        )}
      </SectionBoundary>

      {items.length > 0 && (
        <motion.section
          variants={rise}
          initial="hidden"
          animate="visible"
          transition={transition(durations.enter)}
          aria-label="Cook with what you have"
          className="rounded-xl bg-canvas px-5 py-6 shadow-lift sm:px-7 sm:py-8"
        >
          <h2 className="font-display text-title text-canvas-ink text-balance">Cook with what you've got</h2>
          <p className="mt-2 max-w-reading text-body text-canvas-muted">
            {selectedItems.size > 0
              ? "We'll build something around the things you've picked, and respect the diets on file."
              : "Pick a few things above, or leave it to us and we'll use the whole shelf."}
          </p>

          {showBanner && allMatched && (
            <p className="mt-3 text-body text-primary-bright">
              You've got everything for {targetRecipe.name}.
            </p>
          )}

          <Button
            variant="onDark"
            size="lg"
            onClick={() => setShowScopeModal(true)}
            loading={generatingRecipes}
            loadingLabel="Putting ideas together…"
            className="mt-5 w-full sm:w-auto"
          >
            <ChefHat className="h-4 w-4" aria-hidden="true" />
            {selectedItems.size > 0 ? `Cook with these ${selectedItems.size}` : 'Cook with what I have'}
          </Button>

          {generatingRecipes && (
            <div
              className="mt-4 flex items-start gap-3 rounded-md border border-canvas-line bg-canvas-soft p-4"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-primary-bright" aria-hidden="true" />
              <p className="text-body text-canvas-muted">
                Matching your ingredients, checking the diets and allergies, and writing the steps out.
              </p>
            </div>
          )}

          {recipeFailure && (
            <div className="mt-4">
              <ErrorState
                error={recipeFailure}
                onRetry={() => generateRecipes(lastRecipeScope ?? 'me')}
                retrying={generatingRecipes}
              />
            </div>
          )}
        </motion.section>
      )}

      {recipes && (
        <motion.section
          variants={rise}
          initial="hidden"
          animate="visible"
          transition={transition(durations.enter)}
          className="space-y-4"
          aria-label="What you could make"
        >
          <h2 className="font-display text-title text-ink">What you could make</h2>
          {(recipes.recipes || recipes).map((recipe: any, i: number) => {
            const savingThis = savingRecipe && savingVariables?.name === recipe.name;
            return (
              <Card key={i}>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="break-words">{recipe.name}</CardTitle>
                      {recipe.description && (
                        <p className="mt-1 text-body text-ink-muted">{recipe.description}</p>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {recipe.preparation_time && (
                        <Badge variant="neutral">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          <span className="font-mono tabular-nums">{recipe.preparation_time}</span>
                        </Badge>
                      )}
                      <Button
                        variant={savedRecipeIds.has(i) ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => !savedRecipeIds.has(i) && saveRecipe(recipe)}
                        disabled={savedRecipeIds.has(i)}
                        loading={savingThis}
                        loadingLabel="Saving…"
                      >
                        <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
                        {savedRecipeIds.has(i) ? 'Saved' : 'Save it'}
                      </Button>
                    </div>
                  </div>

                  {saveFailure?.index === i && (
                    <div className="mt-3">
                      <ErrorState
                        error={saveFailure.error}
                        onRetry={() => saveRecipe(recipe)}
                        retrying={savingThis}
                      />
                    </div>
                  )}

                  {recipe.dietary_tags?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {recipe.dietary_tags.map((tag: string, j: number) => (
                        <Badge key={j} variant="outline">{tag}</Badge>
                      ))}
                    </div>
                  )}
                </CardHeader>

                <CardContent className="space-y-5">
                  {recipe.serves && (
                    <p className="text-caption text-ink-muted">
                      Serves <span className="font-mono tabular-nums">{recipe.serves}</span>
                    </p>
                  )}

                  {recipe.ingredients?.length > 0 && (
                    <div>
                      <p className="text-label text-ink-muted">Ingredients</p>
                      <ul className="mt-2 divide-y divide-line border-t border-line">
                        {recipe.ingredients.map((ing: string, j: number) => (
                          <li key={j} className="py-2 text-body text-ink">
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
                        {recipe.instructions.map((stepText: string, j: number) => (
                          <li key={j} className="flex items-start gap-3">
                            <span
                              aria-hidden="true"
                              className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft font-mono text-caption text-primary-ink"
                            >
                              {j + 1}
                            </span>
                            <span className="text-body-lg text-ink">{stepText}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {recipe.health_benefits && (
                    <div className="rounded-md bg-primary-soft p-4">
                      <p className="text-label text-primary-ink">Why this is good for you</p>
                      <p className="mt-1 text-body text-ink">{recipe.health_benefits}</p>
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

                  {Array.isArray(recipe.missing_ingredients) && recipe.missing_ingredients.length > 0 && (
                    <div className="rounded-md bg-sunk p-4">
                      <p className="flex items-center gap-2 text-label text-ink">
                        <ShoppingBasket className="h-4 w-4 flex-shrink-0 text-ink-muted" aria-hidden="true" />
                        You'd need to pick up
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {recipe.missing_ingredients.map((ing: string, k: number) => (
                          <Button
                            key={k}
                            size="sm"
                            variant="secondary"
                            onClick={() => openAddWithPrefill(ing)}
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="max-w-[180px] truncate">{ing.split('(')[0].trim()}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.isArray(recipe.missing_ingredients) && recipe.missing_ingredients.length === 0 && (
                    <p className="flex items-center gap-2 text-body text-primary-ink">
                      <Check className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                      You've already got everything for this one.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
          <CitationsBar sources={[]} ragSources={recipes?.ragSources} />
          <DisclaimerBanner />
        </motion.section>
      )}

      <Dialog open={showScopeModal} onOpenChange={setShowScopeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Who's eating?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Button
              variant="secondary"
              className="h-auto w-full justify-start gap-3 py-3.5"
              onClick={() => { setShowScopeModal(false); generateRecipes('me'); }}
            >
              <User className="h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 text-left">
                <span className="block text-heading text-ink">Just me</span>
                <span className="block text-caption font-normal text-ink-muted">
                  Built around {activeProfile?.name}'s diet and allergies
                </span>
              </span>
            </Button>
            <Button
              variant="secondary"
              className="h-auto w-full justify-start gap-3 py-3.5"
              onClick={() => { setShowScopeModal(false); generateRecipes('family'); }}
            >
              <Users className="h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 text-left">
                <span className="block text-heading text-ink">Everyone at home</span>
                <span className="block text-caption font-normal text-ink-muted">
                  Safe for every profile you've set up
                </span>
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddForm} onOpenChange={(open) => { setShowAddForm(open); if (!open) setAddPrefill(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to your pantry</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (form.name && !adding) addItem();
            }}
          >
            {addPrefill && (
              <p className="-mt-2 text-caption text-ink-muted">For the recipe: {addPrefill}</p>
            )}

            <Field htmlFor="pantry-name" label="What is it" required error={nameError}>
              <Input
                {...fieldAria('pantry-name', { error: nameError })}
                invalid={!!nameError}
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder={addPrefill ? parseIngredientName(addPrefill) : 'Chicken breast'}
              />
            </Field>

            <fieldset>
              <legend className="mb-2 block text-label text-ink">Where it lives</legend>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => {
                  const active = form.category === cat.value;
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setForm((p) => ({ ...p, category: cat.value }))}
                      className={cn(
                        'inline-flex min-h-[44px] items-center gap-2 rounded-full border-2 px-3.5 text-body transition-colors duration-micro ease-entrance focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                        active
                          ? 'border-primary bg-primary-soft text-primary-ink'
                          : 'border-ink/15 bg-surface text-ink-muted hover:border-ink/30',
                      )}
                    >
                      <cat.Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field htmlFor="pantry-quantity" label="How much" error={quantityError}>
                <Input
                  {...fieldAria('pantry-quantity', { error: quantityError })}
                  invalid={!!quantityError}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={form.quantity}
                  onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
                  placeholder="1"
                  className="font-mono tabular-nums"
                />
              </Field>

              <Field htmlFor="pantry-unit" label="In what">
                <select
                  id="pantry-unit"
                  value={form.unit}
                  onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                  className="h-12 w-full rounded border-2 border-ink/15 bg-surface px-3 text-body text-ink transition-colors duration-micro ease-entrance hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <option value="pieces">Pieces</option>
                  <option value="kg">Kilograms</option>
                  <option value="g">Grams</option>
                  <option value="L">Litres</option>
                  <option value="ml">Millilitres</option>
                  <option value="packs">Packs</option>
                </select>
              </Field>
            </div>

            <Field
              htmlFor="pantry-expiry"
              label="Use by"
              hint="Leave it blank if there's no date on the pack."
              error={expiryError}
            >
              <Input
                {...fieldAria('pantry-expiry', {
                  hint: "Leave it blank if there's no date on the pack.",
                  error: expiryError,
                })}
                invalid={!!expiryError}
                type="date"
                value={form.expiryDate}
                onChange={(e) => setForm((p) => ({ ...p, expiryDate: e.target.value }))}
              />
            </Field>

            {addFailure && !addFailure.fields && (
              <ErrorState error={addFailure} onRetry={() => addItem()} retrying={adding} />
            )}

            <Button
              type="submit"
              disabled={!form.name}
              loading={adding}
              loadingLabel="Adding…"
              className="w-full"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add it
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
