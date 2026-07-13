'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSession, updateSession, FocusSession } from '@/lib/store';
import { createAmbientSound, SoundType } from '@/lib/ambient-sounds';
import { Play, Pause, SkipForward, ArrowLeft, CheckCircle, Save, Video, Maximize, Minimize } from 'lucide-react';

// Extract YouTube video ID from various URL formats (watch, short link, embed, shorts, live)
function getYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*[?&]v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const match = url.match(p);
    if (match) return match[1];
  }
  return null;
}

function isYouTubeUrl(url: string): boolean {
  return /youtu\.be|youtube\.com/i.test(url);
}

type TimerState = 'focus' | 'break' | 'completed';

export default function SessionRoom() {
  const { id } = useParams();
  const router = useRouter();
  const [session, setSession] = useState<FocusSession | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [timerState, setTimerState] = useState<TimerState>('focus');
  const [notes, setNotes] = useState('');
  const [isClient, setIsClient] = useState(false);
  const [origin, setOrigin] = useState('');
  const [soundType, setSoundType] = useState<SoundType>('none');
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration guard: ensure client-side render before showing UI
    setIsClient(true);
    setOrigin(window.location.origin);
    const s = getSession(id as string);
    if (s) {
      setSession(s);
      setNotes(s.notes || '');
      // Initialize timer
      if (s.status === 'completed') {
        setTimerState('completed');
        setTimeLeft(0);
      } else {
        setTimeLeft(s.chunkDuration * 60);
      }
    } else {
      router.push('/');
    }
  }, [id, router]);

  const playBeep = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);

      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5);
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.error('Audio play failed', e);
    }
  }, []);

  const handleTimerComplete = useCallback(() => {
    if (!session) return;
    playBeep();

    if (timerState === 'focus') {
      // Completed a focus chunk
      const newCompleted = session.completedChunks + 1;
      const totalChunks = Math.ceil(session.totalDuration / session.chunkDuration);

      if (newCompleted >= totalChunks) {
        // Session fully completed
        updateSession(session.id, { completedChunks: newCompleted, status: 'completed', notes });
        setSession(prev => prev ? { ...prev, completedChunks: newCompleted, status: 'completed', notes } : prev);
        setTimerState('completed');
        setIsActive(false);
      } else {
        // Start break
        updateSession(session.id, { completedChunks: newCompleted, notes });
        setSession(prev => prev ? { ...prev, completedChunks: newCompleted, notes } : prev);
        setTimerState('break');
        setTimeLeft(session.breakDuration * 60);
        setIsActive(false); // Wait for user to start break
      }
    } else if (timerState === 'break') {
      // Break over, back to focus — persist any notes taken during break
      updateSession(session.id, { notes });
      setTimerState('focus');
      setTimeLeft(session.chunkDuration * 60);
      setIsActive(false);
    }
  }, [session, timerState, playBeep, notes]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((time) => time - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- timer completion must transition focus↔break
      handleTimerComplete();
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, handleTimerComplete]);

  const toggleTimer = () => setIsActive(!isActive);

  const skipTimer = () => {
    setTimeLeft(0);
    handleTimerComplete();
  };

  const saveNotes = useCallback(() => {
    if (!session) return;
    updateSession(session.id, { notes });
    setSession(prev => prev ? { ...prev, notes } : prev);
  }, [session, notes]);

  // Ambient sound — start/stop based on timer activity
  useEffect(() => {
    if (!isClient) return;
    const ctrl = createAmbientSound(soundType, 0.35);
    if (isActive && timerState === 'focus' && soundType !== 'none') {
      ctrl.start();
    }
    return () => { ctrl.stop(); };
  }, [soundType, isActive, timerState, isClient]);

  // Esc key exits immersive mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && immersive) setImmersive(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [immersive]);

  // Auto-save notes with 2-second debounce
  useEffect(() => {
    if (!session || notes === session.notes) return;
    const timer = setTimeout(() => {
      saveNotes();
    }, 2000);
    return () => clearTimeout(timer);
  }, [notes, session, saveNotes]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!isClient || !session) return null;

  const totalChunks = Math.ceil(session.totalDuration / session.chunkDuration);
  const chunkProgressPercent = (session.completedChunks / totalChunks) * 100;
  const saveStatus: 'saved' | 'unsaved' = notes === (session.notes ?? '') ? 'saved' : 'unsaved';

  // ── Circular progress ring ───────────────────────────
  const ringRadius = 100;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const currentDuration = timerState === 'focus'
    ? session.chunkDuration * 60
    : session.breakDuration * 60;
  const ringProgress = currentDuration > 0 ? timeLeft / currentDuration : 0;
  const ringOffset = ringCircumference * (1 - ringProgress);

  // Compute ring color (not a hook — avoids ordering issues with the early return guard above)
  const ringColor = timerState === 'break'
    ? '#60a5fa'
    : ringProgress > 0.6
      ? '#10b981'
      : ringProgress > 0.3
        ? '#f59e0b'
        : '#ef4444';

  const ringTrackColor = timerState === 'break' ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.08)';

  const soundOptions: { type: SoundType; label: string; emoji: string }[] = [
    { type: 'none', label: 'Off', emoji: '🔇' },
    { type: 'rain', label: 'Rain', emoji: '🌧' },
    { type: 'forest', label: 'Forest', emoji: '🌲' },
    { type: 'cafe', label: 'Cafe', emoji: '☕' },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans flex flex-col">
      <header className={`border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-md h-16 flex items-center justify-between px-6 shrink-0 ${immersive ? 'hidden' : ''}`}>
        <button 
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <div className="font-medium text-zinc-200">{session.title}</div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500">Progress:</span>
          <div className="w-32 h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${chunkProgressPercent}%` }}
            />
          </div>
          <span className="text-zinc-300 font-medium">{session.completedChunks}/{totalChunks}</span>
        </div>
      </header>

      <main className={`flex-1 overflow-hidden flex flex-col lg:flex-row ${immersive ? 'hidden' : ''}`}>
        {/* Left Side: Video or Task Info */}
        <div className="flex-1 border-r border-zinc-800 flex flex-col bg-black">
          {session.videoUrl ? (
            <div className="flex-1 flex items-center justify-center bg-black p-4">
              {isYouTubeUrl(session.videoUrl) && getYouTubeId(session.videoUrl) ? (
                <div className="w-full max-w-4xl aspect-video">
                  <iframe
                    src={`https://www.youtube.com/embed/${getYouTubeId(session.videoUrl)}?origin=${encodeURIComponent(origin)}&rel=0&modestbranding=1`}
                    width="100%"
                    height="100%"
                    allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="rounded-lg"
                    title="YouTube video player"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center max-w-md">
                  <Video className="w-12 h-12 text-zinc-600 mb-4" />
                  {getYouTubeId(session.videoUrl) ? null : (
                    <>
                      <h3 className="text-xl font-bold text-zinc-200 mb-2">URL Not Recognised</h3>
                      <p className="text-zinc-400 mb-4">
                        Paste a YouTube link (watch, short link, embed, or shorts) to play it here.
                      </p>
                    </>
                  )}
                  <a
                    href={session.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors text-sm"
                  >
                    Open in New Tab
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-12 text-center">
              <div className="max-w-md">
                <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-6">
                  <Play className="w-8 h-8 text-emerald-500 fill-emerald-500/20" />
                </div>
                <h2 className="text-2xl font-bold mb-4">{session.title}</h2>
                <p className="text-zinc-400">
                  You are currently in a focus session. Keep this window open and focus on your task.
                  Use the notepad on the right to jot down thoughts and stay engaged.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Timer & Notes */}
        <div className="w-full lg:w-[400px] flex flex-col shrink-0 bg-zinc-950">
          {/* Timer Section */}
          <div className="p-6 border-b border-zinc-800 flex flex-col items-center justify-center min-h-[300px]">
            {timerState === 'completed' ? (
              <div className="text-center space-y-4">
                <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto" />
                <h3 className="text-2xl font-bold text-zinc-100">Session Complete!</h3>
                <p className="text-zinc-400">Great job staying focused.</p>
              </div>
            ) : (
              <>
                {/* Sound selector */}
                <div className="flex items-center gap-1 mb-5">
                  {soundOptions.map(opt => (
                    <button
                      key={opt.type}
                      onClick={() => setSoundType(opt.type)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        soundType === opt.type
                          ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                      }`}
                      title={opt.label}
                    >
                      {opt.emoji} {opt.label}
                    </button>
                  ))}
                </div>

                {/* Circular progress ring */}
                <div className="relative mb-5">
                  <svg width="220" height="220" className="-rotate-90">
                    {/* Track circle */}
                    <circle
                      cx="110" cy="110" r={ringRadius}
                      fill="none"
                      stroke={ringTrackColor}
                      strokeWidth="6"
                    />
                    {/* Progress circle */}
                    <circle
                      cx="110" cy="110" r={ringRadius}
                      fill="none"
                      stroke={ringColor}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringOffset}
                      style={{ transition: 'stroke-dashoffset 0.8s linear, stroke 0.5s ease' }}
                    />
                  </svg>
                  {/* Time in center */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-bold tracking-tighter tabular-nums text-zinc-100">
                      {formatTime(timeLeft)}
                    </span>
                    <span className={`text-xs font-bold tracking-widest uppercase mt-1 ${
                      timerState === 'focus' ? 'text-emerald-400' : 'text-blue-400'
                    }`}>
                      {timerState === 'focus' ? 'Focus' : 'Break'}
                    </span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={toggleTimer}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
                        : 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400'
                    }`}
                  >
                    {isActive ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                  </button>
                  <button
                    onClick={skipTimer}
                    className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 flex items-center justify-center transition-all"
                    title="Skip"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setImmersive(true)}
                    className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 flex items-center justify-center transition-all"
                    title="Immersive mode"
                  >
                    <Maximize className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Notes Section */}
          <div className="flex-1 flex flex-col p-6 min-h-0">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h3 className="font-medium text-zinc-200">Active Notes</h3>
              <div className="flex items-center gap-2">
                {saveStatus === 'saved' && (
                  <span className="text-xs text-emerald-500 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Saved
                  </span>
                )}
                {saveStatus === 'unsaved' && (
                  <span className="text-xs text-zinc-500">Unsaved</span>
                )}
                <button
                  onClick={saveNotes}
                  className="text-xs flex items-center gap-1.5 text-zinc-500 hover:text-emerald-400 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Now
                </button>
              </div>
            </div>
            <textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Jot down thoughts, questions, or key takeaways here to stay engaged..."
              className="flex-1 w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 resize-none transition-all"
            />
          </div>
        </div>
      </main>

      {/* ── Immersive Mode Overlay ────────────────────── */}
      {immersive && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
          {/* Exit button */}
          <button
            onClick={() => setImmersive(false)}
            className="absolute top-6 right-6 text-zinc-600 hover:text-zinc-300 transition-colors"
            title="Exit immersive (Esc)"
          >
            <Minimize className="w-6 h-6" />
          </button>

          {/* Sound selector */}
          <div className="flex items-center gap-2 mb-8">
            {soundOptions.map(opt => (
              <button
                key={opt.type}
                onClick={() => setSoundType(opt.type)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  soundType === opt.type
                    ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                {opt.emoji} {opt.label}
              </button>
            ))}
          </div>

          {/* Big progress ring */}
          <div className="relative mb-10">
            <svg width="320" height="320" className="-rotate-90">
              <circle
                cx="160" cy="160" r={ringRadius + 40}
                fill="none"
                stroke={ringTrackColor}
                strokeWidth="6"
              />
              <circle
                cx="160" cy="160" r={ringRadius + 40}
                fill="none"
                stroke={ringColor}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * (ringRadius + 40)}
                strokeDashoffset={ringOffset * (ringRadius + 40) / ringRadius}
                style={{ transition: 'stroke-dashoffset 0.8s linear, stroke 0.5s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-7xl font-bold tracking-tighter tabular-nums text-zinc-100">
                {formatTime(timeLeft)}
              </span>
              <span className={`text-sm font-bold tracking-widest uppercase mt-2 ${
                timerState === 'focus' ? 'text-emerald-400' : 'text-blue-400'
              }`}>
                {timerState === 'focus' ? 'Focus Sprint' : 'Break Time'}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4 mb-8">
            <button
              onClick={toggleTimer}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                isActive
                  ? 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
                  : 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400'
              }`}
            >
              {isActive ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-1" />}
            </button>
            <button
              onClick={skipTimer}
              className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 flex items-center justify-center transition-all"
            >
              <SkipForward className="w-6 h-6" />
            </button>
          </div>

          {/* Task name + chunk progress */}
          <p className="text-zinc-500 text-sm mb-1">{session.title}</p>
          <p className="text-zinc-600 text-xs">
            Chunk {session.completedChunks + 1} of {totalChunks}
          </p>

          {/* Exit hint */}
          <p className="absolute bottom-8 text-zinc-700 text-xs">Press Esc or click ⊠ to exit</p>
        </div>
      )}
    </div>
  );
}
