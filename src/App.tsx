import {
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  Layers,
  Lock,
  Megaphone,
  Play,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { AdminPortal } from './components/AdminPortal.tsx';
import { ExamWorkspace } from './components/ExamWorkspace.tsx';
import { OfflineIndicator, PWAInstallButton } from './components/PWAComponents.tsx';
import { HEADER_THEME_META } from './lib/theme.ts';
import {
  type AntiCheatMode,
  DEFAULT_PORTAL_BRANDING,
  type ExamPackage,
  type ExamSchedule,
  type ParticipantPublic,
  type PortalBranding,
  type QuestionPublic,
  type SavedAnswerState,
} from './types/exam.ts';

type AppStep =
  | 'SELECT_SIMULATION'
  | 'LOGIN'
  | 'CONFIRM_PARTICIPANT'
  | 'CONFIRM_TEST'
  | 'EXAM'
  | 'ADMIN';

const MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export default function App() {
  const [step, setStep] = useState<AppStep>('SELECT_SIMULATION');

  // Catalog & branding state
  const [packages, setPackages] = useState<ExamPackage[]>([]);
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [branding, setBranding] = useState<PortalBranding>(DEFAULT_PORTAL_BRANDING);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  // Step 1 selections
  const [selectedLevel, setSelectedLevel] = useState('SMP/MTs/Sederajat');
  const [selectedCategory, setSelectedCategory] = useState('Mata Pelajaran Wajib');
  const [selectedPackageId, setSelectedPackageId] = useState<number>(0);

  // Step 2 Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Authenticated student session state (stored strictly in React memory)
  const [authToken, setAuthToken] = useState<string>('');
  const [participant, setParticipant] = useState<ParticipantPublic | null>(null);
  const [activeSchedule, setActiveSchedule] = useState<{
    id: number;
    packageId: number;
    packageTitle: string;
    subjectName: string;
    durationMinutes: number;
    sessionNumber: 1 | 2 | 3;
    examDate: string;
    startTime: string;
    endTime: string;
    antiCheatMode: AntiCheatMode;
    maxWarnings: number;
    visibleToken: string | null;
  } | null>(null);

  // Step 3 Participant Confirmation state
  const [typedName, setTypedName] = useState('');
  const [birthDay, setBirthDay] = useState('15');
  const [birthMonth, setBirthMonth] = useState('8');
  const [birthYear, setBirthYear] = useState('2010');
  const [tokenInput, setTokenInput] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Step 4 Test Confirmation state
  const [sessionId, setSessionId] = useState<number>(0);
  const [testSummary, setTestSummary] = useState<{
    packageTitle: string;
    subjectName: string;
    testStatus: string;
    examDateTime: string;
    durationMinutes: number;
    sessionNumber: 1 | 2 | 3;
    antiCheatMode: AntiCheatMode;
    maxWarnings: number;
  } | null>(null);
  const [startLoading, setStartLoading] = useState(false);

  // Step 5 Exam Workspace payload
  const [examQuestions, setExamQuestions] = useState<QuestionPublic[]>([]);
  const [savedAnswers, setSavedAnswers] = useState<SavedAnswerState[]>([]);
  const [examExpiresAt, setExamExpiresAt] = useState<string>('');
  const [examServerNow, setExamServerNow] = useState<string>('');
  const [initialViolationCount, setInitialViolationCount] = useState<number>(0);
  const [initialLocked, setInitialLocked] = useState<boolean>(false);

  // Notice displayed cleanly on initial portal after finishing exam
  const [finishNotice, setFinishNotice] = useState<string | null>(null);

  const loadCatalog = async () => {
    setLoadingCatalog(true);
    try {
      const res = await fetch('/api/catalog');
      const data = await res.json();
      if (res.ok) {
        const pkgs: ExamPackage[] = data.packages || [];
        setPackages(pkgs);
        setSchedules(data.schedules || []);
        if (data.branding) {
          setBranding({ ...DEFAULT_PORTAL_BRANDING, ...data.branding });
        }
        const defaultPkg =
          pkgs.find(
            (p) =>
              p.educationLevel === 'SMP/MTs/Sederajat' &&
              p.subjectCategory === 'Mata Pelajaran Wajib',
          ) || pkgs[0];
        if (defaultPkg) {
          setSelectedLevel(defaultPkg.educationLevel);
          setSelectedCategory(defaultPkg.subjectCategory);
          setSelectedPackageId(defaultPkg.id);
        }
      }
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, []);

  useEffect(() => {
    if (branding.portalTitle) {
      document.title = `${branding.portalTitle} · ${branding.headerOrgLabel || 'CBT'}`;
    }
  }, [branding.headerOrgLabel, branding.portalTitle]);

  const themeMeta = HEADER_THEME_META[branding.themePreset] || HEADER_THEME_META.pusmendik_blue;

  const filteredPackages = useMemo(() => {
    return packages.filter(
      (p) =>
        p.educationLevel === selectedLevel && p.subjectCategory === selectedCategory,
    );
  }, [packages, selectedCategory, selectedLevel]);

  useEffect(() => {
    if (filteredPackages.length > 0) {
      if (!filteredPackages.some((p) => p.id === selectedPackageId)) {
        setSelectedPackageId(filteredPackages[0].id);
      }
    } else {
      setSelectedPackageId(0);
    }
  }, [filteredPackages, selectedPackageId]);

  const resetToHome = (notice?: string) => {
    setAuthToken('');
    setParticipant(null);
    setActiveSchedule(null);
    setSessionId(0);
    setTestSummary(null);
    setExamQuestions([]);
    setSavedAnswers([]);
    setUsername('');
    setPassword('');
    setShowPassword(false);
    setLoginError(null);
    setConfirmError(null);
    setTypedName('');
    setTokenInput('');
    setFinishNotice(notice || null);
    setStep('SELECT_SIMULATION');
    void loadCatalog();
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      const res = await fetch('/api/participant/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          packageId: selectedPackageId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Login gagal.');
        return;
      }

      setAuthToken(data.authToken);
      setParticipant(data.participant);
      setActiveSchedule(data.schedule);

      // Parse participant birthDate as helpful default or empty
      const parts = String(data.participant.birthDate || '2010-08-15').split('-');
      if (parts.length === 3) {
        setBirthYear(parts[0]);
        setBirthMonth(String(Number(parts[1])));
        setBirthDay(String(Number(parts[2])));
      }
      setTypedName('');
      setTokenInput('');
      setConfirmError(null);
      setStep('CONFIRM_PARTICIPANT');
    } catch {
      setLoginError('Gagal terhubung ke server.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleConfirmParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchedule) return;
    setConfirmError(null);
    setConfirmLoading(true);
    try {
      const res = await fetch('/api/participant/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          scheduleId: activeSchedule.id,
          typedName,
          birthDay,
          birthMonth,
          birthYear,
          tokenInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConfirmError(data.error || 'Konfirmasi gagal.');
        return;
      }

      if (data.alreadyCompleted) {
        setConfirmError(
          'Peserta ini sudah menyelesaikan tes dan mengirim jawaban. Nilai telah tersimpan di server.',
        );
        return;
      }

      setSessionId(data.sessionId);
      setTestSummary(data.testSummary);
      setStep('CONFIRM_TEST');
    } catch {
      setConfirmError('Gagal terhubung ke server.');
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleStartTest = async () => {
    setStartLoading(true);
    try {
      const res = await fetch('/api/participant/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConfirmError(data.error || 'Gagal memulai tes.');
        return;
      }
      if (data.status === 'COMPLETED') {
        resetToHome('Peserta ini sudah menyelesaikan tes. Jawaban telah tercatat di server.');
        return;
      }

      setExamQuestions(data.questions || []);
      setSavedAnswers(data.savedAnswers || []);
      setExamExpiresAt(data.expiresAt);
      setExamServerNow(data.serverNow);
      setInitialViolationCount(Number(data.violationCount || 0));
      setInitialLocked(data.status === 'LOCKED');

      // Enter fullscreen cleanly on start
      document.documentElement.requestFullscreen?.().catch(() => {});
      setStep('EXAM');
    } finally {
      setStartLoading(false);
    }
  };

  if (step === 'ADMIN') {
    return (
      <>
        <AdminPortal onBackToStudent={() => resetToHome()} onBrandingChange={setBranding} />
        <OfflineIndicator />
      </>
    );
  }

  if (step === 'EXAM' && participant && activeSchedule) {
    return (
      <>
        <ExamWorkspace
          authToken={authToken}
          sessionId={sessionId}
          participant={participant}
          packageTitle={activeSchedule.packageTitle}
          sessionNumber={activeSchedule.sessionNumber}
          initialQuestions={examQuestions}
          initialAnswers={savedAnswers}
          expiresAt={examExpiresAt}
          serverNow={examServerNow}
          antiCheatMode={activeSchedule.antiCheatMode}
          maxWarnings={activeSchedule.maxWarnings}
          initialViolationCount={initialViolationCount}
          initialLocked={initialLocked}
          branding={branding}
          onFinish={() => {
            resetToHome('Terima kasih, tes telah selesai dan seluruh jawaban Anda telah berhasil dikirim.');
          }}
        />
        <OfflineIndicator />
      </>
    );
  }

  // STEP 1: SELECT SIMULATION (Matches PDF Screenshot 1 + Customizable Portal Branding)
  if (step === 'SELECT_SIMULATION') {
    const showCustomBadgeText = branding.logoBadgeText && branding.logoBadgeText !== 'TKA';
    return (
      <div className={`${themeMeta.headerClass} min-h-screen flex flex-col justify-between p-4 sm:p-6`}>
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-semibold tracking-wide text-white/90">
            {branding.topBannerText || 'SISTEM SIMULASI TKA · MULTI-SEKOLAH'}
          </div>
          <div className="flex items-center gap-2">
            <PWAInstallButton variant="dark" />
            <button
              type="button"
              onClick={() => setStep('ADMIN')}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Portal Pengawas & Bank Soal
            </button>
          </div>
        </div>

        <main className="my-8 flex items-center justify-center">
          <div className="w-full max-w-md rounded-xl border border-white/20 bg-white p-6 shadow-2xl sm:p-7">
            <div className="flex flex-col items-center text-center">
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={branding.portalTitle}
                  className="h-14 w-14 rounded-full border border-slate-200 bg-white object-contain p-1 shadow-sm"
                  referrerPolicy="no-referrer"
                />
              ) : showCustomBadgeText ? (
                <div className="flex h-12 min-w-12 items-center justify-center rounded-full bg-slate-900 px-3 text-xs font-bold tracking-wider text-white shadow-sm">
                  {branding.logoBadgeText}
                </div>
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm">
                  <GraduationCap className="h-6 w-6" />
                </div>
              )}
              <h1 className="mt-3 text-xl font-bold text-slate-900">
                {branding.portalTitle || 'Simulasi TKA'}
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                {branding.portalSubtitle || 'Pilih jenjang dan mata pelajaran untuk memulai simulasi'}
              </p>
            </div>

            {finishNotice && (
              <div className="mt-4 flex items-start justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium leading-relaxed text-emerald-900">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                  <span>{finishNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFinishNotice(null)}
                  className="rounded p-0.5 text-emerald-700 hover:bg-emerald-100"
                  aria-label="Tutup pemberitahuan"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {branding.announcementText && (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
                <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                <span>{branding.announcementText}</span>
              </div>
            )}

            <div className="mt-6 space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <GraduationCap className="h-3.5 w-3.5 text-slate-500" />
                  {branding.levelLabel || 'Jenjang Pendidikan:'}
                </label>
                <select
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="SD/MI/Sederajat">SD/MI/Sederajat</option>
                  <option value="SMP/MTs/Sederajat">SMP/MTs/Sederajat</option>
                  <option value="SMA/MA/SMK/Sederajat">SMA/MA/SMK/Sederajat</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <Layers className="h-3.5 w-3.5 text-slate-500" />
                  {branding.categoryLabel || 'Jenis Mata Pelajaran:'}
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="Mata Pelajaran Wajib">Mata Pelajaran Wajib</option>
                  <option value="Mata Pelajaran Pilihan">Mata Pelajaran Pilihan</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <BookOpen className="h-3.5 w-3.5 text-slate-500" />
                  {branding.subjectLabel || 'Mata Pelajaran & Paket:'}
                </label>
                <select
                  value={selectedPackageId}
                  onChange={(e) => setSelectedPackageId(Number(e.target.value))}
                  disabled={loadingCatalog || filteredPackages.length === 0}
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                >
                  {loadingCatalog ? (
                    <option>Memuat paket ujian...</option>
                  ) : filteredPackages.length === 0 ? (
                    <option value={0}>Belum ada paket pada jenjang/kategori ini</option>
                  ) : (
                    filteredPackages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.title} ({pkg.questionCount || 0} soal · {pkg.durationMinutes} mnt)
                      </option>
                    ))
                  )}
                </select>
              </div>

              <button
                type="button"
                disabled={!selectedPackageId}
                onClick={() => {
                  setFinishNotice(null);
                  setLoginError(null);
                  setStep('LOGIN');
                }}
                className={`mt-2 flex w-full items-center justify-center gap-2 rounded-md ${themeMeta.buttonClass} py-2.5 text-sm font-semibold text-white shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <Play className="h-4 w-4 fill-current" />
                {branding.startButtonText || 'Mulai Simulasi'}
              </button>
            </div>
          </div>
        </main>

        <footer className="text-center text-xs text-white/80">
          {branding.footerText || 'Simulasi TKA Berbasis Web · Mendukung Laptop & Ponsel Siswa (PWA)'}
        </footer>
        <OfflineIndicator />
      </div>
    );
  }

  // STEPS 2, 3, 4 SHARE THE INSTITUTIONAL HEADER
  return (
    <div className="min-h-screen bg-[#f4f7fb] flex flex-col">
      <header className={`${themeMeta.headerClass} px-4 py-3 text-white shadow-sm sm:px-6`}>
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
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/15 text-xs font-bold">
                {branding.logoBadgeText || 'TKA'}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-[11px] font-semibold tracking-wider uppercase opacity-90 truncate">
                {branding.headerOrgLabel || 'PUSMENDIK'}
              </div>
              <div className="truncate text-sm font-bold">
                {branding.headerAppTitle || 'APLIKASI TKA / SIMULASI UJIAN'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {participant ? (
              <div className="text-right text-xs">
                <div className="font-semibold">
                  {participant.username} - {participant.fullName}
                </div>
                <div className="opacity-85">{participant.schoolName}</div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setStep('SELECT_SIMULATION')}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Pilih Mapel Lain
              </button>
            )}
          </div>
        </div>
      </header>

      {/* STEP 2: LOGIN PESERTA (Matches PDF Screenshot 2) */}
      {step === 'LOGIN' && (
        <main className="flex flex-1 flex-col items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-md sm:p-7">
            <h2 className="text-lg font-bold text-slate-900">
              {branding.loginTitle || 'Selamat Datang'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {branding.loginSubtitle ||
                'Silakan login dengan menggunakan username dan password yang anda miliki.'}
            </p>

            <form onSubmit={handleLoginSubmit} className="mt-5 space-y-4">
              <div>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    className="w-full rounded-md border border-slate-300 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full rounded-md border border-slate-300 py-2.5 pl-9 pr-10 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label="Tampilkan password"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {loginError && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full rounded-md bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-60"
              >
                {loginLoading ? 'Memeriksa Akun...' : branding.loginButtonText || 'Login'}
              </button>
            </form>
          </div>

          {/* Quick Demo Account Selector (hidden in Official Exam Mode when toggled off) */}
          {branding.showDemoAccounts && (
            <div className="mt-4 w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600">
              <div className="font-bold text-slate-800">Akun Simulasi Uji Coba:</div>
              <div className="mt-2 space-y-1.5">
                {[
                  { u: '123asd', p: '123asd', desc: 'Ahya · SMPN 1 BEJI · Sesi 1' },
                  { u: 'siswa01', p: 'tka2026', desc: 'Siti Rahmawati · SMPN 2 REMBANG · Sesi 1' },
                  { u: 'siswa02', p: 'tka2026', desc: 'Budi Santoso · SMPN 2 BEJI · Sesi 2' },
                  { u: 'siswa04', p: 'tka2026', desc: 'Rizky Pratama · SMPN 1 BANGIL · Sesi 1' },
                ].map((acc) => (
                  <div key={acc.u} className="flex items-center justify-between gap-2">
                    <span>
                      <strong className="font-mono text-slate-900">{acc.u}</strong> /{' '}
                      <span className="font-mono">{acc.p}</span> — {acc.desc}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setUsername(acc.u);
                        setPassword(acc.p);
                      }}
                      className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-semibold text-blue-700 hover:bg-blue-100 whitespace-nowrap shrink-0"
                    >
                      Isi
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      )}

      {/* STEP 3: KONFIRMASI DATA PESERTA & TOKEN (Matches PDF Screenshot 3) */}
      {step === 'CONFIRM_PARTICIPANT' && participant && activeSchedule && (
        <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
            {/* Left Token Panel (Matches Screenshot 3) */}
            <div className="lg:col-span-6 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
                {activeSchedule.visibleToken ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600">Token :</span>
                    <span className="font-mono text-xl font-bold tracking-widest text-slate-900">
                      {activeSchedule.visibleToken}
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-slate-700">
                    <strong>Mode Token Ruang Ujian:</strong> Silakan minta{' '}
                    <strong>Token Sesi {activeSchedule.sessionNumber}</strong> dari Pengawas ruang ujian Anda.
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600 space-y-1.5">
                <div className="font-bold text-slate-800">Informasi Jadwal Sesi</div>
                <div>
                  Sekolah: <strong className="text-slate-900">{participant.schoolName}</strong> (NPSN{' '}
                  <span className="font-mono">{participant.npsn}</span>)
                </div>
                <div>
                  Sesi Aktif: <strong className="text-slate-900">Sesi {activeSchedule.sessionNumber}</strong> ·{' '}
                  {activeSchedule.startTime}–{activeSchedule.endTime} WIB
                </div>
                <div>
                  Pengamanan:{' '}
                  <strong className="text-slate-900">
                    {activeSchedule.antiCheatMode === 'strict'
                      ? 'Ketat (Keluar tab/app langsung terkunci)'
                      : `Toleransi (${activeSchedule.maxWarnings}x peringatan)`}
                  </strong>
                </div>
              </div>
            </div>

            {/* Right Konfirmasi Data Peserta Card */}
            <div className="lg:col-span-6 rounded-lg border border-slate-200 bg-white p-6 shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-slate-900">Konfirmasi data Peserta</h2>
                <button
                  type="button"
                  onClick={() => {
                    setTypedName(participant.fullName);
                    const parts = String(participant.birthDate || '').split('-');
                    if (parts.length === 3) {
                      setBirthYear(parts[0]);
                      setBirthMonth(String(Number(parts[1])));
                      setBirthDay(String(Number(parts[2])));
                    }
                    if (activeSchedule.visibleToken) {
                      setTokenInput(activeSchedule.visibleToken);
                    }
                  }}
                  className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 whitespace-nowrap shrink-0"
                >
                  Isi Sesuai Data
                </button>
              </div>

              <dl className="mt-4 space-y-2.5 border-b border-slate-200 pb-4 text-xs">
                <div>
                  <dt className="font-semibold text-slate-500">Username / NIS</dt>
                  <dd className="font-mono font-semibold text-slate-900">
                    {participant.username}
                    {participant.nis && participant.nis !== participant.username
                      ? ` (NIS: ${participant.nis})`
                      : ''}
                  </dd>
                </div>
                {participant.className && (
                  <div>
                    <dt className="font-semibold text-slate-500">Kelas</dt>
                    <dd className="font-semibold text-slate-900">{participant.className}</dd>
                  </div>
                )}
                <div>
                  <dt className="font-semibold text-slate-500">Nama Peserta</dt>
                  <dd className="font-semibold text-slate-900">{participant.fullName}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">Jenis Kelamin</dt>
                  <dd className="font-semibold text-slate-900">{participant.gender}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">Mata Ujian</dt>
                  <dd className="font-semibold text-slate-900">{activeSchedule.packageTitle}</dd>
                </div>
              </dl>

              <form onSubmit={handleConfirmParticipant} className="mt-4 space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Nama Peserta</label>
                  <input
                    type="text"
                    required
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    placeholder="Ketikkan Nama Peserta"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <Calendar className="h-3.5 w-3.5 text-slate-500" />
                    Tanggal Lahir
                  </label>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    <select
                      value={birthDay}
                      onChange={(e) => setBirthDay(e.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none focus:border-blue-600"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={String(d)}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <select
                      value={birthMonth}
                      onChange={(e) => setBirthMonth(e.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none focus:border-blue-600"
                    >
                      {MONTHS_ID.map((m, idx) => (
                        <option key={m} value={String(idx + 1)}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={birthYear}
                      onChange={(e) => setBirthYear(e.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none focus:border-blue-600"
                    >
                      {Array.from({ length: 12 }, (_, i) => 2005 + i).map((yr) => (
                        <option key={yr} value={String(yr)}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Token</label>
                  <input
                    type="text"
                    required
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                    placeholder="Ketikkan token di sini"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm font-bold tracking-wider uppercase outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                {confirmError && (
                  <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    {confirmError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={confirmLoading}
                  className="w-full rounded-full bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-60"
                >
                  {confirmLoading ? 'Memverifikasi...' : 'Submit'}
                </button>
              </form>
            </div>
          </div>
        </main>
      )}

      {/* STEP 4: KONFIRMASI TES (Matches PDF Screenshot 4) */}
      {step === 'CONFIRM_TEST' && testSummary && (
        <main className="flex flex-1 items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-md">
            <h2 className="text-lg font-bold text-slate-900">Konfirmasi Tes</h2>

            <dl className="mt-4 space-y-3 border-b border-slate-200 pb-4 text-xs">
              <div>
                <dt className="font-semibold text-slate-500">Nama Tes</dt>
                <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                  {testSummary.packageTitle}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Status Tes</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{testSummary.testStatus}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Waktu Tes</dt>
                <dd className="mt-0.5 font-mono font-semibold text-slate-900">
                  {testSummary.examDateTime}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Alokasi Waktu Tes</dt>
                <dd className="mt-0.5 font-mono font-semibold text-slate-900">
                  {testSummary.durationMinutes} Menit
                </dd>
              </div>
            </dl>

            <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">
              Saat menekan <strong>Mulai</strong>, ujian masuk ke mode layar penuh dan waktu mulai dihitung mundur. Jangan berpindah tab atau keluar dari aplikasi selama ujian berlangsung.
            </div>

            <button
              type="button"
              disabled={startLoading}
              onClick={() => void handleStartTest()}
              className="mt-5 w-full rounded-full bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-60"
            >
              {startLoading ? 'Menyiapkan Soal...' : 'Mulai'}
            </button>
          </div>
        </main>
      )}

      <OfflineIndicator />
    </div>
  );
}
