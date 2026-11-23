import {
  ArrowLeft,
  BookOpen,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Download,
  Edit3,
  Eye,
  FileUp,
  Folder,
  FolderOpen,
  FolderPlus,
  GraduationCap,
  KeyRound,
  Lock,
  LogOut,
  Megaphone,
  Palette,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  StopCircle,
  Trash2,
  Unlock,
  Upload,
  Users,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { HEADER_THEME_META } from '../lib/theme.ts';
import {
  type AnswerKey,
  type AntiCheatMode,
  DEFAULT_PDF_REPORT_CONFIG,
  DEFAULT_PORTAL_BRANDING,
  type EducationLevel,
  type ExamPackage,
  type ExamSchedule,
  type ExamSessionSummary,
  type HeaderThemePreset,
  type LayoutMode,
  type ParticipantPublic,
  type PdfReportConfig,
  type PortalBranding,
  type QuestionAdmin,
  type QuestionConfig,
  type QuestionType,
  SCHOOL_CLASSES_33,
  type School,
  type ScoringMode,
  type StudentAnswerPayload,
  type SubjectCategory,
  type ViolationLogEntry,
} from '../types/exam.ts';
import { MathText } from './MathText.tsx';
import { QuestionRenderer } from './QuestionRenderer.tsx';
import { StimulusRenderer } from './StimulusRenderer.tsx';

interface AdminPortalProps {
  onBackToStudent: () => void;
  onBrandingChange?: (branding: PortalBranding) => void;
}

interface MonitoringSessionRow {
  id: number;
  participantId: number;
  username: string;
  fullName: string;
  nis?: string;
  className?: string;
  schoolId: number;
  schoolName: string;
  npsn: string;
  packageTitle: string;
  sessionNumber: 1 | 2 | 3;
  status: 'CONFIRMED' | 'IN_PROGRESS' | 'LOCKED' | 'COMPLETED';
  unlockToken: string | null;
  violationCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  totalScore: number;
  maxScore: number;
  percentage: number;
  needsManualGrading: boolean;
  violations: ViolationLogEntry[];
}

type AdminTab = 'monitoring' | 'bank_soal' | 'jadwal_sekolah' | 'rekap_nilai' | 'tampilan';

const TYPE_LABELS: Record<QuestionType, string> = {
  PG_SEDERHANA: 'Pilihan Ganda Sederhana',
  MCMA: 'PG Kompleks (MCMA)',
  PGK_KATEGORI: 'PG Kompleks Kategori',
  MENJODOHKAN: 'Menjodohkan',
  URAIAN: 'Uraian',
};

export const AdminPortal: React.FC<AdminPortalProps> = ({
  onBackToStudent,
  onBrandingChange,
}) => {
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [managedByEnv, setManagedByEnv] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminTab>('monitoring');

  // Shared Admin Data
  const [sessions, setSessions] = useState<MonitoringSessionRow[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [packages, setPackages] = useState<ExamPackage[]>([]);
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [participants, setParticipants] = useState<ParticipantPublic[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Filters
  const [schoolFilter, setSchoolFilter] = useState<string>('ALL');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [sessionFilter, setSessionFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [rekapSchoolFilter, setRekapSchoolFilter] = useState<string>('ALL');
  const [rekapClassFilter, setRekapClassFilter] = useState<string>('ALL');
  const [rekapSessionFilter, setRekapSessionFilter] = useState<string>('ALL');
  const [participantSchoolFilter, setParticipantSchoolFilter] = useState<string>('ALL');
  const [participantClassFilter, setParticipantClassFilter] = useState<string>('ALL');
  const [participantSearch, setParticipantSearch] = useState('');
  const [confirmSessionAction, setConfirmSessionAction] = useState<{
    sessionId: number;
    type: 'force' | 'reset';
  } | null>(null);

  // Bank Soal (Folder-based) State
  const [selectedPackageId, setSelectedPackageId] = useState<number>(0);
  const [openedFolderId, setOpenedFolderId] = useState<number | null>(null);
  const [folderSearch, setFolderSearch] = useState('');
  const [folderLevelFilter, setFolderLevelFilter] = useState<string>('ALL');
  const [folderStatusFilter, setFolderStatusFilter] = useState<string>('ALL');
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<number | null>(null);
  const [editingFolderMeta, setEditingFolderMeta] = useState<ExamPackage | null>(null);
  const [questions, setQuestions] = useState<QuestionAdmin[]>([]);
  const [showPkgForm, setShowPkgForm] = useState(false);
  const [newPkg, setNewPkg] = useState({
    educationLevel: 'SMP/MTs/Sederajat' as EducationLevel,
    subjectCategory: 'Mata Pelajaran Wajib' as SubjectCategory,
    subjectName: '',
    title: '',
    durationMinutes: 75,
    description: '',
    autoScheduleSesi1: true,
    initialToken: '',
  });

  // Inline Active Token Editing State
  const [editingTokenScheduleId, setEditingTokenScheduleId] = useState<number | null>(null);
  const [editingTokenValue, setEditingTokenValue] = useState('');
  const [tokenEditError, setTokenEditError] = useState<string | null>(null);
  const [savingTokenScheduleId, setSavingTokenScheduleId] = useState<number | null>(null);

  // Schedule Time & Details Editing State
  const [editingSchedule, setEditingSchedule] = useState<ExamSchedule | null>(null);
  const [savingScheduleEdit, setSavingScheduleEdit] = useState(false);
  const [scheduleEditError, setScheduleEditError] = useState<string | null>(null);

  // Question Editor Modal State
  const [editingQuestion, setEditingQuestion] = useState<QuestionAdmin | null>(null);
  const [showQuestionEditor, setShowQuestionEditor] = useState(false);

  // Grading Modal State
  const [gradingSummary, setGradingSummary] = useState<ExamSessionSummary | null>(null);
  const [manualScores, setManualScores] = useState<Record<number, { score: string; note: string }>>({});

  // School / Schedule / Participant creation & bulk import forms
  const [newSchool, setNewSchool] = useState({ npsn: '', name: '', district: '' });
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [schoolEditError, setSchoolEditError] = useState<string | null>(null);
  const [savingSchoolEdit, setSavingSchoolEdit] = useState(false);
  const [confirmDeleteSchoolId, setConfirmDeleteSchoolId] = useState<number | null>(null);
  const [newSchedule, setNewSchedule] = useState({
    packageId: 0,
    sessionNumber: 1 as 1 | 2 | 3,
    examDate: new Date().toISOString().slice(0, 10),
    startTime: '07:30',
    endTime: '09:30',
    token: '',
    showTokenToStudent: true,
    antiCheatMode: 'strict' as AntiCheatMode,
    maxWarnings: 1,
  });
  const [newParticipant, setNewParticipant] = useState({
    schoolId: 0,
    nis: '',
    className: '7A',
    username: '',
    password: '',
    fullName: '',
    gender: 'Laki-Laki' as 'Laki-Laki' | 'Perempuan',
    birthDate: '2011-05-10',
    assignedSession: 1 as 1 | 2 | 3,
  });
  const [editingParticipant, setEditingParticipant] = useState<
    (ParticipantPublic & { newPassword: string }) | null
  >(null);
  const [participantEditError, setParticipantEditError] = useState<string | null>(null);
  const [savingParticipantEdit, setSavingParticipantEdit] = useState(false);
  const [confirmDeleteParticipantId, setConfirmDeleteParticipantId] = useState<number | null>(null);

  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkSchoolId, setBulkSchoolId] = useState<number>(0);
  const [bulkClassName, setBulkClassName] = useState<string>('7A');
  const [bulkSession, setBulkSession] = useState<1 | 2 | 3>(1);
  const [bulkPasswordMode, setBulkPasswordMode] = useState<'nis' | 'custom'>('nis');
  const [bulkCustomPassword, setBulkCustomPassword] = useState<string>('tka2026');
  const [bulkPreviewRows, setBulkPreviewRows] = useState<
    Array<{ no: string; nis: string; fullName: string; gender: 'Laki-Laki' | 'Perempuan' }>
  >([]);
  const [bulkFileName, setBulkFileName] = useState<string>('');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkCsvText, setBulkCsvText] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  // Portal Branding / Front Page Settings
  const [brandingDraft, setBrandingDraft] = useState<PortalBranding>(DEFAULT_PORTAL_BRANDING);
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);

  // PDF Report Config & Modals
  const [pdfConfig, setPdfConfig] = useState<PdfReportConfig>(DEFAULT_PDF_REPORT_CONFIG);
  const [showPdfSettingsModal, setShowPdfSettingsModal] = useState(false);
  const [showPdfPreviewModal, setShowPdfPreviewModal] = useState(false);
  const [savingPdfConfig, setSavingPdfConfig] = useState(false);
  const [pdfConfigError, setPdfConfigError] = useState<string | null>(null);


  useEffect(() => {
    fetch('/api/admin/status')
      .then((r) => r.json())
      .then((d) => {
        setIsConfigured(Boolean(d.isConfigured));
        setManagedByEnv(Boolean(d.managedByEnv));
      })
      .catch(() => setIsConfigured(true));
  }, []);

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers || {});
      if (adminToken) headers.set('Authorization', `Bearer ${adminToken}`);
      if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      const res = await fetch(url, { ...options, headers });
      if (res.status === 401) {
        setAdminToken(null);
      }
      return res;
    },
    [adminToken],
  );

  const loadAllAdminData = useCallback(async () => {
    if (!adminToken) return;
    setLoadingData(true);
    try {
      const [monRes, schRes, pkgRes, schedRes, partRes, brandRes, pdfRes] = await Promise.all([
        authFetch('/api/admin/monitoring'),
        authFetch('/api/admin/schools'),
        authFetch('/api/admin/packages'),
        authFetch('/api/admin/schedules'),
        authFetch('/api/admin/participants'),
        authFetch('/api/admin/branding'),
        authFetch('/api/admin/pdf-config'),
      ]);

      const [monData, schData, pkgData, schedData, partData, brandData, pdfData] = await Promise.all([
        monRes.json(),
        schRes.json(),
        pkgRes.json(),
        schedRes.json(),
        partRes.json(),
        brandRes.json(),
        pdfRes.json(),
      ]);

      if (monRes.ok) setSessions(monData.sessions || []);
      if (schRes.ok) {
        const list = schData.schools || [];
        setSchools(list);
        if (list.length > 0) {
          if (newParticipant.schoolId === 0) {
            setNewParticipant((p) => ({ ...p, schoolId: list[0].id }));
          }
          if (bulkSchoolId === 0) {
            setBulkSchoolId(list[0].id);
          }
        }
      }
      if (pkgRes.ok) {
        const pkgs = pkgData.packages || [];
        setPackages(pkgs);
        if (pkgs.length > 0 && selectedPackageId === 0) {
          setSelectedPackageId(pkgs[0].id);
          setNewSchedule((s) => ({ ...s, packageId: pkgs[0].id }));
        }
      }
      if (schedRes.ok) setSchedules(schedData.schedules || []);
      if (partRes.ok) setParticipants(partData.participants || []);
      if (brandRes.ok && brandData.branding) {
        setBrandingDraft({ ...DEFAULT_PORTAL_BRANDING, ...brandData.branding });
      }
      if (pdfRes.ok && pdfData.config) {
        setPdfConfig({ ...DEFAULT_PDF_REPORT_CONFIG, ...pdfData.config });
      }
    } finally {
      setLoadingData(false);
    }
  }, [adminToken, authFetch, bulkSchoolId, newParticipant.schoolId, selectedPackageId]);

  useEffect(() => {
    if (adminToken) {
      void loadAllAdminData();
    }
  }, [adminToken, loadAllAdminData]);

  const loadQuestionsForPackage = useCallback(
    async (pkgId: number) => {
      if (!adminToken || !pkgId) return;
      const res = await authFetch(`/api/admin/questions?packageId=${pkgId}`);
      const data = await res.json();
      if (res.ok) setQuestions(data.questions || []);
    },
    [adminToken, authFetch],
  );

  useEffect(() => {
    if (adminToken && selectedPackageId > 0) {
      void loadQuestionsForPackage(selectedPackageId);
    }
  }, [adminToken, loadQuestionsForPackage, selectedPackageId]);

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (passwordInput.length < 6) {
      setAuthError('Password Admin minimal 6 karakter.');
      return;
    }
    if (passwordInput !== confirmPasswordInput) {
      setAuthError('Konfirmasi password tidak cocok.');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await fetch('/api/admin/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Gagal aktivasi akun Admin.');
        return;
      }
      setIsConfigured(true);
      setAdminToken(data.token);
      setPasswordInput('');
      setConfirmPasswordInput('');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Password salah.');
        return;
      }
      setAdminToken(data.token);
      setPasswordInput('');
    } finally {
      setAuthLoading(false);
    }
  };

  // Monitoring Actions
  const handleIssueUnlockToken = async (sessionId: number) => {
    const res = await authFetch(`/api/admin/sessions/${sessionId}/issue-unlock-token`, {
      method: 'POST',
    });
    const data = await res.json();
    if (res.ok) {
      setActionMessage(`Token Buka Kunci diterbitkan: ${data.unlockToken}`);
      void loadAllAdminData();
    }
  };

  const handleDirectUnlock = async (sessionId: number) => {
    const res = await authFetch(`/api/admin/sessions/${sessionId}/unlock-direct`, {
      method: 'POST',
    });
    if (res.ok) {
      setActionMessage('Sesi peserta berhasil dibuka langsung oleh Pengawas.');
      void loadAllAdminData();
    }
  };

  const handleResetDevice = async (sessionId: number) => {
    const res = await authFetch(`/api/admin/sessions/${sessionId}/reset-device`, {
      method: 'POST',
    });
    if (res.ok) {
      setActionMessage('Kunci perangkat berhasil direset. Peserta dapat login kembali.');
      void loadAllAdminData();
    }
  };

  const handleForceFinish = async (sessionId: number) => {
    const res = await authFetch(`/api/admin/sessions/${sessionId}/force-finish`, {
      method: 'POST',
    });
    if (res.ok) {
      setConfirmSessionAction(null);
      setActionMessage('Sesi ujian diakhiri secara paksa dan nilai peserta langsung dihitung.');
      void loadAllAdminData();
    }
  };

  const handleResetSession = async (sessionId: number) => {
    const res = await authFetch(`/api/admin/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setConfirmSessionAction(null);
      setActionMessage('Sesi ujian direset. Peserta dapat memulai ulang ujian dari awal.');
      void loadAllAdminData();
    }
  };

  const handleSaveCustomToken = async (scheduleId: number, sessionNumber: number) => {
    const cleaned = editingTokenValue.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,20}$/.test(cleaned)) {
      setTokenEditError('Token harus 3–20 karakter (huruf, angka, -, atau _ tanpa spasi).');
      return;
    }
    setTokenEditError(null);
    setSavingTokenScheduleId(scheduleId);
    try {
      const res = await authFetch(`/api/admin/schedules/${scheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ token: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTokenEditError(data.error || 'Gagal menyimpan token.');
        return;
      }
      setEditingTokenScheduleId(null);
      setEditingTokenValue('');
      setActionMessage(`Token Sesi ${sessionNumber} berhasil diubah menjadi: ${data.token}`);
      void loadAllAdminData();
    } finally {
      setSavingTokenScheduleId(null);
    }
  };

  const handleRegenerateScheduleToken = async (scheduleId: number, sessionNumber: number) => {
    setTokenEditError(null);
    setSavingTokenScheduleId(scheduleId);
    try {
      const res = await authFetch(`/api/admin/schedules/${scheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ regenerateToken: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setEditingTokenScheduleId(null);
        setActionMessage(`Token Sesi ${sessionNumber} diperbarui acak: ${data.token}`);
        void loadAllAdminData();
      }
    } finally {
      setSavingTokenScheduleId(null);
    }
  };

  const handleDownloadExcelTemplate = async () => {
    setBulkError(null);
    const qs = bulkClassName ? `?className=${encodeURIComponent(bulkClassName)}` : '';
    const res = await authFetch(`/api/admin/participants/template.xlsx${qs}`);
    if (!res.ok) {
      setBulkError('Gagal mengunduh template Excel.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = bulkClassName
      ? `Template_Impor_Siswa_Kelas_${bulkClassName}.xlsx`
      : 'Template_Impor_Siswa.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExcelOrCsvFileUpload = async (file: File) => {
    setBulkError(null);
    setBulkFileName(file.name);
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = async () => {
        setBulkLoading(true);
        try {
          const res = await authFetch('/api/admin/participants/parse-excel', {
            method: 'POST',
            body: JSON.stringify({ base64Data: String(reader.result || '') }),
          });
          const data = await res.json();
          if (!res.ok) {
            setBulkError(data.error || 'Gagal membaca file Excel.');
            setBulkPreviewRows([]);
            return;
          }
          const rows = (data.rows || []) as Array<{
            no: string;
            nis: string;
            fullName: string;
            gender: 'Laki-Laki' | 'Perempuan';
          }>;
          setBulkPreviewRows(rows);
          if (rows.length === 0) {
            setBulkError(
              'Tidak ada baris siswa terbaca. Pastikan header kolom berisi: No, NIS, NAMA SISWA, Jenis Kelamin (L/P).',
            );
          }
        } finally {
          setBulkLoading(false);
        }
      };
      reader.readAsDataURL(file);
      return;
    }

    // Fallback CSV / TXT parsing supporting (No, NIS, NAMA SISWA, L/P)
    const reader = new FileReader();
    reader.onload = () => {
      const txt = String(reader.result || '');
      setBulkCsvText(txt);
      const lines = txt
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const parsed: Array<{
        no: string;
        nis: string;
        fullName: string;
        gender: 'Laki-Laki' | 'Perempuan';
      }> = [];
      lines.forEach((line, idx) => {
        const lower = line.toLowerCase();
        if (idx === 0 && (lower.includes('nis') || lower.includes('nama'))) return;
        const sep = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
        const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
        if (cols.length >= 3 && cols[1] && cols[2]) {
          const jk = (cols[3] || 'L').toUpperCase();
          parsed.push({
            no: cols[0] || String(parsed.length + 1),
            nis: cols[1],
            fullName: cols[2],
            gender: jk.startsWith('P') ? 'Perempuan' : 'Laki-Laki',
          });
        }
      });
      setBulkPreviewRows(parsed);
    };
    reader.readAsText(file);
  };

  const handleBulkImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkError(null);

    let rowsToImport: Array<{
      nis: string;
      username: string;
      password: string;
      fullName: string;
      gender: 'Laki-Laki' | 'Perempuan';
      className: string;
      assignedSession: 1 | 2 | 3;
    }> = [];

    if (bulkPreviewRows.length > 0) {
      const uniformPwd = bulkCustomPassword.trim() || 'tka2026';
      rowsToImport = bulkPreviewRows.map((r) => ({
        nis: r.nis,
        username: r.nis,
        password: bulkPasswordMode === 'nis' ? r.nis : uniformPwd,
        fullName: r.fullName,
        gender: r.gender,
        className: bulkClassName,
        assignedSession: bulkSession,
      }));
    } else if (bulkCsvText.trim()) {
      const lines = bulkCsvText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const uniformPwd = bulkCustomPassword.trim() || 'tka2026';
      lines.forEach((line, idx) => {
        const lower = line.toLowerCase();
        if (idx === 0 && (lower.includes('nis') || lower.includes('nama') || lower.includes('username')))
          return;
        const sep = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
        const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
        if (!cols[1] || !cols[2]) return;
        const jk = (cols[3] || 'L').toUpperCase();
        rowsToImport.push({
          nis: cols[1],
          username: cols[1],
          password: bulkPasswordMode === 'nis' ? cols[1] : uniformPwd,
          fullName: cols[2],
          gender: jk.startsWith('P') ? 'Perempuan' : 'Laki-Laki',
          className: bulkClassName,
          assignedSession: bulkSession,
        });
      });
    }

    if (rowsToImport.length === 0) {
      setBulkError('Unggah file Excel/CSV atau tempel data siswa sesuai kolom No, NIS, NAMA SISWA, L/P.');
      return;
    }

    setBulkLoading(true);
    try {
      const res = await authFetch('/api/admin/participants/bulk', {
        method: 'POST',
        body: JSON.stringify({
          schoolId: bulkSchoolId || schools[0]?.id,
          className: bulkClassName,
          assignedSession: bulkSession,
          rows: rowsToImport,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBulkError(data.error || 'Gagal mengimpor peserta.');
        return;
      }
      setActionMessage(
        `Impor Kelas ${bulkClassName || 'Umum'} selesai: ${data.insertedCount} siswa ditambahkan, ${data.skippedCount} dilewati (duplikat NIS/Username).`,
      );
      setBulkCsvText('');
      setBulkPreviewRows([]);
      setBulkFileName('');
      setShowBulkImport(false);
      void loadAllAdminData();
    } finally {
      setBulkLoading(false);
    }
  };

  const openGradingModal = async (sessionId: number) => {
    const res = await authFetch(`/api/admin/results/${sessionId}`);
    const data = await res.json();
    if (res.ok && data.summary) {
      const sum = data.summary as ExamSessionSummary;
      setGradingSummary(sum);
      const initScores: Record<number, { score: string; note: string }> = {};
      for (const d of sum.details) {
        initScores[d.questionId] = {
          score: String(d.manualScoreEarned !== null ? d.manualScoreEarned : d.autoScoreEarned),
          note: d.graderNote || '',
        };
      }
      setManualScores(initScores);
    }
  };

  const handleSaveEssayGrade = async (questionId: number) => {
    if (!gradingSummary) return;
    const entry = manualScores[questionId];
    if (!entry) return;
    const res = await authFetch(`/api/admin/results/${gradingSummary.sessionId}/grade`, {
      method: 'POST',
      body: JSON.stringify({
        questionId,
        manualScore: Number(entry.score),
        graderNote: entry.note,
      }),
    });
    const data = await res.json();
    if (res.ok && data.summary) {
      setGradingSummary(data.summary);
      setActionMessage('Nilai koreksi uraian tersimpan dan total nilai diperbarui.');
      void loadAllAdminData();
    }
  };

  const handleDownloadCsv = async () => {
    const res = await authFetch('/api/admin/results-export/csv');
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rekap-hasil-tka-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Auth Gate Render
  if (!adminToken) {
    return (
      <div className="min-h-screen bg-[#f4f7fb] flex flex-col">
        <header className="tka-header-bg px-4 py-3 text-white shadow-sm sm:px-6">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/assets/aistudio/tutwuri1_e2a6801e.jpg"
                alt="Logo Tut Wuri Handayani"
                className="h-9 w-9 shrink-0 rounded-full border border-white/30 bg-white object-contain p-0.5 shadow-xs"
              />
              <div>
                <div className="text-[11px] font-semibold tracking-wider uppercase opacity-90">
                  PORTAL PENGAWAS & BANK SOAL
                </div>
                <div className="text-sm font-bold">Manajemen Ujian Kabupaten</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onBackToStudent}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Portal Peserta
            </button>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-md">
            {isConfigured === null ? (
              <div className="py-8 text-center text-sm text-slate-500">Memeriksa status portal...</div>
            ) : !isConfigured ? (
              <form onSubmit={handleClaimAdmin} className="space-y-4">
                <div className="flex items-center gap-2.5 text-blue-700">
                  <KeyRound className="h-5 w-5" />
                  <h2 className="text-lg font-bold text-slate-900">
                    Aktivasi Password Admin Pertama Kali
                  </h2>
                </div>
                <p className="text-xs leading-relaxed text-slate-600">
                  Belum ada password Pengawas/Admin yang tersimpan di server. Buat password baru untuk mengunci akses Bank Soal, Token Sesi 1–3, dan Rekap Nilai.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Buat Password Admin (minimal 6 karakter)
                  </label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    required
                    minLength={6}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Ulangi Password Admin
                  </label>
                  <input
                    type="password"
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    required
                    minLength={6}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                {authError && (
                  <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full rounded-md bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {authLoading ? 'Menyimpan...' : 'Simpan Password & Masuk Portal'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div className="flex items-center gap-2.5 text-blue-700">
                  <Lock className="h-5 w-5" />
                  <h2 className="text-lg font-bold text-slate-900">
                    Login Pengawas / Proktor & Bank Soal
                  </h2>
                </div>
                <p className="text-xs text-slate-600">
                  Masukkan {managedByEnv ? 'passcode Admin server' : 'password Admin yang telah diaktifkan'} untuk mengelola soal, token, dan monitoring peserta.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Password Admin / Proktor
                  </label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    required
                    placeholder="Masukkan password..."
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                {authError && (
                  <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full rounded-md bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {authLoading ? 'Memverifikasi...' : 'Masuk Portal Pengawas'}
                </button>
              </form>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Filtered monitoring list
  const filteredSessions = sessions.filter((s) => {
    if (schoolFilter !== 'ALL' && String(s.schoolId) !== schoolFilter) return false;
    if (classFilter !== 'ALL' && (s.className || '') !== classFilter) return false;
    if (sessionFilter !== 'ALL' && String(s.sessionNumber) !== sessionFilter) return false;
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      if (
        !s.fullName.toLowerCase().includes(q) &&
        !s.username.toLowerCase().includes(q) &&
        !(s.nis || '').toLowerCase().includes(q) &&
        !(s.className || '').toLowerCase().includes(q) &&
        !s.schoolName.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const activeCount = sessions.filter((s) => s.status === 'IN_PROGRESS').length;
  const lockedCount = sessions.filter((s) => s.status === 'LOCKED').length;
  const completedCount = sessions.filter((s) => s.status === 'COMPLETED').length;
  const manualGradeCount = sessions.filter((s) => s.status === 'COMPLETED' && s.needsManualGrading).length;

  return (
    <div className="min-h-screen bg-[#f4f7fb] flex flex-col">
      {/* Top Bar Contract: Brand — Tabs — Action */}
      <header className="tka-header-bg px-4 py-3 text-white shadow-sm sm:px-6">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <img
              src="/assets/aistudio/tutwuri1_e2a6801e.jpg"
              alt="Logo Tut Wuri Handayani"
              className="h-8 w-8 shrink-0 rounded-full border border-white/30 bg-white object-contain p-0.5 shadow-xs"
            />
            <span className="text-base font-bold tracking-tight">Panel Proktor & Bank Soal TKA</span>
          </div>

          <nav className="flex flex-wrap items-center gap-1 sm:gap-2">
            {(
              [
                { id: 'monitoring', label: 'Monitoring Sesi', icon: ShieldAlert },
                { id: 'bank_soal', label: 'Bank Soal', icon: BookOpen },
                { id: 'jadwal_sekolah', label: 'Sesi 1-3 & Sekolah', icon: CalendarClock },
                { id: 'rekap_nilai', label: 'Rekap Nilai', icon: ClipboardCheck },
                { id: 'tampilan', label: 'Tampilan Depan', icon: Palette },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-white text-blue-800 shadow-xs'
                      : 'text-white/90 hover:bg-white/15'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onBackToStudent}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 whitespace-nowrap shrink-0"
            >
              Portal Peserta
            </button>
            <button
              type="button"
              onClick={() => setAdminToken(null)}
              title="Keluar Admin"
              className="inline-flex items-center gap-1 rounded-md border border-white/25 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/20 whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              Keluar
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1360px] flex-1 space-y-5 p-4 sm:p-6">
        {actionMessage && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-900">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              {actionMessage}
            </span>
            <button
              type="button"
              onClick={() => setActionMessage(null)}
              className="text-emerald-700 hover:text-emerald-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* TAB 1: MONITORING SESI & ANTI-CURANG */}
        {activeTab === 'monitoring' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium text-slate-500">Sedang Mengerjakan</div>
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-blue-700">
                  {activeCount}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium text-slate-500">Terkunci (Butuh Token)</div>
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-red-600">
                  {lockedCount}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium text-slate-500">Selesai Ujian</div>
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-700">
                  {completedCount}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium text-slate-500">Perlu Koreksi Uraian</div>
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-700">
                  {manualGradeCount}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Cari nama / username..."
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs outline-none focus:border-blue-600"
                  />
                  <select
                    value={schoolFilter}
                    onChange={(e) => setSchoolFilter(e.target.value)}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-600"
                  >
                    <option value="ALL">Semua Sekolah</option>
                    {schools.map((sc) => (
                      <option key={sc.id} value={String(sc.id)}>
                        {sc.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-600"
                  >
                    <option value="ALL">Semua Kelas (33)</option>
                    <optgroup label="Kelas 7 (7A–7K)">
                      {SCHOOL_CLASSES_33.filter((c) => c.startsWith('7')).map((c) => (
                        <option key={c} value={c}>
                          Kelas {c}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Kelas 8 (8A–8K)">
                      {SCHOOL_CLASSES_33.filter((c) => c.startsWith('8')).map((c) => (
                        <option key={c} value={c}>
                          Kelas {c}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Kelas 9 (9A–9K)">
                      {SCHOOL_CLASSES_33.filter((c) => c.startsWith('9')).map((c) => (
                        <option key={c} value={c}>
                          Kelas {c}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <select
                    value={sessionFilter}
                    onChange={(e) => setSessionFilter(e.target.value)}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-600"
                  >
                    <option value="ALL">Semua Sesi</option>
                    <option value="1">Sesi 1</option>
                    <option value="2">Sesi 2</option>
                    <option value="3">Sesi 3</option>
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-600"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value="LOCKED">Terkunci Pelanggaran</option>
                    <option value="IN_PROGRESS">Sedang Ujian</option>
                    <option value="CONFIRMED">Siap Mulai</option>
                    <option value="COMPLETED">Selesai</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => void loadAllAdminData()}
                  disabled={loadingData}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin' : ''}`} />
                  Muat Ulang
                </button>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                      <th className="px-3 py-2.5 font-bold">Peserta</th>
                      <th className="px-3 py-2.5 font-bold">Sekolah & Sesi</th>
                      <th className="px-3 py-2.5 font-bold">Status</th>
                      <th className="px-3 py-2.5 font-bold">Pelanggaran & Token Unlock</th>
                      <th className="px-3 py-2.5 text-right font-bold">Aksi Pengawas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredSessions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                          Belum ada sesi peserta yang sesuai filter.
                        </td>
                      </tr>
                    ) : (
                      filteredSessions.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/70">
                          <td className="px-3 py-3 align-top">
                            <div className="font-semibold text-slate-900">
                              {s.fullName}
                              {s.className && (
                                <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700">
                                  {s.className}
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500">
                              {s.username}
                              {s.nis && s.nis !== s.username ? ` · NIS ${s.nis}` : ''}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <div className="text-slate-800">{s.schoolName}</div>
                            <div className="text-[11px] text-slate-500">
                              Sesi {s.sessionNumber} · {s.packageTitle}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <span
                              className={`font-semibold ${
                                s.status === 'LOCKED'
                                  ? 'text-red-700'
                                  : s.status === 'IN_PROGRESS'
                                    ? 'text-blue-700'
                                    : s.status === 'COMPLETED'
                                      ? 'text-emerald-700'
                                      : 'text-slate-700'
                              }`}
                            >
                              {s.status === 'LOCKED'
                                ? 'TERKUNCI (Pelanggaran)'
                                : s.status === 'IN_PROGRESS'
                                  ? 'Sedang Ujian'
                                  : s.status === 'COMPLETED'
                                    ? 'Selesai'
                                    : 'Terkonfirmasi'}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <div className="font-mono text-slate-700">
                              Pelanggaran: <strong>{s.violationCount}x</strong>
                            </div>
                            {s.unlockToken && (
                              <div className="mt-1 inline-block rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-xs font-bold text-amber-900">
                                Token Unlock: {s.unlockToken}
                              </div>
                            )}
                            {s.violations.length > 0 && (
                              <div className="mt-1 text-[11px] text-slate-500">
                                Terakhir: {s.violations[0].reason}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right align-top">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              {s.status !== 'COMPLETED' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void handleIssueUnlockToken(s.id)}
                                    className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                                  >
                                    <KeyRound className="h-3 w-3" />
                                    Token Ulang
                                  </button>
                                  {s.status === 'LOCKED' && (
                                    <button
                                      type="button"
                                      onClick={() => void handleDirectUnlock(s.id)}
                                      className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                                    >
                                      <Unlock className="h-3 w-3" />
                                      Buka Langsung
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => void handleResetDevice(s.id)}
                                    className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                    Reset Device
                                  </button>
                                  {confirmSessionAction?.sessionId === s.id &&
                                  confirmSessionAction.type === 'force' ? (
                                    <span className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-1.5 py-0.5">
                                      <button
                                        type="button"
                                        onClick={() => void handleForceFinish(s.id)}
                                        className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-red-700"
                                      >
                                        Ya, Akhiri
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmSessionAction(null)}
                                        className="px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900"
                                      >
                                        Batal
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmSessionAction({ sessionId: s.id, type: 'force' })
                                      }
                                      className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                                    >
                                      <StopCircle className="h-3 w-3" />
                                      Paksa Selesai
                                    </button>
                                  )}
                                </>
                              )}
                              {s.status === 'COMPLETED' && (
                                <button
                                  type="button"
                                  onClick={() => void openGradingModal(s.id)}
                                  className="inline-flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100"
                                >
                                  Lihat / Koreksi
                                </button>
                              )}
                              {confirmSessionAction?.sessionId === s.id &&
                              confirmSessionAction.type === 'reset' ? (
                                <span className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-1.5 py-0.5">
                                  <button
                                    type="button"
                                    onClick={() => void handleResetSession(s.id)}
                                    className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-red-700"
                                  >
                                    Ya, Reset
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmSessionAction(null)}
                                    className="px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900"
                                  >
                                    Batal
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmSessionAction({ sessionId: s.id, type: 'reset' })
                                  }
                                  title="Hapus/reset sesi agar peserta bisa mengulang"
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-red-50 hover:text-red-700"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Reset Sesi
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: BANK SOAL BERBASIS FOLDER PAKET SOAL */}
        {activeTab === 'bank_soal' && (() => {
          const schedulesByPkg = new Map<number, ExamSchedule[]>();
          for (const sch of schedules) {
            if (!schedulesByPkg.has(sch.packageId)) schedulesByPkg.set(sch.packageId, []);
            schedulesByPkg.get(sch.packageId)!.push(sch);
          }

          const getFolderStatus = (pkg: ExamPackage) => {
            const pkgScheds = (schedulesByPkg.get(pkg.id) || []).filter((s) => s.isActive);
            const qCount = pkg.questionCount || 0;
            if (!pkg.isActive) {
              return {
                key: 'draft' as const,
                label: 'Draft (Nonaktif)',
                tone: 'text-slate-600',
                folderBg: 'bg-slate-100 text-slate-600 border-slate-200',
                tabAccent: 'bg-slate-300',
                activeSchedules: pkgScheds,
              };
            }
            if (qCount === 0) {
              return {
                key: 'empty' as const,
                label: 'Perlu Butir Soal',
                tone: 'text-amber-700',
                folderBg: 'bg-amber-50 text-amber-700 border-amber-200',
                tabAccent: 'bg-amber-400',
                activeSchedules: pkgScheds,
              };
            }
            if (pkgScheds.length === 0) {
              return {
                key: 'need_schedule' as const,
                label: 'Perlu Jadwal Sesi',
                tone: 'text-blue-700',
                folderBg: 'bg-blue-50 text-blue-700 border-blue-200',
                tabAccent: 'bg-blue-500',
                activeSchedules: pkgScheds,
              };
            }
            return {
              key: 'ready' as const,
              label: 'Siap Diujikan',
              tone: 'text-emerald-700',
              folderBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
              tabAccent: 'bg-emerald-500',
              activeSchedules: pkgScheds,
            };
          };

          const openFolder = (pkgId: number) => {
            setSelectedPackageId(pkgId);
            setOpenedFolderId(pkgId);
            setEditingFolderMeta(null);
            void loadQuestionsForPackage(pkgId);
          };

          const handleTogglePackageActive = async (pkg: ExamPackage) => {
            const res = await authFetch(`/api/admin/packages/${pkg.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ isActive: !pkg.isActive }),
            });
            if (res.ok) {
              setActionMessage(
                !pkg.isActive
                  ? `Folder "${pkg.title}" diaktifkan dan siap diujikan.`
                  : `Folder "${pkg.title}" diubah menjadi Draft (disembunyikan dari siswa).`,
              );
              void loadAllAdminData();
            }
          };

          const handleQuickCreateSchedule = async (pkg: ExamPackage) => {
            const res = await authFetch('/api/admin/schedules', {
              method: 'POST',
              body: JSON.stringify({
                packageId: pkg.id,
                sessionNumber: 1,
                examDate: new Date().toISOString().slice(0, 10),
                startTime: '07:30',
                endTime: '23:59',
                showTokenToStudent: true,
                antiCheatMode: 'strict',
                maxWarnings: 1,
                allowedSchoolIds: schools.map((s) => s.id),
              }),
            });
            const data = await res.json();
            if (res.ok) {
              setActionMessage(
                `Jadwal Sesi 1 untuk "${pkg.title}" aktif dengan Token: ${data.token}`,
              );
              void loadAllAdminData();
            }
          };

          const handleDeleteFolder = async (pkg: ExamPackage) => {
            const res = await authFetch(`/api/admin/packages/${pkg.id}`, { method: 'DELETE' });
            if (res.ok) {
              setConfirmDeleteFolderId(null);
              if (openedFolderId === pkg.id) setOpenedFolderId(null);
              setActionMessage(`Folder paket "${pkg.title}" telah dihapus.`);
              void loadAllAdminData();
            }
          };

          const openedPkg =
            openedFolderId !== null
              ? packages.find((p) => p.id === openedFolderId) || null
              : null;

          // VIEW B: INSIDE AN OPENED FOLDER
          if (openedPkg) {
            const st = getFolderStatus(openedPkg);
            return (
              <div className="space-y-4">
                {/* Breadcrumb & Folder Hero Header */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenedFolderId(null);
                          setEditingFolderMeta(null);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Semua Folder Paket
                      </button>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                        <FolderOpen className="h-4 w-4 text-blue-600" />
                        {openedPkg.title}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingFolderMeta(editingFolderMeta ? null : openedPkg)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        {editingFolderMeta ? 'Tutup Edit Info' : 'Edit Info Folder'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleTogglePackageActive(openedPkg)}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          openedPkg.isActive
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {openedPkg.isActive ? 'Aktif di Portal Siswa' : 'Status: Draft'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingQuestion({
                            id: 0,
                            packageId: openedPkg.id,
                            orderNumber: questions.length + 1,
                            questionType: 'PG_SEDERHANA',
                            layoutMode: 'single_column',
                            stimulus: { paragraphs: [''] },
                            prompt: '',
                            config: {
                              options: [
                                { id: 'opt-a', label: 'A', text: '' },
                                { id: 'opt-b', label: 'B', text: '' },
                                { id: 'opt-c', label: 'C', text: '' },
                                { id: 'opt-d', label: 'D', text: '' },
                              ],
                              categories: ['Benar', 'Salah'],
                              statements: [
                                { id: 'stmt-1', text: '' },
                                { id: 'stmt-2', text: '' },
                              ],
                              leftItems: [
                                { id: 'L1', text: '' },
                                { id: 'L2', text: '' },
                              ],
                              rightItems: [
                                { id: 'R1', text: '' },
                                { id: 'R2', text: '' },
                                { id: 'R3', text: '' },
                              ],
                              placeholder: 'Tuliskan jawaban uraian lengkap...',
                              rubricHint: '',
                            },
                            answerKey: {
                              correctOptionId: 'opt-a',
                              correctOptionIds: ['opt-a'],
                              correctCategories: { 'stmt-1': 'Benar', 'stmt-2': 'Salah' },
                              correctPairs: { L1: 'R1', L2: 'R2' },
                              expectedKeywords: [],
                              modelAnswer: '',
                              rubricNotes: '',
                            },
                            maxScore: 2,
                            scoringMode: 'partial',
                            explanation: '',
                          });
                          setShowQuestionEditor(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
                      >
                        <Plus className="h-4 w-4" />
                        Tambah Butir Soal
                      </button>
                    </div>
                  </div>

                  {/* Folder Metadata Strip */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${st.folderBg}`}
                      >
                        <FolderOpen className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h2 className="text-lg font-bold text-slate-900">{openedPkg.title}</h2>
                          <span className={`text-xs font-bold ${st.tone}`}>· {st.label}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-semibold text-slate-700">
                            {openedPkg.subjectName}
                          </span>
                          <span>·</span>
                          <span>{openedPkg.educationLevel}</span>
                          <span>·</span>
                          <span>{openedPkg.subjectCategory}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1 font-mono text-slate-700">
                            <Clock className="h-3 w-3" />
                            {openedPkg.durationMinutes} menit
                          </span>
                          <span>·</span>
                          <span className="font-mono font-semibold text-slate-700">
                            {questions.length} butir soal
                          </span>
                        </div>
                        {openedPkg.description && (
                          <p className="mt-1 text-xs text-slate-500">{openedPkg.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Readiness / Token Quick Action & Inline Editor */}
                    <div className="flex flex-col items-end gap-1.5">
                      {st.activeSchedules.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900">
                          <span className="font-semibold">Token Sesi Aktif:</span>
                          {st.activeSchedules.map((sch) =>
                            editingTokenScheduleId === sch.id ? (
                              <form
                                key={sch.id}
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void handleSaveCustomToken(sch.id, sch.sessionNumber);
                                }}
                                className="inline-flex flex-wrap items-center gap-1 rounded border border-blue-300 bg-white px-1.5 py-1 shadow-2xs"
                              >
                                <span className="text-[11px] font-bold text-slate-600">
                                  Sesi {sch.sessionNumber}:
                                </span>
                                <input
                                  type="text"
                                  autoFocus
                                  maxLength={20}
                                  value={editingTokenValue}
                                  onChange={(e) =>
                                    setEditingTokenValue(
                                      e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''),
                                    )
                                  }
                                  placeholder="TOKEN"
                                  className="w-28 rounded border border-slate-300 px-1.5 py-0.5 font-mono text-xs font-bold uppercase text-slate-900 outline-none focus:border-blue-600"
                                />
                                <button
                                  type="submit"
                                  disabled={savingTokenScheduleId === sch.id}
                                  className="rounded bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                >
                                  Simpan
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingTokenScheduleId(null);
                                    setTokenEditError(null);
                                  }}
                                  className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"
                                >
                                  Batal
                                </button>
                              </form>
                            ) : (
                              <div
                                key={sch.id}
                                className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-white px-2 py-0.5 text-emerald-900"
                              >
                                <span className="font-mono font-bold">
                                  Sesi {sch.sessionNumber}: {sch.token}
                                </span>
                                <button
                                  type="button"
                                  title="Edit Token Sesi"
                                  onClick={() => {
                                    setEditingTokenScheduleId(sch.id);
                                    setEditingTokenValue(sch.token);
                                    setTokenEditError(null);
                                  }}
                                  className="rounded p-0.5 text-blue-600 hover:bg-blue-50"
                                >
                                  <Edit3 className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  title="Acak Token Baru"
                                  disabled={savingTokenScheduleId === sch.id}
                                  onClick={() =>
                                    void handleRegenerateScheduleToken(sch.id, sch.sessionNumber)
                                  }
                                  className="rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                >
                                  <RefreshCw
                                    className={`h-3 w-3 ${
                                      savingTokenScheduleId === sch.id ? 'animate-spin' : ''
                                    }`}
                                  />
                                </button>
                              </div>
                            ),
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleQuickCreateSchedule(openedPkg)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                        >
                          <CalendarClock className="h-3.5 w-3.5" />
                          Aktifkan Jadwal Sesi 1 & Token Otomatis
                        </button>
                      )}
                      {tokenEditError && openedFolderId !== null && (
                        <div className="text-[11px] font-medium text-red-600">{tokenEditError}</div>
                      )}
                    </div>
                  </div>

                  {/* Inline Edit Info Folder */}
                  {editingFolderMeta && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const res = await authFetch(`/api/admin/packages/${editingFolderMeta.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({
                            educationLevel: editingFolderMeta.educationLevel,
                            subjectCategory: editingFolderMeta.subjectCategory,
                            subjectName: editingFolderMeta.subjectName,
                            title: editingFolderMeta.title,
                            durationMinutes: editingFolderMeta.durationMinutes,
                            description: editingFolderMeta.description,
                          }),
                        });
                        if (res.ok) {
                          setEditingFolderMeta(null);
                          setActionMessage('Informasi folder paket soal diperbarui.');
                          void loadAllAdminData();
                        }
                      }}
                      className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-3"
                    >
                      <select
                        value={editingFolderMeta.educationLevel}
                        onChange={(e) =>
                          setEditingFolderMeta((m) =>
                            m ? { ...m, educationLevel: e.target.value as EducationLevel } : m,
                          )
                        }
                        className="rounded border border-slate-300 bg-white px-2.5 py-2"
                      >
                        <option value="SD/MI/Sederajat">SD/MI/Sederajat</option>
                        <option value="SMP/MTs/Sederajat">SMP/MTs/Sederajat</option>
                        <option value="SMA/MA/SMK/Sederajat">SMA/MA/SMK/Sederajat</option>
                      </select>
                      <select
                        value={editingFolderMeta.subjectCategory}
                        onChange={(e) =>
                          setEditingFolderMeta((m) =>
                            m ? { ...m, subjectCategory: e.target.value as SubjectCategory } : m,
                          )
                        }
                        className="rounded border border-slate-300 bg-white px-2.5 py-2"
                      >
                        <option value="Mata Pelajaran Wajib">Mata Pelajaran Wajib</option>
                        <option value="Mata Pelajaran Pilihan">Mata Pelajaran Pilihan</option>
                      </select>
                      <input
                        type="text"
                        required
                        placeholder="Mata Pelajaran"
                        value={editingFolderMeta.subjectName}
                        onChange={(e) =>
                          setEditingFolderMeta((m) => (m ? { ...m, subjectName: e.target.value } : m))
                        }
                        className="rounded border border-slate-300 bg-white px-2.5 py-2"
                      />
                      <input
                        type="text"
                        required
                        placeholder="Nama Folder / Paket"
                        value={editingFolderMeta.title}
                        onChange={(e) =>
                          setEditingFolderMeta((m) => (m ? { ...m, title: e.target.value } : m))
                        }
                        className="rounded border border-slate-300 bg-white px-2.5 py-2 sm:col-span-2"
                      />
                      <input
                        type="number"
                        min={5}
                        required
                        value={editingFolderMeta.durationMinutes}
                        onChange={(e) =>
                          setEditingFolderMeta((m) =>
                            m ? { ...m, durationMinutes: Number(e.target.value) } : m,
                          )
                        }
                        className="rounded border border-slate-300 bg-white px-2.5 py-2 font-mono"
                      />
                      <input
                        type="text"
                        placeholder="Deskripsi singkat folder paket (opsional)"
                        value={editingFolderMeta.description}
                        onChange={(e) =>
                          setEditingFolderMeta((m) => (m ? { ...m, description: e.target.value } : m))
                        }
                        className="rounded border border-slate-300 bg-white px-2.5 py-2 sm:col-span-2"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingFolderMeta(null)}
                          className="rounded border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-600"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          className="rounded bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-700"
                        >
                          Simpan Info
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Questions Inside Opened Folder */}
                <div className="space-y-3">
                  {questions.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
                      <FolderOpen className="mx-auto h-10 w-10 text-slate-300" />
                      <h3 className="mt-3 text-sm font-bold text-slate-800">
                        Folder Paket Ini Masih Kosong
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Tambahkan butir soal (PG Sederhana, MCMA, PGK Kategori, Menjodohkan, atau Uraian) agar paket ini siap diujikan ke peserta.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingQuestion({
                            id: 0,
                            packageId: openedPkg.id,
                            orderNumber: 1,
                            questionType: 'PG_SEDERHANA',
                            layoutMode: 'single_column',
                            stimulus: { paragraphs: [''] },
                            prompt: '',
                            config: {
                              options: [
                                { id: 'opt-a', label: 'A', text: '' },
                                { id: 'opt-b', label: 'B', text: '' },
                                { id: 'opt-c', label: 'C', text: '' },
                                { id: 'opt-d', label: 'D', text: '' },
                              ],
                              categories: ['Benar', 'Salah'],
                              statements: [
                                { id: 'stmt-1', text: '' },
                                { id: 'stmt-2', text: '' },
                              ],
                              leftItems: [
                                { id: 'L1', text: '' },
                                { id: 'L2', text: '' },
                              ],
                              rightItems: [
                                { id: 'R1', text: '' },
                                { id: 'R2', text: '' },
                                { id: 'R3', text: '' },
                              ],
                              placeholder: 'Tuliskan jawaban uraian lengkap...',
                              rubricHint: '',
                            },
                            answerKey: {
                              correctOptionId: 'opt-a',
                              correctOptionIds: ['opt-a'],
                              correctCategories: { 'stmt-1': 'Benar', 'stmt-2': 'Salah' },
                              correctPairs: { L1: 'R1', L2: 'R2' },
                              expectedKeywords: [],
                              modelAnswer: '',
                              rubricNotes: '',
                            },
                            maxScore: 2,
                            scoringMode: 'partial',
                            explanation: '',
                          });
                          setShowQuestionEditor(true);
                        }}
                        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        <Plus className="h-4 w-4" />
                        Tambah Soal Nomor 1
                      </button>
                    </div>
                  ) : (
                    questions.map((q) => (
                      <div
                        key={q.id}
                        className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs transition-colors hover:border-slate-300"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                            <span className="font-mono font-bold text-slate-900">
                              No. {q.orderNumber}
                            </span>
                            <span>·</span>
                            <span className="font-semibold text-blue-700">
                              {TYPE_LABELS[q.questionType]}
                            </span>
                            <span>·</span>
                            <span>
                              {q.layoutMode === 'split_two_column'
                                ? '2 Kolom (Stimulus Kiri)'
                                : '1 Kolom'}
                            </span>
                            <span>·</span>
                            <span className="font-mono">Skor Maks: {q.maxScore}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingQuestion(q);
                                setShowQuestionEditor(true);
                              }}
                              className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await authFetch(`/api/admin/questions/${q.id}`, { method: 'DELETE' });
                                setActionMessage(`Soal #${q.orderNumber} dihapus.`);
                                void loadQuestionsForPackage(openedPkg.id);
                                void loadAllAdminData();
                              }}
                              className="inline-flex items-center gap-1 rounded border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Hapus
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 text-sm text-slate-900">
                          <MathText text={q.prompt} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          }

          // VIEW A: FOLDER REPOSITORY GRID
          const filteredFolders = packages.filter((p) => {
            if (folderLevelFilter !== 'ALL' && p.educationLevel !== folderLevelFilter) return false;
            const st = getFolderStatus(p);
            if (folderStatusFilter !== 'ALL' && st.key !== folderStatusFilter) return false;
            if (folderSearch.trim()) {
              const q = folderSearch.trim().toLowerCase();
              if (
                !p.title.toLowerCase().includes(q) &&
                !p.subjectName.toLowerCase().includes(q) &&
                !p.educationLevel.toLowerCase().includes(q)
              ) {
                return false;
              }
            }
            return true;
          });

          const readyFolderCount = packages.filter((p) => getFolderStatus(p).key === 'ready').length;
          const totalQuestionCount = packages.reduce((acc, p) => acc + (p.questionCount || 0), 0);

          return (
            <div className="space-y-5">
              {/* Summary Metrics Bar */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">Total Folder Paket Soal</div>
                  <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
                    {packages.length}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">Folder Siap Diujikan</div>
                  <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-700">
                    {readyFolderCount}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">Total Butir Soal Tersimpan</div>
                  <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-blue-700">
                    {totalQuestionCount}
                  </div>
                </div>
              </div>

              {/* Filter & Create Folder Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={folderSearch}
                      onChange={(e) => setFolderSearch(e.target.value)}
                      placeholder="Cari folder paket / mapel..."
                      className="rounded-md border border-slate-300 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-blue-600"
                    />
                  </div>
                  <select
                    value={folderLevelFilter}
                    onChange={(e) => setFolderLevelFilter(e.target.value)}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-600"
                  >
                    <option value="ALL">Semua Jenjang</option>
                    <option value="SD/MI/Sederajat">SD/MI/Sederajat</option>
                    <option value="SMP/MTs/Sederajat">SMP/MTs/Sederajat</option>
                    <option value="SMA/MA/SMK/Sederajat">SMA/MA/SMK/Sederajat</option>
                  </select>
                  <select
                    value={folderStatusFilter}
                    onChange={(e) => setFolderStatusFilter(e.target.value)}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-600"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value="ready">Siap Diujikan</option>
                    <option value="need_schedule">Perlu Jadwal Sesi</option>
                    <option value="empty">Perlu Butir Soal</option>
                    <option value="draft">Draft (Nonaktif)</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPkgForm((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 whitespace-nowrap shrink-0"
                >
                  <FolderPlus className="h-4 w-4" />
                  {showPkgForm ? 'Tutup Form Folder' : 'Buat Folder Paket Soal'}
                </button>
              </div>

              {/* Create New Folder Package Form */}
              {showPkgForm && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const res = await authFetch('/api/admin/packages', {
                      method: 'POST',
                      body: JSON.stringify(newPkg),
                    });
                    const data = await res.json();
                    if (res.ok) {
                      setShowPkgForm(false);
                      setNewPkg({
                        educationLevel: 'SMP/MTs/Sederajat',
                        subjectCategory: 'Mata Pelajaran Wajib',
                        subjectName: '',
                        title: '',
                        durationMinutes: 75,
                        description: '',
                        autoScheduleSesi1: true,
                        initialToken: '',
                      });
                      setActionMessage(
                        data.scheduleToken
                          ? `Folder paket soal baru dibuat & Jadwal Sesi 1 aktif (Token: ${data.scheduleToken}). Silakan isi butir soal di bawah.`
                          : 'Folder paket soal baru berhasil dibuat.',
                      );
                      await loadAllAdminData();
                      if (data.id) {
                        openFolder(data.id);
                      }
                    }
                  }}
                  className="rounded-xl border border-blue-200 bg-white p-5 shadow-xs space-y-3"
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <FolderPlus className="h-4 w-4 text-blue-600" />
                    Buat Folder Paket Soal Baru
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700">Jenjang</label>
                      <select
                        value={newPkg.educationLevel}
                        onChange={(e) =>
                          setNewPkg((p) => ({
                            ...p,
                            educationLevel: e.target.value as EducationLevel,
                          }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                      >
                        <option value="SD/MI/Sederajat">SD/MI/Sederajat</option>
                        <option value="SMP/MTs/Sederajat">SMP/MTs/Sederajat</option>
                        <option value="SMA/MA/SMK/Sederajat">SMA/MA/SMK/Sederajat</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700">Kategori Mapel</label>
                      <select
                        value={newPkg.subjectCategory}
                        onChange={(e) =>
                          setNewPkg((p) => ({
                            ...p,
                            subjectCategory: e.target.value as SubjectCategory,
                          }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                      >
                        <option value="Mata Pelajaran Wajib">Mata Pelajaran Wajib</option>
                        <option value="Mata Pelajaran Pilihan">Mata Pelajaran Pilihan</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700">Mata Pelajaran</label>
                      <input
                        type="text"
                        required
                        placeholder="Misal: Ilmu Pengetahuan Alam"
                        value={newPkg.subjectName}
                        onChange={(e) => setNewPkg((p) => ({ ...p, subjectName: e.target.value }))}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700">
                        Nama Folder / Paket Soal
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Misal: IPA Terpadu - SMP Sederajat (Paket 1)"
                        value={newPkg.title}
                        onChange={(e) => setNewPkg((p) => ({ ...p, title: e.target.value }))}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700">Durasi (Menit)</label>
                      <input
                        type="number"
                        min={5}
                        required
                        value={newPkg.durationMinutes}
                        onChange={(e) =>
                          setNewPkg((p) => ({ ...p, durationMinutes: Number(e.target.value) }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <input
                        type="text"
                        placeholder="Catatan / keterangan folder paket (opsional)"
                        value={newPkg.description}
                        onChange={(e) => setNewPkg((p) => ({ ...p, description: e.target.value }))}
                        className="w-full rounded border border-slate-300 px-3 py-2"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={newPkg.autoScheduleSesi1}
                          onChange={(e) =>
                            setNewPkg((p) => ({ ...p, autoScheduleSesi1: e.target.checked }))
                          }
                        />
                        Otomatis aktifkan Jadwal Sesi 1 & Token
                      </label>
                      {newPkg.autoScheduleSesi1 && (
                        <input
                          type="text"
                          maxLength={20}
                          placeholder="Token custom (kosongkan = acak)"
                          value={newPkg.initialToken}
                          onChange={(e) =>
                            setNewPkg((p) => ({
                              ...p,
                              initialToken: e.target.value
                                .toUpperCase()
                                .replace(/[^A-Z0-9_-]/g, ''),
                            }))
                          }
                          className="w-48 rounded border border-slate-300 px-2.5 py-1 font-mono text-xs uppercase text-slate-900"
                        />
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowPkgForm(false)}
                        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        className="rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Simpan & Buka Folder
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Folder Cards Grid */}
              {filteredFolders.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                  Belum ada folder paket soal yang sesuai filter. Klik{' '}
                  <strong>Buat Folder Paket Soal</strong> untuk membuat folder baru.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredFolders.map((pkg) => {
                    const st = getFolderStatus(pkg);
                    return (
                      <div
                        key={pkg.id}
                        className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                      >
                        {/* Sleek Folder Tab Top Strip */}
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-xs ${st.tabAccent}`} />
                            <span className={`text-[11px] font-bold ${st.tone}`}>{st.label}</span>
                          </div>
                          <span className="font-mono text-[11px] text-slate-500">
                            {pkg.educationLevel.split('/')[0]}
                          </span>
                        </div>

                        {/* Folder Body (Clickable to open folder) */}
                        <button
                          type="button"
                          onClick={() => openFolder(pkg.id)}
                          className="flex flex-1 flex-col items-start p-4 text-left"
                        >
                          <div className="flex w-full items-start gap-3">
                            <div
                              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${st.folderBg}`}
                            >
                              <Folder className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 truncate">
                                {pkg.subjectName} · {pkg.subjectCategory.replace('Mata Pelajaran ', 'Mapel ')}
                              </div>
                              <h3 className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-slate-900 group-hover:text-blue-700">
                                {pkg.title}
                              </h3>
                            </div>
                          </div>

                          {pkg.description && (
                            <p className="mt-2.5 line-clamp-2 text-xs text-slate-500">
                              {pkg.description}
                            </p>
                          )}

                          {/* Metrics Row */}
                          <div className="mt-4 grid w-full grid-cols-3 gap-2 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-center">
                            <div>
                              <div className="font-mono text-sm font-bold tabular-nums text-slate-900">
                                {pkg.questionCount || 0}
                              </div>
                              <div className="text-[10px] text-slate-500">Butir Soal</div>
                            </div>
                            <div className="border-x border-slate-200">
                              <div className="font-mono text-sm font-bold tabular-nums text-slate-900">
                                {pkg.durationMinutes}m
                              </div>
                              <div className="text-[10px] text-slate-500">Durasi</div>
                            </div>
                            <div>
                              <div className="font-mono text-sm font-bold tabular-nums text-blue-700">
                                {st.activeSchedules.length}
                              </div>
                              <div className="text-[10px] text-slate-500">Jadwal</div>
                            </div>
                          </div>

                          <div className="mt-2.5 flex w-full flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                            <KeyRound className="h-3 w-3 shrink-0 text-slate-400" />
                            {st.activeSchedules.length > 0 ? (
                              st.activeSchedules.map((sch) => (
                                <span
                                  key={sch.id}
                                  className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono font-semibold text-slate-800"
                                >
                                  S{sch.sessionNumber}: {sch.token}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-400">Belum ada token sesi aktif</span>
                            )}
                          </div>
                        </button>

                        {/* Folder Actions Footer */}
                        <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/40 px-4 py-2.5 text-xs">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleTogglePackageActive(pkg)}
                              className={`rounded border px-2 py-1 text-[11px] font-semibold transition-colors ${
                                pkg.isActive
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {pkg.isActive ? 'Aktif' : 'Draft'}
                            </button>

                            {confirmDeleteFolderId === pkg.id ? (
                              <span className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-1.5 py-0.5">
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteFolder(pkg)}
                                  className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white"
                                >
                                  Hapus
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteFolderId(null)}
                                  className="text-[10px] font-semibold text-slate-600"
                                >
                                  Batal
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteFolderId(pkg.id)}
                                title="Hapus folder paket"
                                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => openFolder(pkg.id)}
                            className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-900"
                          >
                            Buka Folder
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* TAB 3: JADWAL SESI 1-3, SEKOLAH & PESERTA */}
        {activeTab === 'jadwal_sekolah' && (
          <div className="space-y-6">
            {/* Jadwal Sesi 1, 2, 3 */}
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <CalendarClock className="h-4 w-4 text-blue-600" />
                Jadwal Sesi Ujian (Sesi 1, 2, 3) & Token
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const res = await authFetch('/api/admin/schedules', {
                    method: 'POST',
                    body: JSON.stringify({
                      ...newSchedule,
                      allowedSchoolIds: schools.map((s) => s.id),
                    }),
                  });
                  if (res.ok) {
                    setActionMessage('Jadwal sesi baru berhasil ditambahkan.');
                    void loadAllAdminData();
                  }
                }}
                className="mt-4 grid grid-cols-1 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3.5 sm:grid-cols-6"
              >
                <select
                  value={newSchedule.packageId}
                  onChange={(e) =>
                    setNewSchedule((s) => ({ ...s, packageId: Number(e.target.value) }))
                  }
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:col-span-2"
                >
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <select
                  value={newSchedule.sessionNumber}
                  onChange={(e) =>
                    setNewSchedule((s) => ({
                      ...s,
                      sessionNumber: Number(e.target.value) as 1 | 2 | 3,
                    }))
                  }
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value={1}>Sesi 1</option>
                  <option value={2}>Sesi 2</option>
                  <option value={3}>Sesi 3</option>
                </select>
                <input
                  type="date"
                  value={newSchedule.examDate}
                  onChange={(e) => setNewSchedule((s) => ({ ...s, examDate: e.target.value }))}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
                <input
                  type="text"
                  placeholder="Token (opsional)"
                  value={newSchedule.token}
                  onChange={(e) =>
                    setNewSchedule((s) => ({ ...s, token: e.target.value.toUpperCase() }))
                  }
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs uppercase"
                />
                <select
                  value={newSchedule.antiCheatMode}
                  onChange={(e) =>
                    setNewSchedule((s) => ({
                      ...s,
                      antiCheatMode: e.target.value as AntiCheatMode,
                    }))
                  }
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="strict">Anti-Curang Ketat (1x Kunci)</option>
                  <option value="tolerance">Toleransi (Peringatan)</option>
                </select>
                <div className="sm:col-span-6 flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={newSchedule.showTokenToStudent}
                      onChange={(e) =>
                        setNewSchedule((s) => ({ ...s, showTokenToStudent: e.target.checked }))
                      }
                    />
                    Tampilkan token di layar konfirmasi peserta (mode simulasi mandiri)
                  </label>
                  <button
                    type="submit"
                    className="rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    + Tambah Jadwal Sesi
                  </button>
                </div>
              </form>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                      <th className="px-3 py-2 font-bold">Sesi</th>
                      <th className="px-3 py-2 font-bold">Paket Ujian</th>
                      <th className="px-3 py-2 font-bold">Waktu</th>
                      <th className="px-3 py-2 font-bold">Token Aktif</th>
                      <th className="px-3 py-2 font-bold">Kebijakan Anti-Curang</th>
                      <th className="px-3 py-2 text-right font-bold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {schedules.map((sch) => (
                      <tr key={sch.id}>
                        <td className="px-3 py-2.5 font-bold text-blue-700">
                          Sesi {sch.sessionNumber}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-slate-900">
                          {sch.packageTitle}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-600">
                          {sch.examDate} · {sch.startTime}–{sch.endTime}
                        </td>
                        <td className="px-3 py-2.5">
                          {editingTokenScheduleId === sch.id ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                void handleSaveCustomToken(sch.id, sch.sessionNumber);
                              }}
                              className="space-y-1"
                            >
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  autoFocus
                                  maxLength={20}
                                  value={editingTokenValue}
                                  onChange={(e) =>
                                    setEditingTokenValue(
                                      e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''),
                                    )
                                  }
                                  className="w-28 rounded border border-blue-400 px-2 py-0.5 font-mono text-xs font-bold uppercase text-slate-900 outline-none"
                                />
                                <button
                                  type="submit"
                                  disabled={savingTokenScheduleId === sch.id}
                                  className="rounded bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-blue-700"
                                >
                                  Simpan
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingTokenScheduleId(null);
                                    setTokenEditError(null);
                                  }}
                                  className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"
                                >
                                  Batal
                                </button>
                              </div>
                              {tokenEditError && (
                                <div className="text-[11px] text-red-600">{tokenEditError}</div>
                              )}
                            </form>
                          ) : (
                            <>
                              <span className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono font-bold text-slate-900">
                                {sch.token}
                              </span>
                              <div className="mt-1 text-[11px] text-slate-500">
                                {sch.showTokenToStudent ? 'Terlihat oleh peserta' : 'Diumumkan Pengawas'}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {sch.antiCheatMode === 'strict'
                            ? 'Ketat (1x keluar = terkunci)'
                            : `Toleransi (${sch.maxWarnings}x peringatan)`}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTokenScheduleId(sch.id);
                                setEditingTokenValue(sch.token);
                                setTokenEditError(null);
                              }}
                              className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                            >
                              <Edit3 className="h-3 w-3" />
                              Edit Token
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSchedule({ ...sch });
                                setScheduleEditError(null);
                              }}
                              className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                            >
                              <Edit3 className="h-3 w-3" />
                              Edit Waktu & Sesi
                            </button>
                            <button
                              type="button"
                              disabled={savingTokenScheduleId === sch.id}
                              onClick={() =>
                                void handleRegenerateScheduleToken(sch.id, sch.sessionNumber)
                              }
                              className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Acak Token
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await authFetch(`/api/admin/schedules/${sch.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({
                                    showTokenToStudent: !sch.showTokenToStudent,
                                  }),
                                });
                                void loadAllAdminData();
                              }}
                              className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              {sch.showTokenToStudent ? 'Sembunyikan Token' : 'Tampilkan Token'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Edit Schedule Time Modal */}
              {editingSchedule && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <h3 className="text-base font-bold text-slate-900">
                        Edit Jadwal & Waktu Sesi {editingSchedule.sessionNumber}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setEditingSchedule(null)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setScheduleEditError(null);
                        setSavingScheduleEdit(true);
                        try {
                          const res = await authFetch(`/api/admin/schedules/${editingSchedule.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({
                              sessionNumber: editingSchedule.sessionNumber,
                              examDate: editingSchedule.examDate,
                              startTime: editingSchedule.startTime,
                              endTime: editingSchedule.endTime,
                              token: editingSchedule.token,
                              antiCheatMode: editingSchedule.antiCheatMode,
                              maxWarnings: editingSchedule.maxWarnings,
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            setScheduleEditError(data.error || 'Gagal memperbarui jadwal sesi.');
                            return;
                          }
                          setActionMessage(`Jadwal Sesi ${editingSchedule.sessionNumber} berhasil diperbarui.`);
                          setEditingSchedule(null);
                          void loadAllAdminData();
                        } finally {
                          setSavingScheduleEdit(false);
                        }
                      }}
                      className="mt-4 space-y-4 text-xs"
                    >
                      <div>
                        <label className="block font-semibold text-slate-700">Paket Ujian</label>
                        <div className="mt-1 font-medium text-slate-900">
                          {editingSchedule.packageTitle || 'Paket Ujian'}
                        </div>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700">Nomor Sesi</label>
                        <select
                          value={editingSchedule.sessionNumber}
                          onChange={(e) =>
                            setEditingSchedule((s) => s ? { ...s, sessionNumber: Number(e.target.value) as 1 | 2 | 3 } : null)
                          }
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600"
                        >
                          <option value={1}>Sesi 1</option>
                          <option value={2}>Sesi 2</option>
                          <option value={3}>Sesi 3</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700">Tanggal Ujian</label>
                        <input
                          type="date"
                          required
                          value={editingSchedule.examDate}
                          onChange={(e) =>
                            setEditingSchedule((s) => s ? { ...s, examDate: e.target.value } : null)
                          }
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block font-semibold text-slate-700">Jam Mulai</label>
                          <input
                            type="time"
                            required
                            value={editingSchedule.startTime}
                            onChange={(e) =>
                              setEditingSchedule((s) => s ? { ...s, startTime: e.target.value } : null)
                            }
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700">Jam Selesai</label>
                          <input
                            type="time"
                            required
                            value={editingSchedule.endTime}
                            onChange={(e) =>
                              setEditingSchedule((s) => s ? { ...s, endTime: e.target.value } : null)
                            }
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700">Token Sesi</label>
                        <input
                          type="text"
                          required
                          maxLength={20}
                          value={editingSchedule.token}
                          onChange={(e) =>
                            setEditingSchedule((s) => s ? { ...s, token: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') } : null)
                          }
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-bold uppercase outline-none focus:border-blue-600"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700">Kebijakan Anti-Curang</label>
                        <select
                          value={editingSchedule.antiCheatMode}
                          onChange={(e) =>
                            setEditingSchedule((s) => s ? { ...s, antiCheatMode: e.target.value as AntiCheatMode } : null)
                          }
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600"
                        >
                          <option value="strict">Ketat (1x keluar tab langsung terkunci)</option>
                          <option value="tolerance">Toleransi Peringatan</option>
                        </select>
                      </div>

                      {scheduleEditError && (
                        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          {scheduleEditError}
                        </div>
                      )}

                      <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={() => setEditingSchedule(null)}
                          className="rounded border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          disabled={savingScheduleEdit}
                          className="rounded bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {savingScheduleEdit ? 'Menyimpan...' : 'Simpan Perubahan Jadwal'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </section>

            {/* Sekolah & Peserta */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Building2 className="h-4 w-4 text-blue-600" />
                  Daftar Sekolah Peserta (Kabupaten)
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const res = await authFetch('/api/admin/schools', {
                      method: 'POST',
                      body: JSON.stringify(newSchool),
                    });
                    if (res.ok) {
                      setNewSchool({ npsn: '', name: '', district: '' });
                      setActionMessage('Sekolah berhasil ditambahkan.');
                      void loadAllAdminData();
                    }
                  }}
                  className="mt-3 flex flex-wrap gap-2"
                >
                  <input
                    type="text"
                    required
                    placeholder="NPSN"
                    value={newSchool.npsn}
                    onChange={(e) => setNewSchool((s) => ({ ...s, npsn: e.target.value }))}
                    className="w-28 rounded border border-slate-300 px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Nama Sekolah"
                    value={newSchool.name}
                    onChange={(e) => setNewSchool((s) => ({ ...s, name: e.target.value }))}
                    className="flex-1 rounded border border-slate-300 px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Kecamatan"
                    value={newSchool.district}
                    onChange={(e) => setNewSchool((s) => ({ ...s, district: e.target.value }))}
                    className="w-32 rounded border border-slate-300 px-2.5 py-1.5 text-xs"
                  />
                  <button
                    type="submit"
                    className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    + Tambah
                  </button>
                </form>

                <div className="mt-3 divide-y divide-slate-200 text-xs">
                  {schools.map((sc) =>
                    editingSchool?.id === sc.id ? (
                      <form
                        key={sc.id}
                        onSubmit={async (e) => {
                          e.preventDefault();
                          setSchoolEditError(null);
                          setSavingSchoolEdit(true);
                          try {
                            const res = await authFetch(`/api/admin/schools/${sc.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({
                                npsn: editingSchool.npsn,
                                name: editingSchool.name,
                                district: editingSchool.district,
                              }),
                            });
                            const data = await res.json();
                            if (!res.ok) {
                              setSchoolEditError(data.error || 'Gagal menyimpan perubahan sekolah.');
                              return;
                            }
                            setEditingSchool(null);
                            setActionMessage(
                              `Identitas sekolah "${data.school.name}" (NPSN ${data.school.npsn}) diperbarui.`,
                            );
                            void loadAllAdminData();
                          } finally {
                            setSavingSchoolEdit(false);
                          }
                        }}
                        className="space-y-2 rounded-md bg-blue-50/50 p-3 my-1.5 border border-blue-200"
                      >
                        <div className="font-bold text-slate-800">Edit Identitas Sekolah & NPSN</div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600">
                              NPSN
                            </label>
                            <input
                              type="text"
                              required
                              value={editingSchool.npsn}
                              onChange={(e) =>
                                setEditingSchool((prev) =>
                                  prev ? { ...prev, npsn: e.target.value } : prev,
                                )
                              }
                              className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs outline-none focus:border-blue-600"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-600">
                              Nama Sekolah
                            </label>
                            <input
                              type="text"
                              required
                              value={editingSchool.name}
                              onChange={(e) =>
                                setEditingSchool((prev) =>
                                  prev ? { ...prev, name: e.target.value } : prev,
                                )
                              }
                              className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-600"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-600">
                              Kecamatan / Wilayah
                            </label>
                            <input
                              type="text"
                              value={editingSchool.district}
                              onChange={(e) =>
                                setEditingSchool((prev) =>
                                  prev ? { ...prev, district: e.target.value } : prev,
                                )
                              }
                              placeholder="Misal: Kec. Beji"
                              className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-600"
                            />
                          </div>
                        </div>
                        {schoolEditError && (
                          <div className="text-[11px] font-medium text-red-600">
                            {schoolEditError}
                          </div>
                        )}
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSchool(null);
                              setSchoolEditError(null);
                            }}
                            className="rounded border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            Batal
                          </button>
                          <button
                            type="submit"
                            disabled={savingSchoolEdit}
                            className="rounded bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                          >
                            {savingSchoolEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div key={sc.id} className="flex items-center justify-between gap-2 py-2.5">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900">{sc.name}</div>
                          <div className="font-mono text-[11px] text-slate-500">
                            NPSN: {sc.npsn} · {sc.district}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSchool({ ...sc });
                              setSchoolEditError(null);
                              setConfirmDeleteSchoolId(null);
                            }}
                            className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            <Edit3 className="h-3 w-3" />
                            Edit
                          </button>
                          {confirmDeleteSchoolId === sc.id ? (
                            <span className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-1.5 py-0.5">
                              <button
                                type="button"
                                onClick={async () => {
                                  await authFetch(`/api/admin/schools/${sc.id}`, {
                                    method: 'DELETE',
                                  });
                                  setConfirmDeleteSchoolId(null);
                                  setActionMessage(`Sekolah "${sc.name}" telah dihapus.`);
                                  void loadAllAdminData();
                                }}
                                className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white"
                              >
                                Hapus
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSchoolId(null)}
                                className="text-[10px] font-semibold text-slate-600"
                              >
                                Batal
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteSchoolId(sc.id)}
                              title="Hapus sekolah"
                              className="rounded p-1 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <Users className="h-4 w-4 text-blue-600" />
                      Daftar Akun Peserta Ujian ({participants.length})
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      Mendukung multi-sekolah maupun ujian semester 33 kelas (7A–7K, 8A–8K, 9A–9K).
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleDownloadExcelTemplate()}
                      className="inline-flex items-center gap-1.5 rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Template Excel (.xlsx)
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBulkImport((v) => !v)}
                      className="inline-flex items-center gap-1.5 rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      <FileUp className="h-3.5 w-3.5" />
                      {showBulkImport ? 'Tutup Impor Excel' : 'Impor Siswa Excel'}
                    </button>
                  </div>
                </div>

                {showBulkImport && (
                  <form
                    onSubmit={handleBulkImportSubmit}
                    className="mt-3 space-y-3 rounded-md border border-blue-200 bg-blue-50/40 p-3.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-800">
                          Impor Peserta Dari Template Excel (.xlsx / .csv)
                        </span>
                        <div className="text-[11px] text-slate-500">
                          Susunan kolom template:{' '}
                          <strong className="font-mono text-slate-700">
                            No | NIS | NAMA SISWA | Jenis Kelamin (L/P)
                          </strong>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDownloadExcelTemplate()}
                        className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50"
                      >
                        <Download className="h-3 w-3" />
                        Unduh Template Excel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Sekolah Tujuan:
                        </label>
                        <select
                          value={bulkSchoolId}
                          onChange={(e) => setBulkSchoolId(Number(e.target.value))}
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                        >
                          {schools.map((sc) => (
                            <option key={sc.id} value={sc.id}>
                              {sc.name} (NPSN {sc.npsn})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Kelas Tujuan (33 Kelas 7A–9K):
                        </label>
                        <select
                          value={bulkClassName}
                          onChange={(e) => setBulkClassName(e.target.value)}
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold"
                        >
                          <option value="">Umum / Tanpa Kelas Khusus</option>
                          <optgroup label="Kelas 7 (7A–7K)">
                            {SCHOOL_CLASSES_33.filter((c) => c.startsWith('7')).map((c) => (
                              <option key={c} value={c}>
                                Kelas {c}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Kelas 8 (8A–8K)">
                            {SCHOOL_CLASSES_33.filter((c) => c.startsWith('8')).map((c) => (
                              <option key={c} value={c}>
                                Kelas {c}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Kelas 9 (9A–9K)">
                            {SCHOOL_CLASSES_33.filter((c) => c.startsWith('9')).map((c) => (
                              <option key={c} value={c}>
                                Kelas {c}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Sesi Ujian:
                        </label>
                        <select
                          value={bulkSession}
                          onChange={(e) => setBulkSession(Number(e.target.value) as 1 | 2 | 3)}
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                        >
                          <option value={1}>Sesi 1</option>
                          <option value={2}>Sesi 2</option>
                          <option value={3}>Sesi 3</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Password Login Awal (Username = NIS):
                        </label>
                        <div className="mt-1 flex gap-1.5">
                          <select
                            value={bulkPasswordMode}
                            onChange={(e) =>
                              setBulkPasswordMode(e.target.value as 'nis' | 'custom')
                            }
                            className="flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
                          >
                            <option value="nis">Sama dengan NIS</option>
                            <option value="custom">Password Seragam</option>
                          </select>
                          {bulkPasswordMode === 'custom' && (
                            <input
                              type="text"
                              value={bulkCustomPassword}
                              onChange={(e) => setBulkCustomPassword(e.target.value)}
                              placeholder="Password"
                              className="w-24 rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs"
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-dashed border-blue-300 bg-white p-2.5">
                      <div className="text-[11px] text-slate-600">
                        {bulkFileName ? (
                          <span>
                            File dipilih: <strong className="text-slate-900">{bulkFileName}</strong> ·{' '}
                            <strong className="text-emerald-700">
                              {bulkPreviewRows.length} siswa siap impor
                            </strong>
                          </span>
                        ) : (
                          <span>Pilih file Excel (.xlsx) atau CSV hasil pengisian template.</span>
                        )}
                      </div>
                      <label className="cursor-pointer rounded bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-900">
                        Pilih File .XLSX / .CSV
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv,.txt"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleExcelOrCsvFileUpload(file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>

                    {bulkPreviewRows.length > 0 ? (
                      <div className="max-h-44 overflow-y-auto rounded border border-slate-200 bg-white">
                        <table className="w-full border-collapse text-left text-[11px]">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                              <th className="px-2 py-1.5 font-bold">No</th>
                              <th className="px-2 py-1.5 font-bold">NIS</th>
                              <th className="px-2 py-1.5 font-bold">NAMA SISWA</th>
                              <th className="px-2 py-1.5 font-bold">L/P</th>
                              <th className="px-2 py-1.5 font-bold">Kelas</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {bulkPreviewRows.slice(0, 100).map((r, i) => (
                              <tr key={`${r.nis}-${i}`}>
                                <td className="px-2 py-1 font-mono text-slate-500">{r.no}</td>
                                <td className="px-2 py-1 font-mono font-semibold text-slate-900">
                                  {r.nis}
                                </td>
                                <td className="px-2 py-1 text-slate-900">{r.fullName}</td>
                                <td className="px-2 py-1 font-semibold">
                                  {r.gender === 'Perempuan' ? 'P' : 'L'}
                                </td>
                                <td className="px-2 py-1 font-mono text-blue-700">
                                  {bulkClassName || '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {bulkPreviewRows.length > 100 && (
                          <div className="border-t border-slate-100 px-2 py-1 text-[10px] text-slate-500">
                            Menampilkan 100 dari {bulkPreviewRows.length} siswa yang akan diimpor.
                          </div>
                        )}
                      </div>
                    ) : (
                      <textarea
                        rows={3}
                        value={bulkCsvText}
                        onChange={(e) => setBulkCsvText(e.target.value)}
                        placeholder="Atau tempel baris data langsung (No,NIS,NAMA SISWA,L/P) — misal: 1,202607001,Ahmad Fauzan,L"
                        className="w-full rounded border border-slate-300 bg-white p-2 font-mono text-[11px]"
                      />
                    )}

                    {bulkError && (
                      <div className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700">
                        {bulkError}
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      {bulkPreviewRows.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setBulkPreviewRows([]);
                            setBulkFileName('');
                            setBulkCsvText('');
                          }}
                          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          Reset File
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={bulkLoading}
                        className="rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {bulkLoading
                          ? 'Memproses...'
                          : bulkPreviewRows.length > 0
                            ? `Impor ${bulkPreviewRows.length} Siswa (Kelas ${bulkClassName || 'Umum'})`
                            : 'Proses Impor Peserta'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Manual Single Student Add Form */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const res = await authFetch('/api/admin/participants', {
                      method: 'POST',
                      body: JSON.stringify({
                        ...newParticipant,
                        username: newParticipant.username.trim() || newParticipant.nis.trim(),
                      }),
                    });
                    const d = await res.json();
                    if (res.ok) {
                      setNewParticipant((p) => ({
                        ...p,
                        nis: '',
                        username: '',
                        password: '',
                        fullName: '',
                      }));
                      setActionMessage('Peserta baru berhasil didaftarkan.');
                      void loadAllAdminData();
                    } else {
                      setActionMessage(d.error || 'Gagal menambah peserta.');
                    }
                  }}
                  className="mt-3 grid grid-cols-2 gap-2"
                >
                  <select
                    value={newParticipant.schoolId}
                    onChange={(e) =>
                      setNewParticipant((p) => ({ ...p, schoolId: Number(e.target.value) }))
                    }
                    className="rounded border border-slate-300 px-2.5 py-1.5 text-xs"
                  >
                    {schools.map((sc) => (
                      <option key={sc.id} value={sc.id}>
                        {sc.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newParticipant.className}
                    onChange={(e) =>
                      setNewParticipant((p) => ({ ...p, className: e.target.value }))
                    }
                    className="rounded border border-slate-300 px-2.5 py-1.5 text-xs font-semibold"
                  >
                    <option value="">Tanpa Kelas</option>
                    <optgroup label="Kelas 7 (7A–7K)">
                      {SCHOOL_CLASSES_33.filter((c) => c.startsWith('7')).map((c) => (
                        <option key={c} value={c}>
                          Kelas {c}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Kelas 8 (8A–8K)">
                      {SCHOOL_CLASSES_33.filter((c) => c.startsWith('8')).map((c) => (
                        <option key={c} value={c}>
                          Kelas {c}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Kelas 9 (9A–9K)">
                      {SCHOOL_CLASSES_33.filter((c) => c.startsWith('9')).map((c) => (
                        <option key={c} value={c}>
                          Kelas {c}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <input
                    type="text"
                    placeholder="NIS Siswa"
                    value={newParticipant.nis}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewParticipant((p) => ({
                        ...p,
                        nis: val,
                        username: p.username === '' || p.username === p.nis ? val : p.username,
                      }));
                    }}
                    className="rounded border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Username Login (atau NIS)"
                    value={newParticipant.username}
                    onChange={(e) =>
                      setNewParticipant((p) => ({ ...p, username: e.target.value }))
                    }
                    className="rounded border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Nama Lengkap Siswa"
                    value={newParticipant.fullName}
                    onChange={(e) =>
                      setNewParticipant((p) => ({ ...p, fullName: e.target.value }))
                    }
                    className="rounded border border-slate-300 px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Password Login"
                    value={newParticipant.password}
                    onChange={(e) =>
                      setNewParticipant((p) => ({ ...p, password: e.target.value }))
                    }
                    className="rounded border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                  />
                  <select
                    value={newParticipant.gender}
                    onChange={(e) =>
                      setNewParticipant((p) => ({
                        ...p,
                        gender: e.target.value as 'Laki-Laki' | 'Perempuan',
                      }))
                    }
                    className="rounded border border-slate-300 px-2.5 py-1.5 text-xs"
                  >
                    <option value="Laki-Laki">Laki-Laki (L)</option>
                    <option value="Perempuan">Perempuan (P)</option>
                  </select>
                  <select
                    value={newParticipant.assignedSession}
                    onChange={(e) =>
                      setNewParticipant((p) => ({
                        ...p,
                        assignedSession: Number(e.target.value) as 1 | 2 | 3,
                      }))
                    }
                    className="rounded border border-slate-300 px-2.5 py-1.5 text-xs"
                  >
                    <option value={1}>Sesi 1</option>
                    <option value={2}>Sesi 2</option>
                    <option value={3}>Sesi 3</option>
                  </select>
                  <button
                    type="submit"
                    className="col-span-2 rounded bg-blue-600 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    + Daftarkan Peserta
                  </button>
                </form>

                {/* Participant Search & Class Filter Bar */}
                {(() => {
                  const filteredParticipants = participants.filter((pt) => {
                    if (
                      participantSchoolFilter !== 'ALL' &&
                      String(pt.schoolId) !== participantSchoolFilter
                    ) {
                      return false;
                    }
                    if (
                      participantClassFilter !== 'ALL' &&
                      (pt.className || '') !== participantClassFilter
                    ) {
                      return false;
                    }
                    if (participantSearch.trim()) {
                      const q = participantSearch.trim().toLowerCase();
                      if (
                        !pt.fullName.toLowerCase().includes(q) &&
                        !pt.username.toLowerCase().includes(q) &&
                        !(pt.nis || '').toLowerCase().includes(q) &&
                        !(pt.className || '').toLowerCase().includes(q)
                      ) {
                        return false;
                      }
                    }
                    return true;
                  });

                  return (
                    <div className="mt-4 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs">
                        <div className="relative flex-1 min-w-[140px]">
                          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={participantSearch}
                            onChange={(e) => setParticipantSearch(e.target.value)}
                            placeholder="Cari nama / NIS / username..."
                            className="w-full rounded border border-slate-300 bg-white py-1 pl-7 pr-2 text-xs outline-none focus:border-blue-600"
                          />
                        </div>
                        <select
                          value={participantSchoolFilter}
                          onChange={(e) => setParticipantSchoolFilter(e.target.value)}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value="ALL">Semua Sekolah</option>
                          {schools.map((sc) => (
                            <option key={sc.id} value={String(sc.id)}>
                              {sc.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={participantClassFilter}
                          onChange={(e) => setParticipantClassFilter(e.target.value)}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold"
                        >
                          <option value="ALL">Semua Kelas (33)</option>
                          <optgroup label="Kelas 7 (7A–7K)">
                            {SCHOOL_CLASSES_33.filter((c) => c.startsWith('7')).map((c) => (
                              <option key={c} value={c}>
                                Kelas {c}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Kelas 8 (8A–8K)">
                            {SCHOOL_CLASSES_33.filter((c) => c.startsWith('8')).map((c) => (
                              <option key={c} value={c}>
                                Kelas {c}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Kelas 9 (9A–9K)">
                            {SCHOOL_CLASSES_33.filter((c) => c.startsWith('9')).map((c) => (
                              <option key={c} value={c}>
                                Kelas {c}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>

                      <div className="text-[11px] font-medium text-slate-500">
                        Menampilkan {filteredParticipants.length} dari {participants.length} peserta terdaftar
                      </div>

                      <div className="max-h-96 overflow-y-auto divide-y divide-slate-200 text-xs">
                        {filteredParticipants.length === 0 ? (
                          <div className="py-6 text-center text-slate-500">
                            Belum ada siswa yang sesuai filter kelas/sekolah ini.
                          </div>
                        ) : (
                          filteredParticipants.map((pt) =>
                            editingParticipant?.id === pt.id ? (
                              <form
                                key={pt.id}
                                onSubmit={async (e) => {
                                  e.preventDefault();
                                  setParticipantEditError(null);
                                  setSavingParticipantEdit(true);
                                  try {
                                    const res = await authFetch(`/api/admin/participants/${pt.id}`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({
                                        schoolId: editingParticipant.schoolId,
                                        className: editingParticipant.className,
                                        nis: editingParticipant.nis,
                                        username: editingParticipant.username,
                                        fullName: editingParticipant.fullName,
                                        gender: editingParticipant.gender,
                                        birthDate: editingParticipant.birthDate,
                                        assignedSession: editingParticipant.assignedSession,
                                        newPassword: editingParticipant.newPassword,
                                      }),
                                    });
                                    const data = await res.json();
                                    if (!res.ok) {
                                      setParticipantEditError(
                                        data.error || 'Gagal menyimpan data peserta.',
                                      );
                                      return;
                                    }
                                    setEditingParticipant(null);
                                    setActionMessage(
                                      `Data peserta "${editingParticipant.fullName}" berhasil diperbarui.`,
                                    );
                                    void loadAllAdminData();
                                  } finally {
                                    setSavingParticipantEdit(false);
                                  }
                                }}
                                className="my-1.5 space-y-2 rounded-md border border-blue-200 bg-blue-50/50 p-3"
                              >
                                <div className="font-bold text-slate-800">Edit Data Peserta (Siswa)</div>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-600">
                                      Sekolah
                                    </label>
                                    <select
                                      value={editingParticipant.schoolId}
                                      onChange={(e) =>
                                        setEditingParticipant((prev) =>
                                          prev ? { ...prev, schoolId: Number(e.target.value) } : prev,
                                        )
                                      }
                                      className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                                    >
                                      {schools.map((sc) => (
                                        <option key={sc.id} value={sc.id}>
                                          {sc.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-600">
                                      Kelas
                                    </label>
                                    <select
                                      value={editingParticipant.className}
                                      onChange={(e) =>
                                        setEditingParticipant((prev) =>
                                          prev ? { ...prev, className: e.target.value } : prev,
                                        )
                                      }
                                      className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold"
                                    >
                                      <option value="">Tanpa Kelas</option>
                                      <optgroup label="Kelas 7 (7A–7K)">
                                        {SCHOOL_CLASSES_33.filter((c) => c.startsWith('7')).map((c) => (
                                          <option key={c} value={c}>
                                            Kelas {c}
                                          </option>
                                        ))}
                                      </optgroup>
                                      <optgroup label="Kelas 8 (8A–8K)">
                                        {SCHOOL_CLASSES_33.filter((c) => c.startsWith('8')).map((c) => (
                                          <option key={c} value={c}>
                                            Kelas {c}
                                          </option>
                                        ))}
                                      </optgroup>
                                      <optgroup label="Kelas 9 (9A–9K)">
                                        {SCHOOL_CLASSES_33.filter((c) => c.startsWith('9')).map((c) => (
                                          <option key={c} value={c}>
                                            Kelas {c}
                                          </option>
                                        ))}
                                      </optgroup>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-600">
                                      Sesi Ujian
                                    </label>
                                    <select
                                      value={editingParticipant.assignedSession}
                                      onChange={(e) =>
                                        setEditingParticipant((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                assignedSession: Number(e.target.value) as 1 | 2 | 3,
                                              }
                                            : prev,
                                        )
                                      }
                                      className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                                    >
                                      <option value={1}>Sesi 1</option>
                                      <option value={2}>Sesi 2</option>
                                      <option value={3}>Sesi 3</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-600">
                                      NIS
                                    </label>
                                    <input
                                      type="text"
                                      value={editingParticipant.nis}
                                      onChange={(e) =>
                                        setEditingParticipant((prev) =>
                                          prev ? { ...prev, nis: e.target.value } : prev,
                                        )
                                      }
                                      className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs"
                                    />
                                  </div>
                                  <div className="sm:col-span-2">
                                    <label className="block text-[11px] font-semibold text-slate-600">
                                      Nama Siswa
                                    </label>
                                    <input
                                      type="text"
                                      required
                                      value={editingParticipant.fullName}
                                      onChange={(e) =>
                                        setEditingParticipant((prev) =>
                                          prev ? { ...prev, fullName: e.target.value } : prev,
                                        )
                                      }
                                      className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-600">
                                      Username
                                    </label>
                                    <input
                                      type="text"
                                      required
                                      value={editingParticipant.username}
                                      onChange={(e) =>
                                        setEditingParticipant((prev) =>
                                          prev ? { ...prev, username: e.target.value } : prev,
                                        )
                                      }
                                      className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-600">
                                      Jenis Kelamin
                                    </label>
                                    <select
                                      value={editingParticipant.gender}
                                      onChange={(e) =>
                                        setEditingParticipant((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                gender: e.target.value as 'Laki-Laki' | 'Perempuan',
                                              }
                                            : prev,
                                        )
                                      }
                                      className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                                    >
                                      <option value="Laki-Laki">Laki-Laki (L)</option>
                                      <option value="Perempuan">Perempuan (P)</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-600">
                                      Reset Password (opsional)
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="Kosongkan jika tetap"
                                      value={editingParticipant.newPassword}
                                      onChange={(e) =>
                                        setEditingParticipant((prev) =>
                                          prev ? { ...prev, newPassword: e.target.value } : prev,
                                        )
                                      }
                                      className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs"
                                    />
                                  </div>
                                </div>
                                {participantEditError && (
                                  <div className="text-[11px] font-medium text-red-600">
                                    {participantEditError}
                                  </div>
                                )}
                                <div className="flex justify-end gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingParticipant(null);
                                      setParticipantEditError(null);
                                    }}
                                    className="rounded border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                                  >
                                    Batal
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={savingParticipantEdit}
                                    className="rounded bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                  >
                                    {savingParticipantEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <div key={pt.id} className="flex items-center justify-between gap-2 py-2.5">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-900">
                                    <span>{pt.fullName}</span>
                                    {pt.className && (
                                      <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700">
                                        {pt.className}
                                      </span>
                                    )}
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
                                      {pt.gender === 'Perempuan' ? 'P' : 'L'}
                                    </span>
                                  </div>
                                  <div className="mt-0.5 text-[11px] text-slate-500">
                                    {pt.nis ? `NIS: ${pt.nis} · ` : ''}
                                    User: <span className="font-mono text-slate-700">{pt.username}</span> ·{' '}
                                    {pt.schoolName} · Sesi {pt.assignedSession}
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingParticipant({ ...pt, newPassword: '' });
                                      setParticipantEditError(null);
                                      setConfirmDeleteParticipantId(null);
                                    }}
                                    className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                                  >
                                    <Edit3 className="h-3 w-3" />
                                    Edit
                                  </button>
                                  {confirmDeleteParticipantId === pt.id ? (
                                    <span className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-1.5 py-0.5">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await authFetch(`/api/admin/participants/${pt.id}`, {
                                            method: 'DELETE',
                                          });
                                          setConfirmDeleteParticipantId(null);
                                          setActionMessage(`Peserta "${pt.fullName}" dihapus.`);
                                          void loadAllAdminData();
                                        }}
                                        className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white"
                                      >
                                        Hapus
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteParticipantId(null)}
                                        className="text-[10px] font-semibold text-slate-600"
                                      >
                                        Batal
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteParticipantId(pt.id)}
                                      title="Hapus peserta"
                                      className="rounded p-1 text-red-600 hover:bg-red-50"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ),
                          )
                        )}
                      </div>
                    </div>
                  );
                })()}
              </section>
            </div>
          </div>
        )}

        {/* TAB 4: REKAP NILAI & KOREKSI URAIAN */}
        {activeTab === 'rekap_nilai' && (() => {
          const completedAll = sessions.filter((s) => s.status === 'COMPLETED');
          const filteredRekap = completedAll.filter((s) => {
            if (rekapSchoolFilter !== 'ALL' && String(s.schoolId) !== rekapSchoolFilter) return false;
            if (rekapClassFilter !== 'ALL' && (s.className || '') !== rekapClassFilter) return false;
            if (rekapSessionFilter !== 'ALL' && String(s.sessionNumber) !== rekapSessionFilter)
              return false;
            return true;
          });
          const avgPct =
            filteredRekap.length > 0
              ? filteredRekap.reduce((acc, s) => acc + s.percentage, 0) / filteredRekap.length
              : 0;
          const highestPct =
            filteredRekap.length > 0 ? Math.max(...filteredRekap.map((s) => s.percentage)) : 0;
          const needEssayCount = filteredRekap.filter((s) => s.needsManualGrading).length;

          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">Peserta Selesai</div>
                  <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
                    {filteredRekap.length}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">Rata-Rata Nilai (%)</div>
                  <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-blue-700">
                    {avgPct.toFixed(1)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">Nilai Tertinggi (%)</div>
                  <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-700">
                    {highestPct.toFixed(1)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">Menunggu Koreksi Uraian</div>
                  <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-700">
                    {needEssayCount}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Rekapitulasi Nilai & Koreksi Rubrik Uraian
                    </h2>
                    <p className="text-xs text-slate-500">
                      Nilai dihitung akurat di server. Filter per sekolah atau sesi, lalu klik "Koreksi / Rincian" untuk soal Uraian.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={rekapSchoolFilter}
                      onChange={(e) => setRekapSchoolFilter(e.target.value)}
                      className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-600"
                    >
                      <option value="ALL">Semua Sekolah</option>
                      {schools.map((sc) => (
                        <option key={sc.id} value={String(sc.id)}>
                          {sc.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={rekapClassFilter}
                      onChange={(e) => setRekapClassFilter(e.target.value)}
                      className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-600"
                    >
                      <option value="ALL">Semua Kelas (33)</option>
                      <optgroup label="Kelas 7 (7A–7K)">
                        {SCHOOL_CLASSES_33.filter((c) => c.startsWith('7')).map((c) => (
                          <option key={c} value={c}>
                            Kelas {c}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Kelas 8 (8A–8K)">
                        {SCHOOL_CLASSES_33.filter((c) => c.startsWith('8')).map((c) => (
                          <option key={c} value={c}>
                            Kelas {c}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Kelas 9 (9A–9K)">
                        {SCHOOL_CLASSES_33.filter((c) => c.startsWith('9')).map((c) => (
                          <option key={c} value={c}>
                            Kelas {c}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <select
                      value={rekapSessionFilter}
                      onChange={(e) => setRekapSessionFilter(e.target.value)}
                      className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-600"
                    >
                      <option value="ALL">Semua Sesi</option>
                      <option value="1">Sesi 1</option>
                      <option value="2">Sesi 2</option>
                      <option value="3">Sesi 3</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowPdfSettingsModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      <Palette className="h-4 w-4 text-blue-600" />
                      Pengaturan Format PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPdfPreviewModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
                    >
                      <Download className="h-4 w-4" />
                      Unduh / Cetak PDF Rekap
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDownloadCsv()}
                      className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                    >
                      <Download className="h-4 w-4" />
                      Ekspor CSV / Excel
                    </button>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                        <th className="px-3 py-2.5 font-bold">Peserta</th>
                        <th className="px-3 py-2.5 font-bold">Sekolah & Sesi</th>
                        <th className="px-3 py-2.5 font-bold">Paket</th>
                        <th className="px-3 py-2.5 text-right font-bold">Skor</th>
                        <th className="px-3 py-2.5 text-right font-bold">Nilai (%)</th>
                        <th className="px-3 py-2.5 font-bold">Status Penilaian</th>
                        <th className="px-3 py-2.5 text-right font-bold">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredRekap.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                            Belum ada hasil ujian yang sesuai filter sekolah/kelas/sesi ini.
                          </td>
                        </tr>
                      ) : (
                        filteredRekap.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-50/70">
                            <td className="px-3 py-3 font-semibold text-slate-900">
                              {s.fullName}{' '}
                              {s.className && (
                                <span className="ml-1 rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700">
                                  {s.className}
                                </span>
                              )}
                              <span className="block font-mono text-[11px] font-normal text-slate-500">
                                {s.username}
                                {s.nis && s.nis !== s.username ? ` · NIS ${s.nis}` : ''}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              {s.schoolName} · Sesi {s.sessionNumber}
                            </td>
                            <td className="px-3 py-3">{s.packageTitle}</td>
                            <td className="px-3 py-3 text-right font-mono font-bold tabular-nums">
                              {s.totalScore} / {s.maxScore}
                            </td>
                            <td className="px-3 py-3 text-right font-mono font-bold tabular-nums text-blue-700">
                              {s.percentage.toFixed(1)}
                            </td>
                            <td className="px-3 py-3">
                              {s.needsManualGrading ? (
                                <span className="font-semibold text-amber-700">
                                  Perlu Koreksi Uraian
                                </span>
                              ) : (
                                <span className="font-semibold text-emerald-700">Final</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => void openGradingModal(s.id)}
                                className="rounded border border-blue-300 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100"
                              >
                                Koreksi / Rincian
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

      {/* MODAL: PDF FORMAT SETTINGS */}
      {showPdfSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h3 className="text-base font-bold text-slate-900">
                Pengaturan Format PDF Rekapitulasi Nilai
              </h3>
              <button
                type="button"
                onClick={() => setShowPdfSettingsModal(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPdfConfigError(null);
                setSavingPdfConfig(true);
                try {
                  const res = await authFetch('/api/admin/pdf-config', {
                    method: 'PUT',
                    body: JSON.stringify(pdfConfig),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    setPdfConfigError(data.error || 'Gagal menyimpan pengaturan PDF.');
                    return;
                  }
                  if (data.config) {
                    setPdfConfig(data.config);
                  }
                  setActionMessage('Pengaturan format PDF rekap nilai berhasil disimpan.');
                  setShowPdfSettingsModal(false);
                } finally {
                  setSavingPdfConfig(false);
                }
              }}
              className="flex-1 space-y-4 overflow-y-auto p-5 text-xs"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold text-slate-700">Header Pemerintah / Instansi Atas</label>
                  <input
                    type="text"
                    required
                    value={pdfConfig.govHeader}
                    onChange={(e) => setPdfConfig((c) => ({ ...c, govHeader: e.target.value }))}
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Header Dinas / Instansi Kedua</label>
                  <input
                    type="text"
                    required
                    value={pdfConfig.dinasHeader}
                    onChange={(e) => setPdfConfig((c) => ({ ...c, dinasHeader: e.target.value }))}
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Nama Sekolah</label>
                  <input
                    type="text"
                    required
                    value={pdfConfig.schoolName}
                    onChange={(e) => setPdfConfig((c) => ({ ...c, schoolName: e.target.value }))}
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Alamat Sekolah</label>
                  <input
                    type="text"
                    required
                    value={pdfConfig.schoolAddress}
                    onChange={(e) => setPdfConfig((c) => ({ ...c, schoolAddress: e.target.value }))}
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Lokasi Tanda Tangan (Kota/Kecamatan)</label>
                  <input
                    type="text"
                    required
                    value={pdfConfig.signLocation}
                    onChange={(e) => setPdfConfig((c) => ({ ...c, signLocation: e.target.value }))}
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Tanggal Tanda Tangan / Cetak</label>
                  <input
                    type="text"
                    required
                    value={pdfConfig.signDate}
                    onChange={(e) => setPdfConfig((c) => ({ ...c, signDate: e.target.value }))}
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Nama Kepala Sekolah</label>
                  <input
                    type="text"
                    required
                    value={pdfConfig.headmasterName}
                    onChange={(e) => setPdfConfig((c) => ({ ...c, headmasterName: e.target.value }))}
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">NIP Kepala Sekolah</label>
                  <input
                    type="text"
                    required
                    value={pdfConfig.headmasterNip}
                    onChange={(e) => setPdfConfig((c) => ({ ...c, headmasterNip: e.target.value }))}
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Nama Proktor / Guru Mapel</label>
                  <input
                    type="text"
                    required
                    value={pdfConfig.proctorName}
                    onChange={(e) => setPdfConfig((c) => ({ ...c, proctorName: e.target.value }))}
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">NIP Proktor / Guru Mapel</label>
                  <input
                    type="text"
                    required
                    value={pdfConfig.proctorNip}
                    onChange={(e) => setPdfConfig((c) => ({ ...c, proctorNip: e.target.value }))}
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Jabatan Penandatangan Kanan</label>
                  <input
                    type="text"
                    required
                    value={pdfConfig.proctorTitle}
                    onChange={(e) => setPdfConfig((c) => ({ ...c, proctorTitle: e.target.value }))}
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
              </div>

              {pdfConfigError && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                  {pdfConfigError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowPdfSettingsModal(false)}
                  className="rounded border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingPdfConfig}
                  className="rounded bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingPdfConfig ? 'Menyimpan...' : 'Simpan Format PDF'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PDF REKAP PREVIEW & PRINT */}
      {showPdfPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="flex max-h-[94vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Pratinjau Dokumen Rekapitulasi Nilai (Format PDF Resmi)
                </h3>
                <p className="text-xs text-slate-500">
                  Tampilan sesuai dengan format rekap nilai resmi. Klik tombol cetak untuk menyimpan sebagai PDF.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700"
                >
                  <Download className="h-4 w-4" />
                  Cetak / Simpan PDF
                </button>
                <button
                  type="button"
                  onClick={() => setShowPdfPreviewModal(false)}
                  className="rounded-md border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-100 p-6 sm:p-8 flex justify-center">
              <div
                id="printable-pdf-document"
                className="w-full max-w-[210mm] bg-white p-[15mm] shadow-lg text-slate-900 text-xs leading-relaxed font-sans"
              >
                {/* Header Instansi */}
                <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white p-0.5 shadow-xs">
                    {(pdfConfig.logoUrl || '/assets/aistudio/tutwuri1_e2a6801e.jpg') ? (
                      <img
                        src={pdfConfig.logoUrl || '/assets/aistudio/tutwuri1_e2a6801e.jpg'}
                        alt="Logo"
                        className="h-full w-full object-contain rounded-full"
                      />
                    ) : (
                      'TKA'
                    )}
                  </div>
                  <div className="flex-1 text-center px-2">
                    <div className="text-xs font-bold uppercase tracking-wider">{pdfConfig.govHeader}</div>
                    <div className="text-sm font-bold uppercase tracking-wider">{pdfConfig.dinasHeader}</div>
                    <div className="text-base font-extrabold uppercase tracking-tight">{pdfConfig.schoolName}</div>
                    <div className="text-[10px] text-slate-600">{pdfConfig.schoolAddress}</div>
                  </div>
                  <div className="w-12 shrink-0"></div>
                </div>

                <div className="text-center space-y-1 mb-5">
                  <h4 className="text-sm font-extrabold tracking-wide uppercase underline decoration-2 underline-offset-4">
                    REKAPITULASI DAFTAR NILAI
                  </h4>
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-800">
                    MATA PELAJARAN: {packages.find((p) => p.id === selectedPackageId)?.subjectName || 'INFORMATIKA'} — KELAS: {rekapClassFilter !== 'ALL' ? rekapClassFilter : 'VII-E'}
                  </div>
                </div>

                {/* Metadata Box */}
                <div className="mb-4 rounded border border-slate-800 p-2 text-[11px] space-y-1 bg-slate-50/50">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <strong>Paket Ujian :</strong> {packages.find((p) => p.id === selectedPackageId)?.title || 'TKA - SMP Sederajat'}
                    </div>
                    <div>
                      <strong>Tanggal Ujian :</strong> {pdfConfig.signDate}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <strong>Waktu :</strong> {packages.find((p) => p.id === selectedPackageId)?.durationMinutes || 75} Menit
                    </div>
                    <div>
                      <strong>Sesi Ujian :</strong> {rekapSessionFilter !== 'ALL' ? `Sesi ${rekapSessionFilter}` : 'Sesi 1'}
                    </div>
                  </div>
                </div>

                {/* Table */}
                <table className="w-full border-collapse border border-slate-900 text-left text-[11px] mb-4">
                  <thead>
                    <tr className="bg-slate-200 text-slate-900 font-bold border-b border-slate-900">
                      <th className="border-r border-slate-900 px-2 py-1.5 text-center w-10">NO</th>
                      <th className="border-r border-slate-900 px-2.5 py-1.5 w-24">NIS</th>
                      <th className="border-r border-slate-900 px-3 py-1.5">NAMA SISWA</th>
                      <th className="border-r border-slate-900 px-2 py-1.5 text-center w-12">L/P</th>
                      <th className="border-r border-slate-900 px-2 py-1.5 text-center w-16">KELAS</th>
                      <th className="border-r border-slate-900 px-2.5 py-1.5 text-right w-16">NILAI</th>
                      <th className="px-2.5 py-1.5 text-center w-24">STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const completedAll = sessions.filter((s) => s.status === 'COMPLETED');
                      const filteredRekap = completedAll.filter((s) => {
                        if (rekapSchoolFilter !== 'ALL' && String(s.schoolId) !== rekapSchoolFilter) return false;
                        if (rekapClassFilter !== 'ALL' && (s.className || '') !== rekapClassFilter) return false;
                        if (rekapSessionFilter !== 'ALL' && String(s.sessionNumber) !== rekapSessionFilter) return false;
                        return true;
                      });

                      if (filteredRekap.length === 0) {
                        return (
                          <>
                            <tr className="border-b border-slate-300">
                              <td className="border-r border-slate-900 px-2 py-1.5 text-center font-mono">1</td>
                              <td className="border-r border-slate-900 px-2.5 py-1.5 font-mono">14362</td>
                              <td className="border-r border-slate-900 px-3 py-1.5 font-medium">ABDUR ROHMAN</td>
                              <td className="border-r border-slate-900 px-2 py-1.5 text-center font-semibold">L</td>
                              <td className="border-r border-slate-900 px-2 py-1.5 text-center font-mono">7E</td>
                              <td className="border-r border-slate-900 px-2.5 py-1.5 text-right font-mono font-bold">80</td>
                              <td className="px-2.5 py-1.5 text-center font-semibold">Selesai</td>
                            </tr>
                            <tr className="border-b border-slate-300">
                              <td className="border-r border-slate-900 px-2 py-1.5 text-center font-mono">2</td>
                              <td className="border-r border-slate-900 px-2.5 py-1.5 font-mono">14363</td>
                              <td className="border-r border-slate-900 px-3 py-1.5 font-medium">ADINDA PUTRI NUR VEBYANI</td>
                              <td className="border-r border-slate-900 px-2 py-1.5 text-center font-semibold">P</td>
                              <td className="border-r border-slate-900 px-2 py-1.5 text-center font-mono">7E</td>
                              <td className="border-r border-slate-900 px-2.5 py-1.5 text-right font-mono font-bold">-</td>
                              <td className="px-2.5 py-1.5 text-center font-semibold">-</td>
                            </tr>
                            <tr className="border-b border-slate-300">
                              <td className="border-r border-slate-900 px-2 py-1.5 text-center font-mono">3</td>
                              <td className="border-r border-slate-900 px-2.5 py-1.5 font-mono">14364</td>
                              <td className="border-r border-slate-900 px-3 py-1.5 font-medium">AFIKA PUTRI WULANDARI</td>
                              <td className="border-r border-slate-900 px-2 py-1.5 text-center font-semibold">P</td>
                              <td className="border-r border-slate-900 px-2 py-1.5 text-center font-mono">7E</td>
                              <td className="border-r border-slate-900 px-2.5 py-1.5 text-right font-mono font-bold">-</td>
                              <td className="px-2.5 py-1.5 text-center font-semibold">-</td>
                            </tr>
                            <tr className="border-b border-slate-300">
                              <td className="border-r border-slate-900 px-2 py-1.5 text-center font-mono">4</td>
                              <td className="border-r border-slate-900 px-2.5 py-1.5 font-mono">14365</td>
                              <td className="border-r border-slate-900 px-3 py-1.5 font-medium">AHMAD JARIR HABIBI</td>
                              <td className="border-r border-slate-900 px-2 py-1.5 text-center font-semibold">L</td>
                              <td className="border-r border-slate-900 px-2 py-1.5 text-center font-mono">7E</td>
                              <td className="border-r border-slate-900 px-2.5 py-1.5 text-right font-mono font-bold">-</td>
                              <td className="px-2.5 py-1.5 text-center font-semibold">-</td>
                            </tr>
                          </>
                        );
                      }

                      return filteredRekap.map((s, idx) => (
                        <tr key={s.id} className="border-b border-slate-300">
                          <td className="border-r border-slate-900 px-2 py-1.5 text-center font-mono">{idx + 1}</td>
                          <td className="border-r border-slate-900 px-2.5 py-1.5 font-mono">{s.nis || '-'}</td>
                          <td className="border-r border-slate-900 px-3 py-1.5 font-medium">{s.fullName}</td>
                          <td className="border-r border-slate-900 px-2 py-1.5 text-center font-semibold">
                            {participants.find((p) => p.id === s.participantId)?.gender === 'Perempuan' || s.fullName.includes('Putri') || s.fullName.includes('Siti') ? 'P' : 'L'}
                          </td>
                          <td className="border-r border-slate-900 px-2 py-1.5 text-center font-mono">{s.className || '7E'}</td>
                          <td className="border-r border-slate-900 px-2.5 py-1.5 text-right font-mono font-bold">{Math.round(s.percentage)}</td>
                          <td className="px-2.5 py-1.5 text-center font-semibold">{s.status === 'COMPLETED' ? 'Selesai' : s.status}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>

                {/* Summary Box */}
                <div className="mb-8 w-1/2 rounded border border-slate-900 text-[11px]">
                  <div className="flex border-b border-slate-900 px-3 py-1">
                    <span className="w-36 font-semibold">RATA-RATA KELAS:</span>
                    <span className="font-mono font-bold">
                      {(() => {
                        const completedAll = sessions.filter((s) => s.status === 'COMPLETED');
                        const filteredRekap = completedAll.filter((s) => {
                          if (rekapSchoolFilter !== 'ALL' && String(s.schoolId) !== rekapSchoolFilter) return false;
                          if (rekapClassFilter !== 'ALL' && (s.className || '') !== rekapClassFilter) return false;
                          if (rekapSessionFilter !== 'ALL' && String(s.sessionNumber) !== rekapSessionFilter) return false;
                          return true;
                        });
                        return filteredRekap.length > 0 ? (filteredRekap.reduce((a, b) => a + b.percentage, 0) / filteredRekap.length).toFixed(1) : '80.0';
                      })()}
                    </span>
                  </div>
                  <div className="flex border-b border-slate-900 px-3 py-1">
                    <span className="w-36 font-semibold">NILAI TERTINGGI:</span>
                    <span className="font-mono font-bold">
                      {(() => {
                        const completedAll = sessions.filter((s) => s.status === 'COMPLETED');
                        const filteredRekap = completedAll.filter((s) => {
                          if (rekapSchoolFilter !== 'ALL' && String(s.schoolId) !== rekapSchoolFilter) return false;
                          if (rekapClassFilter !== 'ALL' && (s.className || '') !== rekapClassFilter) return false;
                          if (rekapSessionFilter !== 'ALL' && String(s.sessionNumber) !== rekapSessionFilter) return false;
                          return true;
                        });
                        return filteredRekap.length > 0 ? Math.max(...filteredRekap.map((s) => s.percentage)).toFixed(1) : '80.0';
                      })()}
                    </span>
                  </div>
                  <div className="flex px-3 py-1">
                    <span className="w-36 font-semibold">NILAI TERENDAH:</span>
                    <span className="font-mono font-bold">
                      {(() => {
                        const completedAll = sessions.filter((s) => s.status === 'COMPLETED');
                        const filteredRekap = completedAll.filter((s) => {
                          if (rekapSchoolFilter !== 'ALL' && String(s.schoolId) !== rekapSchoolFilter) return false;
                          if (rekapClassFilter !== 'ALL' && (s.className || '') !== rekapClassFilter) return false;
                          if (rekapSessionFilter !== 'ALL' && String(s.sessionNumber) !== rekapSessionFilter) return false;
                          return true;
                        });
                        return filteredRekap.length > 0 ? Math.min(...filteredRekap.map((s) => s.percentage)).toFixed(1) : '80.0';
                      })()}
                    </span>
                  </div>
                </div>

                {/* Signatures */}
                <div className="flex justify-between pt-2 text-[11px]">
                  <div className="text-center space-y-12">
                    <div>
                      Mengetahui,<br />
                      Kepala {pdfConfig.schoolName}
                    </div>
                    <div className="space-y-0.5">
                      <strong className="underline font-bold">{pdfConfig.headmasterName}</strong><br />
                      NIP. {pdfConfig.headmasterNip}
                    </div>
                  </div>
                  <div className="text-center space-y-12">
                    <div>
                      {pdfConfig.signLocation}, {pdfConfig.signDate}<br />
                      {pdfConfig.proctorTitle},
                    </div>
                    <div className="space-y-0.5">
                      <strong className="underline font-bold">{pdfConfig.proctorName}</strong><br />
                      NIP. {pdfConfig.proctorNip}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

        {/* TAB 5: PENGATURAN TAMPILAN HALAMAN DEPAN SISWA */}
        {activeTab === 'tampilan' && (() => {
          const previewTheme =
            HEADER_THEME_META[brandingDraft.themePreset] || HEADER_THEME_META.pusmendik_blue;
          const showCustomBadgeText =
            brandingDraft.logoBadgeText && brandingDraft.logoBadgeText !== 'TKA';

          const handleLogoUpload = (file: File) => {
            setBrandingError(null);
            if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
              setBrandingError('Gunakan file gambar berformat PNG, JPG, WebP, atau GIF.');
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              const img = new Image();
              img.onload = () => {
                const maxSide = 256;
                const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
                const w = Math.max(1, Math.round(img.width * scale));
                const h = Math.max(1, Math.round(img.height * scale));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL('image/png', 0.92);
                setBrandingDraft((b) => ({ ...b, logoUrl: dataUrl }));
              };
              img.src = String(reader.result || '');
            };
            reader.readAsDataURL(file);
          };

          const handleSaveBranding = async (e: React.FormEvent) => {
            e.preventDefault();
            setBrandingError(null);
            setSavingBranding(true);
            try {
              const res = await authFetch('/api/admin/branding', {
                method: 'PUT',
                body: JSON.stringify(brandingDraft),
              });
              const data = await res.json();
              if (!res.ok) {
                setBrandingError(data.error || 'Gagal menyimpan pengaturan tampilan.');
                return;
              }
              if (data.branding) {
                setBrandingDraft(data.branding);
                onBrandingChange?.(data.branding);
              }
              setActionMessage(
                'Pengaturan halaman depan siswa disimpan. Klik "Portal Peserta" untuk melihat langsung.',
              );
            } finally {
              setSavingBranding(false);
            }
          };

          const handleResetBranding = async () => {
            setBrandingError(null);
            setSavingBranding(true);
            try {
              const res = await authFetch('/api/admin/branding/reset', { method: 'POST' });
              const data = await res.json();
              if (res.ok && data.branding) {
                setBrandingDraft(data.branding);
                onBrandingChange?.(data.branding);
                setActionMessage('Tampilan halaman depan dikembalikan ke standar awal Pusmendik.');
              }
            } finally {
              setSavingBranding(false);
            }
          };

          return (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
              {/* Left Form Editor */}
              <form
                onSubmit={handleSaveBranding}
                className="lg:col-span-7 space-y-5 rounded-lg border border-slate-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Pengaturan Halaman Depan & Logo Siswa
                    </h2>
                    <p className="text-xs text-slate-500">
                      Sesuaikan judul, teks tombol, pengumuman, tema warna, serta logo sekolah/dinas di halaman siswa.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setBrandingDraft({ ...DEFAULT_PORTAL_BRANDING })}
                      className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Preset Simulasi
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setBrandingDraft((b) => ({
                          ...b,
                          topBannerText: 'UJIAN BERBASIS KOMPUTER · RESMI',
                          headerOrgLabel: 'PANITIA UJIAN SEKOLAH',
                          headerAppTitle: 'APLIKASI UJIAN BERBASIS KOMPUTER',
                          portalTitle: 'Ujian Akhir Semester',
                          portalSubtitle: 'Pilih jenjang dan mata uji untuk memulai ujian',
                          startButtonText: 'Mulai Ujian',
                          loginButtonText: 'Masuk Ujian',
                          showDemoAccounts: false,
                        }))
                      }
                      className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      Preset Ujian Resmi
                    </button>
                  </div>
                </div>

                {/* Logo & Theme Section */}
                <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-xs">
                  <div className="font-bold text-slate-800">Logo & Tema Warna Portal</div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white p-1 shadow-2xs">
                      {(brandingDraft.logoUrl || '/assets/aistudio/tutwuri1_e2a6801e.jpg') ? (
                        <img
                          src={brandingDraft.logoUrl || '/assets/aistudio/tutwuri1_e2a6801e.jpg'}
                          alt="Preview Logo"
                          className="h-full w-full rounded-full object-contain"
                        />
                      ) : showCustomBadgeText ? (
                        <span className="font-bold text-slate-800">{brandingDraft.logoBadgeText}</span>
                      ) : (
                        <GraduationCap className="h-7 w-7 text-slate-700" />
                      )}
                    </div>

                    <div className="flex-1 space-y-2 min-w-[200px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100">
                          <Upload className="h-3.5 w-3.5" />
                          Unggah Logo (PNG/JPG/WebP)
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleLogoUpload(f);
                            }}
                          />
                        </label>
                        {brandingDraft.logoUrl &&
                          !brandingDraft.logoUrl.includes('tutwuri1') &&
                          brandingDraft.logoUrl !== DEFAULT_PORTAL_BRANDING.logoUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                setBrandingDraft((b) => ({
                                  ...b,
                                  logoUrl: DEFAULT_PORTAL_BRANDING.logoUrl,
                                }))
                              }
                              className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 font-semibold text-red-700 hover:bg-red-100"
                            >
                              Reset ke Logo Default
                            </button>
                          )}
                      </div>
                      <input
                        type="text"
                        placeholder="Atau tempel URL gambar logo (https://...)"
                        value={
                          brandingDraft.logoUrl.startsWith('data:') ||
                          brandingDraft.logoUrl.includes('tutwuri1') ||
                          brandingDraft.logoUrl === DEFAULT_PORTAL_BRANDING.logoUrl
                            ? ''
                            : brandingDraft.logoUrl
                        }
                        onChange={(e) =>
                          setBrandingDraft((b) => ({ ...b, logoUrl: e.target.value }))
                        }
                        className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                      <div className="text-[11px] text-slate-500">
                        {brandingDraft.logoUrl.startsWith('data:')
                          ? 'Logo khusus diunggah dari berkas lokal.'
                          : !brandingDraft.logoUrl ||
                            brandingDraft.logoUrl.includes('tutwuri1') ||
                            brandingDraft.logoUrl === DEFAULT_PORTAL_BRANDING.logoUrl
                          ? 'Logo aktif: Lambang resmi Tut Wuri Handayani (Bawaan).'
                          : 'Logo aktif: URL gambar logo eksternal.'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1">
                    <div>
                      <label className="block font-semibold text-slate-700">
                        Teks Singkatan Logo (jika tanpa gambar)
                      </label>
                      <input
                        type="text"
                        maxLength={12}
                        value={brandingDraft.logoBadgeText}
                        onChange={(e) =>
                          setBrandingDraft((b) => ({ ...b, logoBadgeText: e.target.value }))
                        }
                        placeholder="TKA"
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700">
                        Warna Tema Header & Tombol
                      </label>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {(Object.keys(HEADER_THEME_META) as HeaderThemePreset[]).map((key) => {
                          const meta = HEADER_THEME_META[key];
                          const active = brandingDraft.themePreset === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setBrandingDraft((b) => ({ ...b, themePreset: key }))}
                              title={meta.label}
                              className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-semibold ${
                                active
                                  ? 'border-slate-900 bg-white ring-2 ring-blue-300'
                                  : 'border-slate-300 bg-white hover:bg-slate-100'
                              }`}
                            >
                              <span className={`h-3 w-3 rounded-full ${meta.swatchClass}`} />
                              <span className="hidden sm:inline">{meta.label.split(' ')[0]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Front Page Card Texts */}
                <div className="space-y-3 text-xs">
                  <div className="font-bold text-slate-800">Teks Halaman Depan Siswa (Langkah 1)</div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block font-semibold text-slate-700">
                        Judul Utama Kartu (misal: Simulasi TKA / Ujian Sekolah)
                      </label>
                      <input
                        type="text"
                        required
                        value={brandingDraft.portalTitle}
                        onChange={(e) =>
                          setBrandingDraft((b) => ({ ...b, portalTitle: e.target.value }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700">
                        Teks Tombol Utama (misal: Mulai Simulasi / Mulai Ujian)
                      </label>
                      <input
                        type="text"
                        required
                        value={brandingDraft.startButtonText}
                        onChange={(e) =>
                          setBrandingDraft((b) => ({ ...b, startButtonText: e.target.value }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 font-semibold"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700">Subjudul Kartu</label>
                      <input
                        type="text"
                        required
                        value={brandingDraft.portalSubtitle}
                        onChange={(e) =>
                          setBrandingDraft((b) => ({ ...b, portalSubtitle: e.target.value }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700">Teks Banner Atas</label>
                      <input
                        type="text"
                        value={brandingDraft.topBannerText}
                        onChange={(e) =>
                          setBrandingDraft((b) => ({ ...b, topBannerText: e.target.value }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700">Teks Footer Bawah</label>
                      <input
                        type="text"
                        value={brandingDraft.footerText}
                        onChange={(e) =>
                          setBrandingDraft((b) => ({ ...b, footerText: e.target.value }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700">Label Pilihan 1</label>
                      <input
                        type="text"
                        value={brandingDraft.levelLabel}
                        onChange={(e) =>
                          setBrandingDraft((b) => ({ ...b, levelLabel: e.target.value }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700">Label Pilihan 2</label>
                      <input
                        type="text"
                        value={brandingDraft.categoryLabel}
                        onChange={(e) =>
                          setBrandingDraft((b) => ({ ...b, categoryLabel: e.target.value }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700">Label Pilihan 3 (Mapel/Paket)</label>
                      <input
                        type="text"
                        value={brandingDraft.subjectLabel}
                        onChange={(e) =>
                          setBrandingDraft((b) => ({ ...b, subjectLabel: e.target.value }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700">
                        Pengumuman Halaman Depan (Opsional — kosongkan jika tidak perlu)
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Contoh: Pastikan baterai HP di atas 50% dan gunakan mode Jangan Ganggu selama ujian."
                        value={brandingDraft.announcementText}
                        onChange={(e) =>
                          setBrandingDraft((b) => ({ ...b, announcementText: e.target.value }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 p-2"
                      />
                    </div>
                  </div>
                </div>

                {/* Header & Login Texts */}
                <div className="space-y-3 border-t border-slate-200 pt-4 text-xs">
                  <div className="font-bold text-slate-800">
                    Header Ujian & Halaman Login Siswa (Langkah 2–5)
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block font-semibold text-slate-700">
                        Nama Instansi / Penyelenggara
                      </label>
                      <input
                        type="text"
                        value={brandingDraft.headerOrgLabel}
                        onChange={(e) =>
                          setBrandingDraft((b) => ({ ...b, headerOrgLabel: e.target.value }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700">Judul Header Aplikasi</label>
                      <input
                        type="text"
                        value={brandingDraft.headerAppTitle}
                        onChange={(e) =>
                          setBrandingDraft((b) => ({ ...b, headerAppTitle: e.target.value }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700">Judul Kotak Login</label>
                      <input
                        type="text"
                        value={brandingDraft.loginTitle}
                        onChange={(e) =>
                          setBrandingDraft((b) => ({ ...b, loginTitle: e.target.value }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700">Teks Tombol Login</label>
                      <input
                        type="text"
                        value={brandingDraft.loginButtonText}
                        onChange={(e) =>
                          setBrandingDraft((b) => ({ ...b, loginButtonText: e.target.value }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700">Subjudul Kotak Login</label>
                      <input
                        type="text"
                        value={brandingDraft.loginSubtitle}
                        onChange={(e) =>
                          setBrandingDraft((b) => ({ ...b, loginSubtitle: e.target.value }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                      />
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 pt-1 font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={brandingDraft.showDemoAccounts}
                      onChange={(e) =>
                        setBrandingDraft((b) => ({ ...b, showDemoAccounts: e.target.checked }))
                      }
                    />
                    Tampilkan kotak "Akun Simulasi Uji Coba" di halaman login (matikan saat Ujian Resmi)
                  </label>
                </div>

                {brandingError && (
                  <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {brandingError}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    disabled={savingBranding}
                    onClick={() => void handleResetBranding()}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset ke Standar
                  </button>
                  <button
                    type="submit"
                    disabled={savingBranding}
                    className="rounded-md bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {savingBranding ? 'Menyimpan...' : 'Simpan Pengaturan Tampilan'}
                  </button>
                </div>
              </form>

              {/* Right Live Preview */}
              <div className="lg:col-span-5 space-y-4">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Pratinjau Langsung Halaman Depan Siswa
                    </span>
                  </div>

                  <div
                    className={`${previewTheme.headerClass} rounded-lg p-4 text-white shadow-inner`}
                  >
                    <div className="mb-3 flex items-center justify-between text-[10px] opacity-90">
                      <span className="truncate font-semibold">{brandingDraft.topBannerText}</span>
                      <span className="rounded border border-white/25 bg-white/10 px-1.5 py-0.5 whitespace-nowrap">
                        Portal Pengawas
                      </span>
                    </div>

                    <div className="mx-auto max-w-xs rounded-lg bg-white p-4 text-slate-900 shadow-lg">
                      <div className="flex flex-col items-center text-center">
                        {(brandingDraft.logoUrl || '/assets/aistudio/tutwuri1_e2a6801e.jpg') ? (
                          <img
                            src={brandingDraft.logoUrl || '/assets/aistudio/tutwuri1_e2a6801e.jpg'}
                            alt="Logo"
                            className="h-11 w-11 rounded-full border border-slate-200 bg-white object-contain p-0.5 shadow-xs"
                          />
                        ) : showCustomBadgeText ? (
                          <div className="flex h-10 min-w-10 items-center justify-center rounded-full bg-slate-900 px-2.5 text-[11px] font-bold text-white">
                            {brandingDraft.logoBadgeText}
                          </div>
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white">
                            <GraduationCap className="h-5 w-5" />
                          </div>
                        )}
                        <div className="mt-2 text-sm font-bold">{brandingDraft.portalTitle}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {brandingDraft.portalSubtitle}
                        </div>
                      </div>

                      {brandingDraft.announcementText && (
                        <div className="mt-2.5 flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-950">
                          <Megaphone className="mt-0.5 h-3 w-3 shrink-0 text-amber-700" />
                          <span>{brandingDraft.announcementText}</span>
                        </div>
                      )}

                      <div className="mt-3 space-y-2 text-[11px]">
                        <div>
                          <div className="font-bold text-slate-700">{brandingDraft.levelLabel}</div>
                          <div className="mt-0.5 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-slate-600">
                            SMP/MTs/Sederajat
                          </div>
                        </div>
                        <div>
                          <div className="font-bold text-slate-700">
                            {brandingDraft.categoryLabel}
                          </div>
                          <div className="mt-0.5 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-slate-600">
                            Mata Pelajaran Wajib
                          </div>
                        </div>
                        <div>
                          <div className="font-bold text-slate-700">
                            {brandingDraft.subjectLabel}
                          </div>
                          <div className="mt-0.5 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-slate-600">
                            Matematika - Paket 2
                          </div>
                        </div>
                        <div
                          className={`mt-2 flex items-center justify-center gap-1.5 rounded ${previewTheme.buttonClass} py-1.5 font-semibold text-white`}
                        >
                          <Play className="h-3 w-3 fill-current" />
                          {brandingDraft.startButtonText}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 text-center text-[10px] text-white/80">
                      {brandingDraft.footerText}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Pratinjau Header Ruang Ujian
                  </div>
                  <div
                    className={`${previewTheme.headerClass} flex items-center justify-between rounded-md px-3 py-2 text-white`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {(brandingDraft.logoUrl || '/assets/aistudio/tutwuri1_e2a6801e.jpg') ? (
                        <img
                          src={brandingDraft.logoUrl || '/assets/aistudio/tutwuri1_e2a6801e.jpg'}
                          alt="Logo"
                          className="h-7 w-7 shrink-0 rounded-full bg-white object-contain p-0.5 shadow-xs"
                        />
                      ) : (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/15 text-[10px] font-bold">
                          {brandingDraft.logoBadgeText || 'TKA'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-[9px] uppercase opacity-85">
                          {brandingDraft.headerOrgLabel}
                        </div>
                        <div className="truncate text-[11px] font-bold">
                          {brandingDraft.headerAppTitle}
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-[9px] opacity-90 shrink-0">
                      Demo Akun: {brandingDraft.showDemoAccounts ? 'Tampil' : 'Disembunyikan'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </main>

      {/* MODAL: QUESTION EDITOR (ALL 5 OFFICIAL TYPES) */}
      {showQuestionEditor && editingQuestion && (
        <QuestionEditorModal
          question={editingQuestion}
          onClose={() => {
            setShowQuestionEditor(false);
            setEditingQuestion(null);
          }}
          onSave={async (draft) => {
            const isNew = draft.id === 0;
            const url = isNew ? '/api/admin/questions' : `/api/admin/questions/${draft.id}`;
            const method = isNew ? 'POST' : 'PUT';
            const res = await authFetch(url, {
              method,
              body: JSON.stringify(draft),
            });
            if (res.ok) {
              setShowQuestionEditor(false);
              setEditingQuestion(null);
              setActionMessage(isNew ? 'Butir soal baru disimpan.' : 'Perubahan soal disimpan.');
              void loadQuestionsForPackage(selectedPackageId);
              void loadAllAdminData();
            }
          }}
        />
      )}

      {/* MODAL: ESSAY GRADING & SESSION DETAIL */}
      {gradingSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Koreksi & Rincian Jawaban — {gradingSummary.participantName}
                </h3>
                <div className="text-xs text-slate-500">
                  Total Skor: <strong className="font-mono">{gradingSummary.totalScore} / {gradingSummary.maxScore}</strong> ({gradingSummary.percentage.toFixed(1)}%)
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGradingSummary(null)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {gradingSummary.details.map((d) => (
                <div key={d.questionId} className="rounded-md border border-slate-200 p-4 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span>
                      Soal #{d.orderNumber} · {TYPE_LABELS[d.questionType]}
                    </span>
                    <span className="font-mono">
                      Skor:{' '}
                      {d.manualScoreEarned !== null ? d.manualScoreEarned : d.autoScoreEarned} /{' '}
                      {d.maxScore}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-slate-900">
                    <MathText text={d.prompt} />
                  </div>

                  {d.questionType === 'URAIAN' && (
                    <div className="mt-3 space-y-2.5 rounded border border-amber-200 bg-amber-50/50 p-3">
                      <div>
                        <div className="font-semibold text-slate-600">Jawaban Peserta:</div>
                        <div className="mt-1 whitespace-pre-line rounded border border-slate-200 bg-white p-2.5 text-slate-900">
                          {d.studentAnswer?.type === 'URAIAN' && d.studentAnswer.text
                            ? d.studentAnswer.text
                            : '(Tidak dijawab)'}
                        </div>
                      </div>
                      {d.answerKey.rubricNotes && (
                        <div className="text-[11px] text-slate-600">
                          <strong>Rubrik:</strong> {d.answerKey.rubricNotes}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <label className="font-semibold text-slate-700">
                          Nilai Guru (0–{d.maxScore}):
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min={0}
                          max={d.maxScore}
                          value={manualScores[d.questionId]?.score || '0'}
                          onChange={(e) =>
                            setManualScores((m) => ({
                              ...m,
                              [d.questionId]: {
                                score: e.target.value,
                                note: m[d.questionId]?.note || '',
                              },
                            }))
                          }
                          className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono"
                        />
                        <input
                          type="text"
                          placeholder="Catatan koreksi (opsional)"
                          value={manualScores[d.questionId]?.note || ''}
                          onChange={(e) =>
                            setManualScores((m) => ({
                              ...m,
                              [d.questionId]: {
                                score: m[d.questionId]?.score || '0',
                                note: e.target.value,
                              },
                            }))
                          }
                          className="flex-1 rounded border border-slate-300 bg-white px-2.5 py-1"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveEssayGrade(d.questionId)}
                          className="rounded bg-blue-600 px-3 py-1 font-semibold text-white hover:bg-blue-700"
                        >
                          Simpan Nilai
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// BANK SOAL EDITOR MODAL (5 OFFICIAL TYPES)
// ==========================================
const QuestionEditorModal: React.FC<{
  question: QuestionAdmin;
  onClose: () => void;
  onSave: (q: QuestionAdmin) => Promise<void>;
}> = ({ question, onClose, onSave }) => {
  const [draft, setDraft] = useState<QuestionAdmin>(question);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewAnswer, setPreviewAnswer] = useState<StudentAnswerPayload | null>(null);

  const paragraphsText = (draft.stimulus?.paragraphs || []).join('\n\n');
  const categoriesText = (draft.config.categories || ['Benar', 'Salah']).join(', ');
  const hasTable = Boolean(draft.stimulus?.table);
  const hasBarChart = Boolean(draft.stimulus?.barChart);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
          <h3 className="text-base font-bold text-slate-900">
            {draft.id === 0 ? 'Tambah Butir Soal Baru' : `Edit Soal Nomor ${draft.orderNumber}`}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPreviewAnswer(null);
                setPreviewMode((p) => !p);
              }}
              className={`inline-flex items-center gap-1.5 rounded border px-3 py-1 text-xs font-semibold ${
                previewMode
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              {previewMode ? 'Kembali ke Editor' : 'Pratinjau Soal'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {previewMode ? (
          <div className="flex-1 overflow-y-auto bg-[#f4f7fb] p-5">
            <div className="rounded-lg border border-slate-200 bg-white shadow-xs">
              {draft.layoutMode === 'split_two_column' && draft.stimulus ? (
                <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                  <div className="p-5">
                    <StimulusRenderer stimulus={draft.stimulus} fontSizeClass="text-[15px]" />
                  </div>
                  <div className="p-5">
                    <QuestionRenderer
                      question={draft}
                      answer={previewAnswer}
                      onChange={setPreviewAnswer}
                      fontSizeClass="text-[15px]"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-5 p-6">
                  {draft.stimulus && (
                    <StimulusRenderer stimulus={draft.stimulus} fontSizeClass="text-[15px]" />
                  )}
                  <QuestionRenderer
                    question={draft}
                    answer={previewAnswer}
                    onChange={setPreviewAnswer}
                    fontSizeClass="text-[15px]"
                  />
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewMode(false)}
                className="rounded bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Tutup Pratinjau
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                await onSave(draft);
              } finally {
                setSaving(false);
              }
            }}
            className="flex-1 space-y-4 overflow-y-auto p-5 text-xs"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className="block font-semibold text-slate-700">Jenis Soal Resmi</label>
                <select
                  value={draft.questionType}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, questionType: e.target.value as QuestionType }))
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-2.5 py-2"
                >
                  <option value="PG_SEDERHANA">1. Pilihan Ganda Sederhana</option>
                  <option value="MCMA">2. Pilihan Ganda Kompleks (MCMA)</option>
                  <option value="PGK_KATEGORI">3. Pilihan Ganda Kompleks Kategori</option>
                  <option value="MENJODOHKAN">4. Menjodohkan</option>
                  <option value="URAIAN">5. Uraian</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Tata Letak</label>
                <select
                  value={draft.layoutMode}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, layoutMode: e.target.value as LayoutMode }))
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-2.5 py-2"
                >
                  <option value="single_column">1 Kolom</option>
                  <option value="split_two_column">2 Kolom (Stimulus Kiri)</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Bobot Maksimal</label>
                <input
                  type="number"
                  min={1}
                  step={0.5}
                  value={draft.maxScore}
                  onChange={(e) => setDraft((d) => ({ ...d, maxScore: Number(e.target.value) }))}
                  className="mt-1 w-full rounded border border-slate-300 px-2.5 py-2 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Aturan Skor</label>
                <select
                  value={draft.scoringMode}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, scoringMode: e.target.value as ScoringMode }))
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-2.5 py-2"
                >
                  <option value="partial">Parsial Proporsional</option>
                  <option value="exact">Benar Semua (Exact)</option>
                </select>
              </div>
            </div>

            {/* Stimulus */}
            <div className="space-y-2.5 rounded-md border border-slate-200 bg-slate-50 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-800">
                  Stimulus / Bacaan / Rumus / Tabel / Grafik (Opsional)
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        stimulus: {
                          ...(d.stimulus || {}),
                          table: d.stimulus?.table
                            ? undefined
                            : {
                                headers: ['Kolom 1', 'Kolom 2'],
                                rows: [['Data A', '100']],
                              },
                        },
                      }))
                    }
                    className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${
                      hasTable
                        ? 'border-blue-300 bg-blue-50 text-blue-800'
                        : 'border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    {hasTable ? '- Hapus Tabel' : '+ Tabel Data'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        stimulus: {
                          ...(d.stimulus || {}),
                          barChart: d.stimulus?.barChart
                            ? undefined
                            : {
                                title: 'Grafik Batang Data',
                                xLabel: 'Kategori',
                                yLabel: 'Jumlah',
                                data: [
                                  { label: 'Item A', value: 40 },
                                  { label: 'Item B', value: 75 },
                                ],
                              },
                        },
                      }))
                    }
                    className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${
                      hasBarChart
                        ? 'border-blue-300 bg-blue-50 text-blue-800'
                        : 'border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    {hasBarChart ? '- Hapus Grafik' : '+ Grafik Batang'}
                  </button>
                </div>
              </div>

              <input
                type="text"
                placeholder="Judul Bacaan / Stimulus (opsional)"
                value={draft.stimulus?.title || ''}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    stimulus: { ...(d.stimulus || {}), title: e.target.value || undefined },
                  }))
                }
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
              />

              <textarea
                rows={3}
                placeholder="Teks bacaan atau pengantar soal (pisahkan paragraf dengan Enter 2x; gunakan $...$ untuk rumus KaTeX, misal $2x^2 - 5$)"
                value={paragraphsText}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    stimulus: {
                      ...(d.stimulus || {}),
                      paragraphs: e.target.value.split('\n\n').filter((p) => p.length > 0),
                    },
                  }))
                }
                className="w-full rounded border border-slate-300 bg-white p-2.5"
              />

              <input
                type="text"
                placeholder="Rumus LaTeX Besar (opsional, misal: \\left(7^5 \\times 7^{-2}\\right)^3)"
                value={draft.stimulus?.mathFormula || ''}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    stimulus: { ...(d.stimulus || {}), mathFormula: e.target.value || undefined },
                  }))
                }
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-2 font-mono"
              />

              {/* Stimulus Table Editor */}
              {draft.stimulus?.table && (
                <div className="space-y-2 rounded border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Editor Tabel Stimulus</span>
                    <button
                      type="button"
                      onClick={() => {
                        const tbl = draft.stimulus!.table!;
                        setDraft((d) => ({
                          ...d,
                          stimulus: {
                            ...d.stimulus,
                            table: {
                              ...tbl,
                              rows: [...tbl.rows, tbl.headers.map(() => '')],
                            },
                          },
                        }));
                      }}
                      className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold"
                    >
                      + Baris Tabel
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Header kolom dipisah koma (misal: Komponen, Persentase)"
                    value={draft.stimulus.table.headers.join(', ')}
                    onChange={(e) => {
                      const headers = e.target.value.split(',').map((h) => h.trim());
                      const tbl = draft.stimulus!.table!;
                      setDraft((d) => ({
                        ...d,
                        stimulus: { ...d.stimulus, table: { ...tbl, headers } },
                      }));
                    }}
                    className="w-full rounded border border-slate-300 px-2.5 py-1"
                  />
                  {draft.stimulus.table.rows.map((row, rIdx) => (
                    <div key={rIdx} className="flex items-center gap-1.5">
                      {draft.stimulus!.table!.headers.map((_, cIdx) => (
                        <input
                          key={cIdx}
                          type="text"
                          value={row[cIdx] || ''}
                          onChange={(e) => {
                            const tbl = draft.stimulus!.table!;
                            const nextRows = tbl.rows.map((r, ri) =>
                              ri === rIdx
                                ? tbl.headers.map((__, ci) => (ci === cIdx ? e.target.value : r[ci] || ''))
                                : r,
                            );
                            setDraft((d) => ({
                              ...d,
                              stimulus: { ...d.stimulus, table: { ...tbl, rows: nextRows } },
                            }));
                          }}
                          className="flex-1 rounded border border-slate-300 px-2 py-1"
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const tbl = draft.stimulus!.table!;
                          setDraft((d) => ({
                            ...d,
                            stimulus: {
                              ...d.stimulus,
                              table: { ...tbl, rows: tbl.rows.filter((_, i) => i !== rIdx) },
                            },
                          }));
                        }}
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Stimulus Bar Chart Editor */}
              {draft.stimulus?.barChart && (
                <div className="space-y-2 rounded border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Editor Grafik Batang</span>
                    <button
                      type="button"
                      onClick={() => {
                        const bc = draft.stimulus!.barChart!;
                        setDraft((d) => ({
                          ...d,
                          stimulus: {
                            ...d.stimulus,
                            barChart: {
                              ...bc,
                              data: [...bc.data, { label: `Item ${bc.data.length + 1}`, value: 10 }],
                            },
                          },
                        }));
                      }}
                      className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold"
                    >
                      + Batang
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      type="text"
                      placeholder="Judul Grafik"
                      value={draft.stimulus.barChart.title}
                      onChange={(e) => {
                        const bc = draft.stimulus!.barChart!;
                        setDraft((d) => ({
                          ...d,
                          stimulus: { ...d.stimulus, barChart: { ...bc, title: e.target.value } },
                        }));
                      }}
                      className="rounded border border-slate-300 px-2 py-1"
                    />
                    <input
                      type="text"
                      placeholder="Label Sumbu X"
                      value={draft.stimulus.barChart.xLabel}
                      onChange={(e) => {
                        const bc = draft.stimulus!.barChart!;
                        setDraft((d) => ({
                          ...d,
                          stimulus: { ...d.stimulus, barChart: { ...bc, xLabel: e.target.value } },
                        }));
                      }}
                      className="rounded border border-slate-300 px-2 py-1"
                    />
                    <input
                      type="text"
                      placeholder="Label Sumbu Y"
                      value={draft.stimulus.barChart.yLabel}
                      onChange={(e) => {
                        const bc = draft.stimulus!.barChart!;
                        setDraft((d) => ({
                          ...d,
                          stimulus: { ...d.stimulus, barChart: { ...bc, yLabel: e.target.value } },
                        }));
                      }}
                      className="rounded border border-slate-300 px-2 py-1"
                    />
                  </div>
                  {draft.stimulus.barChart.data.map((datum, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={datum.label}
                        placeholder="Label"
                        onChange={(e) => {
                          const bc = draft.stimulus!.barChart!;
                          const nextData = bc.data.map((it, i) =>
                            i === idx ? { ...it, label: e.target.value } : it,
                          );
                          setDraft((d) => ({
                            ...d,
                            stimulus: { ...d.stimulus, barChart: { ...bc, data: nextData } },
                          }));
                        }}
                        className="flex-1 rounded border border-slate-300 px-2 py-1"
                      />
                      <input
                        type="number"
                        value={datum.value}
                        placeholder="Nilai"
                        onChange={(e) => {
                          const bc = draft.stimulus!.barChart!;
                          const nextData = bc.data.map((it, i) =>
                            i === idx ? { ...it, value: Number(e.target.value) } : it,
                          );
                          setDraft((d) => ({
                            ...d,
                            stimulus: { ...d.stimulus, barChart: { ...bc, data: nextData } },
                          }));
                        }}
                        className="w-24 rounded border border-slate-300 px-2 py-1 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const bc = draft.stimulus!.barChart!;
                          setDraft((d) => ({
                            ...d,
                            stimulus: {
                              ...d.stimulus,
                              barChart: { ...bc, data: bc.data.filter((_, i) => i !== idx) },
                            },
                          }));
                        }}
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Prompt */}
            <div>
              <label className="block font-semibold text-slate-700">Pertanyaan / Perintah Soal</label>
              <textarea
                rows={2}
                required
                value={draft.prompt}
                onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
                className="mt-1 w-full rounded border border-slate-300 p-2.5"
              />
            </div>

            {/* Type-specific editor */}
            {(draft.questionType === 'PG_SEDERHANA' || draft.questionType === 'MCMA') && (
              <div className="space-y-2 rounded-md border border-slate-200 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">
                    Opsi Pilihan & Kunci Jawaban ({draft.questionType === 'MCMA' ? 'Centang >1 Benar' : 'Pilih 1 Benar'})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const opts = draft.config.options || [];
                      const letter = String.fromCharCode(65 + opts.length);
                      setDraft((d) => ({
                        ...d,
                        config: {
                          ...d.config,
                          options: [...opts, { id: `opt-${Date.now()}`, label: letter, text: '' }],
                        },
                      }));
                    }}
                    className="rounded border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    + Tambah Opsi
                  </button>
                </div>
                {(draft.config.options || []).map((opt, idx) => {
                  const isPgCorrect = draft.answerKey.correctOptionId === opt.id;
                  const isMcmaCorrect = (draft.answerKey.correctOptionIds || []).includes(opt.id);
                  return (
                    <div key={opt.id} className="flex items-center gap-2">
                      {draft.questionType === 'PG_SEDERHANA' ? (
                        <input
                          type="radio"
                          checked={isPgCorrect}
                          onChange={() =>
                            setDraft((d) => ({
                              ...d,
                              answerKey: { ...d.answerKey, correctOptionId: opt.id },
                            }))
                          }
                        />
                      ) : (
                        <input
                          type="checkbox"
                          checked={isMcmaCorrect}
                          onChange={(e) => {
                            const set = new Set(draft.answerKey.correctOptionIds || []);
                            if (e.target.checked) set.add(opt.id);
                            else set.delete(opt.id);
                            setDraft((d) => ({
                              ...d,
                              answerKey: { ...d.answerKey, correctOptionIds: Array.from(set) },
                            }));
                          }}
                        />
                      )}
                      <span className="w-6 font-bold">{opt.label}.</span>
                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => {
                          const next = [...(draft.config.options || [])];
                          next[idx] = { ...opt, text: e.target.value };
                          setDraft((d) => ({ ...d, config: { ...d.config, options: next } }));
                        }}
                        className="flex-1 rounded border border-slate-300 px-2.5 py-1.5"
                        placeholder={`Teks opsi ${opt.label}`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = (draft.config.options || [])
                            .filter((_, i) => i !== idx)
                            .map((o, i) => ({ ...o, label: String.fromCharCode(65 + i) }));
                          setDraft((d) => ({
                            ...d,
                            config: { ...d.config, options: next },
                          }));
                        }}
                        title="Hapus opsi"
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {draft.questionType === 'PGK_KATEGORI' && (
              <div className="space-y-3 rounded-md border border-slate-200 p-3.5">
                <div>
                  <label className="block font-bold text-slate-800">
                    Label Kolom Kategori (pisahkan koma, misal: Benar, Salah atau Sesuai, Tidak Sesuai)
                  </label>
                  <input
                    type="text"
                    value={categoriesText}
                    onChange={(e) => {
                      const cats = e.target.value
                        .split(',')
                        .map((c) => c.trim())
                        .filter(Boolean);
                      setDraft((d) => ({
                        ...d,
                        config: { ...d.config, categories: cats.length ? cats : ['Benar', 'Salah'] },
                      }));
                    }}
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Baris Pernyataan & Kunci Kategori</span>
                  <button
                    type="button"
                    onClick={() => {
                      const stmts = draft.config.statements || [];
                      const newId = `stmt-${Date.now()}`;
                      setDraft((d) => ({
                        ...d,
                        config: {
                          ...d.config,
                          statements: [...stmts, { id: newId, text: '' }],
                        },
                      }));
                    }}
                    className="rounded border border-slate-300 px-2 py-1 font-semibold text-slate-700"
                  >
                    + Tambah Pernyataan
                  </button>
                </div>

                {(draft.config.statements || []).map((stmt, idx) => (
                  <div
                    key={stmt.id}
                    className="space-y-1.5 rounded border border-slate-100 bg-slate-50/70 p-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={stmt.text}
                        onChange={(e) => {
                          const next = [...(draft.config.statements || [])];
                          next[idx] = { ...stmt, text: e.target.value };
                          setDraft((d) => ({ ...d, config: { ...d.config, statements: next } }));
                        }}
                        placeholder={`Pernyataan ${idx + 1}`}
                        className="flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5"
                      />
                      <select
                        value={draft.answerKey.correctCategories?.[stmt.id] || ''}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            answerKey: {
                              ...d.answerKey,
                              correctCategories: {
                                ...(d.answerKey.correctCategories || {}),
                                [stmt.id]: e.target.value,
                              },
                            },
                          }))
                        }
                        className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                      >
                        <option value="">-- Kunci --</option>
                        {(draft.config.categories || ['Benar', 'Salah']).map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          const next = (draft.config.statements || []).filter((_, i) => i !== idx);
                          setDraft((d) => ({ ...d, config: { ...d.config, statements: next } }));
                        }}
                        title="Hapus pernyataan"
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={stmt.badgeCode || ''}
                        onChange={(e) => {
                          const next = [...(draft.config.statements || [])];
                          next[idx] = { ...stmt, badgeCode: e.target.value || undefined };
                          setDraft((d) => ({ ...d, config: { ...d.config, statements: next } }));
                        }}
                        placeholder="Badge Kode (opsional, misal: A / VOUCHER)"
                        className="w-56 rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                      />
                      <input
                        type="text"
                        value={stmt.badgeAmount || ''}
                        onChange={(e) => {
                          const next = [...(draft.config.statements || [])];
                          next[idx] = { ...stmt, badgeAmount: e.target.value || undefined };
                          setDraft((d) => ({ ...d, config: { ...d.config, statements: next } }));
                        }}
                        placeholder="Badge Nominal (opsional, misal: Rp15.000)"
                        className="w-56 rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {draft.questionType === 'MENJODOHKAN' && (
              <div className="space-y-3 rounded-md border border-slate-200 p-3.5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span>Premis Kiri & Kunci Pasangan</span>
                      <button
                        type="button"
                        onClick={() => {
                          const left = draft.config.leftItems || [];
                          setDraft((d) => ({
                            ...d,
                            config: {
                              ...d.config,
                              leftItems: [...left, { id: `L${left.length + 1}`, text: '' }],
                            },
                          }));
                        }}
                        className="rounded border border-slate-300 px-2 py-0.5 text-[11px]"
                      >
                        + Kiri
                      </button>
                    </div>
                    {(draft.config.leftItems || []).map((l, idx) => (
                      <div key={l.id} className="flex items-center gap-1.5">
                        <span className="font-mono font-bold">{l.id}</span>
                        <input
                          type="text"
                          value={l.text}
                          onChange={(e) => {
                            const next = [...(draft.config.leftItems || [])];
                            next[idx] = { ...l, text: e.target.value };
                            setDraft((d) => ({ ...d, config: { ...d.config, leftItems: next } }));
                          }}
                          className="flex-1 rounded border border-slate-300 px-2 py-1"
                        />
                        <select
                          value={draft.answerKey.correctPairs?.[l.id] || ''}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              answerKey: {
                                ...d.answerKey,
                                correctPairs: {
                                  ...(d.answerKey.correctPairs || {}),
                                  [l.id]: e.target.value,
                                },
                              },
                            }))
                          }
                          className="rounded border border-slate-300 px-2 py-1 font-mono"
                        >
                          <option value="">Kunci</option>
                          {(draft.config.rightItems || []).map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.id}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const nextLeft = (draft.config.leftItems || []).filter((_, i) => i !== idx);
                            const nextPairs = { ...(draft.answerKey.correctPairs || {}) };
                            delete nextPairs[l.id];
                            setDraft((d) => ({
                              ...d,
                              config: { ...d.config, leftItems: nextLeft },
                              answerKey: { ...d.answerKey, correctPairs: nextPairs },
                            }));
                          }}
                          title="Hapus premis kiri"
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span>Respons Kanan (Bisa + Pengecoh)</span>
                      <button
                        type="button"
                        onClick={() => {
                          const right = draft.config.rightItems || [];
                          setDraft((d) => ({
                            ...d,
                            config: {
                              ...d.config,
                              rightItems: [...right, { id: `R${right.length + 1}`, text: '' }],
                            },
                          }));
                        }}
                        className="rounded border border-slate-300 px-2 py-0.5 text-[11px]"
                      >
                        + Kanan
                      </button>
                    </div>
                    {(draft.config.rightItems || []).map((r, idx) => (
                      <div key={r.id} className="flex items-center gap-1.5">
                        <span className="font-mono font-bold">{r.id}</span>
                        <input
                          type="text"
                          value={r.text}
                          onChange={(e) => {
                            const next = [...(draft.config.rightItems || [])];
                            next[idx] = { ...r, text: e.target.value };
                            setDraft((d) => ({ ...d, config: { ...d.config, rightItems: next } }));
                          }}
                          className="flex-1 rounded border border-slate-300 px-2 py-1"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const nextRight = (draft.config.rightItems || []).filter(
                              (_, i) => i !== idx,
                            );
                            setDraft((d) => ({
                              ...d,
                              config: { ...d.config, rightItems: nextRight },
                            }));
                          }}
                          title="Hapus respons kanan"
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {draft.questionType === 'URAIAN' && (
              <div className="space-y-2.5 rounded-md border border-slate-200 p-3.5">
                <input
                  type="text"
                  placeholder="Kata kunci deteksi awal (pisahkan koma, misal: 14, 9, 5)"
                  value={(draft.answerKey.expectedKeywords || []).join(', ')}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      answerKey: {
                        ...d.answerKey,
                        expectedKeywords: e.target.value
                          .split(',')
                          .map((k) => k.trim())
                          .filter(Boolean),
                      },
                    }))
                  }
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5"
                />
                <textarea
                  rows={2}
                  placeholder="Jawaban Referensi / Model Jawaban"
                  value={draft.answerKey.modelAnswer || ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      answerKey: { ...d.answerKey, modelAnswer: e.target.value },
                    }))
                  }
                  className="w-full rounded border border-slate-300 p-2.5"
                />
                <input
                  type="text"
                  placeholder="Catatan Rubrik Penilaian Guru"
                  value={draft.answerKey.rubricNotes || ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      answerKey: { ...d.answerKey, rubricNotes: e.target.value },
                    }))
                  }
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5"
                />
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700">Pembahasan Soal</label>
              <textarea
                rows={2}
                value={draft.explanation}
                onChange={(e) => setDraft((d) => ({ ...d, explanation: e.target.value }))}
                className="mt-1 w-full rounded border border-slate-300 p-2.5"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-slate-300 px-4 py-2 font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Menyimpan...' : 'Simpan Butir Soal'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
