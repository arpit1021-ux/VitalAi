import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Plus, Heart, Clock, TrendingUp, Send, Loader2, AlertTriangle, Leaf, Utensils, Sparkles, ChefHat, ChevronDown } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProfileStore } from '@/stores/profileStore';
import { community, savedRecipes } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';

interface Post {
  _id: string;
  type: string;
  title: string;
  content: string;
  condition?: string;
  dietaryTags?: string[];
  likes: number;
  commentCount: number;
  isLiked: boolean;
  author: { name: string; avatar: string };
  status?: string;
  moderationNote?: string;
  createdAt: string;
}

const typeConfig: Record<string, { icon: typeof Leaf; label: string; color: string }> = {
  nuskha: { icon: Leaf, label: 'Nuskha', color: 'text-primary' },
  recipe: { icon: Utensils, label: 'Recipe', color: 'text-secondary' },
  motivation: { icon: Sparkles, label: 'Motivation', color: 'text-warning' },
};

export default function CommunityPage() {
  const { activeProfile } = useProfileStore();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sort, setSort] = useState('recent');
  const [createForm, setCreateForm] = useState({
    type: 'nuskha' as 'nuskha' | 'recipe' | 'motivation',
    title: '',
    content: '',
    condition: '',
    dietaryTags: [] as string[],
  });
  const [createError, setCreateError] = useState('');
  const [showRecipePicker, setShowRecipePicker] = useState(false);

  const { data: savedRecipesData } = useQuery({
    queryKey: ['savedRecipes', activeProfile?._id],
    queryFn: () => savedRecipes.getAll(activeProfile!._id).then((r) => r.data),
    enabled: !!activeProfile && showRecipePicker,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['communityFeed', sort],
    queryFn: () => community.getFeed({ sort }).then((r) => r.data),
  });

  const { mutate: createPost, isPending: creating } = useMutation({
    mutationFn: () =>
      community.createPost({
        profileId: activeProfile!._id,
        ...createForm,
      }),
    onSuccess: (res) => {
      setShowCreateModal(false);
      setCreateForm({ type: 'nuskha', title: '', content: '', condition: '', dietaryTags: [] });
      setCreateError('');
      queryClient.invalidateQueries({ queryKey: ['communityFeed'] });
      if (res.data.post.status === 'pending_review') {
        setCreateError('Your post is pending review before publishing.');
      }
    },
    onError: (err: any) => {
      setCreateError(err.response?.data?.error || 'Failed to create post');
    },
  });

  const { mutate: toggleLike } = useMutation({
    mutationFn: (id: string) => community.toggleLike(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['communityFeed'] }),
  });

  const posts: Post[] = data?.posts || [];

  const timeAgo = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="max-w-3xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Community</h1>
            <p className="text-text-muted">Share remedies, recipes, and wellness tips</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-1" /> Post
          </Button>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Tabs value={sort} onValueChange={setSort}>
          <TabsList>
            <TabsTrigger value="recent" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Recent
            </TabsTrigger>
            <TabsTrigger value="trending" className="gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Trending
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-24 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-4 w-48 mb-2" />
                <Skeleton className="h-3 w-full mb-1" />
                <Skeleton className="h-3 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No posts yet"
          description="Be the first to share a remedy, recipe, or wellness tip with the community."
          actionLabel="Create First Post"
          onAction={() => setShowCreateModal(true)}
        />
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {posts.map((post, i) => {
              const config = typeConfig[post.type] || typeConfig.nuskha;
              const Icon = config.icon;
              return (
                <motion.div
                  key={post._id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-lg">
                          {post.author.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">{post.author.name}</p>
                          <p className="text-xs text-text-muted">{timeAgo(post.createdAt)}</p>
                        </div>
                        <Badge variant="outline" className={`gap-1 text-xs ${config.color}`}>
                          <Icon className="h-3 w-3" /> {config.label}
                        </Badge>
                      </div>

                      <h3 className="font-semibold text-text-primary mb-2">{post.title}</h3>
                      <p className="text-sm text-text-muted leading-relaxed whitespace-pre-line">{post.content}</p>

                      {post.condition && (
                        <Badge variant="secondary" className="mt-2 text-xs">For: {post.condition}</Badge>
                      )}

                      {post.dietaryTags && post.dietaryTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {post.dietaryTags.map((tag, j) => (
                            <Badge key={j} variant="outline" className="text-xs">{tag}</Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border">
                        <button
                          onClick={() => toggleLike(post._id)}
                          className={`flex items-center gap-1.5 text-sm transition-colors ${
                            post.isLiked ? 'text-danger' : 'text-text-muted hover:text-danger'
                          }`}
                        >
                          <Heart className={`h-4 w-4 ${post.isLiked ? 'fill-current' : ''}`} />
                          {post.likes}
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Share with Community</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-text-muted">Post Type</label>
              <div className="flex gap-2">
                {Object.entries(typeConfig).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => setCreateForm((p) => ({ ...p, type: key as any }))}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors border ${
                        createForm.type === key
                          ? 'bg-primary/20 border-primary/50 text-primary'
                          : 'bg-surface border-border text-text-muted hover:border-text-muted/50'
                      }`}
                    >
                      <Icon className="h-4 w-4" /> {config.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {createForm.type === 'recipe' && (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRecipePicker(!showRecipePicker)}
                  className="gap-1.5 text-xs"
                >
                  <ChefHat className="h-3.5 w-3.5" />
                  {showRecipePicker ? 'Hide saved recipes' : 'Use a saved recipe'}
                  <ChevronDown className={`h-3 w-3 transition-transform ${showRecipePicker ? 'rotate-180' : ''}`} />
                </Button>

                {showRecipePicker && (
                  <div className="space-y-2 max-h-48 overflow-y-auto rounded-lg border border-border p-2">
                    {savedRecipesData?.recipes?.length === 0 && (
                      <p className="text-xs text-text-muted text-center py-2">No saved recipes yet. Save recipes from the pantry or dinner ideas first.</p>
                    )}
                    {savedRecipesData?.recipes?.map((recipe: any) => (
                      <button
                        key={recipe._id}
                        onClick={() => {
                          const content = [
                            recipe.description,
                            '',
                            'Ingredients:',
                            ...(recipe.ingredients || []).map((ing: string) => `- ${ing}`),
                            '',
                            'Instructions:',
                            ...(recipe.instructions || []).map((step: string, i: number) => `${i + 1}. ${step}`),
                            '',
                            recipe.healthBenefits ? `Health Benefits: ${recipe.healthBenefits}` : '',
                          ].filter(Boolean).join('\n');
                          setCreateForm((p) => ({
                            ...p,
                            title: recipe.name,
                            content,
                          }));
                          setShowRecipePicker(false);
                        }}
                        className="w-full text-left p-2.5 rounded-lg hover:bg-surface transition-colors border border-border/50 hover:border-border"
                      >
                        <p className="text-sm font-medium text-text-primary">{recipe.name}</p>
                        {recipe.prepTime && (
                          <p className="text-xs text-text-muted mt-0.5">⏱ {recipe.prepTime}{recipe.serves ? ` · Serves ${recipe.serves}` : ''}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm text-text-muted">Title</label>
              <Input
                value={createForm.title}
                onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Give your post a title"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-text-muted">Content</label>
              <Textarea
                value={createForm.content}
                onChange={(e) => setCreateForm((p) => ({ ...p, content: e.target.value }))}
                placeholder={
                  createForm.type === 'nuskha'
                    ? 'Share your home remedy...'
                    : createForm.type === 'recipe'
                    ? 'Share your recipe...'
                    : 'Share your wellness tip...'
                }
                className="min-h-[120px]"
              />
            </div>

            {createForm.type === 'nuskha' && (
              <div className="space-y-2">
                <label className="text-sm text-text-muted">Helps with (optional)</label>
                <Input
                  value={createForm.condition}
                  onChange={(e) => setCreateForm((p) => ({ ...p, condition: e.target.value }))}
                  placeholder="e.g., cold, cough, digestion"
                />
              </div>
            )}

            {createError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 text-warning text-sm">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {createError}
              </div>
            )}

            <Button
              onClick={() => createPost()}
              disabled={!createForm.title || !createForm.content || creating}
              className="w-full"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Post
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
