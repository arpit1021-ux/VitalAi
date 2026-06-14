import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, ChefHat, Loader2, AlertTriangle, Package } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProfileStore } from '@/stores/profileStore';
import { pantry } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { DisclaimerBanner } from '@/components/shared/DisclaimerBanner';

interface PantryItem {
  _id: string;
  name: string;
  quantity: number;
  unit: string;
  expiryDate: string;
}

export default function SmartPantry() {
  const { activeProfile } = useProfileStore();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ name: '', quantity: '', unit: 'pieces', expiryDate: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['pantry', activeProfile?._id],
    queryFn: () => pantry.getAll(activeProfile!._id).then((r) => r.data),
    enabled: !!activeProfile,
  });

  const { mutate: addItem, isPending: adding } = useMutation({
    mutationFn: () => pantry.create({ ...form, profileId: activeProfile!._id, quantity: Number(form.quantity) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pantry', activeProfile?._id] });
      setShowAddForm(false);
      setForm({ name: '', quantity: '', unit: 'pieces', expiryDate: '' });
    },
  });

  const { mutate: deleteItem } = useMutation({
    mutationFn: (id: string) => pantry.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pantry', activeProfile?._id] }),
  });

  const { mutate: generateRecipes, data: recipes, isPending: generatingRecipes } = useMutation({
    mutationFn: () => pantry.generateRecipes(activeProfile!._id).then((r) => r.data),
  });

  const items: PantryItem[] = data?.items || data || [];
  const sortedItems = [...items].sort((a, b) => {
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
  });

  const getExpiryColor = (date: string) => {
    if (!date) return 'border-l-text-muted';
    const days = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'border-l-danger';
    if (days < 3) return 'border-l-warning';
    return 'border-l-primary';
  };

  const getExpiryLabel = (date: string) => {
    if (!date) return '';
    const days = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Expired';
    if (days === 0) return 'Expires today';
    if (days < 3) return `${days} days left`;
    return new Date(date).toLocaleDateString();
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sortedItems.map((item, i) => (
            <motion.div
              key={item._id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className={`border-l-4 ${getExpiryColor(item.expiryDate)}`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-text-primary">{item.name}</p>
                    <p className="text-xs text-text-muted">
                      {item.quantity} {item.unit}
                      {item.expiryDate && ` · ${getExpiryLabel(item.expiryDate)}`}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteItem(item._id)}>
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Button
            onClick={() => generateRecipes()}
            disabled={generatingRecipes}
            className="w-full"
            variant="secondary"
            size="lg"
          >
            {generatingRecipes ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ChefHat className="h-4 w-4 mr-2" />}
            Cook With What I Have
          </Button>
        </motion.div>
      )}

      {recipes && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <h2 className="text-xl font-bold text-text-primary">Suggested Recipes</h2>
          {(recipes.recipes || recipes).map((recipe: any, i: number) => (
            <Card key={i}>
              <CardHeader>
                <CardTitle>{recipe.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-text-muted mb-1">Ingredients</p>
                  <p className="text-sm text-text-primary">{recipe.ingredients?.join(', ')}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-1">Steps</p>
                  <ol className="text-sm text-text-primary space-y-1 list-decimal list-inside">
                    {recipe.steps?.map((step: string, j: number) => (
                      <li key={j}>{step}</li>
                    ))}
                  </ol>
                </div>
                {recipe.nutrition && (
                  <div className="text-xs text-text-muted">
                    ~{recipe.nutrition.calories} cal · {recipe.nutrition.protein}g protein
                  </div>
                )}
                {recipe.tagline && (
                  <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-xs">
                    {recipe.tagline}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          <DisclaimerBanner />
        </motion.div>
      )}

      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Pantry Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-text-muted">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g., Chicken breast"
              />
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
