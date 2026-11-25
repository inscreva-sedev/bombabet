'use client';

import React from 'react';
import { X, History } from 'lucide-react';
import { getMultiplierPillStyle } from '@/shared/format';
import { RoundHistoryItem } from '@/shared/types';

interface HistoryModalProps {
  open: boolean;
  history: RoundHistoryItem[];
  onClose: () => void;
}

export function HistoryModal({ open, history, onClose }: HistoryModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#181921] border border-[#2d303e] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[#262835] flex items-center justify-between bg-[#14151b]">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#9d5cf6]" />
            <h2 className="text-sm font-bold text-white">Histórico das Últimas Rondas</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#8c909e] hover:text-white hover:bg-[#232532]"
            aria-label="Fechar histórico"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 max-h-[65vh] overflow-y-auto">
          {history.length === 0 ? (
            <div className="text-center py-8 text-xs text-[#7e8291]">
              Sem rondas registadas ainda.
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {history.map((item) => (
                <div
                  key={item.roundId}
                  title={`Ronda #${item.roundId} (${new Date(item.timestamp).toLocaleTimeString('pt-PT')})`}
                  className={`flex flex-col items-center justify-center py-2 px-2 rounded-xl border ${getMultiplierPillStyle(
                    item.crashPoint
                  )}`}
                >
                  <span className="text-[13px] font-bold font-mono tabular-nums">
                    {item.crashPoint.toFixed(2)}x
                  </span>
                  <span className="text-[9px] text-white/55 font-mono">
                    #{item.roundId}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
