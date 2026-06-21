import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChefHat, SkipForward, ArrowRight } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardExtended } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Recipe {
  name: string;
  description: string;
  emoji: string;
  prepTime: string;
}

interface DinnerIdeasCarouselProps {
  profileId: string;
  loading?: boolean;
}

function EmptyState() {
  return (
    <Card className="border-indigo-500/20">
      <CardContent className="p-5 flex flex-col items-center text-center py-8">
        <ChefHat className="h-10 w-10 text-text-muted/30 mb-3" />
        <p className="text-sm text-text-muted">No dinner ideas yet</p>
        <p className="text-xs text-text-muted/70 mt-1">Sign in to get personalized recipe suggestions</p>
      </CardContent>
    </Card>
  );
}

function SkeletonLoader() {
  return (
    <Card className="border-indigo-500/20">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex flex-col items-center text-center py-4">
          <Skeleton className="h-16 w-16 rounded-full mb-3" />
          <Skeleton className="h-5 w-40 mb-2" />
          <Skeleton className="h-3 w-56 mb-2" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="flex justify-between items-center pt-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex justify-center gap-1.5 mt-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-2 w-2 rounded-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DinnerIdeasCarousel({ profileId, loading }: DinnerIdeasCarouselProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const hasFetchedRef = useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: ['recipes', profileId],
    queryFn: () => dashboardExtended.getRecipes(profileId).then((r) => r.data),
    enabled: !!profileId,
  });

  useEffect(() => {
    if (data?.recipes?.length) {
      setAllRecipes(data.recipes);
      hasFetchedRef.current = false;
    }
  }, [data]);

  const fetchMore = useCallback(async () => {
    if (isFetchingMore || !profileId) return;
    setIsFetchingMore(true);
    try {
      const excludeNames = allRecipes.map((r) => r.name);
      const res = await dashboardExtended.getMoreRecipes(profileId, excludeNames);
      const newRecipes = res.data?.recipes || [];
      if (newRecipes.length > 0) {
        setAllRecipes((prev) => [...prev, ...newRecipes]);
      }
    } catch {
    } finally {
      setIsFetchingMore(false);
    }
  }, [profileId, allRecipes, isFetchingMore]);

  useEffect(() => {
    if (allRecipes.length > 0 && currentIndex >= allRecipes.length - 3 && !isFetchingMore && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchMore();
    }
  }, [currentIndex, allRecipes.length, isFetchingMore, fetchMore]);

  const recipes = allRecipes.length > 0 ? allRecipes : [];

  if (loading || isLoading) {
    return <SkeletonLoader />;
  }

  if (recipes.length === 0) {
    return <EmptyState />;
  }

  const currentRecipe = recipes[currentIndex % recipes.length];
  const remaining = Math.max(recipes.length - currentIndex - 1, 0);

  const handleSkip = () => {
    setDirection(1);
    setCurrentIndex((prev) => prev + 1);
  };

  const handleCookThis = () => {
    navigate('/recipe-detail', {
      state: {
        name: currentRecipe.name,
        description: currentRecipe.description,
        emoji: currentRecipe.emoji,
        prepTime: currentRecipe.prepTime,
      },
    });
  };

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 200 : -200,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -200 : 200,
      opacity: 0,
    }),
  };

  const visibleDots = Math.min(recipes.length, 7);
  const dotStart = Math.max(0, currentIndex - Math.floor(visibleDots / 2));
  const dotEnd = Math.min(recipes.length, dotStart + visibleDots);

  return (
    <Card className="border-indigo-500/20">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <ChefHat className="h-5 w-5 text-indigo-400" />
          <p className="text-sm font-semibold text-text-primary">Dinner Ideas</p>
        </div>

        <div className="relative overflow-hidden min-h-[180px]">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentIndex}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="flex flex-col items-center text-center py-2"
            >
              <span className="text-4xl mb-3" role="img" aria-label={currentRecipe.name}>
                {currentRecipe.emoji}
              </span>
              <p className="text-base font-semibold text-text-primary mb-1">{currentRecipe.name}</p>
              <p className="text-sm text-text-muted leading-relaxed max-w-[250px]">{currentRecipe.description}</p>
              <p className="text-xs text-text-muted mt-2 flex items-center gap-1">
                <span>⏱️</span> {currentRecipe.prepTime}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex justify-between items-center pt-3 border-t border-border mt-3">
          <button
            onClick={handleSkip}
            className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium flex items-center gap-1"
            aria-label="Skip to next recipe"
          >
            Skip <SkipForward className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleCookThis}
            className="text-sm text-primary hover:text-primary/80 transition-colors font-medium flex items-center gap-1"
            aria-label="Go to recipes page"
          >
            Cook this <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex justify-center gap-1.5 mt-3">
          {recipes.slice(dotStart, dotEnd).map((_: Recipe, i: number) => {
            const actualIndex = dotStart + i;
            return (
              <button
                key={actualIndex}
                onClick={() => {
                  setDirection(actualIndex > currentIndex ? 1 : -1);
                  setCurrentIndex(actualIndex);
                }}
                className={`h-2 rounded-full transition-all duration-200 ${
                  actualIndex === currentIndex ? 'w-5 bg-indigo-400' : 'w-2 bg-border'
                }`}
                aria-label={`Go to recipe ${actualIndex + 1}`}
              />
            );
          })}
        </div>

        {remaining > 0 && (
          <p className="text-center text-xs text-text-muted mt-2">
            Tap to see {remaining} more
          </p>
        )}
        {isFetchingMore && (
          <p className="text-center text-xs text-text-muted mt-1">
            Loading more recipes...
          </p>
        )}
      </CardContent>
    </Card>
  );
}
