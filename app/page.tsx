'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Clock, Video, CheckCircle, ListTodo, Trash2 } from 'lucide-react';
import { createSession, getSessions, deleteSession, FocusSession } from '@/lib/store';
import { formatDistanceToNow } from 'date-fns';

export default function Dashboard() {
  const router = useRouter();
  const [sessions, setSessions] = useState<FocusSession[]>(() => getSessions());
  const [title, setTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [totalDuration, setTotalDuration] = useState(120);
  const [chunkDuration, setChunkDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);

  const handleStartSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    
    const session = createSession({
      title,
      videoUrl,
      totalDuration,
      chunkDuration,
      breakDuration,
    });
    
    router.push(`/session/${session.id}`);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Delete this session?')) {
      deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans">
      <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xl tracking-tight">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
              <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" />
            </div>
            DeepFocus
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 grid md:grid-cols-[1fr_350px] gap-12">
        <div className="space-y-10">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-3">Build your patience.</h1>
            <p className="text-zinc-400 text-lg max-w-xl">
              Break down long videos or daunting tasks into manageable focus sprints. 
              Stay engaged, take structured breaks, and actually finish what you start.
            </p>
          </div>

          <form onSubmit={handleStartSession} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">What are you focusing on?</label>
                <input 
                  type="text" 
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g., 2-Hour React Tutorial, Read Chapter 4..." 
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">Video URL (Optional)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Video className="h-5 w-5 text-zinc-600" />
                  </div>
                  <input 
                    type="url" 
                    value={videoUrl}
                    onChange={e => setVideoUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Total (min)</label>
                  <input 
                    type="number" 
                    min="1"
                    value={totalDuration}
                    onChange={e => setTotalDuration(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Focus (min)</label>
                  <input 
                    type="number" 
                    min="1"
                    value={chunkDuration}
                    onChange={e => setChunkDuration(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Break (min)</label>
                  <input 
                    type="number" 
                    min="1"
                    value={breakDuration}
                    onChange={e => setBreakDuration(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>
            </div>

            <button 
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold rounded-xl px-4 py-3.5 flex items-center justify-center gap-2 transition-colors"
            >
              <Play className="w-5 h-5 fill-zinc-950" />
              Start Focus Session
            </button>
          </form>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Clock className="w-5 h-5 text-zinc-500" />
            Recent Sessions
          </h2>
          
          {sessions.length === 0 ? (
            <div className="bg-zinc-900/50 border border-zinc-800/50 border-dashed rounded-2xl p-8 text-center text-zinc-500">
              <ListTodo className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p>No sessions yet.</p>
              <p className="text-sm mt-1">Start your first focus sprint!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map(session => (
                <div
                  key={session.id}
                  onClick={() => router.push(`/session/${session.id}`)}
                  className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 cursor-pointer transition-colors group relative"
                >
                  <div className="flex items-start justify-between mb-2 pr-6">
                    <h3 className="font-medium text-zinc-200 group-hover:text-emerald-400 transition-colors line-clamp-1">{session.title}</h3>
                    <div className="flex items-center gap-2 shrink-0">
                      {session.status === 'completed' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                      {session.status === 'active' && <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5" />}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span>{session.completedChunks} / {Math.ceil(session.totalDuration / session.chunkDuration)} chunks</span>
                    <span>•</span>
                    <span>{formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })}</span>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, session.id)}
                    className="absolute top-3 right-3 p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete session"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
