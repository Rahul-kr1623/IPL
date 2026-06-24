import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import {
  Bot, Users, Shuffle, Copy, Check, ArrowLeft, Play,
  RotateCcw, ChevronRight, Trophy, Zap, Target, Activity
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const W = 500, H = 340;
const PITCH_TOP = 45, PITCH_BOT = H - 40, PITCH_CX = W / 2, PITCH_W = 64;
const BAT_CY = PITCH_BOT - 10;
const BOWL_CY = PITCH_TOP + 18;

const OVER_OPTIONS = [
  { label: '1 Over',  value: 1 },
  { label: '2 Overs', value: 2 },
  { label: '5 Overs', value: 5 },
  { label: '10 Overs',value: 10 },
];
const DIFFICULTIES = [
  { label: 'Easy',   value: 'easy',   color: '#22c55e', desc: 'Forgiving timing, loose bot bowling' },
  { label: 'Normal', value: 'normal', color: '#0ea5e9', desc: 'Balanced challenge' },
  { label: 'Hard',   value: 'hard',   color: '#f97316', desc: 'Tight windows, accurate bot' },
  { label: 'Legend', value: 'legend', color: '#f43f5e', desc: 'Elite difficulty — good luck' },
];

// ─── PURE HELPERS (outside component — no stale closure issues) ───────────────
const mkInnings = () => ({
  runs: 0, wickets: 0, balls: 0, extras: 0, ballLog: [],
  batsmen: [
    { name: 'Opener 1', runs: 0, balls: 0, out: false },
    { name: 'Opener 2', runs: 0, balls: 0, out: false },
  ],
  activeBat: 0,
  partnerships: [],
});

const mkGame = (totalOvers) => ({
  totalOvers,
  innings: 1,
  phase: 'toss',   // toss | batting | innings_break | result
  target: null,
  inn1: mkInnings(),
  inn2: mkInnings(),
  toss: null,       // { winner: 'player'|'bot', choice: 'bat'|'bowl' }
  playerBatsIn: null, // 1 | 2
});

const curInn = (g) => (g.innings === 1 ? g.inn1 : g.inn2);

const TIMING_WINDOWS = {
  easy:   { perfect: 0.28, good: 0.50, edge: 0.70 },
  normal: { perfect: 0.16, good: 0.34, edge: 0.56 },
  hard:   { perfect: 0.10, good: 0.24, edge: 0.48 },
  legend: { perfect: 0.06, good: 0.16, edge: 0.38 },
};
const BOWL_WINDOWS = {
  easy:   { perfect: 0.35, good: 0.60 },
  normal: { perfect: 0.22, good: 0.45 },
  hard:   { perfect: 0.14, good: 0.32 },
  legend: { perfect: 0.08, good: 0.22 },
};

// Returns { runs, wicket, wide, noball, label, quality }
const resolveBall = (batTiming, bowlAccuracy, difficulty, isBotBatting) => {
  const w = TIMING_WINDOWS[difficulty] || TIMING_WINDOWS.normal;
  const bw = BOWL_WINDOWS[difficulty] || BOWL_WINDOWS.normal;

  // Wide / no-ball based on bowl accuracy
  const bowlDiff = Math.abs(bowlAccuracy - 0.5);
  if (!isBotBatting && bowlDiff > 0.42) return { runs: 1, wide: true, label: 'WD', quality: 'wide' };
  if (!isBotBatting && bowlDiff > 0.38 && Math.random() < 0.3) return { runs: 1, noball: true, label: 'NB', quality: 'noball' };

  // Good bowl bonus — tighter timing needed
  const bowlBonus = bowlDiff < bw.perfect ? 0.08 : bowlDiff < bw.good ? 0.03 : 0;
  const batDiff = Math.abs(batTiming - 0.5) + bowlBonus;

  if (batDiff < w.perfect) {
    const r = Math.random();
    if (r < 0.14) return { runs: 6, label: '6', quality: 'perfect' };
    if (r < 0.35) return { runs: 4, label: '4', quality: 'perfect' };
    if (r < 0.52) return { runs: 3, label: '3', quality: 'perfect' };
    if (r < 0.75) return { runs: 2, label: '2', quality: 'perfect' };
    return { runs: 1, label: '1', quality: 'perfect' };
  }
  if (batDiff < w.good) {
    const r = Math.random();
    if (r < 0.07) return { runs: 6, label: '6', quality: 'good' };
    if (r < 0.20) return { runs: 4, label: '4', quality: 'good' };
    if (r < 0.42) return { runs: 2, label: '2', quality: 'good' };
    if (r < 0.72) return { runs: 1, label: '1', quality: 'good' };
    return { runs: 0, label: '·', quality: 'good' };
  }
  if (batDiff < w.edge) {
    const r = Math.random();
    if (r < 0.28) return { runs: 0, wicket: true, label: 'W', quality: 'edge' };
    if (r < 0.44) return { runs: 4, label: '4', quality: 'edge' };
    return { runs: 0, label: '·', quality: 'edge' };
  }
  // Mishit zone
  if (Math.random() < 0.62) return { runs: 0, wicket: true, label: 'W', quality: 'miss' };
  return { runs: 0, label: '·', quality: 'miss' };
};

// Apply result to a cloned game, returns new game + inningsOver flag
const applyResult = (g, result) => {
  const ng = JSON.parse(JSON.stringify(g));
  const inn = curInn(ng);
  const legal = !result.wide && !result.noball;

  inn.runs += result.runs;
  if (!legal) { inn.extras++; return { ng, inningsOver: false }; }

  inn.balls++;
  const bat = inn.batsmen[inn.activeBat];
  bat.runs  += result.runs;
  bat.balls++;

  if (result.wicket) {
    bat.out = true;
    inn.wickets++;
    // New batter
    const newIdx = inn.batsmen.length;
    inn.batsmen.push({ name: `Batter ${newIdx + 1}`, runs: 0, balls: 0, out: false });
    inn.activeBat = newIdx;
  } else if (result.runs % 2 === 1) {
    // Swap strike
    const nonStriker = inn.batsmen.findIndex((b, i) => i !== inn.activeBat && !b.out);
    if (nonStriker !== -1) inn.activeBat = nonStriker;
  }

  inn.ballLog = [...inn.ballLog, result.label];

  const oversUp = Math.floor(inn.balls / 6) >= ng.totalOvers;
  const allOut  = inn.wickets >= 10;
  return { ng, inningsOver: oversUp || allOut };
};

// Bot batting timing — smarter with pressure
const botTiming = (difficulty, target, runs, balls, totalOvers) => {
  const noise = { easy: 0.55, normal: 0.38, hard: 0.24, legend: 0.14 }[difficulty] || 0.38;
  const pressureFactor = target
    ? Math.min(0.12, (target - runs) / Math.max(1, totalOvers * 6 - balls) > 1.5 ? 0.12 : 0)
    : 0;
  return Math.max(0, Math.min(1, 0.5 + (Math.random() - 0.5) * noise + pressureFactor));
};

// Bot bowling accuracy — harder bot = more accurate
const botBowlAccuracy = (difficulty) => {
  const center = 0.5;
  const spread = { easy: 0.28, normal: 0.18, hard: 0.10, legend: 0.06 }[difficulty] || 0.18;
  return Math.max(0, Math.min(1, center + (Math.random() - 0.5) * spread));
};

// ─── CANVAS COMPONENT ─────────────────────────────────────────────────────────
const CricketCanvas = ({ role, phase, onAction, lastResult, inningsBreak }) => {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const s         = useRef({
    // ball
    bx: PITCH_CX, by: BOWL_CY, bvx: 0, bvy: 0, ballLive: false,
    // result overlay
    flashLabel: '', flashColor: '#fff', flashTimer: 0,
    // particles
    particles: [],
    // bat swing
    batAngle: 0, batTarget: 0,
    // power bar (batting)
    power: 0, powerDir: 1,
    // bowl meter (bowling) — oscillates left-right on pitch
    bowlX: PITCH_CX, bowlDir: 1,
    // timing flash
    qualityLabel: '', qualityTimer: 0,
  }).current;

  // When result comes in, animate
  useEffect(() => {
    if (!lastResult) return;
    // Launch ball
    s.bx = PITCH_CX + (Math.random() - 0.5) * 8;
    s.by = BOWL_CY;
    s.bvx = (Math.random() - 0.5) * 2.2;
    s.bvy = 4.2;
    s.ballLive = true;
    // Flash label
    const r = lastResult;
    s.flashLabel = r.wicket ? 'OUT!' : r.wide ? 'WIDE' : r.noball ? 'NO BALL'
      : r.runs === 6 ? 'SIX!' : r.runs === 4 ? 'FOUR!'
      : r.runs === 3 ? 'THREE' : r.runs === 2 ? 'TWO'
      : r.runs === 1 ? 'ONE' : 'DOT';
    s.flashColor = r.wicket ? '#ef4444' : r.runs === 6 ? '#f59e0b'
      : r.runs === 4 ? '#22c55e' : r.wide || r.noball ? '#a855f7' : '#94a3b8';
    s.flashTimer = 100;
    // Quality label
    s.qualityLabel = { perfect: '✦ Perfect timing', good: '● Good', edge: '○ Edge', miss: '✕ Missed', wide: 'Wide', noball: 'No Ball' }[r.quality] || '';
    s.qualityTimer = 80;
    // Particles
    if (r.runs >= 4 || r.wicket) {
      s.particles = Array.from({ length: r.runs >= 4 ? 22 : 14 }, () => ({
        x: PITCH_CX + (Math.random() - 0.5) * 50,
        y: BAT_CY - 20,
        vx: (Math.random() - 0.5) * 7,
        vy: -(Math.random() * 5 + 2),
        life: 1,
        color: r.wicket ? '#ef4444' : r.runs === 6 ? `hsl(${30 + Math.random()*40},100%,60%)` : '#22c55e',
        size: 2 + Math.random() * 3,
      }));
    }
    // Bat swing
    s.batTarget = r.wicket ? -1.1 : r.runs >= 4 ? -0.9 : r.runs > 0 ? -0.6 : 0.1;
    setTimeout(() => { s.batTarget = 0.15; }, 400);
  }, [lastResult]);

  // Main loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // ── Sky / outfield gradient ──
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0d1b12');
      sky.addColorStop(1, '#1a3524');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Field circles (decorative)
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      [80, 140, 200].forEach(r => {
        ctx.beginPath();
        ctx.ellipse(PITCH_CX, H / 2, r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
      });

      // ── Pitch ──
      const pg = ctx.createLinearGradient(PITCH_CX - PITCH_W/2, 0, PITCH_CX + PITCH_W/2, 0);
      pg.addColorStop(0, '#8b6320');
      pg.addColorStop(0.5, '#c8922a');
      pg.addColorStop(1, '#8b6320');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.roundRect(PITCH_CX - PITCH_W/2, PITCH_TOP, PITCH_W, PITCH_BOT - PITCH_TOP, 4);
      ctx.fill();

      // Wear cracks
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(PITCH_CX - 18 + Math.sin(i) * 12, PITCH_TOP + 55 + i * 24);
        ctx.lineTo(PITCH_CX + 14 + Math.cos(i) * 8, PITCH_TOP + 65 + i * 24);
        ctx.stroke();
      }

      // ── Crease lines ──
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      // Batting crease
      ctx.beginPath();
      ctx.moveTo(PITCH_CX - PITCH_W/2 - 10, PITCH_BOT - 22);
      ctx.lineTo(PITCH_CX + PITCH_W/2 + 10, PITCH_BOT - 22);
      ctx.stroke();
      // Bowling crease
      ctx.beginPath();
      ctx.moveTo(PITCH_CX - PITCH_W/2 - 10, PITCH_TOP + 22);
      ctx.lineTo(PITCH_CX + PITCH_W/2 + 10, PITCH_TOP + 22);
      ctx.stroke();
      // Return creases
      [PITCH_CX - PITCH_W/2, PITCH_CX + PITCH_W/2].forEach(x => {
        ctx.beginPath();
        ctx.moveTo(x, PITCH_BOT - 22); ctx.lineTo(x, PITCH_BOT - 22 - 28);
        ctx.moveTo(x, PITCH_TOP + 22); ctx.lineTo(x, PITCH_TOP + 22 + 28);
        ctx.stroke();
      });

      // ── Stumps ──
      const drawStumps = (cx, cy) => {
        [-9, 0, 9].forEach(dx => {
          ctx.fillStyle = '#f1f5f9';
          ctx.fillRect(cx + dx - 1.5, cy - 26, 3, 26);
        });
        // Bails
        ctx.fillStyle = '#fde68a';
        ctx.fillRect(cx - 9, cy - 27.5, 7, 2.5);
        ctx.fillRect(cx + 2, cy - 27.5, 7, 2.5);
      };
      drawStumps(PITCH_CX, PITCH_BOT - 22); // batter end
      drawStumps(PITCH_CX, PITCH_TOP + 22); // bowler end

      // ── Ball ──
      if (s.ballLive) {
        s.bx += s.bvx;
        s.by += s.bvy;
        // Pitch bounce near batting crease area
        if (s.by > PITCH_BOT - 90 && s.by < PITCH_BOT - 75 && s.bvy > 0) {
          s.bvy *= -0.48;
          s.bvx += (Math.random() - 0.5) * 1.0;
          s.bvx *= 0.9;
        }
        if (s.by > H + 30) s.ballLive = false;

        // Shadow on pitch
        const prog = Math.max(0, (s.by - BOWL_CY) / (BAT_CY - BOWL_CY));
        ctx.fillStyle = `rgba(0,0,0,${0.25 * prog})`;
        ctx.beginPath();
        ctx.ellipse(s.bx, PITCH_BOT - 20, 9 * prog, 3 * prog, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ball gradient
        const bg = ctx.createRadialGradient(s.bx - 2.5, s.by - 2.5, 1, s.bx, s.by, 9);
        bg.addColorStop(0, '#fff');
        bg.addColorStop(0.3, '#dc2626');
        bg.addColorStop(1, '#7f1d1d');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(s.bx, s.by, 9, 0, Math.PI * 2);
        ctx.fill();
        // Seam
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(s.bx, s.by, 7.5, 0.4, Math.PI - 0.4);
        ctx.stroke();
      } else if (!s.flashTimer) {
        // Idle ball at bowler end
        const bg = ctx.createRadialGradient(PITCH_CX - 2, BOWL_CY - 2, 1, PITCH_CX, BOWL_CY, 8);
        bg.addColorStop(0, '#fff');
        bg.addColorStop(0.3, '#dc2626');
        bg.addColorStop(1, '#7f1d1d');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(PITCH_CX, BOWL_CY, 8, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Particles ──
      s.particles = s.particles.filter(p => p.life > 0.02);
      s.particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life -= 0.028;
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // ── Bat ──
      s.batAngle += (s.batTarget - s.batAngle) * 0.18;
      ctx.save();
      ctx.translate(PITCH_CX, BAT_CY);
      ctx.rotate(s.batAngle);
      // Handle
      const hg = ctx.createLinearGradient(-3, -52, 3, -36);
      hg.addColorStop(0, '#9ca3af');
      hg.addColorStop(1, '#6b7280');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.roundRect(-3, -52, 6, 18, 2);
      ctx.fill();
      // Blade
      const bladeg = ctx.createLinearGradient(-5, -36, 5, 10);
      bladeg.addColorStop(0, '#fde68a');
      bladeg.addColorStop(0.4, '#f59e0b');
      bladeg.addColorStop(1, '#d97706');
      ctx.fillStyle = bladeg;
      ctx.beginPath();
      ctx.roundRect(-5, -36, 11, 46, 3);
      ctx.fill();
      // Grain lines
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 0.8;
      [-3, 0, 3].forEach(x => {
        ctx.beginPath();
        ctx.moveTo(x, -34); ctx.lineTo(x, 8);
        ctx.stroke();
      });
      ctx.restore();

      // ── Power bar (BATTING) ──
      if (phase === 'batting' && role === 'bat' && !s.ballLive && !s.flashTimer) {
        s.power += s.powerDir * 0.022;
        if (s.power >= 1) s.powerDir = -1;
        if (s.power <= 0) s.powerDir = 1;

        const bx = 16, by = H/2 - 70, bw = 14, bh = 140;
        // Track bg
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 5); ctx.fill();
        // Fill
        const fill = s.power * bh;
        const pg2 = ctx.createLinearGradient(0, by + bh, 0, by);
        pg2.addColorStop(0, '#22c55e');
        pg2.addColorStop(0.45, '#eab308');
        pg2.addColorStop(0.75, '#f97316');
        pg2.addColorStop(1, '#ef4444');
        ctx.fillStyle = pg2;
        ctx.beginPath(); ctx.roundRect(bx, by + bh - fill, bw, fill, 5); ctx.fill();
        // Needle marker
        ctx.fillStyle = '#fff';
        ctx.fillRect(bx - 3, by + bh - fill - 2, bw + 6, 3);
        // Labels
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PWR', bx + bw/2, by - 5);
        ctx.fillText('TAP', bx + bw/2, by + bh + 14);
        ctx.textAlign = 'left';
      }

      // ── Bowl targeting cursor (BOWLING) ──
      if (phase === 'batting' && role === 'bowl' && !s.ballLive && !s.flashTimer) {
        const speed = { easy: 1.4, normal: 2.2, hard: 3.2, legend: 4.2 }[window.__difficulty__] || 2.2;
        s.bowlX += s.bowlDir * speed;
        const minX = PITCH_CX - PITCH_W/2 - 18;
        const maxX = PITCH_CX + PITCH_W/2 + 18;
        if (s.bowlX > maxX) s.bowlDir = -1;
        if (s.bowlX < minX) s.bowlDir = 1;

        // Target zone on pitch
        const tz = PITCH_W * 0.55;
        ctx.fillStyle = 'rgba(14,165,233,0.12)';
        ctx.beginPath(); ctx.roundRect(PITCH_CX - tz/2, PITCH_BOT - 80, tz, 30, 4); ctx.fill();
        ctx.strokeStyle = 'rgba(14,165,233,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(PITCH_CX - tz/2, PITCH_BOT - 80, tz, 30, 4); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GOOD LENGTH', PITCH_CX, PITCH_BOT - 60);
        ctx.textAlign = 'left';

        // Moving cursor ball (aim indicator)
        const cursorG = ctx.createRadialGradient(s.bowlX, BOWL_CY + 12, 1, s.bowlX, BOWL_CY + 12, 10);
        cursorG.addColorStop(0, 'rgba(14,165,233,0.9)');
        cursorG.addColorStop(1, 'rgba(14,165,233,0)');
        ctx.fillStyle = cursorG;
        ctx.beginPath(); ctx.arc(s.bowlX, BOWL_CY + 12, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0ea5e9';
        ctx.beginPath(); ctx.arc(s.bowlX, BOWL_CY + 12, 5, 0, Math.PI * 2); ctx.fill();

        // Vertical aim line
        ctx.strokeStyle = 'rgba(14,165,233,0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(s.bowlX, BOWL_CY + 20);
        ctx.lineTo(s.bowlX, PITCH_BOT - 22);
        ctx.stroke();
        ctx.setLineDash([]);

        // Accuracy label
        const inZone = Math.abs(s.bowlX - PITCH_CX) < PITCH_W * 0.3;
        ctx.fillStyle = inZone ? '#22c55e' : '#f97316';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(inZone ? '✓ ON TARGET' : '⚠ WIDE', PITCH_CX, H - 12);
        ctx.fillText('TAP TO BOWL', PITCH_CX, H - 2);
        ctx.textAlign = 'left';
      }

      // ── Result flash ──
      if (s.flashTimer > 0) {
        s.flashTimer--;
        const a = Math.min(1, s.flashTimer / 18);
        ctx.globalAlpha = a;
        const fs = (s.flashLabel.includes('!') || s.flashLabel === 'OUT!') ? 42 : 28;
        ctx.font = `900 ${fs}px 'Arial Black', sans-serif`;
        ctx.textAlign = 'center';
        ctx.shadowColor = s.flashColor;
        ctx.shadowBlur = 28;
        ctx.fillStyle = s.flashColor;
        ctx.fillText(s.flashLabel, W / 2, H / 2 - 8);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
      }

      // ── Quality timing label ──
      if (s.qualityTimer > 0) {
        s.qualityTimer--;
        ctx.globalAlpha = Math.min(1, s.qualityTimer / 15);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(s.qualityLabel, W / 2, H / 2 + 20);
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [role, phase, lastResult]);

  const handleTap = () => {
    if (phase !== 'batting') return;
    if (role === 'bat') {
      onAction(s.power); // timing 0-1
    } else if (role === 'bowl') {
      // Convert bowl cursor X to accuracy 0-1 (0.5 = perfect center)
      const accuracy = (s.bowlX - (PITCH_CX - PITCH_W/2 - 18)) / (PITCH_W + 36);
      onAction(Math.max(0, Math.min(1, accuracy)));
    }
  };

  return (
    <div className="relative w-full max-w-[500px] mx-auto select-none">
      <canvas
        ref={canvasRef}
        width={W} height={H}
        onClick={handleTap}
        onTouchEnd={e => { e.preventDefault(); handleTap(); }}
        className={`w-full rounded-2xl border border-white/10 shadow-[0_8px_40px_rgba(0,0,0,0.6)]
          ${phase === 'batting' ? 'cursor-pointer active:scale-[0.99]' : 'cursor-default'} transition-transform`}
      />
      {/* Role badge */}
      <div className={`absolute top-3 right-3 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border
        ${role === 'bat' ? 'bg-yellow-400/15 border-yellow-400/40 text-yellow-300' : 'bg-ipl-neon/15 border-ipl-neon/40 text-ipl-neon'}`}>
        {role === 'bat' ? '🏏 Batting' : '🎯 Bowling'}
      </div>
    </div>
  );
};

// ─── SCOREBOARD ───────────────────────────────────────────────────────────────
const Scoreboard = ({ game }) => {
  const inn   = curInn(game);
  const balls = inn.balls;
  const ovsStr = `${Math.floor(balls / 6)}.${balls % 6}`;
  const crr   = balls > 0 ? (inn.runs / (balls / 6)).toFixed(2) : '0.00';
  const isChasing = game.innings === 2 && game.target;
  const rrr = isChasing
    ? ((game.target - inn.runs) / Math.max(0.01, (game.totalOvers * 6 - balls) / 6)).toFixed(2)
    : null;
  const needed = isChasing ? game.target - inn.runs : null;
  const ballsLeft = isChasing ? game.totalOvers * 6 - balls : null;
  const recentBalls = inn.ballLog.slice(-6);
  const striker = inn.batsmen[inn.activeBat];
  const nonStrikerIdx = inn.batsmen.findIndex((b, i) => i !== inn.activeBat && !b.out);
  const nonStriker = nonStrikerIdx !== -1 ? inn.batsmen[nonStrikerIdx] : null;

  return (
    <div className="space-y-3">
      {/* Main score */}
      <div className="glass bg-white/5 border border-white/10 rounded-2xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-end gap-2">
              <span className="text-6xl font-black tracking-tighter text-white leading-none">{inn.runs}</span>
              <span className="text-3xl font-black text-gray-500 leading-none mb-1">/{inn.wickets}</span>
            </div>
            <p className="text-[10px] text-gray-500 font-mono mt-1.5 uppercase tracking-widest">
              {ovsStr} / {game.totalOvers}.0 overs · Innings {game.innings}
            </p>
          </div>
          <div className="text-right space-y-1">
            {isChasing && (
              <>
                <p className="text-xs font-black text-ipl-neon">Target: {game.target}</p>
                <p className="text-[10px] font-bold text-gray-300">
                  Need {Math.max(0, needed)} off {Math.max(0, ballsLeft)} balls
                </p>
                <p className="text-[9px] font-mono text-ipl-accent">RRR: {rrr}</p>
              </>
            )}
            <p className="text-[9px] font-mono text-gray-500">CRR: {crr}</p>
          </div>
        </div>

        {/* Recent balls */}
        <div className="flex items-center gap-1.5 mt-4">
          <span className="text-[8px] text-gray-600 font-black uppercase tracking-widest w-12">Last 6:</span>
          <div className="flex gap-1">
            {(recentBalls.length ? recentBalls : ['·','·','·','·','·','·']).slice(-6).map((b, i) => (
              <div key={i}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black border transition-all
                  ${b === 'W'  ? 'bg-red-500/25 border-red-500/50 text-red-300'
                  : b === '6'  ? 'bg-yellow-400/25 border-yellow-400/50 text-yellow-200'
                  : b === '4'  ? 'bg-green-500/25 border-green-500/50 text-green-300'
                  : b === 'WD'||b==='NB' ? 'bg-purple-500/25 border-purple-500/50 text-purple-300'
                  : b === '·'  ? 'bg-white/5 border-white/10 text-gray-600'
                  : 'bg-blue-500/15 border-blue-500/30 text-blue-300'}`}
              >{b}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Batsmen */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { bat: striker, label: '🏏 Strike' },
          { bat: nonStriker, label: '○ Non-Strike' },
        ].map(({ bat, label }, i) => bat && (
          <div key={i} className={`glass border rounded-xl px-4 py-2.5 ${i === 0 ? 'border-yellow-400/30 bg-yellow-400/5' : 'border-white/10 bg-white/5'}`}>
            <p className={`text-[8px] font-black uppercase tracking-widest mb-0.5 ${i === 0 ? 'text-yellow-400' : 'text-gray-600'}`}>{label}</p>
            <div className="flex justify-between items-center">
              <span className="text-xs font-black text-white truncate">{bat.name}</span>
              <span className="text-[10px] font-mono text-gray-300 ml-2">{bat.runs}({bat.balls})</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── TOSS SCREEN ──────────────────────────────────────────────────────────────
const TossScreen = ({ onTossComplete }) => {
  const [step, setStep] = useState('call');      // call | flipping | result | choice
  const [call, setCall] = useState(null);
  const [result, setResult] = useState(null);
  const [won, setWon] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const doFlip = (choice) => {
    setCall(choice);
    setStep('flipping');
    setSpinning(true);
    setTimeout(() => {
      const flip = Math.random() < 0.5 ? 'heads' : 'tails';
      const playerWon = flip === choice;
      setResult(flip);
      setWon(playerWon);
      setSpinning(false);
      setStep(playerWon ? 'choice' : 'result_lost');
    }, 1800);
  };

  const doChoice = (choice) => {
    // choice: 'bat' | 'bowl'
    onTossComplete({ playerWon: true, playerChoice: choice, playerBatsIn: choice === 'bat' ? 1 : 2 });
  };

  return (
    <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}}
      className="max-w-sm mx-auto text-center space-y-8 py-10">
      <div>
        <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">
          The <span className="text-ipl-neon">Toss</span>
        </h2>
        <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-2">
          Call it in the air
        </p>
      </div>

      {/* Coin */}
      <div className="relative flex justify-center">
        <motion.div
          animate={spinning ? { rotateY: [0, 360, 720, 1080] } : {}}
          transition={{ duration: 1.8, ease: 'easeOut' }}
          className="w-28 h-28 rounded-full flex items-center justify-center text-6xl shadow-[0_0_40px_rgba(14,165,233,0.3)] border-2 border-ipl-neon/30"
          style={{ background: 'radial-gradient(circle at 40% 35%, #f59e0b, #92400e)' }}
        >
          {spinning ? '🪙' : result === 'heads' ? '👑' : result === 'tails' ? '🦅' : '🪙'}
        </motion.div>
      </div>

      {step === 'call' && (
        <div className="space-y-4">
          <p className="text-sm font-bold text-gray-400">Choose heads or tails:</p>
          <div className="flex gap-4 justify-center">
            {[
              { id:'heads', emoji:'👑', label:'Heads' },
              { id:'tails', emoji:'🦅', label:'Tails' },
            ].map(opt => (
              <motion.button key={opt.id}
                whileHover={{ scale: 1.06, y: -3 }} whileTap={{ scale: 0.95 }}
                onClick={() => doFlip(opt.id)}
                className="flex flex-col items-center gap-2 px-8 py-5 glass border border-white/10 rounded-2xl hover:border-ipl-neon/40 hover:bg-ipl-neon/5 transition-all group"
              >
                <span className="text-4xl">{opt.emoji}</span>
                <span className="font-black uppercase tracking-widest text-sm text-gray-300 group-hover:text-white">{opt.label}</span>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {step === 'flipping' && (
        <div className="space-y-3">
          <p className="text-ipl-neon font-black uppercase tracking-widest animate-pulse">Flipping…</p>
          <p className="text-gray-500 text-sm">You called: <span className="text-white font-black">{call}</span></p>
        </div>
      )}

      {step === 'choice' && (
        <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="space-y-5">
          <div className="glass bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
            <p className="text-green-400 font-black text-lg">🎉 You won the toss!</p>
            <p className="text-gray-400 text-sm mt-1">It was <span className="text-white font-black">{result}</span> — your call!</p>
          </div>
          <p className="text-sm font-bold text-gray-400">What do you choose?</p>
          <div className="flex gap-4 justify-center">
            {[
              { id:'bat', emoji:'🏏', label:'Bat First', desc:'Set the target' },
              { id:'bowl', emoji:'🎯', label:'Bowl First', desc:'Chase the target' },
            ].map(opt => (
              <motion.button key={opt.id}
                whileHover={{ scale: 1.05, y: -3 }} whileTap={{ scale: 0.95 }}
                onClick={() => doChoice(opt.id)}
                className="flex-1 flex flex-col items-center gap-2 px-5 py-5 glass border border-white/10 rounded-2xl hover:border-ipl-neon/40 hover:bg-ipl-neon/5 transition-all"
              >
                <span className="text-3xl">{opt.emoji}</span>
                <span className="font-black uppercase tracking-tight text-white text-sm">{opt.label}</span>
                <span className="text-[9px] text-gray-500 font-bold">{opt.desc}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {step === 'result_lost' && (
        <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="space-y-5">
          <div className="glass bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
            <p className="text-red-400 font-black text-lg">Bot won the toss!</p>
            <p className="text-gray-400 text-sm mt-1">
              It was <span className="text-white font-black">{result}</span> — you called {call}.
            </p>
          </div>
          <div className="glass bg-white/5 border border-white/10 rounded-2xl p-4">
            <p className="text-gray-400 text-sm font-bold">Bot chose to <span className="text-ipl-neon font-black">bat first</span></p>
            <p className="text-[9px] text-gray-600 mt-1">You will bowl first, then chase.</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => onTossComplete({ playerWon: false, playerBatsIn: 2 })}
            className="w-full py-4 bg-ipl-neon text-black font-black uppercase tracking-widest rounded-2xl shadow-[0_0_20px_#0ea5e9]"
          >
            <Play className="w-4 h-4 inline mr-2" /> Start Bowling
          </motion.button>
        </motion.div>
      )}
    </motion.div>
  );
};

// ─── INNINGS BREAK SCREEN ─────────────────────────────────────────────────────
const InningsBreak = ({ game, playerBatsIn, onContinue }) => {
  const [countdown, setCountdown] = useState(5);
  useEffect(() => {
    const id = setInterval(() => setCountdown(c => { if (c <= 1) { clearInterval(id); onContinue(); } return c - 1; }), 1000);
    return () => clearInterval(id);
  }, []);

  const inn1 = game.inn1;
  const playerBatted1st = playerBatsIn === 1;
  const needing = game.target;

  return (
    <motion.div initial={{opacity:0,scale:0.9}} animate={{opacity:1,scale:1}}
      className="max-w-sm mx-auto text-center space-y-6 py-10">
      <div className="text-5xl">🏏</div>
      <div>
        <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white">
          Innings <span className="text-ipl-neon">Break</span>
        </h2>
        <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-2">1st innings complete</p>
      </div>

      <div className="glass bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-gray-400 font-bold text-sm">{playerBatted1st ? 'You scored' : 'Bot scored'}</span>
          <span className="text-2xl font-black text-white">{inn1.runs}/{inn1.wickets}</span>
        </div>
        <div className="h-px bg-white/10" />
        <div className="flex justify-between items-center">
          <span className="text-ipl-neon font-black uppercase tracking-widest text-xs">Target</span>
          <span className="text-3xl font-black text-ipl-neon">{needing}</span>
        </div>
        <p className="text-[10px] text-gray-500 font-bold">
          {playerBatted1st ? 'Bot needs' : 'You need'} {needing} in {game.totalOvers} overs
        </p>
      </div>

      <div className="w-16 h-16 rounded-full bg-ipl-neon/10 border border-ipl-neon/30 flex items-center justify-center mx-auto">
        <span className="text-2xl font-black text-ipl-neon">{countdown}</span>
      </div>

      <button onClick={onContinue}
        className="w-full py-4 bg-ipl-neon text-black font-black uppercase tracking-widest rounded-2xl">
        Continue Now
      </button>
    </motion.div>
  );
};

// ─── MAIN GAME PAGE ───────────────────────────────────────────────────────────
export default function CricketGame() {
  const [screen,     setScreen]     = useState('menu');
  const [mode,       setMode]       = useState(null);
  const [overs,      setOvers]      = useState(2);
  const [difficulty, setDifficulty] = useState('normal');
  const [playerName, setPlayerName] = useState('You');

  // Bot game state
  const [game,         setGame]         = useState(null);
  const [playerBatsIn, setPlayerBatsIn] = useState(null); // 1 | 2
  const [role,         setRole]         = useState(null); // 'bat' | 'bowl'
  const [lastResult,   setLastResult]   = useState(null);
  const [resultData,   setResultData]   = useState(null);
  const [awaitingBotBowl, setAwaitingBotBowl] = useState(false);

  // Multiplayer
  const [roomCode,    setRoomCode]    = useState('');
  const [inputCode,   setInputCode]   = useState('');
  const [copied,      setCopied]      = useState(false);
  const [statusMsg,   setStatusMsg]   = useState('');
  const [mpGame,      setMpGame]      = useState(null);
  const [mpRole,      setMpRole]      = useState(null);
  const socketRef = useRef(null);

  // Expose difficulty to canvas (avoid stale closure in rAF loop)
  useEffect(() => { window.__difficulty__ = difficulty; }, [difficulty]);

  // ── BOT: toss complete → initialise game ──────────────────────────────────
  const handleTossComplete = useCallback(({ playerWon, playerBatsIn: pbi, playerChoice }) => {
    const g = mkGame(overs);
    g.phase = 'batting';
    g.toss  = { playerWon, playerChoice };
    const batsIn = pbi ?? 2;
    setPlayerBatsIn(batsIn);
    setRole(batsIn === 1 ? 'bat' : 'bowl');
    setGame(g);
    setScreen('game');
  }, [overs]);

  // ── BOT: resolve one ball ─────────────────────────────────────────────────
  const resolveBotBall = useCallback((g, batTiming, bowlAccuracy) => {
    const result = resolveBall(batTiming, bowlAccuracy, difficulty, false);
    setLastResult(result);

    const { ng, inningsOver } = applyResult(g, result);

    if (inningsOver) {
      if (ng.innings === 1) {
        ng.target  = curInn(ng).runs + 1;
        ng.innings = 2;
        ng.phase   = 'innings_break';
        setGame({ ...ng });
        setScreen('innings_break');
      } else {
        const inn2 = ng.inn2;
        const playerBatted2nd = playerBatsIn === 2;
        const playerRuns = playerBatted2nd ? inn2.runs : ng.inn1.runs;
        const botRuns    = playerBatted2nd ? ng.inn1.runs : inn2.runs;
        const won = playerRuns > botRuns || (playerBatted2nd && inn2.runs >= ng.target);
        setResultData({
          inn1: ng.inn1, inn2: ng.inn2,
          winner: won ? playerName : 'Bot',
          margin: won
            ? `${10 - inn2.wickets} wickets`
            : `${ng.target - inn2.runs - 1} runs`,
          target: ng.target,
        });
        setScreen('result');
      }
    } else {
      setGame({ ...ng });
    }

    return { ng, inningsOver };
  }, [difficulty, playerBatsIn, playerName]);

  // ── BOT: player bats — tap to hit ────────────────────────────────────────
  const handlePlayerAction = useCallback((value) => {
    if (!game || game.phase !== 'batting') return;

    const isPlayerBatting = (game.innings === 1 && playerBatsIn === 1) ||
                             (game.innings === 2 && playerBatsIn === 2);
    const isPlayerBowling = !isPlayerBatting;

    if (mode === 'bot') {
      if (awaitingBotBowl) return; // already processing

      if (isPlayerBatting) {
        // Player plays shot → bot bowls (auto accuracy)
        const bowlAcc = botBowlAccuracy(difficulty);
        resolveBotBall(game, value, bowlAcc);
      } else if (isPlayerBowling) {
        // Player delivers (value = bowl accuracy) → bot bats
        const batTim = botTiming(difficulty, game.target, curInn(game).runs, curInn(game).balls, game.totalOvers);
        // Invert: when player bowls, bat timing is the bot's, bowl accuracy is player's
        const result = resolveBall(batTim, value, difficulty, true);
        setLastResult(result);
        const { ng, inningsOver } = applyResult(game, result);
        if (inningsOver) {
          if (ng.innings === 1) {
            ng.target = curInn(ng).runs + 1;
            ng.innings = 2;
            ng.phase   = 'innings_break';
            setGame({ ...ng });
            setScreen('innings_break');
          } else {
            const playerRuns = playerBatsIn === 1 ? ng.inn1.runs : ng.inn2.runs;
            const botRuns    = playerBatsIn === 1 ? ng.inn2.runs : ng.inn1.runs;
            const won = playerRuns > botRuns;
            setResultData({
              inn1: ng.inn1, inn2: ng.inn2,
              winner: won ? playerName : 'Bot',
              margin: won ? `${10 - ng.inn2.wickets} wickets` : `${Math.abs(playerRuns - botRuns)} runs`,
              target: ng.target,
            });
            setScreen('result');
          }
        } else {
          setGame({ ...ng });
        }
      }
    } else if (mpRole === 'bat') {
      socketRef.current?.emit('game:shot', { timing: value });
    } else if (mpRole === 'bowl') {
      socketRef.current?.emit('game:bowl', { variation: value });
    }
  }, [game, mode, playerBatsIn, difficulty, awaitingBotBowl, resolveBotBall, playerName, mpRole]);

  // ── Innings break → continue ──────────────────────────────────────────────
  const handleInningsBreakContinue = useCallback(() => {
    setGame(prev => {
      if (!prev) return prev;
      const ng = { ...prev, phase: 'batting' };
      return ng;
    });
    // Swap role
    setRole(prev => prev === 'bat' ? 'bowl' : 'bat');
    setScreen('game');
  }, []);

  // ── Multiplayer socket ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mode || mode === 'bot') return;
    const s = io(API_URL, { path: '/socket.io', transports: ['websocket'] });
    socketRef.current = s;

    s.on('room:joined',     ({ code }) => { setRoomCode(code); });
    s.on('room:ready',      ({ player1, player2 }) => { setStatusMsg(`${player1} vs ${player2}`); setScreen('mp_toss'); });
    s.on('queue:waiting',   () => setStatusMsg('Finding opponent…'));
    s.on('queue:matched',   ({ code }) => setRoomCode(code));
    s.on('game:toss_result',({ flip, winner }) => {
      const myId = s.id;
      const won = winner === myId;
      if (!won) { setStatusMsg('Bot chose to bat'); setMpRole('bowl'); }
    });
    s.on('game:state', ({ game: g, roles }) => {
      setMpGame(g);
      if (roles.bat  === s.id) setMpRole('bat');
      if (roles.bowl === s.id) setMpRole('bowl');
      if (g.phase === 'batting') setScreen('mp_game');
    });
    s.on('game:ball', ({ result }) => setLastResult(result));
    s.on('game:over', (data) => { setResultData(data); setScreen('result'); });
    s.on('game:opponent_left', () => { setStatusMsg('Opponent left'); setScreen('menu'); });
    s.on('error', msg => setStatusMsg(msg));
    return () => s.disconnect();
  }, [mode]);

  // ── Current role string ───────────────────────────────────────────────────
  const currentRole = mode === 'bot' ? role : mpRole;
  const activeGame  = mode === 'bot' ? game : mpGame;

  // Determine current role for bot mode dynamically
  const effectiveRole = (() => {
    if (!game || mode !== 'bot') return currentRole;
    const isPlayerBatting = (game.innings === 1 && playerBatsIn === 1) ||
                             (game.innings === 2 && playerBatsIn === 2);
    return isPlayerBatting ? 'bat' : 'bowl';
  })();

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-10 relative z-10 min-h-screen">

      {/* ── MENU ── */}
      <AnimatePresence mode="wait">
      {screen === 'menu' && (
        <motion.div key="menu" initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-16}}
          className="space-y-12 max-w-2xl mx-auto">
          {/* Title */}
          <div className="text-center space-y-4">
            <motion.div animate={{rotate:[0,-5,5,0]}} transition={{duration:2.5,repeat:Infinity,repeatDelay:4}} className="text-7xl">🏏</motion.div>
            <h1 className="text-6xl font-black italic uppercase tracking-tighter">
              Cricket <span className="text-ipl-neon">Blitz</span>
            </h1>
            <p className="text-gray-500 font-bold uppercase tracking-widest text-[11px]">
              Real-time mini cricket · Timing · Tactics · Triumph
            </p>
          </div>

          {/* Player name */}
          <div className="max-w-xs mx-auto">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 block mb-2 text-center">Your Name</label>
            <input value={playerName} onChange={e => setPlayerName(e.target.value.slice(0,16))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-sm font-bold text-white focus:border-ipl-neon outline-none text-center tracking-widest"
              placeholder="Enter name…" />
          </div>

          {/* Over selector */}
          <div className="flex justify-center gap-2 flex-wrap">
            {OVER_OPTIONS.map(o => (
              <button key={o.value} onClick={() => setOvers(o.value)}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all
                  ${overs === o.value ? 'bg-ipl-neon text-black border-ipl-neon shadow-[0_0_14px_#0ea5e9]' : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30 hover:text-white'}`}>
                {o.label}
              </button>
            ))}
          </div>

          {/* Mode cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { id:'bot',     icon:<Bot className="w-8 h-8"/>,     label:'vs Bot',      desc:'Play vs AI',       color:'#0ea5e9', sub:'All skill levels' },
              { id:'friend',  icon:<Users className="w-8 h-8"/>,   label:'vs Friend',   desc:'Room code',        color:'#22c55e', sub:'Real-time 1v1' },
              { id:'stranger',icon:<Shuffle className="w-8 h-8"/>, label:'vs Stranger', desc:'Quick match',      color:'#f59e0b', sub:'Auto matchmaking' },
            ].map(m => (
              <motion.button key={m.id}
                whileHover={{y:-6,scale:1.02}} whileTap={{scale:0.97}}
                onClick={() => {
                  setMode(m.id);
                  if (m.id === 'bot') setScreen('bot_setup');
                  else setScreen('lobby');
                }}
                className="glass bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col items-center gap-4 group hover:border-white/25 transition-all relative overflow-hidden"
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-8 transition-opacity rounded-3xl"
                  style={{background:`radial-gradient(circle,${m.color},transparent 70%)`}}/>
                <div style={{color:m.color}} className="group-hover:scale-110 transition-transform">{m.icon}</div>
                <div className="text-center">
                  <p className="font-black uppercase tracking-tight text-white text-sm">{m.label}</p>
                  <p className="text-[9px] text-gray-500 font-bold mt-0.5">{m.desc}</p>
                  <p className="text-[8px] text-gray-700 mt-0.5">{m.sub}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── BOT SETUP ── */}
      {screen === 'bot_setup' && (
        <motion.div key="setup" initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-16}}
          className="max-w-md mx-auto space-y-8">
          <button onClick={() => setScreen('menu')}
            className="flex items-center gap-2 text-gray-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors">
            <ArrowLeft className="w-4 h-4"/> Back
          </button>
          <div className="border-l-4 border-ipl-neon pl-5">
            <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white">
              Choose <span className="text-ipl-neon">Difficulty</span>
            </h2>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
              {overs} over{overs>1?'s':''} match · vs Bot
            </p>
          </div>
          <div className="space-y-2">
            {DIFFICULTIES.map(d => (
              <motion.button key={d.value} whileHover={{x:4}} whileTap={{scale:0.98}}
                onClick={() => setDifficulty(d.value)}
                className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl border transition-all
                  ${difficulty === d.value ? 'border-white/25 bg-white/8' : 'border-white/8 bg-white/3 hover:bg-white/6'}`}>
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{backgroundColor:d.color, boxShadow: difficulty===d.value?`0 0 10px ${d.color}`:''}}/>
                <div className="text-left flex-1">
                  <p className="font-black uppercase tracking-widest text-sm text-white">{d.label}</p>
                  <p className="text-[9px] text-gray-500 font-bold mt-0.5">{d.desc}</p>
                </div>
                {difficulty === d.value && <Check className="w-4 h-4 flex-shrink-0" style={{color:d.color}}/>}
              </motion.button>
            ))}
          </div>
          <motion.button
            whileHover={{scale:1.02}} whileTap={{scale:0.97}}
            onClick={() => setScreen('toss')}
            className="w-full py-5 bg-ipl-neon text-black font-black text-base uppercase tracking-widest rounded-2xl shadow-[0_0_30px_#0ea5e980]">
            <Play className="w-5 h-5 inline mr-2"/>Flip the Coin
          </motion.button>
        </motion.div>
      )}

      {/* ── TOSS ── */}
      {screen === 'toss' && (
        <motion.div key="toss" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
          <TossScreen onTossComplete={handleTossComplete} />
        </motion.div>
      )}

      {/* ── LOBBY (friend/stranger) ── */}
      {screen === 'lobby' && (
        <motion.div key="lobby" initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-16}}
          className="max-w-md mx-auto space-y-8">
          <button onClick={() => { setScreen('menu'); setMode(null); }}
            className="flex items-center gap-2 text-gray-500 hover:text-white text-[10px] font-black uppercase tracking-widest">
            <ArrowLeft className="w-4 h-4"/> Back
          </button>

          {mode === 'friend' && (
            <div className="space-y-6">
              <div className="border-l-4 border-green-500 pl-5">
                <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white">
                  Friend <span className="text-green-400">Room</span>
                </h2>
              </div>
              {!roomCode ? (
                <button onClick={() => socketRef.current?.emit('room:create', { overs, name: playerName })}
                  className="w-full py-4 bg-green-500/10 border border-green-500/30 text-green-400 font-black uppercase tracking-widest rounded-2xl hover:bg-green-500/20 transition-all">
                  Create New Room
                </button>
              ) : (
                <div className="glass bg-white/5 border border-green-500/30 rounded-2xl p-8 text-center space-y-4">
                  <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Share this code</p>
                  <p className="text-5xl font-black tracking-[0.4em] text-green-400">{roomCode}</p>
                  <button onClick={() => { navigator.clipboard?.writeText(roomCode); setCopied(true); setTimeout(()=>setCopied(false),2000); }}
                    className="flex items-center gap-2 mx-auto px-5 py-2 bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest">
                    {copied ? <Check className="w-3.5 h-3.5 text-green-400"/> : <Copy className="w-3.5 h-3.5"/>}
                    {copied ? 'Copied!' : 'Copy Code'}
                  </button>
                  <p className="text-[9px] text-gray-600 animate-pulse">Waiting for opponent…</p>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/8"/>
                <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">or join one</span>
                <div className="flex-1 h-px bg-white/8"/>
              </div>
              <div className="flex gap-3">
                <input value={inputCode} onChange={e=>setInputCode(e.target.value.toUpperCase())} maxLength={6}
                  placeholder="XXXXXX"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-xl font-black tracking-[0.35em] text-white focus:border-ipl-neon outline-none"/>
                <button onClick={() => socketRef.current?.emit('room:join', { code: inputCode, name: playerName })}
                  className="px-6 py-3 bg-ipl-neon text-black font-black uppercase tracking-widest rounded-xl text-sm">
                  Join
                </button>
              </div>
            </div>
          )}

          {mode === 'stranger' && (
            <div className="text-center space-y-8">
              <div className="border-l-4 border-yellow-400 pl-5 text-left">
                <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white">
                  Quick <span className="text-yellow-400">Match</span>
                </h2>
              </div>
              <motion.div animate={{scale:[1,1.06,1]}} transition={{duration:1.8,repeat:Infinity}}
                className="w-28 h-28 rounded-full bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center mx-auto">
                <Shuffle className="w-12 h-12 text-yellow-400"/>
              </motion.div>
              <button onClick={() => socketRef.current?.emit('queue:join', { overs, name: playerName })}
                className="px-12 py-4 bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 font-black uppercase tracking-widest rounded-2xl hover:bg-yellow-400/20 transition-all">
                Find Opponent
              </button>
              {statusMsg && <p className="text-ipl-neon font-black uppercase tracking-widest text-[10px] animate-pulse">{statusMsg}</p>}
            </div>
          )}
        </motion.div>
      )}

      {/* ── TOSS (multiplayer placeholder) ── */}
      {screen === 'mp_toss' && (
        <motion.div key="mp_toss" initial={{opacity:0}} animate={{opacity:1}}
          className="max-w-sm mx-auto text-center space-y-6 py-20">
          <div className="text-5xl">🪙</div>
          <h2 className="text-3xl font-black italic uppercase tracking-tighter">Waiting for toss…</h2>
          <p className="text-gray-500 text-sm font-bold">{statusMsg}</p>
        </motion.div>
      )}

      {/* ── GAME (bot) ── */}
      {screen === 'game' && game && (
        <motion.div key="game" initial={{opacity:0}} animate={{opacity:1}} className="space-y-6">
          {/* Top bar */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <button onClick={() => { setScreen('menu'); setGame(null); }}
              className="flex items-center gap-1.5 text-gray-600 hover:text-white text-[9px] font-black uppercase tracking-widest transition-colors">
              <ArrowLeft className="w-3.5 h-3.5"/> Quit
            </button>
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">
                vs Bot · <span className="capitalize">{difficulty}</span>
              </span>
              <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border
                ${effectiveRole === 'bat' ? 'bg-yellow-400/15 border-yellow-400/40 text-yellow-300' : 'bg-ipl-neon/15 border-ipl-neon/40 text-ipl-neon'}`}>
                {effectiveRole === 'bat' ? '🏏 You bat' : '🎯 You bowl'}
              </span>
            </div>
          </div>

          {/* Innings indicator */}
          <div className="flex justify-center gap-2">
            {[1,2].map(i => (
              <div key={i} className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all
                ${game.innings === i ? 'bg-ipl-neon/10 border-ipl-neon/30 text-ipl-neon' : 'bg-white/5 border-white/10 text-gray-600'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${game.innings === i ? 'bg-ipl-neon' : 'bg-gray-700'}`}/>
                Innings {i}
                {i === 1 && game.innings === 2 && <span className="ml-1 text-gray-600">✓ {game.inn1.runs}/{game.inn1.wickets}</span>}
              </div>
            ))}
          </div>

          {/* Canvas */}
          <CricketCanvas
            role={effectiveRole}
            phase={game.phase}
            onAction={handlePlayerAction}
            lastResult={lastResult}
          />

          {/* Scoreboard */}
          <Scoreboard game={game} />

          {/* Action hint */}
          <div className="text-center py-2">
            <p className="text-[9px] text-gray-700 font-bold uppercase tracking-widest">
              {effectiveRole === 'bat'
                ? 'Tap the pitch — time your shot with the power bar'
                : 'Tap to bowl — aim the cursor at the good length zone'}
            </p>
          </div>
        </motion.div>
      )}

      {/* ── INNINGS BREAK ── */}
      {screen === 'innings_break' && game && (
        <motion.div key="break" initial={{opacity:0}} animate={{opacity:1}}>
          <InningsBreak game={game} playerBatsIn={playerBatsIn} onContinue={handleInningsBreakContinue} />
        </motion.div>
      )}

      {/* ── RESULT ── */}
      {screen === 'result' && resultData && (
        <motion.div key="result" initial={{opacity:0,scale:0.9}} animate={{opacity:1,scale:1}}
          className="max-w-md mx-auto space-y-8 text-center py-10">
          <motion.div
            animate={{scale:[1,1.25,1],rotate:[0,12,-12,0]}}
            transition={{duration:0.7, delay:0.2}}
            className="text-7xl"
          >
            {resultData.winner === playerName ? '🏆' : '😔'}
          </motion.div>

          <div>
            <h2 className="text-5xl font-black italic uppercase tracking-tighter">
              {resultData.winner === playerName
                ? <><span className="text-ipl-neon">You</span> Won!</>
                : <><span className="text-red-400">{resultData.winner}</span> Won</>}
            </h2>
            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs mt-2">
              Won by {resultData.margin}
            </p>
          </div>

          {/* Scorecard */}
          <div className="space-y-3">
            {[
              { inn: resultData.inn1, label: '1st Innings', who: playerBatsIn === 1 ? playerName : 'Bot' },
              { inn: resultData.inn2, label: '2nd Innings', who: playerBatsIn === 2 ? playerName : 'Bot', target: resultData.target },
            ].map(({ inn, label, who, target }) => inn && (
              <div key={label} className="glass bg-white/5 border border-white/10 rounded-2xl p-5 text-left">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest">{label} · {who}</span>
                  {target && <span className="text-[9px] text-ipl-neon font-black">Target: {target}</span>}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-black text-white">{inn.runs}<span className="text-2xl text-gray-500">/{inn.wickets}</span></span>
                  <span className="font-mono text-gray-400 text-sm">({Math.floor(inn.balls/6)}.{inn.balls%6} ov)</span>
                </div>
                {/* Recent balls */}
                <div className="flex gap-1 mt-2">
                  {inn.ballLog.slice(-8).map((b,i) => (
                    <div key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-black
                      ${b==='W'?'bg-red-500/30 text-red-300':b==='6'?'bg-yellow-400/30 text-yellow-200':b==='4'?'bg-green-500/30 text-green-300':'bg-white/5 text-gray-500'}`}>
                      {b}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setScreen('menu'); setGame(null); setResultData(null); setLastResult(null); setRole(null); setPlayerBatsIn(null); }}
              className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl font-black uppercase tracking-widest text-gray-400 hover:text-white hover:border-white/25 transition-all text-sm flex items-center justify-center gap-2">
              <ArrowLeft className="w-4 h-4"/> Menu
            </button>
            <button onClick={() => { setGame(null); setResultData(null); setLastResult(null); setRole(null); setPlayerBatsIn(null); setScreen('toss'); }}
              className="flex-1 py-4 bg-ipl-neon text-black rounded-2xl font-black uppercase tracking-widest shadow-[0_0_20px_#0ea5e980] text-sm flex items-center justify-center gap-2">
              <RotateCcw className="w-4 h-4"/> Play Again
            </button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}