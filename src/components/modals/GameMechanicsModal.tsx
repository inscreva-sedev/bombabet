'use client';

import React from 'react';
import { X, ShieldCheck, Calculator, PlaneTakeoff } from 'lucide-react';

interface GameMechanicsModalProps {
  open: boolean;
  lastRoundId: number | null;
  lastCrashPoint: number | null;
  lastRoundHash: string | null;
  onClose: () => void;
}

export function GameMechanicsModal({
  open,
  lastRoundId,
  lastCrashPoint,
  lastRoundHash,
  onClose,
}: GameMechanicsModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#181921] border border-[#2d303e] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[#262835] flex items-center justify-between bg-[#14151b]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#36b51a]" />
            <h2 className="text-sm font-bold text-white">Mecânica do Jogo & Regras</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#8c909e] hover:text-white hover:bg-[#232532]"
            aria-label="Fechar mecânica do jogo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs text-[#c7cad6] leading-relaxed">
          <div className="p-3 rounded-xl bg-[#121319] border border-[#252734] space-y-1.5">
            <div className="flex items-center gap-2 text-white font-semibold">
              <PlaneTakeoff className="w-4 h-4 text-[#e50539]" />
              Fluxo da Ronda
            </div>
            <p>
              1. Faça uma ou duas apostas independentes antes da contagem decrescente terminar.
              <br />
              2. O avião descola e o multiplicador sobe progressivamente a partir de <strong className="text-white">1.00x</strong>.
              <br />
              3. Clique em <strong className="text-[#ef9b1a]">Levantar</strong> antes do avião voar para longe (crash) para garantir o ganho.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#121319] border border-[#252734] space-y-1.5">
            <div className="flex items-center gap-2 text-white font-semibold">
              <Calculator className="w-4 h-4 text-[#36b51a]" />
              Fórmula de Cálculo
            </div>
            <div className="p-2 rounded-lg bg-[#191b24] font-mono text-[11px] text-[#7ef263] text-center">
              Ganhos = Valor da Aposta × Multiplicador de Levantamento
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#121319] border border-[#252734] space-y-1.5">
            <div className="flex items-center gap-2 text-white font-semibold">
              <ShieldCheck className="w-4 h-4 text-[#36b51a]" />
              Integridade no Servidor
            </div>
            <p>
              O ponto de crash de cada ronda é gerado exclusivamente no servidor antes da descolagem através de aleatoriedade criptográfica (<code className="text-white">crypto.randomBytes</code>) e só é revelado após o fim do voo.
            </p>
            {lastRoundHash && lastRoundId && (
              <div className="mt-2 pt-2 border-t border-[#232530] text-[11px] font-mono text-[#9ea2b0] break-all">
                <div>
                  Última ronda #{lastRoundId}: <strong className="text-white">{lastCrashPoint?.toFixed(2)}x</strong>
                </div>
                <div className="text-[10px] text-[#707484] mt-0.5">SHA-256: {lastRoundHash}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
