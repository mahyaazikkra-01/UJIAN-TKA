import React from 'react';
import type { ArrowDiagram, StimulusBlock, VoucherItem } from '../types/exam.ts';
import { MathFormulaBlock, MathText } from './MathText.tsx';

const VOUCHER_THEME: Record<NonNullable<VoucherItem['accentColor']>, { strip: string; badge: string }> = {
  rose: { strip: 'bg-[#9b1c2e]', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  blue: { strip: 'bg-[#1d4ed8]', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  amber: { strip: 'bg-[#b45309]', badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  emerald: { strip: 'bg-[#047857]', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
};

const ArrowDiagramCard: React.FC<{ diagram: ArrowDiagram }> = ({ diagram }) => {
  const maxNodes = Math.max(diagram.leftNodes.length, diagram.rightNodes.length);
  const svgHeight = Math.max(130, maxNodes * 34 + 34);
  const leftX = 38;
  const rightX = 142;

  const nodeY = (index: number, total: number) => {
    const start = 36;
    const step = total > 1 ? (svgHeight - 60) / (total - 1) : 0;
    return start + index * step;
  };

  return (
    <div className="flex flex-col items-center rounded-md border border-slate-200 bg-white p-3">
      <svg width="180" height={svgHeight} viewBox={`0 0 180 ${svgHeight}`} className="overflow-visible">
        <defs>
          <marker
            id={`arrow-${diagram.title.replace(/\s+/g, '-')}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#1e293b" />
          </marker>
        </defs>

        <text x={leftX} y="16" textAnchor="middle" className="fill-slate-800 text-xs font-bold">
          {diagram.leftTitle}
        </text>
        <text x={rightX} y="16" textAnchor="middle" className="fill-slate-800 text-xs font-bold">
          {diagram.rightTitle}
        </text>

        <ellipse
          cx={leftX}
          cy={(svgHeight + 18) / 2}
          rx="26"
          ry={(svgHeight - 30) / 2}
          fill="#f8fafc"
          stroke="#475569"
          strokeWidth="1.5"
        />
        <ellipse
          cx={rightX}
          cy={(svgHeight + 18) / 2}
          rx="26"
          ry={(svgHeight - 30) / 2}
          fill="#f8fafc"
          stroke="#475569"
          strokeWidth="1.5"
        />

        {diagram.edges.map(([li, ri], idx) => {
          const y1 = nodeY(li, diagram.leftNodes.length);
          const y2 = nodeY(ri, diagram.rightNodes.length);
          return (
            <line
              key={idx}
              x1={leftX + 10}
              y1={y1}
              x2={rightX - 12}
              y2={y2}
              stroke="#1e293b"
              strokeWidth="1.4"
              markerEnd={`url(#arrow-${diagram.title.replace(/\s+/g, '-')})`}
            />
          );
        })}

        {diagram.leftNodes.map((label, i) => {
          const y = nodeY(i, diagram.leftNodes.length);
          return (
            <g key={`l-${i}`}>
              <circle cx={leftX + 8} cy={y} r="3" fill="#0f172a" />
              <text x={leftX - 8} y={y + 4} textAnchor="middle" className="fill-slate-800 text-[11px] font-semibold">
                {label}
              </text>
            </g>
          );
        })}

        {diagram.rightNodes.map((label, i) => {
          const y = nodeY(i, diagram.rightNodes.length);
          return (
            <g key={`r-${i}`}>
              <circle cx={rightX - 8} cy={y} r="3" fill="#0f172a" />
              <text x={rightX + 8} y={y + 4} textAnchor="middle" className="fill-slate-800 text-[11px] font-semibold">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 rounded bg-[#d4a017] px-3 py-1 text-xs font-bold tracking-wide text-slate-950">
        {diagram.title}
      </div>
    </div>
  );
};

export const StimulusRenderer: React.FC<{
  stimulus: StimulusBlock | null;
  fontSizeClass: string;
}> = ({ stimulus, fontSizeClass }) => {
  if (!stimulus) return null;

  return (
    <div className={`space-y-4 leading-relaxed text-slate-800 ${fontSizeClass}`}>
      {stimulus.title && (
        <h3 className="text-base font-bold text-slate-900">{stimulus.title}</h3>
      )}

      {stimulus.paragraphs?.map((para, idx) => (
        <p key={idx} className="whitespace-pre-line">
          <MathText text={para} />
        </p>
      ))}

      {stimulus.mathFormula && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
          <MathFormulaBlock formula={stimulus.mathFormula} />
        </div>
      )}

      {stimulus.vouchers && stimulus.vouchers.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5">
          <div className="mb-3 border-b border-slate-200 pb-2 text-center text-sm font-bold tracking-wide text-[#9b1c2e]">
            VOUCHER CASHBACK
          </div>
          <div className="space-y-2.5">
            {stimulus.vouchers.map((v) => {
              const theme = VOUCHER_THEME[v.accentColor || 'rose'];
              return (
                <div
                  key={v.code}
                  className="flex overflow-hidden rounded-md border border-slate-200 bg-white shadow-xs"
                >
                  <div
                    className={`flex w-24 shrink-0 flex-col items-center justify-center px-2 py-2.5 text-center text-white ${theme.strip}`}
                  >
                    <span className="text-[11px] font-medium opacity-90">Voucher</span>
                    <span className="text-lg font-bold leading-tight">
                      {v.code.replace(/^Voucher\s*/i, '')}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
                    <div>
                      <div className="text-sm font-bold text-slate-900">{v.title}</div>
                      <div className="text-xs text-slate-500">{v.subtitle}</div>
                    </div>
                    <span
                      className={`rounded border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${theme.badge}`}
                    >
                      {v.minPurchase}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {stimulus.arrowDiagrams && stimulus.arrowDiagrams.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {stimulus.arrowDiagrams.map((diag, idx) => (
            <ArrowDiagramCard key={idx} diagram={diag} />
          ))}
        </div>
      )}

      {stimulus.barChart && (
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="mb-3 text-center text-xs font-bold tracking-wide text-slate-800">
            {stimulus.barChart.title}
          </div>
          <div className="overflow-x-auto">
            {(() => {
              const data = stimulus.barChart.data;
              const maxVal = Math.max(...data.map((d) => d.value), 10);
              const yMax = Math.ceil(maxVal / 5) * 5;
              const chartH = 160;
              const chartW = Math.max(360, data.length * 32 + 48);
              const padLeft = 36;
              const padBottom = 28;
              const plotH = chartH - padBottom - 14;
              const barSlot = (chartW - padLeft - 12) / data.length;

              return (
                <svg
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  className="mx-auto w-full max-w-[460px]"
                >
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                    const val = Math.round(yMax * ratio);
                    const y = 14 + plotH * (1 - ratio);
                    return (
                      <g key={idx}>
                        <line
                          x1={padLeft}
                          y1={y}
                          x2={chartW - 8}
                          y2={y}
                          stroke="#e2e8f0"
                          strokeDasharray="3 3"
                        />
                        <text
                          x={padLeft - 6}
                          y={y + 3}
                          textAnchor="end"
                          className="fill-slate-500 font-mono text-[9px]"
                        >
                          {val}
                        </text>
                      </g>
                    );
                  })}

                  {data.map((d, i) => {
                    const barW = Math.min(20, barSlot * 0.62);
                    const h = (d.value / yMax) * plotH;
                    const x = padLeft + i * barSlot + (barSlot - barW) / 2;
                    const y = 14 + plotH - h;
                    return (
                      <g key={d.label}>
                        <rect
                          x={x}
                          y={y}
                          width={barW}
                          height={h}
                          rx="2"
                          fill={i < 6 ? '#a3b18a' : '#2563eb'}
                        />
                        <text
                          x={x + barW / 2}
                          y={y - 3}
                          textAnchor="middle"
                          className="fill-slate-700 font-mono text-[9px] font-semibold"
                        >
                          {d.value}
                        </text>
                        <text
                          x={x + barW / 2}
                          y={chartH - 10}
                          textAnchor="middle"
                          className="fill-slate-600 font-mono text-[9px]"
                        >
                          {d.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>Sumbu Y: {stimulus.barChart.yLabel}</span>
            <span>Sumbu X: {stimulus.barChart.xLabel}</span>
          </div>
        </div>
      )}

      {stimulus.flowSteps && stimulus.flowSteps.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {stimulus.flowSteps.map((fs, i) => (
            <div key={i} className="rounded-md border border-amber-200 bg-amber-50/70 p-2.5">
              <div className="text-xs font-bold text-amber-900">{fs.step}</div>
              <div className="mt-0.5 text-xs text-slate-700">{fs.detail}</div>
            </div>
          ))}
        </div>
      )}

      {stimulus.table && (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-slate-800">
              <tr>
                {stimulus.table.headers.map((h, i) => (
                  <th key={i} className="border-b border-slate-200 px-3 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {stimulus.table.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2">
                      <MathText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
