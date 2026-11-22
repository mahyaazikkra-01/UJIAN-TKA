export type EducationLevel =
  | 'SD/MI/Sederajat'
  | 'SMP/MTs/Sederajat'
  | 'SMA/MA/SMK/Sederajat';

export type SubjectCategory =
  | 'Mata Pelajaran Wajib'
  | 'Mata Pelajaran Pilihan';

export type QuestionType =
  | 'PG_SEDERHANA'
  | 'MCMA'
  | 'PGK_KATEGORI'
  | 'MENJODOHKAN'
  | 'URAIAN';

export type LayoutMode = 'single_column' | 'split_two_column';

export type ScoringMode = 'exact' | 'partial';

export type SessionStatus =
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'LOCKED'
  | 'COMPLETED';

export type AntiCheatMode = 'strict' | 'tolerance';

export interface VoucherItem {
  code: string;
  label: string;
  title: string;
  subtitle: string;
  minPurchase: string;
  accentColor?: 'rose' | 'blue' | 'amber' | 'emerald';
}

export interface ArrowDiagram {
  title: string;
  leftTitle: string;
  rightTitle: string;
  leftNodes: string[];
  rightNodes: string[];
  edges: Array<[number, number]>;
}

export interface BarChartDatum {
  label: string;
  value: number;
}

export interface StimulusBlock {
  title?: string;
  paragraphs?: string[];
  mathFormula?: string;
  vouchers?: VoucherItem[];
  arrowDiagrams?: ArrowDiagram[];
  barChart?: {
    title: string;
    xLabel: string;
    yLabel: string;
    data: BarChartDatum[];
  };
  flowSteps?: Array<{
    step: string;
    detail: string;
  }>;
  table?: {
    headers: string[];
    rows: string[][];
  };
}

export interface ChoiceOption {
  id: string;
  label: string;
  text: string;
}

export interface CategoryStatement {
  id: string;
  text: string;
  badgeCode?: string;
  badgeAmount?: string;
}

export interface MatchingItem {
  id: string;
  text: string;
}

export interface QuestionConfig {
  // PG_SEDERHANA & MCMA
  options?: ChoiceOption[];
  // PGK_KATEGORI
  categories?: string[]; // e.g. ["Benar", "Salah"] or ["Sesuai", "Tidak Sesuai"] or ["Fungsi", "Bukan Fungsi"]
  statements?: CategoryStatement[];
  // MENJODOHKAN
  leftItems?: MatchingItem[];
  rightItems?: MatchingItem[];
  // URAIAN
  placeholder?: string;
  rubricHint?: string;
}

export interface AnswerKey {
  // PG_SEDERHANA
  correctOptionId?: string;
  // MCMA
  correctOptionIds?: string[];
  // PGK_KATEGORI: statementId -> category string
  correctCategories?: Record<string, string>;
  // MENJODOHKAN: leftId -> rightId
  correctPairs?: Record<string, string>;
  // URAIAN
  expectedKeywords?: string[];
  modelAnswer?: string;
  rubricNotes?: string;
  autoGradeExactNumeric?: boolean;
}

export type StudentAnswerPayload =
  | { type: 'PG_SEDERHANA'; optionId: string }
  | { type: 'MCMA'; optionIds: string[] }
  | { type: 'PGK_KATEGORI'; selections: Record<string, string> }
  | { type: 'MENJODOHKAN'; pairs: Record<string, string> }
  | { type: 'URAIAN'; text: string };

export interface QuestionPublic {
  id: number;
  packageId: number;
  orderNumber: number;
  questionType: QuestionType;
  layoutMode: LayoutMode;
  stimulus: StimulusBlock | null;
  prompt: string;
  config: QuestionConfig;
  maxScore: number;
  scoringMode: ScoringMode;
}

export interface QuestionAdmin extends QuestionPublic {
  answerKey: AnswerKey;
  explanation: string;
}

export interface School {
  id: number;
  npsn: string;
  name: string;
  district: string;
}

export interface ExamPackage {
  id: number;
  educationLevel: EducationLevel;
  subjectCategory: SubjectCategory;
  subjectName: string;
  title: string;
  durationMinutes: number;
  description: string;
  isActive: boolean;
  questionCount?: number;
}

export interface ExamSchedule {
  id: number;
  packageId: number;
  packageTitle?: string;
  subjectName?: string;
  educationLevel?: string;
  sessionNumber: 1 | 2 | 3;
  examDate: string;
  startTime: string;
  endTime: string;
  token: string;
  showTokenToStudent: boolean;
  antiCheatMode: AntiCheatMode;
  maxWarnings: number;
  allowedSchoolIds: number[];
  isActive: boolean;
}

export const SCHOOL_CLASSES_33: readonly string[] = [
  ...['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].map((c) => `7${c}`),
  ...['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].map((c) => `8${c}`),
  ...['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].map((c) => `9${c}`),
];

export interface ParticipantPublic {
  id: number;
  schoolId: number;
  schoolName: string;
  npsn: string;
  nis: string;
  className: string;
  username: string;
  fullName: string;
  gender: 'Laki-Laki' | 'Perempuan';
  birthDate: string;
  assignedSession: 1 | 2 | 3;
}

export interface SavedAnswerState {
  questionId: number;
  answer: StudentAnswerPayload | null;
  isDoubtful: boolean;
}

export interface ViolationLogEntry {
  id: number;
  reason: string;
  durationSeconds: number;
  actionTaken: string;
  createdAt: string;
}

export interface ExamResultDetail {
  questionId: number;
  orderNumber: number;
  questionType: QuestionType;
  prompt: string;
  studentAnswer: StudentAnswerPayload | null;
  answerKey: AnswerKey;
  explanation: string;
  autoScoreEarned: number;
  manualScoreEarned: number | null;
  maxScore: number;
  isGraded: boolean;
  graderNote: string | null;
}

export interface ExamSessionSummary {
  sessionId: number;
  status: SessionStatus;
  packageTitle: string;
  subjectName: string;
  participantName: string;
  schoolName: string;
  sessionNumber: 1 | 2 | 3;
  startedAt: string | null;
  finishedAt: string | null;
  totalScore: number;
  maxScore: number;
  percentage: number;
  needsManualGrading: boolean;
  violationCount: number;
  details: ExamResultDetail[];
}

export type HeaderThemePreset = 'pusmendik_blue' | 'navy' | 'emerald' | 'maroon' | 'slate';

export interface PortalBranding {
  topBannerText: string;
  headerOrgLabel: string;
  headerAppTitle: string;
  logoUrl: string;
  logoBadgeText: string;
  portalTitle: string;
  portalSubtitle: string;
  levelLabel: string;
  categoryLabel: string;
  subjectLabel: string;
  startButtonText: string;
  footerText: string;
  announcementText: string;
  loginTitle: string;
  loginSubtitle: string;
  loginButtonText: string;
  showDemoAccounts: boolean;
  themePreset: HeaderThemePreset;
}

export const DEFAULT_PORTAL_BRANDING: PortalBranding = {
  topBannerText: 'SISTEM SIMULASI TKA · MULTI-SEKOLAH',
  headerOrgLabel: 'PUSMENDIK',
  headerAppTitle: 'APLIKASI TKA / SIMULASI UJIAN',
  logoUrl: '',
  logoBadgeText: 'TKA',
  portalTitle: 'Simulasi TKA',
  portalSubtitle: 'Pilih jenjang dan mata pelajaran untuk memulai simulasi',
  levelLabel: 'Jenjang Pendidikan:',
  categoryLabel: 'Jenis Mata Pelajaran:',
  subjectLabel: 'Mata Pelajaran & Paket:',
  startButtonText: 'Mulai Simulasi',
  footerText: 'Simulasi TKA Berbasis Web · Mendukung Laptop & Ponsel Siswa (PWA)',
  announcementText: '',
  loginTitle: 'Selamat Datang',
  loginSubtitle: 'Silakan login dengan menggunakan username dan password yang anda miliki.',
  loginButtonText: 'Login',
  showDemoAccounts: true,
  themePreset: 'pusmendik_blue',
};

