import {
  ChevronLeft,
  ChevronRight,
  Clock,
  GraduationCap,
  Info,
  LayoutGrid,
  Lock,
  Maximize2,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HEADER_THEME_META } from '../lib/theme.ts';
import {
  type AntiCheatMode,
  DEFAULT_PORTAL_BRANDING,
  type ParticipantPublic,
  type PortalBranding,
  type QuestionPublic,
  type SavedAnswerState,
  type StudentAnswerPayload,
} from '../types/exam.ts';
import { QuestionRenderer } from './QuestionRenderer.tsx';
import { StimulusRenderer } from './StimulusRenderer.tsx';

interface ExamWorkspaceProps {
  authToken: string;
  sessionId: number;
  participant: ParticipantPublic;
  packageTitle: string;
  sessionNumber: 1 | 2 | 3;
  initialQuestions: QuestionPublic[];
  initialAnswers: SavedAnswerState[];
  expiresAt: string;
  serverNow: string;
  antiCheatMode: AntiCheatMode;
  maxWarnings: number;
  initialViolationCount: number;
  initialLocked: boolean;
  branding?: PortalBranding;
  onFinish: () => void;
}

type FontScale = 'sm' | 'base' | 'lg';

const FONT_CLASS: Record<FontScale, string> = {
  sm: 'text-sm',
  base: 'text-[15px]',
  lg: 'text-lg',
};

function isAnswerFilled(answer: StudentAnswerPayload | null | undefined): boolean {
  if (!answer) return false;
  switch (answer.type) {
    case 'PG_SEDERHANA':
      return Boolean(answer.optionId);
    case 'MCMA':
      return answer.optionIds.length > 0;
    case 'PGK_KATEGORI':
      return Object.keys(answer.selections).length > 0;
    case 'MENJODOHKAN':
      return Object.keys(answer.pairs).length > 0;
    case 'URAIAN':
      return answer.text.trim().length > 0;
  }
}

export const ExamWorkspace: React.FC<ExamWorkspaceProps> = ({
  authToken,
  sessionId,
  participant,
  packageTitle,
  sessionNumber,
  initialQuestions,
  initialAnswers,
  expiresAt,
  serverNow,
  antiCheatMode,
  maxWarnings,
  initialViolationCount,
  initialLocked,
  branding = DEFAULT_PORTAL_BRANDING,
  onFinish,
}) => {
  const headerThemeClass = HEADER_THEME_META[branding.themePreset]?.headerClass || 'tka-header-bg';
  const [questions, setQuestions] = useState<QuestionPublic[]>(initialQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fontScale, setFontScale] = useState<FontScale>('base');
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showDaftarSoal, setShowDaftarSoal] = useState(false);
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  // Anti-cheat lock & warning states
  const [isLocked, setIsLocked] = useState(initialLocked);
  const [violationCount, setViolationCount] = useState(initialViolationCount);
  const [warningBanner, setWarningBanner] = useState<string | null>(null);
  const [unlockInput, setUnlockInput] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockLoading, setUnlockLoading] = useState(false);

  // Answers map + offline pending queue
  const [answersMap, setAnswersMap] = useState<Record<number, SavedAnswerState>>(() => {
    const map: Record<number, SavedAnswerState> = {};
    for (const item of initialAnswers) {
      map[item.questionId] = item;
    }
    return map;
  });
  const pendingSyncRef = useRef<Map<number, SavedAnswerState>>(new Map());
  const debounceTimerRef = useRef<number | null>(null);

  // Server-synchronized countdown timer (0 polling!)
  const clockOffsetMs = useMemo(
    () => new Date(serverNow).getTime() - Date.now(),
    [serverNow],
  );
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    const diff = new Date(expiresAt).getTime() - (Date.now() + clockOffsetMs);
    return Math.max(0, Math.floor(diff / 1000));
  });

  const currentQuestion = questions[currentIndex];

  const syncAnswerToServer = useCallback(
    async (payload: SavedAnswerState) => {
      try {
        const res = await fetch('/api/participant/answer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            sessionId,
            questionId: payload.questionId,
            answer: payload.answer,
            isDoubtful: payload.isDoubtful,
          }),
        });
        if (res.status === 423) {
          setIsLocked(true);
          return;
        }
        if (res.ok) {
          pendingSyncRef.current.delete(payload.questionId);
        }
      } catch {
        pendingSyncRef.current.set(payload.questionId, payload);
      }
    },
    [authToken, sessionId],
  );

  // Flush queued offline answers when connection recovers
  useEffect(() => {
    const flushQueue = async () => {
      if (pendingSyncRef.current.size === 0) return;
      const items = Array.from(pendingSyncRef.current.values());
      for (const item of items) {
        await syncAnswerToServer(item);
      }
    };
    window.addEventListener('online', flushQueue);
    return () => window.removeEventListener('online', flushQueue);
  }, [syncAnswerToServer]);

  const handleAnswerChange = (nextAnswer: StudentAnswerPayload) => {
    if (!currentQuestion || isLocked) return;
    const prev = answersMap[currentQuestion.id];
    const nextState: SavedAnswerState = {
      questionId: currentQuestion.id,
      answer: nextAnswer,
      isDoubtful: prev?.isDoubtful || false,
    };

    setAnswersMap((m) => ({ ...m, [currentQuestion.id]: nextState }));
    pendingSyncRef.current.set(currentQuestion.id, nextState);

    if (nextAnswer.type === 'URAIAN') {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(() => {
        void syncAnswerToServer(nextState);
      }, 1400);
    } else {
      void syncAnswerToServer(nextState);
    }
  };

  const toggleDoubtful = () => {
    if (!currentQuestion || isLocked) return;
    const prev = answersMap[currentQuestion.id];
    const nextState: SavedAnswerState = {
      questionId: currentQuestion.id,
      answer: prev?.answer || null,
      isDoubtful: !(prev?.isDoubtful || false),
    };
    setAnswersMap((m) => ({ ...m, [currentQuestion.id]: nextState }));
    void syncAnswerToServer(nextState);
  };

  const handleFinishSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setFinishError(null);
    try {
      // Flush any remaining debounced answer before finishing
      for (const pending of pendingSyncRef.current.values()) {
        await syncAnswerToServer(pending);
      }
      const res = await fetch('/api/participant/finish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        onFinish();
      } else {
        setFinishError(data.error || 'Gagal mengakhiri tes. Silakan coba tekan SELESAI TES kembali.');
      }
    } catch {
      setFinishError('Koneksi ke server terganggu. Periksa jaringan lalu tekan SELESAI TES kembali.');
    } finally {
      setSubmitting(false);
    }
  }, [authToken, onFinish, sessionId, submitting, syncAnswerToServer]);

  // Countdown tick & random jitter (1-7s) on auto-expire for 1,500-student load safety
  useEffect(() => {
    const id = window.setInterval(() => {
      const diff = new Date(expiresAt).getTime() - (Date.now() + clockOffsetMs);
      const secs = Math.max(0, Math.floor(diff / 1000));
      setRemainingSeconds(secs);
      if (secs === 0) {
        window.clearInterval(id);
        const jitterMs = 1000 + Math.floor(Math.random() * 6000);
        window.setTimeout(() => {
          void handleFinishSubmit();
        }, jitterMs);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [clockOffsetMs, expiresAt, handleFinishSubmit]);

  // ==========================================
  // SMART ANTI-CHEAT MONITOR (HP & LAPTOP SAFE)
  // ==========================================
  const hiddenStartRef = useRef<number | null>(null);
  const graceTimerRef = useRef<number | null>(null);
  const lastWidthRef = useRef<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const wasFullscreenRef = useRef<boolean>(
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false,
  );

  const reportViolation = useCallback(
    async (reason: string, durationSeconds: number) => {
      if (isLocked || submitting) return;
      try {
        const res = await fetch('/api/participant/violation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            sessionId,
            reason,
            durationSeconds: Math.round(durationSeconds),
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setViolationCount(Number(data.violationCount || 0));
          if (data.locked) {
            setIsLocked(true);
            setWarningBanner(null);
          } else {
            setWarningBanner(
              `Peringatan Pelanggaran (${data.violationCount}/${data.maxWarnings}): ${reason}. Jangan keluar dari halaman ujian!`,
            );
          }
        }
      } catch {
        // Ignore transient network errors during violation ping
      }
    },
    [authToken, isLocked, sessionId, submitting],
  );

  useEffect(() => {
    if (isLocked) return;

    wasFullscreenRef.current = Boolean(document.fullscreenElement);

    // Trap browser Back button so students don't accidentally exit exam
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
      setWarningBanner('Tombol Kembali dinonaktifkan selama ujian berlangsung.');
    };

    const startGraceCheck = (reason: string) => {
      if (hiddenStartRef.current !== null) return;
      hiddenStartRef.current = Date.now();
      graceTimerRef.current = window.setTimeout(() => {
        if (hiddenStartRef.current !== null) {
          const elapsed = (Date.now() - hiddenStartRef.current) / 1000;
          hiddenStartRef.current = null;
          void reportViolation(reason, elapsed);
        }
      }, 2400);
    };

    const clearGraceCheck = () => {
      if (graceTimerRef.current) {
        window.clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
      hiddenStartRef.current = null;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        startGraceCheck('Berpindah tab atau membuka aplikasi lain');
      } else {
        clearGraceCheck();
      }
    };

    const handleBlur = () => {
      // Only trigger if document loses window focus > 2.4s
      startGraceCheck('Meninggalkan jendela ujian');
    };

    const handleFocus = () => {
      clearGraceCheck();
    };

    // Detect split-screen / floating window on mobile by checking WIDTH shrink only
    // (Virtual keyboard on HP only changes innerHeight, NEVER innerWidth!)
    const handleResize = () => {
      const w = window.innerWidth;
      if (lastWidthRef.current - w > 140 && w < 320) {
        void reportViolation('Terdeteksi mode split-screen / memperkecil layar', 3);
      }
      lastWidthRef.current = w;
    };

    const handleFullscreenChange = () => {
      const isNowFullscreen = Boolean(document.fullscreenElement);
      if (wasFullscreenRef.current && !isNowFullscreen) {
        void reportViolation('Keluar dari mode layar penuh (Fullscreen)', 2);
      }
      wasFullscreenRef.current = isNowFullscreen;
    };

    window.addEventListener('popstate', handlePopState);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('resize', handleResize);

    return () => {
      clearGraceCheck();
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('resize', handleResize);
    };
  }, [isLocked, reportViolation]);

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    setUnlockLoading(true);
    try {
      const res = await fetch('/api/participant/unlock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ sessionId, unlockToken: unlockInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUnlockError(data.error || 'Token Buka Kunci salah.');
        return;
      }
      if (Array.isArray(data.questions) && data.questions.length > 0) {
        setQuestions(data.questions);
      }
      setUnlockInput('');
      setIsLocked(false);
      document.documentElement.requestFullscreen?.().catch(() => {});
    } catch {
      setUnlockError('Gagal terhubung ke server. Periksa koneksi internet.');
    } finally {
      setUnlockLoading(false);
    }
  };

  const handleCheckDirectUnlock = async () => {
    setUnlockError(null);
    setUnlockLoading(true);
    try {
      const res = await fetch(`/api/participant/session-status?sessionId=${sessionId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (res.ok && data.status === 'IN_PROGRESS') {
        // Re-fetch start payload cleanly if questions weren't loaded yet
        const startRes = await fetch('/api/participant/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ sessionId }),
        });
        const startData = await startRes.json();
        if (startRes.ok && Array.isArray(startData.questions)) {
          setQuestions(startData.questions);
        }
        setIsLocked(false);
      } else {
        setUnlockError('Sesi masih terkunci. Silakan masukkan Token Buka Kunci dari Pengawas.');
      }
    } catch {
      setUnlockError('Gagal mengecek status sesi.');
    } finally {
      setUnlockLoading(false);
    }
  };

  const formatTimer = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const answeredCount = questions.filter((q) => isAnswerFilled(answersMap[q.id]?.answer)).length;
  const doubtfulCount = questions.filter((q) => answersMap[q.id]?.isDoubtful).length;
  const unansweredCount = questions.length - answeredCount;

  // ==========================================
  // LOCK SCREEN (ANTI-CHEAT / MINTA TOKEN ULANG)
  // ==========================================
  if (isLocked) {
    return (
      <div className="min-h-screen bg-[#f4f7fb] flex flex-col">
        <header className={`${headerThemeClass} px-4 py-3 text-white shadow-sm sm:px-6`}>
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt="Logo"
                  className="h-9 w-9 shrink-0 rounded-full border border-white/30 bg-white/95 object-contain p-0.5"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold">
                  {branding.logoBadgeText || 'TKA'}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold tracking-wide uppercase opacity-90 truncate">
                  {branding.headerOrgLabel || 'PUSMENDIK'} · {branding.portalTitle || 'SIMULASI TKA'}
                </div>
                <div className="truncate text-sm font-bold">{packageTitle}</div>
              </div>
            </div>
            <div className="text-right text-xs sm:text-sm shrink-0">
              <div className="font-semibold">{participant.fullName}</div>
              <div className="opacity-85">{participant.schoolName} · Sesi {sessionNumber}</div>
            </div>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-md">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <Lock className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-center text-lg font-bold text-slate-900">
              Sesi Ujian Terkunci Sementara
            </h2>
            <p className="mt-2 text-center text-sm leading-relaxed text-slate-600">
              Sistem mendeteksi aktivitas keluar dari halaman ujian atau berpindah aplikasi ({violationCount}x pelanggaran). Demi menjaga kejujuran ujian, soal disembunyikan.
            </p>

            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Hubungi <strong>Pengawas / Proktor</strong> untuk mendapatkan <strong>Token Buka Kunci (Token Ulang)</strong> agar Anda dapat melanjutkan dari soal terakhir. Seluruh jawaban Anda tetap aman tersimpan.
            </div>

            <form onSubmit={handleUnlockSubmit} className="mt-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Masukkan Token Buka Kunci dari Pengawas
                </label>
                <input
                  type="text"
                  value={unlockInput}
                  onChange={(e) => setUnlockInput(e.target.value.toUpperCase())}
                  placeholder="Contoh: K8M4P2"
                  maxLength={10}
                  required
                  className="mt-1.5 w-full rounded-md border border-slate-300 px-3.5 py-2.5 text-center font-mono text-base font-bold tracking-widest uppercase text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {unlockError && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {unlockError}
                </div>
              )}

              <button
                type="submit"
                disabled={unlockLoading}
                className="w-full rounded-md bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {unlockLoading ? 'Memverifikasi...' : 'Buka Kunci & Lanjutkan Ujian'}
              </button>
            </form>

            <button
              type="button"
              onClick={handleCheckDirectUnlock}
              disabled={unlockLoading}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Cek Jika Pengawas Membuka Kunci Langsung
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ==========================================
  // FULL-PAGE KONFIRMASI TES (SELESAI / KEMBALI)
  // ==========================================
  if (showConfirmFinish) {
    return (
      <div
        className="exam-protected-surface min-h-screen bg-[#f4f7fb] flex flex-col"
        onContextMenu={(e) => e.preventDefault()}
      >
        <header className={`${headerThemeClass} px-4 py-3 text-white shadow-sm sm:px-6`}>
          <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt="Logo"
                  className="h-9 w-9 shrink-0 rounded-full border border-white/30 bg-white/95 object-contain p-0.5"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/15 text-xs font-bold">
                  {branding.logoBadgeText || 'TKA'}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-bold tracking-wide uppercase opacity-95 truncate">
                  {branding.headerOrgLabel || 'PUSMENDIK'}
                </div>
                <div className="truncate text-xs sm:text-sm font-medium opacity-95">
                  {branding.headerAppTitle || 'APLIKASI UJIAN TKA'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-xs sm:text-sm font-medium truncate max-w-[180px] sm:max-w-[260px]">
                {participant.username} - {participant.fullName}
              </span>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white/20 text-white">
                <GraduationCap className="h-4 w-4" />
              </div>
            </div>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-[520px] rounded-xl bg-white p-7 shadow-[0_12px_36px_rgba(15,23,42,0.08)] sm:p-9">
            <h1 className="text-xl font-semibold text-slate-900 sm:text-[22px]">
              Konfirmasi Tes
            </h1>

            <p className="mt-4 text-sm leading-relaxed text-slate-700">
              Terimakasih telah berpartisipasi dalam tes ini. Silahkan tekan tombol{' '}
              <span className="inline-block rounded-[2px] bg-[#dc2626] px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white uppercase">
                SELESAI TES
              </span>{' '}
              untuk mengakhiri tes. Atau tekan tombol{' '}
              <span className="inline-block rounded-[2px] bg-[#15803d] px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white uppercase">
                KEMBALI
              </span>{' '}
              untuk kembali ke halaman tes.
            </p>

            {finishError && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {finishError}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleFinishSubmit()}
                className="rounded-full bg-[#dc2626] px-7 py-2.5 text-xs font-bold tracking-wide text-white uppercase shadow-xs transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                {submitting ? 'MENGAKHIRI TES...' : 'SELESAI TES'}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setFinishError(null);
                  setShowConfirmFinish(false);
                }}
                className="rounded-full bg-[#15803d] px-7 py-2.5 text-xs font-bold tracking-wide text-white uppercase shadow-xs transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                KEMBALI
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div
      className="exam-protected-surface min-h-screen bg-[#f4f7fb] flex flex-col"
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
    >
      {/* Official Header */}
      <header className={`${headerThemeClass} px-4 py-3 text-white shadow-sm sm:px-6`}>
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt="Logo"
                className="h-9 w-9 shrink-0 rounded-full border border-white/30 bg-white/95 object-contain p-0.5"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/15 text-xs font-bold">
                {branding.logoBadgeText || 'TKA'}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-[11px] font-semibold tracking-wider uppercase opacity-90 truncate">
                {branding.headerOrgLabel || 'PUSMENDIK'} · {branding.headerAppTitle || 'APLIKASI UJIAN TKA'}
              </div>
              <div className="truncate text-sm font-bold">{packageTitle}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
              title="Mode Layar Penuh"
              className="hidden sm:inline-flex items-center gap-1 rounded border border-white/25 bg-white/10 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/20"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Layar Penuh
            </button>
            <div className="text-right text-xs">
              <div className="font-semibold truncate max-w-[180px]">
                {participant.username} - {participant.fullName}
              </div>
              <div className="opacity-85">
                {participant.schoolName} · Sesi {sessionNumber}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Warning banner if tolerance mode */}
      {warningBanner && (
        <div className="border-b border-red-300 bg-red-600 px-4 py-2 text-center text-xs font-semibold text-white flex items-center justify-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{warningBanner}</span>
          <button
            type="button"
            onClick={() => setWarningBanner(null)}
            className="ml-2 rounded bg-white/20 px-1.5 py-0.5 text-[11px] hover:bg-white/30"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Exam Control Sub-bar (matches PDF Screenshots 5-10) */}
      <div className="border-b border-slate-200 bg-white px-4 py-2.5 shadow-2xs sm:px-6">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-sm font-bold text-slate-900 sm:text-base">
              Soal nomor{' '}
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded bg-blue-50 px-2 font-mono text-blue-700">
                {currentIndex + 1}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="hidden sm:inline">Ukuran font soal:</span>
              {(['sm', 'base', 'lg'] as FontScale[]).map((sz, i) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setFontScale(sz)}
                  className={`flex h-7 w-7 items-center justify-center rounded border font-bold transition-colors ${
                    fontScale === sz
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  } ${i === 0 ? 'text-xs' : i === 1 ? 'text-sm' : 'text-base'}`}
                  title={i === 0 ? 'Kecil' : i === 1 ? 'Normal' : 'Besar'}
                >
                  A
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden sm:inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs font-semibold tabular-nums text-slate-700 whitespace-nowrap shrink-0">
              Terjawab {answeredCount}/{questions.length}
            </div>

            <button
              type="button"
              onClick={() => setShowInfoModal(true)}
              className="inline-flex items-center gap-1.5 rounded bg-[#1d4ed8] px-3 py-1.5 text-xs font-bold text-white whitespace-nowrap shrink-0 hover:bg-blue-800"
            >
              <Info className="h-3.5 w-3.5" />
              INFORMASI SOAL
            </button>

            <div
              className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-xs font-bold tabular-nums whitespace-nowrap shrink-0 ${
                remainingSeconds <= 300
                  ? 'border-red-300 bg-red-50 text-red-700'
                  : 'border-slate-200 bg-slate-50 text-slate-800'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              Sisa Waktu: {formatTimer(remainingSeconds)}
            </div>

            <button
              type="button"
              onClick={() => setShowDaftarSoal(true)}
              className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white whitespace-nowrap shrink-0 hover:bg-blue-700"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Daftar Soal
            </button>
          </div>
        </div>
      </div>

      {/* Main Adaptive Exam Body */}
      <main className="mx-auto w-full max-w-[1360px] flex-1 p-4 sm:p-6">
        {currentQuestion ? (
          <div className="rounded-lg border border-slate-200 bg-white shadow-xs">
            {currentQuestion.layoutMode === 'split_two_column' && currentQuestion.stimulus ? (
              <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                <div className="max-h-[65vh] overflow-y-auto p-5 sm:p-6">
                  <StimulusRenderer
                    stimulus={currentQuestion.stimulus}
                    fontSizeClass={FONT_CLASS[fontScale]}
                  />
                </div>
                <div className="max-h-[65vh] overflow-y-auto p-5 sm:p-6">
                  <QuestionRenderer
                    question={currentQuestion}
                    answer={answersMap[currentQuestion.id]?.answer || null}
                    onChange={handleAnswerChange}
                    fontSizeClass={FONT_CLASS[fontScale]}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-5 p-5 sm:p-7">
                {currentQuestion.stimulus && (
                  <StimulusRenderer
                    stimulus={currentQuestion.stimulus}
                    fontSizeClass={FONT_CLASS[fontScale]}
                  />
                )}
                <QuestionRenderer
                  question={currentQuestion}
                  answer={answersMap[currentQuestion.id]?.answer || null}
                  onChange={handleAnswerChange}
                  fontSizeClass={FONT_CLASS[fontScale]}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
            Tidak ada butir soal pada paket ini.
          </div>
        )}
      </main>

      {/* Bottom Official Navigation Bar (Red / Amber / Blue) */}
      <footer className="sticky bottom-0 z-20 border-t border-slate-200 bg-white px-4 py-3 shadow-xs sm:px-6">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-2 sm:gap-4">
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#ef4444] px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40 sm:px-5 sm:text-sm whitespace-nowrap shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
            Soal sebelumnya
          </button>

          <button
            type="button"
            onClick={toggleDoubtful}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold shadow-xs transition-colors sm:px-6 sm:text-sm whitespace-nowrap shrink-0 ${
              currentQuestion && answersMap[currentQuestion.id]?.isDoubtful
                ? 'bg-[#eab308] text-slate-950 ring-2 ring-amber-300'
                : 'bg-[#facc15] text-slate-900 hover:bg-amber-400'
            }`}
          >
            <input
              type="checkbox"
              readOnly
              checked={Boolean(currentQuestion && answersMap[currentQuestion.id]?.isDoubtful)}
              className="pointer-events-none h-3.5 w-3.5 accent-slate-900"
            />
            Ragu-ragu
          </button>

          {currentIndex < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#2563eb] px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-700 sm:px-5 sm:text-sm whitespace-nowrap shrink-0"
            >
              Soal berikutnya
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowConfirmFinish(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#059669] px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 sm:px-6 sm:text-sm whitespace-nowrap shrink-0"
            >
              Selesai Tes
            </button>
          )}
        </div>
      </footer>

      {/* Modal: INFORMASI SOAL */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Informasi Soal & Aturan Ujian</h3>
              <button
                type="button"
                onClick={() => setShowInfoModal(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-2.5 text-sm text-slate-700">
              <p>
                <strong>Paket Ujian:</strong> {packageTitle}
              </p>
              <p>
                <strong>Total Butir Soal:</strong> {questions.length} soal (terjawab {answeredCount}, ragu-ragu {doubtfulCount})
              </p>
              <p>
                <strong>Kebijakan Anti-Curang:</strong>{' '}
                {antiCheatMode === 'strict'
                  ? 'Mode Ketat — Keluar dari halaman ujian atau berpindah aplikasi langsung mengunci sesi dan memerlukan Token Buka Kunci dari Pengawas.'
                  : `Mode Toleransi — Maksimal ${maxWarnings} kali peringatan sebelum sesi terkunci.`}
              </p>
              <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                Pastikan seluruh soal telah terjawab sebelum menekan tombol <strong>Selesai Tes</strong> pada nomor terakhir.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowInfoModal(false)}
              className="mt-5 w-full rounded-md bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Modal: DAFTAR SOAL */}
      {showDaftarSoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Daftar Nomor Soal</h3>
              <button
                type="button"
                onClick={() => setShowDaftarSoal(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-5 gap-2.5 sm:grid-cols-6">
              {questions.map((q, idx) => {
                const state = answersMap[q.id];
                const filled = isAnswerFilled(state?.answer);
                const doubtful = Boolean(state?.isDoubtful);
                const isCurrent = idx === currentIndex;

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(idx);
                      setShowDaftarSoal(false);
                    }}
                    className={`flex h-11 items-center justify-center rounded-md border font-mono text-sm font-bold transition-colors ${
                      doubtful
                        ? 'border-amber-500 bg-[#facc15] text-slate-950'
                        : filled
                          ? 'border-blue-700 bg-blue-600 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    } ${isCurrent ? 'ring-2 ring-slate-900 ring-offset-1' : ''}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-slate-200 pt-3 text-xs text-slate-600">
              <div className="flex items-center gap-1.5">
                <span className="h-3.5 w-3.5 rounded bg-blue-600" /> Sudah dijawab ({answeredCount})
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3.5 w-3.5 rounded bg-[#facc15]" /> Ragu-ragu ({doubtfulCount})
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3.5 w-3.5 rounded border border-slate-300 bg-white" /> Belum dijawab ({unansweredCount})
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDaftarSoal(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Kembali ke Soal
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDaftarSoal(false);
                  setShowConfirmFinish(true);
                }}
                className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Selesai Tes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
