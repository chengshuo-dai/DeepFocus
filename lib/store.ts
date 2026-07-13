import { v4 as uuidv4 } from 'uuid';

export type SessionStatus = 'active' | 'completed' | 'abandoned';

export interface FocusSession {
  id: string;
  title: string;
  videoUrl?: string;
  totalDuration: number; // in minutes
  chunkDuration: number; // in minutes
  breakDuration: number; // in minutes
  completedChunks: number;
  status: SessionStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export const getSessions = (): FocusSession[] => {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem('deepfocus_sessions');
  return data ? JSON.parse(data) : [];
};

export const getSession = (id: string): FocusSession | undefined => {
  return getSessions().find(s => s.id === id);
};

export const createSession = (data: Omit<FocusSession, 'id' | 'completedChunks' | 'status' | 'notes' | 'createdAt' | 'updatedAt'>): FocusSession => {
  const newSession: FocusSession = {
    ...data,
    id: uuidv4(),
    completedChunks: 0,
    status: 'active',
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const sessions = getSessions();
  localStorage.setItem('deepfocus_sessions', JSON.stringify([newSession, ...sessions]));
  return newSession;
};

export const deleteSession = (id: string): boolean => {
  const sessions = getSessions();
  const filtered = sessions.filter(s => s.id !== id);
  if (filtered.length === sessions.length) return false;
  localStorage.setItem('deepfocus_sessions', JSON.stringify(filtered));
  return true;
};

export const updateSession = (id: string, updates: Partial<FocusSession>): FocusSession | undefined => {
  const sessions = getSessions();
  const index = sessions.findIndex(s => s.id === id);
  if (index === -1) return undefined;
  
  const updatedSession = { ...sessions[index], ...updates, updatedAt: new Date().toISOString() };
  sessions[index] = updatedSession;
  localStorage.setItem('deepfocus_sessions', JSON.stringify(sessions));
  return updatedSession;
};

// ── Statistics ──────────────────────────────────────
export interface FocusStats {
  totalFocusMinutes: number;
  completedSessions: number;
  streakDays: number;
  todayFocusMinutes: number;
}

export function getStats(): FocusStats {
  const sessions = getSessions();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const completedSessions = sessions.filter(s => s.status === 'completed').length;

  let totalFocusMinutes = 0;
  let todayFocusMinutes = 0;

  // Per-day tracking for streak calculation
  const dayMap = new Map<string, number>(); // dateKey → total minutes that day

  for (const s of sessions) {
    const sessionFocus = s.completedChunks * s.chunkDuration;
    totalFocusMinutes += sessionFocus;

    const d = new Date(s.updatedAt);
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + sessionFocus);

    // Today
    const sessionDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (sessionDay.getTime() === today.getTime()) {
      todayFocusMinutes += sessionFocus;
    }
  }

  // Streak: count consecutive days backwards from today
  let streakDays = 0;
  const oneDay = 86400000;
  for (let i = 0; i < 365; i++) {
    const check = new Date(today.getTime() - i * oneDay);
    const key = `${check.getFullYear()}-${check.getMonth()}-${check.getDate()}`;
    if ((dayMap.get(key) || 0) > 0) {
      streakDays++;
    } else if (i > 0) {
      break; // chain broken (allow today to be 0)
    }
  }

  return { totalFocusMinutes, completedSessions, streakDays, todayFocusMinutes };
}
