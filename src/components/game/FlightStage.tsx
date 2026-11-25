'use client';

import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import { formatMoney } from '@/shared/format';
import { RoundPhase, ToastNotification } from '@/shared/types';

interface FlightStageProps {
  roundId: number;
  phase: RoundPhase;
  multiplier: number;
  countdownRemainingMs: number;
  countdownTotalMs: number;
  elapsedFlightMs: number;
  lastCrashPoint: number | null;
  animationsEnabled: boolean;
  maintenanceMode?: boolean;
  currency: string;
  toasts: ToastNotification[];
}

interface CloudShape {
  x: number;
  y: number;
  scale: number;
  speed: number;
  layer: 0 | 1 | 2;
}

const INITIAL_CLOUDS: CloudShape[] = [
  { x: 0.08, y: 0.18, scale: 1.15, speed: 0.012, layer: 0 },
  { x: 0.42, y: 0.12, scale: 1.4, speed: 0.01, layer: 0 },
  { x: 0.78, y: 0.22, scale: 1.25, speed: 0.014, layer: 0 },
  { x: 0.2, y: 0.48, scale: 1.55, speed: 0.022, layer: 1 },
  { x: 0.62, y: 0.42, scale: 1.75, speed: 0.025, layer: 1 },
  { x: 0.92, y: 0.56, scale: 1.35, speed: 0.02, layer: 1 },
  { x: 0.14, y: 0.78, scale: 1.9, speed: 0.036, layer: 2 },
  { x: 0.52, y: 0.82, scale: 2.1, speed: 0.04, layer: 2 },
  { x: 0.84, y: 0.74, scale: 1.8, speed: 0.034, layer: 2 },
];

export function FlightStage({
  roundId,
  phase,
  multiplier,
  countdownRemainingMs,
  countdownTotalMs,
  elapsedFlightMs,
  lastCrashPoint,
  animationsEnabled,
  maintenanceMode = false,
  currency,
  toasts,
}: FlightStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    phase,
    multiplier,
    elapsedFlightMs,
    animationsEnabled,
  });

  useEffect(() => {
    stateRef.current = { phase, multiplier, elapsedFlightMs, animationsEnabled };
  }, [phase, multiplier, elapsedFlightMs, animationsEnabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let lastTime = performance.now();
    const clouds = INITIAL_CLOUDS.map((c) => ({ ...c }));

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = parent.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    const drawStylizedCloud = (
      cx: number,
      cy: number,
      scale: number,
      fill: string,
      alpha: number
    ) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(-70, 22);
      ctx.arc(-44, 6, 26, Math.PI * 0.7, Math.PI * 1.9);
      ctx.arc(-12, -12, 34, Math.PI * 1.05, Math.PI * 1.95);
      ctx.arc(28, -4, 28, Math.PI * 1.15, Math.PI * 2.05);
      ctx.arc(54, 10, 20, Math.PI * 1.25, Math.PI * 0.4);
      ctx.lineTo(-70, 22);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const drawPlane = (
      x: number,
      y: number,
      angleRad: number,
      propellerPhase: number,
      scale: number
    ) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angleRad);
      ctx.scale(scale, scale);

      // Subtle drop shadow
      ctx.save();
      ctx.translate(4, 10);
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#0f2d56';
      ctx.beginPath();
      ctx.ellipse(0, 0, 34, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Tail fin
      ctx.fillStyle = '#b9062e';
      ctx.beginPath();
      ctx.moveTo(-26, -2);
      ctx.lineTo(-37, -18);
      ctx.lineTo(-22, -17);
      ctx.lineTo(-14, -2);
      ctx.closePath();
      ctx.fill();

      // Lower stabilizer
      ctx.fillStyle = '#8f0322';
      ctx.beginPath();
      ctx.moveTo(-30, 3);
      ctx.lineTo(-40, 8);
      ctx.lineTo(-24, 7);
      ctx.closePath();
      ctx.fill();

      // Fuselage
      const bodyGrad = ctx.createLinearGradient(-32, -12, 34, 12);
      bodyGrad.addColorStop(0, '#c80834');
      bodyGrad.addColorStop(0.55, '#ef1749');
      bodyGrad.addColorStop(1, '#ff456e');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(-32, 0);
      ctx.quadraticCurveTo(-18, -12, 18, -9);
      ctx.quadraticCurveTo(36, -6, 39, 1);
      ctx.quadraticCurveTo(36, 9, 14, 10);
      ctx.quadraticCurveTo(-18, 10, -32, 0);
      ctx.closePath();
      ctx.fill();

      // Cockpit canopy
      ctx.fillStyle = '#dff2ff';
      ctx.beginPath();
      ctx.moveTo(-2, -8);
      ctx.quadraticCurveTo(8, -16, 18, -7);
      ctx.closePath();
      ctx.fill();

      // Wing
      ctx.fillStyle = '#a30428';
      ctx.beginPath();
      ctx.moveTo(-8, 1);
      ctx.lineTo(14, -2);
      ctx.lineTo(4, 18);
      ctx.lineTo(-14, 15);
      ctx.closePath();
      ctx.fill();

      // Racing stripe
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-22, 1);
      ctx.lineTo(24, 1);
      ctx.stroke();

      // Nose cone
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(38, 1, 4.2, 0, Math.PI * 2);
      ctx.fill();

      // Spinning propeller blades
      const bladeSpan = 16 * Math.abs(Math.sin(propellerPhase)) + 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(41, 1 - bladeSpan);
      ctx.lineTo(41, 1 + bladeSpan);
      ctx.stroke();

      ctx.restore();
    };

    const render = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const { phase: curPhase, elapsedFlightMs: elapsed, animationsEnabled: anim } =
        stateRef.current;

      // Sky gradient matching reference crisp blue sky
      const skyGrad = ctx.createLinearGradient(0, 0, width * 0.4, height);
      skyGrad.addColorStop(0, '#3684eb');
      skyGrad.addColorStop(0.55, '#62abf8');
      skyGrad.addColorStop(1, '#9cd0ff');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // Large bright cloud mass on right/center like reference sky artwork
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      const bgClouds = [
        [width * 0.72, height * 0.56, Math.min(width, height) * 0.38],
        [width * 0.55, height * 0.42, Math.min(width, height) * 0.28],
        [width * 0.85, height * 0.36, Math.min(width, height) * 0.26],
        [width * 0.34, height * 0.88, Math.min(width, height) * 0.32],
      ];
      for (const [bx, by, br] of bgClouds) {
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Parallax scrolling clouds
      const speedBoost = curPhase === 'FLYING' ? 2.4 : 0.65;
      for (const cloud of clouds) {
        if (anim) {
          cloud.x -= cloud.speed * speedBoost * dt;
          if (cloud.x < -0.25) {
            cloud.x = 1.22;
          }
        }
        const cx = cloud.x * width;
        const cy = cloud.y * height;
        const fill =
          cloud.layer === 0
            ? '#dff0ff'
            : cloud.layer === 1
              ? '#eef7ff'
              : '#ffffff';
        const alpha = cloud.layer === 0 ? 0.65 : cloud.layer === 1 ? 0.82 : 0.94;
        drawStylizedCloud(cx, cy, cloud.scale * Math.max(0.7, width / 900), fill, alpha);
      }

      // Flight curve & airplane
      if (curPhase === 'FLYING') {
        const tSec = elapsed / 1000;
        const progress = 1 - Math.exp(-tSec / 4.2); // smooth approach toward upper-right
        const startX = width * 0.08;
        const startY = height * 0.86;
        const targetX = width * (0.14 + progress * 0.68);
        const bob = anim ? Math.sin(tSec * 3.1) * 8 : 0;
        const targetY = height * (0.82 - progress * 0.54) + bob;

        const ctrlX = startX + (targetX - startX) * 0.55;
        const ctrlY = startY + (targetY - startY) * 0.14;

        // Subtle luminous area under flight path
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(ctrlX, ctrlY, targetX, targetY);
        ctx.lineTo(targetX, height);
        ctx.lineTo(startX, height);
        ctx.closePath();
        const areaGrad = ctx.createLinearGradient(0, targetY, 0, height);
        areaGrad.addColorStop(0, 'rgba(229, 5, 57, 0.22)');
        areaGrad.addColorStop(1, 'rgba(229, 5, 57, 0.02)');
        ctx.fillStyle = areaGrad;
        ctx.fill();

        // Flight trail curve
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(ctrlX, ctrlY, targetX, targetY);
        ctx.strokeStyle = '#e50539';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();

        // Tangent angle at end of quadratic bezier
        const dx = targetX - ctrlX;
        const dy = targetY - ctrlY;
        const rawAngle = Math.atan2(dy, dx);
        const clampedAngle = Math.max(-0.48, Math.min(-0.08, rawAngle));

        drawPlane(
          targetX,
          targetY,
          clampedAngle,
          now * 0.035,
          Math.max(0.75, Math.min(1.15, width / 760))
        );
      } else if (curPhase === 'COUNTDOWN') {
        // Plane parked on lower-left runway ready for takeoff
        drawPlane(
          width * 0.1,
          height * 0.84,
          -0.08,
          now * 0.015,
          Math.max(0.75, Math.min(1.1, width / 780))
        );
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      observer.disconnect();
    };
  }, []);

  const countdownProgress =
    countdownTotalMs > 0
      ? Math.max(0, Math.min(100, (countdownRemainingMs / countdownTotalMs) * 100))
      : 0;

  return (
    <div className="relative flex-1 min-h-[260px] sm:min-h-[320px] lg:min-h-[360px] rounded-2xl overflow-hidden border border-[#242632] shadow-lg select-none">
      {/* Sky & Flight Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* Subtle Round Indicator Badge */}
      <div className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/25 backdrop-blur-sm text-white text-[11px] font-medium">
        <span>Ronda #{roundId}</span>
      </div>

      {/* Central Overlay: Multiplier / Countdown / Crash / Maintenance */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none px-4 text-center">
        {maintenanceMode && phase === 'COUNTDOWN' ? (
          <div className="flex flex-col items-center gap-2 bg-[#161822]/92 backdrop-blur-md px-6 py-4 rounded-2xl border border-amber-400/50 shadow-xl text-white">
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
              Manutenção Programada
            </span>
            <span className="text-sm font-semibold">
              As rondas estão temporariamente pausadas pelo administrador.
            </span>
          </div>
        ) : phase === 'COUNTDOWN' && (
          <div className="flex flex-col items-center gap-3 bg-white/65 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/70 shadow-lg">
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#172133]">
              A aguardar próxima descolagem
            </span>
            <div className="text-3xl sm:text-4xl font-black text-black font-mono tabular-nums">
              {(countdownRemainingMs / 1000).toFixed(1)}s
            </div>
            <div className="w-48 sm:w-56 h-2 rounded-full bg-[#cbdcf2] overflow-hidden">
              <div
                className="h-full bg-[#e50539] transition-[width] duration-75"
                style={{ width: `${countdownProgress}%` }}
              />
            </div>
          </div>
        )}

        {phase === 'FLYING' && (
          <div className="flex flex-col items-center">
            <div className="text-[54px] sm:text-[68px] md:text-[78px] font-black text-black tracking-tight leading-none font-mono tabular-nums drop-shadow-[0_2px_10px_rgba(255,255,255,0.75)]">
              {multiplier.toFixed(2)}x
            </div>
          </div>
        )}

        {phase === 'CRASHED' && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center gap-1 bg-white/75 backdrop-blur-md px-6 py-4 rounded-2xl border border-[#e50539]/35 shadow-xl"
          >
            <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[#c80432]">
              Voou para longe!
            </span>
            <div className="text-[48px] sm:text-[62px] font-black text-[#e50539] tracking-tight leading-none font-mono tabular-nums">
              {(lastCrashPoint ?? multiplier).toFixed(2)}x
            </div>
          </motion.div>
        )}
      </div>

      {/* Win / Loss Toast Stack */}
      <div className="absolute top-3 right-3 z-20 flex flex-col gap-2 max-w-[270px] pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 24, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.95 }}
              className={`px-3 py-2 rounded-xl border shadow-xl flex items-center gap-2.5 text-white ${
                toast.type === 'win'
                  ? 'bg-[#102d13] border-[#36b51a]'
                  : toast.type === 'loss'
                    ? 'bg-[#311119] border-[#e50539]'
                    : 'bg-[#14161f] border-[#393d50]'
              }`}
            >
              {toast.type === 'win' ? (
                <CheckCircle2 className="w-4 h-4 text-[#5cf243] shrink-0" />
              ) : toast.type === 'loss' ? (
                <XCircle className="w-4 h-4 text-[#ff6685] shrink-0" />
              ) : (
                <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-[12px] font-bold leading-tight truncate">
                  {toast.title}
                </div>
                {toast.subtitle && (
                  <div className="text-[11px] text-white/85 font-mono leading-tight mt-0.5">
                    {toast.subtitle}
                    {toast.amount !== undefined && ` (${formatMoney(toast.amount)} ${currency})`}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
