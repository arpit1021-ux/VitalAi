import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/me')) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export const auth = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (email: string, password: string) =>
    api.post('/auth/register', { email, password }),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  googleLogin: () => `${api.defaults.baseURL}/auth/google`,
};

export const profiles = {
  getAll: () => api.get('/profiles'),
  create: (data: any) => api.post('/profiles', data),
  update: (id: string, data: any) => api.put(`/profiles/${id}`, data),
  delete: (id: string) => api.delete(`/profiles/${id}`),
};

export const scans = {
  scanFood: (extractedText: string, profileId: string, imageFile?: File) => {
    const formData = new FormData();
    formData.append('extractedText', extractedText);
    formData.append('profileId', profileId);
    if (imageFile) formData.append('image', imageFile);
    return api.post('/scans/food', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  scanMedicine: (extractedText: string, profileId: string) =>
    api.post('/scans/medicine', { extractedText, profileId }),
  scanSupplement: (extractedText: string, profileId: string) =>
    api.post('/scans/supplement', { extractedText, profileId }),
  getHistory: (profileId: string) =>
    api.get(`/scans/history/${profileId}`),
};

export const chat = {
  createSession: (profileId: string) =>
    api.post('/chat/session', { profileId }),
  getSessions: (profileId: string) =>
    api.get(`/chat/sessions/${profileId}`),
  getSession: (id: string) => api.get(`/chat/session/${id}`),
  sendMessage: (sessionId: string, content: string) =>
    api.post('/chat/message', { sessionId, content }),
  deleteSession: (id: string) => api.delete(`/chat/session/${id}`),
};

export const pantry = {
  create: (data: any) => api.post('/pantry', data),
  getAll: (profileId: string) => api.get(`/pantry/${profileId}`),
  update: (id: string, data: any) => api.put(`/pantry/${id}`, data),
  delete: (id: string) => api.delete(`/pantry/${id}`),
  generateRecipes: (profileId: string) =>
    api.post('/pantry/recipes', { profileId }),
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
  updatePlate: (profileId: string, group: string, value: boolean) => api.put(`/dailylog/${profileId}/plate`, { group, value }),
  updateChallenge: (profileId: string, completed: boolean) => api.put(`/dailylog/${profileId}/challenge`, { completed }),
  getStreak: (profileId: string) => api.get(`/dailylog/${profileId}/streak`),
  getTips: (profileId: string) => api.get(`/dailylog/${profileId}/tips`),
  markActivity: (profileId: string) => api.post(`/dailylog/${profileId}/activity`),
};

export default api;
