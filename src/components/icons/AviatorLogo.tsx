'use client';

import React from 'react';

interface AviatorLogoProps {
  size?: 'md' | 'sm';
  showStudio?: boolean;
}

export function AviatorLogo({ size = 'md', showStudio = false }: AviatorLogoProps) {
  const fontSize = size === 'md' ? 'text-[26px]' : 'text-[20px]';

  return (
    <div className="inline-flex flex-col leading-none select-none">
      <span
        className={`${fontSize} font-black italic tracking-tight text-[#e50539] drop-shadow-[0_1px_8px_rgba(229,5,57,0.35)]`}
        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
      >
        Aviator
      </span>
      {showStudio && (
        <span className="text-[7px] font-bold tracking-[0.28em] text-[#9b9ea8] uppercase text-center -mt-0.5">
          STUDIO
        </span>
      )}
    </div>
  );
}

interface PlayerAvatarProps {
  index: number;
  isUser?: boolean;
}

const AVATAR_PALETTES = [
  { bg: '#3b1d24', ring: '#c94a63', accent: '#f3a6b6' },
  { bg: '#1e2c3f', ring: '#4287f5', accent: '#9bc2ff' },
  { bg: '#2c2419', ring: '#d48b35', accent: '#f5cc90' },
  { bg: '#212e24', ring: '#3bb55d', accent: '#9ce6af' },
  { bg: '#2c1f38', ring: '#9855e0', accent: '#cfa6fa' },
  { bg: '#38221e', ring: '#e06043', accent: '#f7b2a1' },
];

export function PlayerAvatar({ index, isUser = false }: PlayerAvatarProps) {
  const palette = isUser
    ? { bg: '#133319', ring: '#36b51a', accent: '#9bf587' }
    : AVATAR_PALETTES[Math.abs(index) % AVATAR_PALETTES.length];

  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 border"
      style={{
        backgroundColor: palette.bg,
        borderColor: palette.ring,
      }}
    >
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
        <circle cx="12" cy="8.5" r="3.4" fill={palette.accent} />
        <path
          d="M5.5 19.5c.7-3.3 3.4-5.2 6.5-5.2s5.8 1.9 6.5 5.2"
          stroke={palette.accent}
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
