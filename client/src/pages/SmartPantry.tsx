import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Trash2, ChefHat, Loader2, AlertTriangle, Package, Users, Check, Bookmark } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProfileStore } from '@/stores/profileStore';
import { pantry, savedRecipes } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { DisclaimerBanner } from '@/components/shared/DisclaimerBanner';
import { CitationsBar } from '@/components/shared/CitationsBar';

interface PantryItem {
  _id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  expiryDate: string;
}

const categories = [
  { value: 'grains', label: 'Grains', emoji: '🌾' },
  { value: 'dairy', label: 'Dairy', emoji: '🥛' },
  { value: 'produce', label: 'Produce', emoji: '🥬' },
  { value: 'protein', label: 'Protein', emoji: '🍗' },
  { value: 'spices', label: 'Spices', emoji: '🧂' },
  { value: 'other', label: 'Other', emoji: '📦' },
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
  const [recipeError, setRecipeError] = useState('');
  const [form, setForm] = useState({ name: '', quantity: '', unit: 'pieces', category: 'other', expiryDate: '' });
  const [addPrefill, setAddPrefill] = useState<string | null>(null);

  const targetRecipe = useMemo(() => {
    const state = location.state as { targetRecipe?: { name: string; ingredients: string[] } } | null;
    return state?.targetRecipe || null;
  }, [location.state]);

  const [dismissedBanner, setDismissedBanner] = useState(false);
  const showBanner = targetRecipe && !dismissedBanner;

  const { data, isLoading } = useQuery({
    queryKey: ['pantry', activeProfile?._id],
    queryFn: () => pantry.getAll(activeProfile!._id).then((r) => r.data),
    enabled: !!activeProfile,
  });


  const { mutate: addItem, isPending: adding } = useMutation({
    mutationFn: () => pantry.create({
      ...form,
      profileId: activeProfile!._id,
      quantity: Number(form.quantity) || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pantry', activeProfile?._id] });
      setShowAddForm(false);
      setAddPrefill(null);
      setForm({ name: '', quantity: '', unit: 'pieces', category: 'other', expiryDate: '' });
    },
  });

  const { mutate: deleteItem } = useMutation({
    mutationFn: (id: string) => pantry.delete(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['pantry', activeProfile?._id] });
      setSelectedItems((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
  });

  const { mutate: generateRecipes, data: recipes, isPending: generatingRecipes } = useMutation({
    mutationFn: (scope: 'me' | 'family') => {
      const ids = selectedItems.size > 0 ? Array.from(selectedItems) : undefined;
      return pantry.generateRecipes(activeProfile!._id, scope, ids).then((r) => r.data);
    },
    onSuccess: () => setRecipeError(''),
    onError: (err: any) => {
      setRecipeError(err.response?.data?.error || 'Failed to generate recipes. Please try again.');
    },
  });

  const [savedRecipeIds, setSavedRecipeIds] = useState<Set<number>>(new Set());

  const { mutate: saveRecipe } = useMutation({
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
    onSuccess: (_data, recipe) => {
      const idx = (recipes?.recipes || recipes || []).findIndex((r: any) => r.name === recipe.name);
      if (idx >= 0) setSavedRecipeIds((prev) => new Set([...prev, idx]));
    },
  });

  const items: PantryItem[] = data?.items || data || [];
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
    if (!date) return { color: 'border-l-text-muted', chip: null as string | null, chipVariant: 'outline' as const };
    const days = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return { color: 'border-l-danger', chip: 'Expired', chipVariant: 'destructive' as const };
    if (days < 3) return { color: 'border-l-warning', chip: days === 0 ? 'Expires today' : `${days}d left`, chipVariant: 'warning' as const };
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

  return (
    <div className="max-w-4xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Smart Pantry</h1>
            <p className="text-text-muted">Track your food inventory and expiry dates</p>
          </div>
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Item
          </Button>
        </div>
      </motion.div>

      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    🍳 Cooking: <span className="text-primary">{targetRecipe.name}</span>
                  </p>
                  {items.length === 0 ? (
                    <p className="text-xs text-text-muted mt-1">
                      Starting fresh? Here's what you'll need:
                    </p>
                  ) : (
                    <p className="text-xs text-text-muted mt-1">
                      We've highlighted {matchedItemIds.size} item{matchedItemIds.size !== 1 ? 's' : ''} you already have
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setDismissedBanner(true)}
                  className="text-text-muted hover:text-text-primary text-xs flex-shrink-0"
                >
                  Dismiss
                </button>
              </div>

              {missingIngredients.length > 0 && (
                <div className="mt-3 pt-3 border-t border-primary/20">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-xs">🛒</span>
                    <p className="text-xs font-medium text-text-muted">
                      Shopping list — you'll need to buy:
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {missingIngredients.map((ing, i) => (
                      <button
                        key={i}
                        onClick={() => openAddWithPrefill(ing)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-surface text-[11px] text-text-primary hover:border-primary/50 hover:bg-primary/5 transition-colors group"
                        title={`Add "${parseIngredientName(ing)}" to pantry`}
                      >
                        <span className="truncate max-w-[140px]">{ing}</span>
                        <Plus className="h-3 w-3 text-text-muted group-hover:text-primary flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-surface animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Your pantry is empty"
          description="Add items to track your food inventory and get recipe suggestions"
          actionLabel="Add First Item"
          onAction={() => setShowAddForm(true)}
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-muted">
              {selectedItems.size > 0 ? `${selectedItems.size} of ${items.length} selected` : `${items.length} items`}
            </p>
            <Button variant="ghost" size="sm" onClick={selectAll}>
              {selectedItems.size === items.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sortedItems.map((item, i) => {
              const expiry = getExpiryInfo(item.expiryDate);
              const isSelected = selectedItems.has(item._id);
              const cat = categories.find((c) => c.value === item.category);
              return (
                <motion.div
                  key={item._id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card
                    className={`border-l-4 ${expiry.color} cursor-pointer transition-all ${
                      isSelected ? 'ring-2 ring-primary/50 bg-primary/5' : ''
                    }`}
                    onClick={() => toggleItemSelect(item._id)}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <div
                        className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isSelected ? 'bg-primary border-primary' : 'border-border'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-text-primary truncate">{item.name}</p>
                          {cat && <span className="text-xs">{cat.emoji}</span>}
                        </div>
                        <p className="text-xs text-text-muted">
                          {item.quantity ? `${item.quantity} ${item.unit}` : ''}
                          {item.expiryDate && ` · ${new Date(item.expiryDate).toLocaleDateString()}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {expiry.chip && (
                          <Badge variant={expiry.chipVariant} className="text-xs">{expiry.chip}</Badge>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteItem(item._id); }}
                          className="p-1 rounded-lg hover:bg-danger/10 transition-colors"
                          aria-label={`Delete ${item.name}`}
                        >
                          <Trash2 className="h-4 w-4 text-danger" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      {items.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          {showBanner && allMatched && (
            <p className="text-sm text-primary font-medium text-center mb-2">
              You have everything for {targetRecipe.name}!
            </p>
          )}
          <Button
            onClick={() => setShowScopeModal(true)}
            disabled={generatingRecipes}
            className="w-full"
            variant="secondary"
            size="lg"
          >
            {generatingRecipes ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ChefHat className="h-4 w-4 mr-2" />}
            {selectedItems.size > 0 ? `Cook with ${selectedItems.size} items` : 'Cook With What I Have'}
          </Button>
        </motion.div>
      )}

      {recipeError && (
        <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {recipeError}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setRecipeError('')}>
            Dismiss
          </Button>
        </div>
      )}

      {recipes && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <h2 className="text-xl font-bold text-text-primary">Suggested Recipes</h2>
          {(recipes.recipes || recipes).map((recipe: any, i: number) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{recipe.name}</CardTitle>
                    {recipe.description && (
                      <p className="text-sm text-text-muted mt-1">{recipe.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {recipe.preparation_time && (
                      <Badge variant="outline" className="text-xs">⏱️ {recipe.preparation_time}</Badge>
                    )}
                    <Button
                      variant={savedRecipeIds.has(i) ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => !savedRecipeIds.has(i) && saveRecipe(recipe)}
                      disabled={savedRecipeIds.has(i)}
                      className="gap-1"
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                      {savedRecipeIds.has(i) ? 'Saved' : 'Save'}
                    </Button>
                  </div>
                </div>
                {recipe.dietary_tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
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

                {Array.isArray(recipe.missing_ingredients) && recipe.missing_ingredients.length > 0 && (
                  <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="h-4 w-4 text-warning" />
                      <p className="text-xs font-medium text-warning">Shopping List — Items to Buy</p>
                    </div>
                    <ul className="text-sm text-text-primary space-y-1 mb-3">
                      {recipe.missing_ingredients.map((ing: string, k: number) => (
                        <li key={k} className="flex items-center gap-2">
                          <span className="text-warning">•</span>
                          {ing}
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                      {recipe.missing_ingredients.map((ing: string, k: number) => (
                        <Button
                          key={k}
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => openAddWithPrefill(ing)}
                        >
                          <Plus className="h-3 w-3" /> Add "{ing.split('(')[0].trim()}" to pantry
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(recipe.missing_ingredients) && recipe.missing_ingredients.length === 0 && (
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary" />
                      <p className="text-xs font-medium text-primary">All ingredients available in your pantry!</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          <CitationsBar sources={[]} ragSources={recipes?.ragSources} />
          <DisclaimerBanner />
        </motion.div>
      )}

      <Dialog open={showScopeModal} onOpenChange={setShowScopeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Who should this recipe be for?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-14"
              onClick={() => { setShowScopeModal(false); generateRecipes('me'); }}
            >
              <ChefHat className="h-5 w-5 text-primary" />
              <div className="text-left">
                <p className="font-medium">Just for me</p>
                <p className="text-xs text-text-muted">Tailored to {activeProfile?.name}'s diet and allergies</p>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-14"
              onClick={() => { setShowScopeModal(false); generateRecipes('family'); }}
            >
              <Users className="h-5 w-5 text-secondary" />
              <div className="text-left">
                <p className="font-medium">For all family members</p>
                <p className="text-xs text-text-muted">Compatible with everyone's dietary needs</p>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddForm} onOpenChange={(open) => { setShowAddForm(open); if (!open) setAddPrefill(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Pantry Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {addPrefill && (
              <p className="text-xs text-text-muted -mt-2">Adding for recipe: {addPrefill}</p>
            )}
            <div className="space-y-2">
              <label className="text-sm text-text-muted">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder={addPrefill || 'e.g., Chicken breast'}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-text-muted">Category</label>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => setForm((p) => ({ ...p, category: cat.value }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors border ${
                      form.category === cat.value
                        ? 'bg-primary/20 border-primary/50 text-primary'
                        : 'bg-surface border-border text-text-muted hover:border-text-muted/50'
                    }`}
                  >
                    <span>{cat.emoji}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-text-muted">Quantity</label>
                <Input
                  type="number"
                  value={form.quantity}
                  onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
                  placeholder="1"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-text-muted">Unit</label>
                <select
                  value={form.unit}
                  onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                  className="flex h-10 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                >
                  <option value="pieces">Pieces</option>
                  <option value="kg">Kilograms</option>
                  <option value="g">Grams</option>
                  <option value="L">Liters</option>
                  <option value="ml">Milliliters</option>
                  <option value="packs">Packs</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-text-muted">Expiry Date</label>
              <Input
                type="date"
                value={form.expiryDate}
                onChange={(e) => setForm((p) => ({ ...p, expiryDate: e.target.value }))}
              />
            </div>
            <Button onClick={() => addItem()} disabled={!form.name || adding} className="w-full">
              {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Add Item
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
