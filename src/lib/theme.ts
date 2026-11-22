import type { HeaderThemePreset } from '../types/exam.ts';

export const HEADER_THEME_META: Record<
  HeaderThemePreset,
  { label: string; headerClass: string; buttonClass: string; swatchClass: string }
> = {
  pusmendik_blue: {
    label: 'Biru Pusmendik (Standar)',
    headerClass: 'tka-header-bg',
    buttonClass: 'bg-[#334e68] hover:bg-[#243b53]',
    swatchClass: 'bg-[#1d4ed8]',
  },
  navy: {
    label: 'Biru Navy Dinas',
    headerClass: 'tka-header-navy',
    buttonClass: 'bg-[#1e3a8a] hover:bg-[#172554]',
    swatchClass: 'bg-[#1e3a8a]',
  },
  emerald: {
    label: 'Hijau Zamrud',
    headerClass: 'tka-header-emerald',
    buttonClass: 'bg-[#047857] hover:bg-[#065f46]',
    swatchClass: 'bg-[#047857]',
  },
  maroon: {
    label: 'Merah Marun',
    headerClass: 'tka-header-maroon',
    buttonClass: 'bg-[#991b1b] hover:bg-[#7f1d1d]',
    swatchClass: 'bg-[#991b1b]',
  },
  slate: {
    label: 'Abu Slate Klasik',
    headerClass: 'tka-header-slate',
    buttonClass: 'bg-[#1e293b] hover:bg-[#0f172a]',
    swatchClass: 'bg-[#1e293b]',
  },
};
