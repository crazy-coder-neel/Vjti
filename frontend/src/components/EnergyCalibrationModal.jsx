import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Sliders,
  Train,
  GraduationCap,
  Sparkles,
  Bed,
  Volume2,
  Clock,
  CheckCircle2,
  Check,
  UtensilsCrossed,
} from 'lucide-react';
import { calibrateEnergy } from '../api';

export default function EnergyCalibrationModal({
  isOpen,
  onClose,
  userId,
  onCalibrationSuccess,
}) {
  const [commuteMinutes, setCommuteMinutes] = useState(30);
  const [commuteMode, setCommuteMode] = useState('crowded');
  const [campusHours, setCampusHours] = useState(4.0);
  const [hasIntenseLab, setHasIntenseLab] = useState(false);
  const [choreHours, setChoreHours] = useState(1.0);
  const [sleepQuality, setSleepQuality] = useState('fair');
  const [sensoryLoad, setSensoryLoad] = useState('medium');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg('');

    try {
      const payload = {
        user_id: userId || 'demo_student',
        commute_minutes: parseInt(commuteMinutes, 10),
        commute_mode: commuteMode,
        campus_hours: parseFloat(campusHours),
        has_intense_lab: hasIntenseLab,
        chore_hours: parseFloat(choreHours),
        sleep_quality: sleepQuality,
        sensory_load: sensoryLoad,
      };

      const res = await calibrateEnergy(payload);
      setSuccessMsg(res?.message || 'Energy budget successfully calibrated!');

      if (onCalibrationSuccess) {
        await onCalibrationSuccess(res);
      }

      setTimeout(() => {
        setSuccessMsg('');
        onClose();
      }, 900);
    } catch (err) {
      console.error('Failed to calibrate energy:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-xl bg-slate-900/95 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-white my-8 z-10 max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  Calibrate Daily Energy (Spoons)
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Real-World Inputs
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Account for commute, lectures, chores, and sensory load without shame.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-5 space-y-5">
            {/* 1. Commute Transit */}
            <div className="p-4 rounded-2xl bg-slate-800/40 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-300 flex items-center gap-2">
                  <Train className="w-4 h-4 text-amber-400" />
                  1. Transit & Commute (Each Way)
                </span>
                <span className="text-xs font-bold text-white font-mono">
                  {commuteMode === 'wfh' ? '0 min (WFH)' : `${commuteMinutes} min`}
                </span>
              </div>

              {commuteMode !== 'wfh' && (
                <input
                  type="range"
                  min="0"
                  max="120"
                  step="5"
                  value={commuteMinutes}
                  onChange={(e) => setCommuteMinutes(e.target.value)}
                  className="w-full accent-amber-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                />
              )}

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1">
                {[
                  { id: 'crowded', label: '🚆 Train (Packed)' },
                  { id: 'seated', label: '🚌 Bus (Seated)' },
                  { id: 'walk', label: '🚶 Walk / Cycle' },
                  { id: 'car', label: '🚗 Car / Bike' },
                  { id: 'wfh', label: '🏠 WFH / Campus' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setCommuteMode(m.id)}
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-medium border text-center transition-all ${
                      commuteMode === m.id
                        ? 'bg-amber-500/20 border-amber-500 text-amber-200 font-semibold'
                        : 'bg-slate-800/80 border-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Campus Lectures & Labs */}
            <div className="p-4 rounded-2xl bg-slate-800/40 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-sky-300 flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-sky-400" />
                  2. Classes & Lecture Hours Today
                </span>
                <span className="text-xs font-bold text-white font-mono">
                  {campusHours} hours
                </span>
              </div>

              <input
                type="range"
                min="0"
                max="8"
                step="0.5"
                value={campusHours}
                onChange={(e) => setCampusHours(e.target.value)}
                className="w-full accent-sky-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
              />

              <label className="flex items-center gap-2 pt-1 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasIntenseLab}
                  onChange={(e) => setHasIntenseLab(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-0"
                />
                <span>Includes intensive practical lab / workshop (-0.8 Sp sensory effort)</span>
              </label>
            </div>

            {/* 3. Daily Chores & Life Errands */}
            <div className="p-4 rounded-2xl bg-slate-800/40 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-300 flex items-center gap-2">
                  <UtensilsCrossed className="w-4 h-4 text-emerald-400" />
                  3. Life Maintenance, Cooking & Chores
                </span>
                <span className="text-xs font-bold text-white font-mono">
                  {choreHours} hours
                </span>
              </div>

              <input
                type="range"
                min="0"
                max="4"
                step="0.5"
                value={choreHours}
                onChange={(e) => setChoreHours(e.target.value)}
                className="w-full accent-emerald-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
              />
              <p className="text-[11px] text-slate-400">
                Chores, meal prep, grocery shopping, or family obligations all cost real spoons.
              </p>
            </div>

            {/* 4. Sleep & Sensory Load */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Sleep Quality */}
              <div className="p-3.5 rounded-2xl bg-slate-800/40 border border-white/5 space-y-2">
                <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                  <Bed className="w-3.5 h-3.5 text-indigo-400" />
                  Sleep & Morning Wakeup
                </span>
                <select
                  value={sleepQuality}
                  onChange={(e) => setSleepQuality(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                >
                  <option value="poor">😫 Poor / Insomnia (-1.5 Sp)</option>
                  <option value="fair">😐 Fair / Average (-0.5 Sp)</option>
                  <option value="rested">😊 Well Rested (Normal)</option>
                  <option value="excellent">⚡ Recharged (+0.5 Sp)</option>
                </select>
              </div>

              {/* Sensory & Social Load */}
              <div className="p-3.5 rounded-2xl bg-slate-800/40 border border-white/5 space-y-2">
                <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                  Sensory Environment Today
                </span>
                <select
                  value={sensoryLoad}
                  onChange={(e) => setSensoryLoad(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50"
                >
                  <option value="low">🎧 Quiet Library / Low Sensory</option>
                  <option value="medium">🏫 Normal Campus / Moderate</option>
                  <option value="high">📢 High Crowd / Sensory Overload (-1.0 Sp)</option>
                </select>
              </div>
            </div>

            {/* Success Alert */}
            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{successMsg}</span>
              </motion.div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-500/25 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <span>Computing Physics...</span>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Calculate My Real Spoons</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
