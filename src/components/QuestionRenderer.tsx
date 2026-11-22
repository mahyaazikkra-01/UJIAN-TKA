import { Check, Link2, RotateCcw } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import type { QuestionPublic, StudentAnswerPayload } from '../types/exam.ts';
import { MathText } from './MathText.tsx';

interface QuestionRendererProps {
  question: QuestionPublic;
  answer: StudentAnswerPayload | null;
  onChange: (nextAnswer: StudentAnswerPayload) => void;
  fontSizeClass: string;
}

const PAIR_COLORS = [
  { bg: 'bg-blue-600', light: 'bg-blue-50 border-blue-400 text-blue-900', hex: '#2563eb' },
  { bg: 'bg-emerald-600', light: 'bg-emerald-50 border-emerald-400 text-emerald-900', hex: '#059669' },
  { bg: 'bg-amber-600', light: 'bg-amber-50 border-amber-400 text-amber-900', hex: '#d97706' },
  { bg: 'bg-indigo-600', light: 'bg-indigo-50 border-indigo-400 text-indigo-900', hex: '#4f46e5' },
  { bg: 'bg-rose-600', light: 'bg-rose-50 border-rose-400 text-rose-900', hex: '#e11d48' },
  { bg: 'bg-cyan-700', light: 'bg-cyan-50 border-cyan-400 text-cyan-900', hex: '#0e7490' },
];

interface PairLineCoord {
  leftId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  question,
  answer,
  onChange,
  fontSizeClass,
}) => {
  const [activeLeftId, setActiveLeftId] = useState<string | null>(null);
  const matchingContainerRef = useRef<HTMLDivElement | null>(null);
  const leftItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const rightItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pairLines, setPairLines] = useState<PairLineCoord[]>([]);

  useEffect(() => {
    if (question.questionType !== 'MENJODOHKAN') {
      setPairLines([]);
      return;
    }

    const computeLines = () => {
      const container = matchingContainerRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const pairs = answer?.type === 'MENJODOHKAN' ? answer.pairs : {};
      const leftItems = question.config.leftItems || [];
      const nextLines: PairLineCoord[] = [];

      leftItems.forEach((left, idx) => {
        const rightId = pairs[left.id];
        if (!rightId) return;
        const leftEl = leftItemRefs.current[left.id];
        const rightEl = rightItemRefs.current[rightId];
        if (!leftEl || !rightEl) return;

        const lRect = leftEl.getBoundingClientRect();
        const rRect = rightEl.getBoundingClientRect();

        nextLines.push({
          leftId: left.id,
          x1: lRect.right - cRect.left,
          y1: lRect.top + lRect.height / 2 - cRect.top,
          x2: rRect.left - cRect.left,
          y2: rRect.top + rRect.height / 2 - cRect.top,
          color: PAIR_COLORS[idx % PAIR_COLORS.length].hex,
        });
      });

      setPairLines(nextLines);
    };

    const rafId = window.requestAnimationFrame(computeLines);
    const observer =
      typeof ResizeObserver !== 'undefined' && matchingContainerRef.current
        ? new ResizeObserver(() => computeLines())
        : null;
    if (observer && matchingContainerRef.current) {
      observer.observe(matchingContainerRef.current);
    }
    window.addEventListener('resize', computeLines);

    return () => {
      window.cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.removeEventListener('resize', computeLines);
    };
  }, [question, answer, fontSizeClass]);

  if (question.questionType === 'PG_SEDERHANA') {
    const selectedId = answer?.type === 'PG_SEDERHANA' ? answer.optionId : '';
    const options = question.config.options || [];

    return (
      <div className={`space-y-3 ${fontSizeClass}`}>
        <div className="whitespace-pre-line font-medium leading-relaxed text-slate-900">
          <MathText text={question.prompt} />
        </div>

        <div className="space-y-2.5 pt-2">
          {options.map((opt) => {
            const isSelected = selectedId === opt.id;
            return (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-start gap-3 rounded-md border px-3.5 py-2.5 transition-colors ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/70'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name={`q-${question.id}`}
                  checked={isSelected}
                  onChange={() => onChange({ type: 'PG_SEDERHANA', optionId: opt.id })}
                  className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                />
                <div className="flex items-baseline gap-2 text-slate-800">
                  {opt.label && (
                    <span className="font-semibold text-slate-600">{opt.label}.</span>
                  )}
                  <MathText text={opt.text} />
                </div>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  if (question.questionType === 'MCMA') {
    const selectedIds = new Set(answer?.type === 'MCMA' ? answer.optionIds : []);
    const options = question.config.options || [];

    const toggleOption = (optId: string) => {
      const next = new Set(selectedIds);
      if (next.has(optId)) {
        next.delete(optId);
      } else {
        next.add(optId);
      }
      onChange({ type: 'MCMA', optionIds: Array.from(next) });
    };

    return (
      <div className={`space-y-3 ${fontSizeClass}`}>
        <div className="whitespace-pre-line font-medium leading-relaxed text-slate-900">
          <MathText text={question.prompt} />
        </div>
        <p className="text-xs font-medium text-blue-700">
          Pilih lebih dari satu jawaban yang benar menggunakan kotak centang.
        </p>

        <div className="space-y-2.5 pt-1">
          {options.map((opt) => {
            const checked = selectedIds.has(opt.id);
            return (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-start gap-3 rounded-md border px-3.5 py-2.5 transition-colors ${
                  checked
                    ? 'border-blue-600 bg-blue-50/70'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleOption(opt.id)}
                  className="mt-1 h-4 w-4 shrink-0 rounded accent-blue-600"
                />
                <div className="flex items-baseline gap-2 text-slate-800">
                  {opt.label && (
                    <span className="font-semibold text-slate-600">{opt.label}.</span>
                  )}
                  <MathText text={opt.text} />
                </div>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  if (question.questionType === 'PGK_KATEGORI') {
    const categories = question.config.categories || ['Benar', 'Salah'];
    const statements = question.config.statements || [];
    const selections = answer?.type === 'PGK_KATEGORI' ? answer.selections : {};

    const handleSelect = (statementId: string, category: string) => {
      onChange({
        type: 'PGK_KATEGORI',
        selections: {
          ...selections,
          [statementId]: category,
        },
      });
    };

    return (
      <div className={`space-y-3 ${fontSizeClass}`}>
        <div className="whitespace-pre-line font-medium leading-relaxed text-slate-900">
          <MathText text={question.prompt} />
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-800">
                <th className="border-b border-r border-slate-200 px-3.5 py-2.5 text-xs font-bold tracking-wide sm:text-sm">
                  Pernyataan
                </th>
                {categories.map((cat) => (
                  <th
                    key={cat}
                    className="w-24 border-b border-r last:border-r-0 border-slate-200 px-2.5 py-2.5 text-center text-xs font-bold sm:w-28 sm:text-sm"
                  >
                    {cat}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {statements.map((stmt) => (
                <tr key={stmt.id} className="hover:bg-slate-50/60">
                  <td className="border-r border-slate-200 px-3.5 py-3 align-middle text-slate-800">
                    {(stmt.badgeCode || stmt.badgeAmount) && (
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        {stmt.badgeCode && (
                          <span className="inline-flex items-center rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-800">
                            {stmt.badgeCode}
                          </span>
                        )}
                        {stmt.badgeAmount && (
                          <span className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-800">
                            {stmt.badgeAmount}
                          </span>
                        )}
                      </div>
                    )}
                    <MathText text={stmt.text} />
                  </td>

                  {categories.map((cat) => {
                    const isChecked = selections[stmt.id] === cat;
                    return (
                      <td
                        key={cat}
                        className="border-r last:border-r-0 border-slate-200 px-2 py-3 text-center align-middle"
                      >
                        <label className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md hover:bg-blue-50">
                          <input
                            type="radio"
                            name={`pgk-${question.id}-${stmt.id}`}
                            checked={isChecked}
                            onChange={() => handleSelect(stmt.id, cat)}
                            aria-label={`${stmt.text} — ${cat}`}
                            className="h-4 w-4 cursor-pointer accent-blue-600"
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (question.questionType === 'MENJODOHKAN') {
    const leftItems = question.config.leftItems || [];
    const rightItems = question.config.rightItems || [];
    const pairs = answer?.type === 'MENJODOHKAN' ? answer.pairs : {};

    // Reverse lookup rightId -> leftIndex
    const rightToLeftIndex = new Map<string, number>();
    leftItems.forEach((l, idx) => {
      const rId = pairs[l.id];
      if (rId) rightToLeftIndex.set(rId, idx);
    });

    const handleLeftClick = (leftId: string) => {
      if (activeLeftId === leftId) {
        setActiveLeftId(null);
      } else {
        setActiveLeftId(leftId);
      }
    };

    const handleRightClick = (rightId: string) => {
      if (!activeLeftId) {
        // If user clicks an already-paired right item without selecting left, unpair it
        const nextPairs = { ...pairs };
        for (const [k, v] of Object.entries(nextPairs)) {
          if (v === rightId) delete nextPairs[k];
        }
        onChange({ type: 'MENJODOHKAN', pairs: nextPairs });
        return;
      }

      const nextPairs = { ...pairs };
      // Ensure 1-to-1 pairing: remove any previous premise pointing to this rightId
      for (const [k, v] of Object.entries(nextPairs)) {
        if (v === rightId) delete nextPairs[k];
      }
      nextPairs[activeLeftId] = rightId;
      onChange({ type: 'MENJODOHKAN', pairs: nextPairs });
      setActiveLeftId(null);
    };

    const clearPair = (leftId: string) => {
      const nextPairs = { ...pairs };
      delete nextPairs[leftId];
      onChange({ type: 'MENJODOHKAN', pairs: nextPairs });
    };

    const resetAllPairs = () => {
      onChange({ type: 'MENJODOHKAN', pairs: {} });
      setActiveLeftId(null);
    };

    return (
      <div className={`space-y-3 ${fontSizeClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="whitespace-pre-line font-medium leading-relaxed text-slate-900">
            <MathText text={question.prompt} />
          </div>
          {Object.keys(pairs).length > 0 && (
            <button
              type="button"
              onClick={resetAllPairs}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Ulangi Pasangan
            </button>
          )}
        </div>

        <p className="text-xs font-medium text-blue-700">
          Langkah: 1) Ketuk salah satu kotak di kolom kiri, lalu 2) ketuk pasangannya di kolom kanan.
        </p>

        <div ref={matchingContainerRef} className="relative grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-14">
          {pairLines.length > 0 && (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 hidden h-full w-full md:block"
            >
              {pairLines.map((line) => {
                const dx = Math.max(24, Math.abs(line.x2 - line.x1) * 0.45);
                const d = `M ${line.x1} ${line.y1} C ${line.x1 + dx} ${line.y1}, ${line.x2 - dx} ${line.y2}, ${line.x2} ${line.y2}`;
                return (
                  <g key={line.leftId}>
                    <path
                      d={d}
                      fill="none"
                      stroke={line.color}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                    />
                    <circle cx={line.x1} cy={line.y1} r={4} fill={line.color} />
                    <circle cx={line.x2} cy={line.y2} r={4} fill={line.color} />
                  </g>
                );
              })}
            </svg>
          )}

          <div className="relative z-10 space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Kolom Pernyataan / Premis
            </div>
            {leftItems.map((left, idx) => {
              const isSelected = activeLeftId === left.id;
              const pairedRightId = pairs[left.id];
              const color = PAIR_COLORS[idx % PAIR_COLORS.length];

              return (
                <div
                  key={left.id}
                  ref={(el) => {
                    leftItemRefs.current[left.id] = el;
                  }}
                  className={`flex items-center justify-between gap-2 rounded-md border p-3 transition-colors ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                      : pairedRightId
                        ? color.light
                        : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleLeftClick(left.id)}
                    className="flex flex-1 items-center gap-2.5 text-left"
                  >
                    <span
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                        pairedRightId ? color.bg : isSelected ? 'bg-blue-600' : 'bg-slate-400'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="text-slate-800">
                      <MathText text={left.text} />
                    </span>
                  </button>

                  {pairedRightId && (
                    <button
                      type="button"
                      onClick={() => clearPair(left.id)}
                      title="Hapus pasangan ini"
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Lepas
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="relative z-10 space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Kolom Pasangan / Respons
            </div>
            {rightItems.map((right, rIdx) => {
              const pairedLeftIdx = rightToLeftIndex.get(right.id);
              const isPaired = pairedLeftIdx !== undefined;
              const color = isPaired
                ? PAIR_COLORS[pairedLeftIdx % PAIR_COLORS.length]
                : null;

              return (
                <button
                  key={right.id}
                  ref={(el) => {
                    rightItemRefs.current[right.id] = el;
                  }}
                  type="button"
                  onClick={() => handleRightClick(right.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md border p-3 text-left transition-colors ${
                    isPaired && color
                      ? color.light
                      : activeLeftId
                        ? 'border-blue-300 bg-white hover:border-blue-500 hover:bg-blue-50/40'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-300 bg-slate-50 font-mono text-xs font-bold text-slate-700">
                      {String.fromCharCode(65 + rIdx)}
                    </span>
                    <span className="text-slate-800">
                      <MathText text={right.text} />
                    </span>
                  </div>

                  {isPaired && color ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold text-white ${color.bg}`}
                    >
                      <Link2 className="h-3 w-3" />#{pairedLeftIdx + 1}
                    </span>
                  ) : activeLeftId ? (
                    <span className="text-xs font-semibold text-blue-600">Pilih</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // URAIAN
  const textValue = answer?.type === 'URAIAN' ? answer.text : '';
  return (
    <div className={`space-y-3 ${fontSizeClass}`}>
      <div className="whitespace-pre-line font-medium leading-relaxed text-slate-900">
        <MathText text={question.prompt} />
      </div>

      {question.config.rubricHint && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <strong>Petunjuk Penilaian:</strong> {question.config.rubricHint}
        </div>
      )}

      <div className="space-y-1.5 pt-1">
        <textarea
          rows={7}
          value={textValue}
          onChange={(e) => onChange({ type: 'URAIAN', text: e.target.value })}
          placeholder={
            question.config.placeholder ||
            'Tuliskan jawaban uraian lengkap dan jelas di sini...'
          }
          className="w-full rounded-md border border-slate-300 bg-white p-3.5 text-slate-900 shadow-xs outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        />
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Check className="h-3.5 w-3.5 text-emerald-600" />
            Jawaban uraian tersimpan otomatis saat mengetik atau berpindah soal.
          </span>
          <span className="font-mono tabular-nums">{textValue.length} karakter</span>
        </div>
      </div>
    </div>
  );
};
