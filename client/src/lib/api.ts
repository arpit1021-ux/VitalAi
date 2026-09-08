import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';

/**
 * VITE_API_URL must include the /api suffix. It is the only VitalAI
 * environment value the browser ever sees: model and database credentials are
 * read server-side and never reach this bundle.
 */
const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api';

const api = axios.create({
  baseURL,
  withCredentials: true,
  // Without a timeout a stalled request hangs the calling screen forever.
  // AI routes override this with their own, longer budget.
  timeout: 30_000,
});

/**
 * A retry key for one logical action.
 *
 * Generated once per attempt and reused if the request is retried, so a scan
 * interrupted by a flaky connection is not analysed and billed twice. The
 * server returns the original response for a repeat.
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

function idempotent(key?: string): Record<string, string> {
  return key ? { 'Idempotency-Key': key } : {};
}

/** Paths where a 401 is an answer rather than an expired session. */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/me'];

type Retryable = InternalAxiosRequestConfig & { _retried?: boolean };

let refreshInFlight: Promise<void> | null = null;
let queue: { resolve: () => void; reject: (reason: unknown) => void }[] = [];

function flushQueue(error: unknown): void {
  const waiting = queue;
  queue = [];
  for (const entry of waiting) {
    if (error) entry.reject(error);
    else entry.resolve();
  }
}

/**
 * Refreshes once for however many requests fail concurrently.
 *
 * A dashboard can have nine requests in flight when the access token expires.
 * Without this gate each would trigger its own refresh, and because refresh
 * tokens rotate, the second one to arrive would present an already-rotated
 * token — which the server correctly treats as theft and responds to by
 * signing the user out of every device.
 */
function refreshSession(): Promise<void> {
  refreshInFlight ??= api
    .post('/auth/refresh')
    .then(() => {
      flushQueue(null);
    })
    .catch((error: unknown) => {
      flushQueue(error);
      throw error;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

/** Notifies the app that the session ended, so it can route to sign-in itself. */
export const SESSION_EXPIRED_EVENT = 'vitalai:session-expired';

function announceSessionEnd(detail: { message: string; action?: string }): void {
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail }));
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: string; action?: string }>) => {
    const original = error.config as Retryable | undefined;
    const status = error.response?.status;
    const url = original?.url ?? '';

    const refreshable =
      status === 401 &&
      original &&
      !original._retried &&
      !NO_REFRESH_PATHS.some((path) => url.includes(path));

    if (!refreshable) return Promise.reject(error);

    original._retried = true;

    try {
      if (refreshInFlight) {
        // A refresh is already running; wait for its outcome rather than
        // starting a second one against a rotating token.
        await new Promise<void>((resolve, reject) => {
          queue.push({ resolve, reject });
        });
      } else {
        await refreshSession();
      }

      // Replay the original request with the new cookie.
      return await api.request(original as AxiosRequestConfig);
    } catch {
      announceSessionEnd({
        message: error.response?.data?.error ?? 'Your session has ended.',
        action: error.response?.data?.action ?? 'Sign in again to continue.',
      });
      return Promise.reject(error);
    }
  },
);

export const auth = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (email: string, password: string) =>
    api.post('/auth/register', { email, password }),
  logout: () => api.post('/auth/logout'),
  logoutEverywhere: () => api.post('/auth/logout-all'),
  refresh: () => api.post('/auth/refresh'),
  forgotPassword: (email: string) => api.post('/auth/password/forgot', { email }),
  resetPassword: (token: string, password: string) =>
    api.post('/auth/password/reset', { token, password }),
  getMe: () => api.get('/auth/me'),
  googleLogin: () => `${api.defaults.baseURL}/auth/google`,
};

export const account = {
  getConsent: () => api.get('/account/consent'),
  acceptConsent: (version: string) =>
    api.post('/account/consent', { version, acceptHealthDataProcessing: true }),
  /**
   * The export is a file download on a cross-origin API, so it cannot be a
   * plain link: the request needs the session cookie, which means fetching it
   * as a blob and handing the browser an object URL.
   */
  downloadExport: async (): Promise<{ filename: string; blob: Blob }> => {
    const response = await api.get('/account/export', { responseType: 'blob', timeout: 120_000 });
    const disposition = response.headers['content-disposition'] as string | undefined;
    const match = disposition?.match(/filename="([^"]+)"/);
    return {
      filename: match?.[1] ?? 'vitalai-export.json',
      blob: response.data as Blob,
    };
  },
  deleteAccount: (confirmEmail: string) =>
    api.delete('/account', {
      data: { confirmEmail, understandPermanent: true },
      timeout: 120_000,
    }),
};

export const profiles = {
  getAll: () => api.get('/profiles'),
  create: (data: any) => api.post('/profiles', data),
  update: (id: string, data: any) => api.put(`/profiles/${id}`, data),
  delete: (id: string) => api.delete(`/profiles/${id}`),
};

export const scans = {
  scanFood: (extractedText: string, profileId: string, imageFile?: File, retryKey?: string) => {
    const formData = new FormData();
    formData.append('extractedText', extractedText);
    formData.append('profileId', profileId);
    if (imageFile) formData.append('image', imageFile);
    return api.post('/scans/food', formData, {
      headers: { 'Content-Type': 'multipart/form-data', ...idempotent(retryKey) },
      // Vision analysis takes far longer than a normal request.
      timeout: 90_000,
    });
  },
  scanMedicine: (extractedText: string, profileId: string, retryKey?: string) =>
    api.post('/scans/medicine', { extractedText, profileId }, {
      headers: idempotent(retryKey),
      timeout: 60_000,
    }),
  scanSupplement: (extractedText: string, profileId: string, retryKey?: string) =>
    api.post('/scans/supplement', { extractedText, profileId }, {
      headers: idempotent(retryKey),
      timeout: 60_000,
    }),
  getHistory: (profileId: string) =>
    api.get(`/scans/history/${profileId}`),
};

export const chat = {
  createSession: (profileId: string) =>
    api.post('/chat/session', { profileId }),
  getSessions: (profileId: string) =>
    api.get(`/chat/sessions/${profileId}`),
  getSession: (id: string) => api.get(`/chat/session/${id}`),
  sendMessage: (sessionId: string, content: string, language?: string, retryKey?: string) =>
    api.post(
      '/chat/message',
      { sessionId, content, language },
      { headers: idempotent(retryKey), timeout: 60_000 },
    ),
  deleteSession: (id: string) => api.delete(`/chat/session/${id}`),
};

export const pantry = {
  create: (data: any) => api.post('/pantry', data),
  getAll: (profileId: string) => api.get(`/pantry/${profileId}`),
  update: (id: string, data: any) => api.put(`/pantry/${id}`, data),
  delete: (id: string) => api.delete(`/pantry/${id}`),
  generateRecipes: (profileId: string, scope: 'me' | 'family' = 'me', selectedItemIds?: string[]) =>
    api.post('/pantry/recipes', { profileId, scope, selectedItemIds }),
};

export const insights = {
  getFamily: (userId: string) => api.get(`/insights/family/${userId}`),
  generate: () => api.post('/insights/generate'),
};

export const dashboard = {
  getData: (profileId: string) => api.get(`/dashboard/${profileId}`),
  getTip: (profileId: string) => api.get(`/dashboard/tip/${profileId}`),
};

export const dailylog = {
  getToday: (profileId: string) => api.get(`/dailylog/${profileId}/today`),
  updateWater: (profileId: string, count: number) => api.put(`/dailylog/${profileId}/water`, { count }),
  updatePlate: (profileId: string, group: string, value: boolean, entry?: string) =>
    api.put(`/dailylog/${profileId}/plate`, { group, value, entry }),
  updateChallenge: (profileId: string, completed: boolean) => api.put(`/dailylog/${profileId}/challenge`, { completed }),
  getStreak: (profileId: string) => api.get(`/dailylog/${profileId}/streak`),
  getTips: (profileId: string) => api.get(`/dailylog/${profileId}/tips`),
  markActivity: (profileId: string) => api.post(`/dailylog/${profileId}/activity`),
  addWater: (profileId: string) => api.post(`/dailylog/${profileId}/water/add`),
  removeWater: (profileId: string) => api.post(`/dailylog/${profileId}/water/remove`),
  setWaterGoal: (profileId: string, goal: number) => api.put(`/dailylog/${profileId}/water/goal`, { goal }),
};

export const dashboardExtended = {
  getTimeline: (profileId: string) => api.get(`/dashboard/timeline/${profileId}`),
  getCoach: (profileId: string) => api.get(`/dashboard/coach/${profileId}`),
  getRecipes: (profileId: string) => api.get(`/dashboard/recipes/${profileId}`),
  getMoreRecipes: (profileId: string, excludeNames: string[]) =>
    api.post(`/dashboard/recipes/${profileId}/more`, { excludeNames }),
  expandRecipe: (profileId: string, recipeName: string, recipeDescription: string) =>
    api.post('/dashboard/recipes/expand', { profileId, recipeName, recipeDescription }),
};

export const healthScore = {
  get: (profileId: string) => api.get(`/health-score/${profileId}`),
};

export const healthInsights = {
  get: (profileId: string) => api.get(`/health-insights/${profileId}`),
  generate: (profileId: string) => api.post(`/health-insights/${profileId}/generate`),
};

export const scansExtended = {
  getHistoryFiltered: (profileId: string, params: { type?: string; search?: string; sort?: string; page?: number; limit?: number }) =>
    api.get(`/scans/history/${profileId}`, { params }),
  deleteScan: (id: string) => api.delete(`/scans/history/${id}`),
  clearAllHistory: (profileId: string) => api.delete(`/scans/history/all/${profileId}`),
};

export const savedRecipes = {
  getAll: (profileId: string, params?: { diet?: string; search?: string; sort?: string }) =>
    api.get(`/saved-recipes/${profileId}`, { params }),
  save: (data: any) => api.post('/saved-recipes', data),
  delete: (id: string) => api.delete(`/saved-recipes/${id}`),
};

export const community = {
  getFeed: (params?: { sort?: string; page?: number; limit?: number }) =>
    api.get('/community/feed', { params }),
  createPost: (data: any) => api.post('/community', data),
  toggleLike: (id: string) => api.post(`/community/${id}/like`),
  deletePost: (id: string) => api.delete(`/community/${id}`),
  getMyPosts: () => api.get('/community/my-posts'),
};

export default api;
