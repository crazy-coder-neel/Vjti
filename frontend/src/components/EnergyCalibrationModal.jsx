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
  Plus,
  Trash2,
  Layers,
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
  const [useMultiLeg, setUseMultiLeg] = useState(false);
  const [commuteLegs, setCommuteLegs] = useState([
    { id: 1, label: 'Local Train / Metro', mode: 'crowded', minutes: 60, icon: '🚆' },
    { id: 2, label: 'BEST Bus', mode: 'seated', minutes: 25, icon: '🚌' },
    { id: 3, label: 'Walking to Campus', mode: 'walk', minutes: 15, icon: '🚶' },
  ]);

  const [campusHours, setCampusHours] = useState(4.0);
  const [hasIntenseLab, setHasIntenseLab] = useState(false);
  const [choreHours, setChoreHours] = useState(1.0);
  const [sleepQuality, setSleepQuality] = useState('fair');
  const [sensoryLoad, setSensoryLoad] = useState('medium');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const totalLegMinutes = commuteLegs.reduce(
    (sum, leg) => sum + (parseInt(leg.minutes, 10) || 0),
    0
  );

  const effectiveOneWayMinutes = useMultiLeg
    ? totalLegMinutes
    : commuteMode === 'wfh'
    ? 0
    : parseInt(commuteMinutes, 10) || 0;

  const effectiveRoundtripMinutes = effectiveOneWayMinutes * 2;
  const roundtripHoursFormatted = (effectiveRoundtripMinutes / 60).toFixed(1);

  // Compute estimated commute drain in spoons (mirrors backend formula)
  const computeEstCommuteDrain = () => {
    if (useMultiLeg) {
      let cost = 0;
      commuteLegs.forEach((leg) => {
        const mins = parseFloat(leg.minutes) || 0;
        const factor =
          leg.mode === 'crowded'
            ? 1.0
            : leg.mode === 'seated'
            ? 0.6
            : leg.mode === 'car'
            ? 0.8
            : leg.mode === 'walk'
            ? 0.3
            : 0.0;
        cost += ((mins * 2) / 30.0) * 0.5 * factor;
      });
      return Math.round(cost * 10) / 10;
    }
    if (commuteMode === 'wfh') return 0;
    const factor =
      commuteMode === 'crowded'
        ? 1.0
        : commuteMode === 'seated'
        ? 0.6
        : commuteMode === 'car'
        ? 0.8
        : commuteMode === 'walk'
        ? 0.3
        : 0.0;
    return Math.round(((parseFloat(commuteMinutes) * 2) / 30.0) * 0.5 * factor * 10) / 10;
  };

  const updateLegMinutes = (index, value) => {
    setCommuteLegs((prev) => {
      const copy = [...prev];
      let val = parseInt(value, 10);
      if (isNaN(val) || val < 0) val = 0;
      if (val > 300) val = 300;
      copy[index] = { ...copy[index], minutes: val };
      return copy;
    });
  };

  const adjustLegMinutes = (index, delta) => {
    setCommuteLegs((prev) => {
      const copy = [...prev];
      let current = parseInt(copy[index].minutes, 10) || 0;
      let next = Math.max(0, Math.min(300, current + delta));
      copy[index] = { ...copy[index], minutes: next };
      return copy;
    });
  };

  const updateLegMode = (index, mode) => {
    const iconMap = {
      crowded: '🚆',
      seated: '🚌',
      walk: '🚶',
      car: '🛺',
    };
    setCommuteLegs((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], mode, icon: iconMap[mode] || '🚗' };
      return copy;
    });
  };

  const updateLegLabel = (index, label) => {
    setCommuteLegs((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], label };
      return copy;
    });
  };

  const removeLeg = (index) => {
    if (commuteLegs.length <= 1) return;
    setCommuteLegs((prev) => prev.filter((_, i) => i !== index));
  };

  const addLeg = () => {
    setCommuteLegs((prev) => [
      ...prev,
      {
        id: Date.now(),
        label: 'Connecting Transit / Auto',
        mode: 'car',
        minutes: 15,
        icon: '🛺',
      },
    ]);
  };

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
        commute_minutes: effectiveOneWayMinutes,
        commute_mode: useMultiLeg ? 'crowded' : commuteMode,
        commute_legs: useMultiLeg
          ? commuteLegs
              .filter((l) => (parseInt(l.minutes, 10) || 0) > 0)
              .map((l) => ({
                label: l.label,
                mode: l.mode,
                minutes: parseInt(l.minutes, 10) || 0,
              }))
          : null,
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
                  1. Transit & Commute (Supports up to 8h daily)
                </span>
                <span className="text-xs font-bold text-amber-400 font-mono">
                  -{computeEstCommuteDrain()} Spoons
                </span>
              </div>

              {/* Mode Switcher */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900/60 rounded-xl border border-white/5">
                <button
                  type="button"
                  onClick={() => setUseMultiLeg(false)}
                  className={`py-1 px-2 rounded-lg text-[11px] font-semibold transition-all ${
                    !useMultiLeg
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ⚡ Single Journey
                </button>
                <button
                  type="button"
                  onClick={() => setUseMultiLeg(true)}
                  className={`py-1 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-all ${
                    useMultiLeg
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  Multi-Leg (Train + Bus + Walk)
                </button>
              </div>

              {!useMultiLeg ? (
                /* Single Journey */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">Travel time each way:</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="300"
                        value={commuteMode === 'wfh' ? 0 : commuteMinutes}
                        disabled={commuteMode === 'wfh'}
                        onChange={(e) => setCommuteMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-16 bg-slate-900 border border-white/10 rounded-lg px-2 py-0.5 text-center font-mono font-bold text-amber-400 text-xs focus:outline-none focus:border-amber-400"
                      />
                      <span className="text-slate-400 font-mono text-[11px]">mins</span>
                    </div>
                  </div>

                  {commuteMode !== 'wfh' && (
                    <>
                      <input
                        type="range"
                        min="5"
                        max="240"
                        step="5"
                        value={commuteMinutes}
                        onChange={(e) => setCommuteMinutes(parseInt(e.target.value, 10))}
                        className="w-full accent-amber-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                      />
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span>5m</span>
                        <span>1h (60m)</span>
                        <span>2h (120m)</span>
                        <span>3h (180m)</span>
                        <span>4h (240m each way = 8h/day)</span>
                      </div>
                    </>
                  )}

                  {/* Quick Presets */}
                  <div className="flex flex-wrap gap-1">
                    {[
                      { label: '30m', mins: 30 },
                      { label: '60m (1h)', mins: 60 },
                      { label: '90m (1.5h)', mins: 90 },
                      { label: '120m (2h)', mins: 120 },
                      { label: '180m (3h)', mins: 180 },
                      { label: '240m (4h)', mins: 240 },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          if (commuteMode === 'wfh') setCommuteMode('crowded');
                          setCommuteMinutes(preset.mins);
                        }}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-mono border transition-all ${
                          commuteMinutes === preset.mins && commuteMode !== 'wfh'
                            ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                            : 'bg-slate-800/80 border-white/5 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

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
              ) : (
                /* Multi-Leg Breakdown */
                <div className="space-y-2.5">
                  <div className="space-y-2">
                    {commuteLegs.map((leg, idx) => (
                      <div
                        key={leg.id || idx}
                        className="p-2.5 rounded-xl bg-slate-900/60 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span>{leg.icon}</span>
                            <input
                              type="text"
                              value={leg.label}
                              onChange={(e) => updateLegLabel(idx, e.target.value)}
                              className="bg-transparent text-[11px] font-semibold text-white border-b border-white/10 focus:border-amber-400 focus:outline-none px-1 w-36"
                              placeholder="Leg name"
                            />
                          </div>

                          <div className="flex items-center gap-1">
                            {[
                              { id: 'crowded', label: 'Packed' },
                              { id: 'seated', label: 'Seated' },
                              { id: 'walk', label: 'Walk' },
                              { id: 'car', label: 'Cab' },
                            ].map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => updateLegMode(idx, opt.id)}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-medium border transition-all ${
                                  leg.mode === opt.id
                                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                                    : 'bg-slate-800 border-white/5 text-slate-400'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => adjustLegMinutes(idx, -15)}
                            className="w-6 h-6 rounded bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            max="240"
                            value={leg.minutes}
                            onChange={(e) => updateLegMinutes(idx, e.target.value)}
                            className="w-12 bg-slate-950 border border-white/10 rounded px-1 py-0.5 text-center font-mono font-bold text-amber-400 text-xs focus:outline-none focus:border-amber-400"
                          />
                          <span className="text-[10px] text-slate-400 font-mono">m</span>
                          <button
                            type="button"
                            onClick={() => adjustLegMinutes(idx, 15)}
                            className="w-6 h-6 rounded bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold"
                          >
                            +
                          </button>

                          {commuteLegs.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLeg(idx)}
                              className="w-6 h-6 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition-colors ml-1"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={addLeg}
                    className="w-full py-1.5 rounded-lg border border-dashed border-white/15 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Plus className="w-3 h-3 text-amber-400" />
                    Add Connecting Leg (e.g. Bus, Walking, Rickshaw)
                  </button>
                </div>
              )}

              {/* Summary Pill */}
              <div className="flex items-center justify-between text-[11px] px-3 py-1.5 rounded-xl bg-slate-900/60 border border-white/5 font-mono text-slate-400">
                <span>One-way: <strong className="text-white">{effectiveOneWayMinutes}m</strong></span>
                <span>Roundtrip: <strong className="text-amber-300">{roundtripHoursFormatted}h ({effectiveRoundtripMinutes}m)</strong></span>
                <span>Drain: <strong className="text-amber-400">-{computeEstCommuteDrain()} spoons</strong></span>
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
                  Sleep Duration & Rest
                </span>
                <select
                  value={sleepQuality}
                  onChange={(e) => setSleepQuality(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                >
                  <option value="poor">😫 Less than 5 hours (Deficit)</option>
                  <option value="fair">😐 5 to 6.5 hours (Average)</option>
                  <option value="rested">😊 7 to 8 hours (Healthy Rest)</option>
                  <option value="excellent">⚡ 8+ hours (Fully Recharged)</option>
                </select>
                <span className="text-[10px] text-slate-400 block">
                  Measured in real sleep hours — mapped internally to spoon recovery.
                </span>
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
