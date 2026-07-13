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
