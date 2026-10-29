import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Sparkles,
  Train,
  GraduationCap,
  Clock,
  BatteryCharging,
  Zap,
  Info,
  CheckCircle2,
  Calendar,
} from 'lucide-react';

/**
 * WhyPanelModal Component (FEAT-A4)
 *
 * Displays the transparent additive factor decomposition explaining why the user's
 * spoon capacity is what it is today:
 * - Base capacity: 12.0 spoons
 * - Commute cost: -X spoons
 * - Campus time: -Y spoons
 * - Deadline pressure: -Z spoons
 * - Yesterday carryover: -W spoons
 * - Probe multiplier: xK
 * - Empathetic human explanation
 *
 * Adheres strictly to Zero-Shame principles: no clinical labels, no blame, pure physics.
 */
export default function WhyPanelModal({ isOpen, onClose, snapshot }) {
  // ESC key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Extract factors with safe defaults
  const rawSnap = snapshot?.snapshot || snapshot || {};
  const factors = rawSnap?.factors || rawSnap?.why_breakdown || {};
  const liveSpoons = rawSnap?.live_spoons ?? rawSnap?.prior_spoons ?? rawSnap?.budget ?? 6.0;
  const rangeText = rawSnap?.range_text || `about ${Math.floor(liveSpoons)} to ${Math.ceil(liveSpoons)} spoons`;
  const explanation =
    rawSnap?.human_explanation ||
    rawSnap?.explanation ||
    factors.human_note ||
    factors.note ||
    'Your budget reflects today\'s transit and campus commitments so you can work comfortably without burnout.';

  const baseCapacity = rawSnap?.budget ?? factors.base_spoons ?? 12.0;
  const commuteCost = Number(rawSnap?.commute_cost ?? factors.commute_cost ?? factors.commute_deduction ?? 0.0);
  const campusCost = Number(rawSnap?.campus_cost ?? factors.campus_cost ?? factors.campus_deduction ?? 0.0);
  const deadlineCost = Number(rawSnap?.deadline_pressure ?? factors.deadline_cost ?? factors.deadline_deduction ?? 0.0);
  const carryoverCost = Number(rawSnap?.carryover ?? factors.carryover_cost ?? factors.yesterday_debt ?? 0.0);
  const probeMult = Number(rawSnap?.probe_multiplier ?? factors.probe_multiplier ?? 1.0);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden z-10"
        >
          {/* Ambient Glow */}
          <div className="absolute -top-20 -left-20 w-48 h-48 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                  Capacity Decomposition
                </span>
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20">
                  Physics, not willpower
                </span>
              </div>
              <h3 className="text-xl font-bold text-white mt-1">
                Why {liveSpoons.toFixed(1)} Spoons Today?
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Empathetic Summary Banner */}
          <div className="mt-5 p-4 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-start gap-3">
            <Info className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-violet-200 leading-relaxed">
              <span className="font-semibold block text-violet-100 mb-0.5">Energy Reality Check</span>
              {explanation}
            </div>
          </div>

          {/* Factor Waterfall List */}
          <div className="mt-6 space-y-3">
            {/* 1. Base Starting Spoons */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <BatteryCharging className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Baseline Capacity</div>
                  <div className="text-[11px] text-slate-400">Full standard student energy budget</div>
                </div>
              </div>
              <span className="text-sm font-bold text-emerald-400">
                +{baseCapacity.toFixed(1)} spoons
              </span>
            </div>

            {/* 2. Commute Cost */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Train className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Transit / Commute</div>
                  <div className="text-[11px] text-slate-400">
                    {commuteCost > 0
                      ? `Transit strain & crowd density`
                      : 'WFH / Holiday / Zero transit deduction'}
                  </div>
                </div>
              </div>
              <span className={`text-sm font-bold ${commuteCost > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                {commuteCost > 0 ? `-${commuteCost.toFixed(1)}` : '0.0'} spoons
              </span>
            </div>

            {/* 3. Campus Lecture / Lab Hours */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Campus Timetable</div>
                  <div className="text-[11px] text-slate-400">
                    {campusCost > 0 ? `Scheduled classes and lab blocks` : 'No scheduled lectures today'}
                  </div>
                </div>
              </div>
              <span className={`text-sm font-bold ${campusCost > 0 ? 'text-sky-400' : 'text-slate-500'}`}>
                {campusCost > 0 ? `-${campusCost.toFixed(1)}` : '0.0'} spoons
              </span>
            </div>

            {/* 4. Upcoming Deadlines */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Deadline Strain</div>
                  <div className="text-[11px] text-slate-400">
                    {deadlineCost > 0 ? `Upcoming submissions within 48 hours` : 'No immediate high-urgency deadlines'}
                  </div>
                </div>
              </div>
              <span className={`text-sm font-bold ${deadlineCost > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                {deadlineCost > 0 ? `-${deadlineCost.toFixed(1)}` : '0.0'} spoons
              </span>
            </div>

            {/* 5. Carryover Recovery */}
            {carryoverCost > 0 && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">Prior Day Recovery</div>
                    <div className="text-[11px] text-slate-400">Residual depletion from yesterday</div>
                  </div>
                </div>
                <span className="text-sm font-bold text-purple-400">
                  -{carryoverCost.toFixed(1)} spoons
                </span>
              </div>
            )}

            {/* 6. Attention Probe Adjustment */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Attention Pulse Multiplier</div>
                  <div className="text-[11px] text-slate-400">
                    {probeMult !== 1.0
                      ? `20s probe reaction vs rolling personal baseline`
                      : 'Default neutral (run 20s probe to calibrate)'}
                  </div>
                </div>
              </div>
              <span className="text-sm font-bold text-cyan-300">
                ×{probeMult.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Final Effective Budget Row */}
          <div className="mt-6 p-4 rounded-2xl bg-gradient-to-r from-violet-950/60 to-slate-900 border border-violet-500/30 flex items-center justify-between">
            <div>
              <span className="text-xs uppercase tracking-wider text-violet-300 font-semibold block">
                Total Available Budget
              </span>
              <span className="text-xs text-slate-400 mt-0.5 block">{rangeText}</span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-white">
                {liveSpoons.toFixed(1)}{' '}
                <span className="text-xs font-normal text-violet-300">spoons</span>
              </span>
            </div>
          </div>

          {/* Footer Action */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-semibold text-sm bg-violet-600 hover:bg-violet-500 text-white transition-all shadow-lg shadow-violet-600/20"
            >
              Got it, let's plan
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
