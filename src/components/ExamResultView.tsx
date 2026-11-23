import { ArrowLeft, CheckCircle2, Clock, FileCheck2, ShieldAlert } from 'lucide-react';
import React from 'react';
import { HEADER_THEME_META } from '../lib/theme.ts';
import type { ExamSessionSummary, PortalBranding } from '../types/exam.ts';
import { DEFAULT_PORTAL_BRANDING } from '../types/exam.ts';
import { MathText } from './MathText.tsx';

interface ExamResultViewProps {
  summary: ExamSessionSummary;
  branding?: PortalBranding;
  onExitToPortal: () => void;
}

const QUESTION_TYPE_LABEL: Record<string, string> = {
  PG_SEDERHANA: 'Pilihan Ganda Sederhana',
  MCMA: 'PG Kompleks (MCMA)',
  PGK_KATEGORI: 'PG Kompleks Kategori',
  MENJODOHKAN: 'Menjodohkan',
  URAIAN: 'Uraian',
};

function formatAnswerDisplay(ans: ExamSessionSummary['details'][number]['studentAnswer']): string {
  if (!ans) return 'Tidak dijawab';
  switch (ans.type) {
    case 'PG_SEDERHANA':
      return ans.optionId.replace('opt-', 'Opsi ').toUpperCase();
    case 'MCMA':
      return ans.optionIds.length > 0
        ? ans.optionIds.map((id) => id.replace('opt-', 'Opsi ').toUpperCase()).join(', ')
        : 'Tidak dijawab';
    case 'PGK_KATEGORI':
      return Object.entries(ans.selections)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');
    case 'MENJODOHKAN':
      return Object.entries(ans.pairs)
        .map(([l, r]) => `${l} → ${r}`)
        .join(', ');
    case 'URAIAN':
      return ans.text || 'Tidak dijawab';
  }
}

export const ExamResultView: React.FC<ExamResultViewProps> = ({
  summary,
  branding = DEFAULT_PORTAL_BRANDING,
  onExitToPortal,
}) => {
  const headerThemeClass = HEADER_THEME_META[branding.themePreset]?.headerClass || 'tka-header-bg';

  return (
    <div className="min-h-screen bg-[#f4f7fb]">
      <header className={`${headerThemeClass} px-4 py-3 text-white shadow-sm sm:px-6`}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {(branding.logoUrl || '/assets/aistudio/tutwuri1_e2a6801e.jpg') ? (
              <img
                src={branding.logoUrl || '/assets/aistudio/tutwuri1_e2a6801e.jpg'}
                alt="Logo Tut Wuri Handayani"
                className="h-9 w-9 shrink-0 rounded-full border border-white/30 bg-white object-contain p-0.5 shadow-xs"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/15 text-xs font-bold">
                {branding.logoBadgeText || 'TKA'}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-[11px] font-semibold tracking-wider uppercase opacity-90 truncate">
                {branding.headerOrgLabel || 'PUSMENDIK'} · HASIL EVALUASI
              </div>
              <div className="truncate text-sm font-bold">{summary.packageTitle}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onExitToPortal}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Kembali ke Beranda
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        {/* Top Score Summary */}
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                UJIAN SELESAI & TERSIMPAN DI SERVER
              </div>
              <h1 className="mt-1 text-xl font-bold text-slate-900">{summary.participantName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{summary.schoolName}</span>
                <span>·</span>
                <span>Sesi {summary.sessionNumber}</span>
                <span>·</span>
                <span>{summary.subjectName}</span>
              </div>
            </div>

            <div className="flex items-center gap-6 border-t border-slate-200 pt-4 sm:border-t-0 sm:pt-0">
              <div className="text-right">
                <div className="text-xs font-medium text-slate-500">Total Skor</div>
                <div className="font-mono text-2xl font-bold tabular-nums text-slate-900">
                  {summary.totalScore} <span className="text-sm font-normal text-slate-500">/ {summary.maxScore}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-medium text-slate-500">Nilai Akhir</div>
                <div className="font-mono text-3xl font-bold tabular-nums text-blue-700">
                  {summary.percentage.toFixed(1)}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-200 pt-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-slate-500" />
              Catatan Pelanggaran: <strong className="font-mono">{summary.violationCount}x</strong>
            </span>
            {summary.needsManualGrading && (
              <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
                <Clock className="h-4 w-4" />
                Memuat soal Uraian (skor sementara menggunakan estimasi kata kunci hingga diverifikasi guru di Rekap Nilai).
              </span>
            )}
          </div>
        </section>

        {/* Item-by-item review & explanation */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <FileCheck2 className="h-4 w-4 text-blue-600" />
            Rincian Jawaban & Pembahasan Resmi
          </div>

          {summary.details.map((item) => {
            const effectiveScore =
              item.manualScoreEarned !== null ? item.manualScoreEarned : item.autoScoreEarned;
            const isFull = effectiveScore >= item.maxScore;

            return (
              <div
                key={item.questionId}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="font-mono font-bold text-slate-900">
                      Soal #{item.orderNumber}
                    </span>
                    <span>·</span>
                    <span>{QUESTION_TYPE_LABEL[item.questionType] || item.questionType}</span>
                  </div>
                  <div className="font-mono text-xs font-bold tabular-nums">
                    <span className={isFull ? 'text-emerald-700' : effectiveScore > 0 ? 'text-amber-700' : 'text-red-600'}>
                      Skor: {effectiveScore} / {item.maxScore}
                    </span>
                    {!item.isGraded && (
                      <span className="ml-2 text-amber-700">(Menunggu Koreksi Guru)</span>
                    )}
                  </div>
                </div>

                <div className="mt-3 text-sm font-medium text-slate-900">
                  <MathText text={item.prompt} />
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                  <div className="rounded border border-slate-200 bg-slate-50 p-3">
                    <div className="font-semibold text-slate-500">Jawaban Anda</div>
                    <div className="mt-1 font-medium text-slate-800 whitespace-pre-line">
                      {formatAnswerDisplay(item.studentAnswer)}
                    </div>
                  </div>
                  <div className="rounded border border-emerald-200 bg-emerald-50/50 p-3">
                    <div className="font-semibold text-emerald-800">Pembahasan & Kunci</div>
                    <div className="mt-1 text-slate-700">
                      {item.explanation ? (
                        <MathText text={item.explanation} />
                      ) : (
                        item.answerKey.modelAnswer || 'Lihat kunci pada Bank Soal.'
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
};
