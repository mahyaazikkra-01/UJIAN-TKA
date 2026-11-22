import katex from 'katex';
import React from 'react';

interface MathTextProps {
  text: string;
  className?: string;
}

/**
 * Renders plain prose safely interspersed with $...$ inline or $$...$$ block KaTeX math.
 * Non-math segments are rendered as plain React text nodes (XSS-safe).
 */
export const MathText: React.FC<MathTextProps> = ({ text, className = '' }) => {
  if (!text) return null;

  // Split by $$...$$ first, then $...$
  const tokens: Array<{ type: 'text' | 'block' | 'inline'; content: string }> = [];
  const regex = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith('$$') && raw.endsWith('$$')) {
      tokens.push({ type: 'block', content: raw.slice(2, -2).trim() });
    } else {
      tokens.push({ type: 'inline', content: raw.slice(1, -1).trim() });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return (
    <span className={className}>
      {tokens.map((tok, idx) => {
        if (tok.type === 'text') {
          return <React.Fragment key={idx}>{tok.content}</React.Fragment>;
        }
        try {
          const html = katex.renderToString(tok.content, {
            displayMode: tok.type === 'block',
            throwOnError: false,
            strict: false,
          });
          return (
            <span
              key={idx}
              className={tok.type === 'block' ? 'my-2 block overflow-x-auto' : 'inline-block align-middle'}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          return <code key={idx}>{tok.content}</code>;
        }
      })}
    </span>
  );
};

export const MathFormulaBlock: React.FC<{ formula: string; className?: string }> = ({
  formula,
  className = '',
}) => {
  if (!formula) return null;
  let html = '';
  try {
    html = katex.renderToString(formula, {
      displayMode: true,
      throwOnError: false,
      strict: false,
    });
  } catch {
    return <pre className="rounded bg-slate-100 p-3 font-mono text-sm">{formula}</pre>;
  }
  return (
    <div
      className={`overflow-x-auto py-1 text-slate-900 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
