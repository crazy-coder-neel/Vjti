import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Train,
  GraduationCap,
  Clock,
  Bed,
  Volume2,
  CheckCircle2,
  UtensilsCrossed,
  Sun,
  Moon,
  Sunset,
  ShieldCheck,
  Brain,
  Building,
  Plus,
  Trash2,
  Layers,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { submitOnboarding } from '../api';

export default function Onboarding({ userEmail, userId, onComplete }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [fullName, setFullName] = useState('');
  const [college, setCollege] = useState('VJTI Mumbai');
  const [major, setMajor] = useState('Computer Engineering');
  const [chronotype, setChronotype] = useState('intermediate');

  const [commuteMinutes, setCommuteMinutes] = useState(40);
  const [commuteMode, setCommuteMode] = useState('crowded');
  const [useMultiLeg, setUseMultiLeg] = useState(false);
  const [commuteLegs, setCommuteLegs] = useState([
    { id: 1, label: 'Local Train / Metro', mode: 'crowded', minutes: 60, icon: '🚆' },
    { id: 2, label: 'BEST Bus', mode: 'seated', minutes: 25, icon: '🚌' },
    { id: 3, label: 'Walking to Campus', mode: 'walk', minutes: 15, icon: '🚶' },
  ]);

  const [campusHours, setCampusHours] = useState(4.0);
  const [hasIntenseLab, setHasIntenseLab] = useState(true);

  const [choreHours, setChoreHours] = useState(1.5);
  const [sleepQuality, setSleepQuality] = useState('fair');
  const [sensoryLoad, setSensoryLoad] = useState('medium');

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

  // Compute estimated commute drain in spoons (matches backend formula)
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

  const handleNext = () => {
    if (step === 1 && !fullName.trim()) {
      setError('Please tell us your name so we can personalize your workspace.');
      return;
    }
    setError('');
    setStep((prev) => Math.min(prev + 1, 4));
  };

  const handlePrev = () => {
    setError('');
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleFinish = async () => {
    setLoading(true);
    setError('');

    try {
      const payload = {
        user_id: userId || 'demo_student',
        full_name: fullName.trim() || 'Student',
        college: college.trim() || 'University',
        major: major.trim() || 'Engineering',
        chronotype,
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

      const result = await submitOnboarding(payload);

      if (onComplete) {
        await onComplete(result);
      }

      navigate('/dashboard');
    } catch (err) {
      console.error('Onboarding failed:', err);
      setError('Something went wrong saving your settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07090E] text-white flex flex-col justify-between p-4 sm:p-8 relative overflow-hidden font-sans">
      {/* Background Glows */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[45%] h-[45%] bg-violet-600/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[45%] h-[45%] bg-emerald-600/10 rounded-full blur-[140px]" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 max-w-2xl mx-auto w-full flex items-center justify-between py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            SpoonSense
          </span>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Step <span className="text-violet-400 font-bold">{step}</span> of 4
        </div>
      </header>

      {/* Main Card */}
      <main className="relative z-10 max-w-2xl mx-auto w-full my-auto py-6">
        {/* Progress Bar */}
        <div className="w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden mb-8 border border-white/5">
          <motion.div
            className="h-full bg-gradient-to-r from-violet-500 to-emerald-400 rounded-full"
            initial={{ width: '25%' }}
            animate={{ width: `${(step / 4) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <div className="bg-slate-900/70 border border-white/10 rounded-[2rem] p-6 sm:p-10 backdrop-blur-2xl shadow-2xl">
          {error && (
            <div className="mb-6 p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
              {error}
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* ── STEP 1: Academic Identity ── */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-violet-400 bg-violet-500/10 px-2.5 py-1 rounded-full border border-violet-500/20">
                    Welcome to SpoonSense
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-3 tracking-tight">
                    Tell us about your student life
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
                    SpoonSense uses your daily context to budget mental energy—so you never burn out.
                  </p>
                </div>

                <div className="space-y-4 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                      Your Name
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Alex Sharma"
                      required
                      className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/60 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                        College / University
                      </label>
                      <input
                        type="text"
                        value={college}
                        onChange={(e) => setCollege(e.target.value)}
                        placeholder="e.g. VJTI Mumbai"
                        className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/60 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                        Degree / Major
                      </label>
                      <input
                        type="text"
                        value={major}
                        onChange={(e) => setMajor(e.target.value)}
                        placeholder="e.g. Computer Engineering"
                        className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/60 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
                      When does your brain focus best?
                    </label>
                    <div className="grid grid-cols-3 gap-2.5">
                      {[
                        { id: 'morning', label: 'Morning', sub: 'Peak 8am-12pm', icon: Sun },
                        { id: 'intermediate', label: 'Afternoon', sub: 'Peak 1pm-5pm', icon: Sunset },
                        { id: 'evening', label: 'Night Owl', sub: 'Peak 7pm-12am', icon: Moon },
                      ].map((c) => {
                        const Icon = c.icon;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setChronotype(c.id)}
                            className={`p-3 rounded-2xl border text-left transition-all ${
                              chronotype === c.id
                                ? 'bg-violet-600/20 border-violet-500 text-white shadow-lg shadow-violet-500/20'
                                : 'bg-slate-800/40 border-white/5 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <Icon className="w-4 h-4 text-violet-400 mb-1.5" />
                            <div className="text-xs font-bold text-white">{c.label}</div>
                            <div className="text-[10px] text-slate-400">{c.sub}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── STEP 2: Transit & Commute ── */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                    Physics, Not Willpower
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-3 tracking-tight">
                    How is your daily commute?
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
                    Long commutes (up to 8 hours daily) and packed local trains drain your sensory spoons before you even open a notebook.
                  </p>
                </div>

                {/* Single vs Multi-Leg Switcher */}
                <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-800/60 rounded-2xl border border-white/5">
                  <button
                    type="button"
                    onClick={() => setUseMultiLeg(false)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                      !useMultiLeg
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ⚡ Single Journey
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseMultiLeg(true)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      useMultiLeg
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Multi-Leg Breakdown (Train + Bus + Walk)
                  </button>
                </div>

                {!useMultiLeg ? (
                  /* ── SINGLE JOURNEY MODE ── */
                  <div className="space-y-5 pt-1">
                    <div className="p-4 rounded-2xl bg-slate-800/50 border border-white/5 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-300">Travel time each way:</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max="300"
                            value={commuteMode === 'wfh' ? 0 : commuteMinutes}
                            disabled={commuteMode === 'wfh'}
                            onChange={(e) => setCommuteMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            className="w-16 bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-center font-mono font-bold text-amber-400 text-sm focus:outline-none focus:border-amber-400"
                          />
                          <span className="text-slate-400 font-mono text-xs">mins</span>
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
                            <span>5 mins</span>
                            <span>1 hr (60m)</span>
                            <span>2 hrs (120m)</span>
                            <span>3 hrs (180m)</span>
                            <span>4 hrs each way (8h total)</span>
                          </div>
                        </>
                      )}

                      {/* Quick Presets */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
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
                            className={`px-2 py-1 rounded-lg text-[10px] font-mono border transition-all ${
                              commuteMinutes === preset.mins && commuteMode !== 'wfh'
                                ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                                : 'bg-slate-800/80 border-white/5 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
                        Primary Travel Mode
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {[
                          { id: 'crowded', label: '🚆 Packed Train/Metro', sub: 'High sensory drain' },
                          { id: 'seated', label: '🚌 Seated Bus', sub: 'Moderate load' },
                          { id: 'walk', label: '🚶 Walk / Cycle', sub: 'Active physical' },
                          { id: 'car', label: '🚗 Car / Bike', sub: 'Driving focus' },
                          { id: 'wfh', label: '🏠 Campus Hostel / WFH', sub: 'Zero transit drain' },
                        ].map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setCommuteMode(m.id)}
                            className={`p-3.5 rounded-2xl border text-left transition-all ${
                              commuteMode === m.id
                                ? 'bg-amber-500/20 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                                : 'bg-slate-800/40 border-white/5 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <div className="text-xs font-bold text-white">{m.label}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{m.sub}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── MULTI-LEG BREAKDOWN MODE ── */
                  <div className="space-y-4 pt-1">
                    <p className="text-xs text-slate-400">
                      Break down your one-way journey into legs (e.g. train + bus + walking). Total daily travel will be calculated automatically.
                    </p>

                    <div className="space-y-2.5">
                      {commuteLegs.map((leg, idx) => (
                        <div
                          key={leg.id || idx}
                          className="p-3.5 rounded-2xl bg-slate-800/60 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{leg.icon}</span>
                              <input
                                type="text"
                                value={leg.label}
                                onChange={(e) => updateLegLabel(idx, e.target.value)}
                                className="bg-transparent text-xs font-semibold text-white border-b border-white/10 focus:border-amber-400 focus:outline-none px-1 py-0.5 w-full sm:w-48"
                                placeholder="Leg name"
                              />
                            </div>

                            {/* Mode Pill Selector */}
                            <div className="flex items-center gap-1.5">
                              {[
                                { id: 'crowded', label: 'Packed' },
                                { id: 'seated', label: 'Seated' },
                                { id: 'walk', label: 'Walk' },
                                { id: 'car', label: 'Auto/Cab' },
                              ].map((opt) => (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => updateLegMode(idx, opt.id)}
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition-all ${
                                    leg.mode === opt.id
                                      ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                                      : 'bg-slate-900/60 border-white/5 text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Minute Controls */}
                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => adjustLegMinutes(idx, -15)}
                              className="w-7 h-7 rounded-lg bg-slate-700/60 text-slate-300 hover:bg-slate-700 hover:text-white flex items-center justify-center text-xs font-bold"
                            >
                              -
                            </button>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max="240"
                                value={leg.minutes}
                                onChange={(e) => updateLegMinutes(idx, e.target.value)}
                                className="w-14 bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-center font-mono font-bold text-amber-400 text-xs focus:outline-none focus:border-amber-400"
                              />
                              <span className="text-[11px] text-slate-400 font-mono">m</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => adjustLegMinutes(idx, 15)}
                              className="w-7 h-7 rounded-lg bg-slate-700/60 text-slate-300 hover:bg-slate-700 hover:text-white flex items-center justify-center text-xs font-bold"
                            >
                              +
                            </button>

                            {commuteLegs.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeLeg(idx)}
                                className="w-7 h-7 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition-colors ml-1"
                                title="Remove leg"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={addLeg}
                      className="w-full py-2.5 rounded-xl border border-dashed border-white/15 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5 text-amber-400" />
                      Add Connecting Leg (e.g. Rickshaw, Bus, Metro)
                    </button>
                  </div>
                )}

                {/* ── LIVE TRANSIT ENERGY IMPACT CARD ── */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-800/60 to-slate-900/80 border border-amber-500/20 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                      <Train className="w-4 h-4 text-amber-400" />
                      Daily Commute Energy Toll
                    </span>
                    <span className="font-mono text-amber-400 font-bold">
                      -{computeEstCommuteDrain()} Spoons
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                    <div className="bg-slate-900/50 p-2 rounded-xl border border-white/5">
                      <div className="text-slate-400">One-way transit:</div>
                      <div className="font-mono font-bold text-white text-xs mt-0.5">
                        {effectiveOneWayMinutes} mins ({Math.floor(effectiveOneWayMinutes / 60)}h {effectiveOneWayMinutes % 60}m)
                      </div>
                    </div>
                    <div className="bg-slate-900/50 p-2 rounded-xl border border-white/5">
                      <div className="text-slate-400">Total daily roundtrip:</div>
                      <div className="font-mono font-bold text-amber-300 text-xs mt-0.5">
                        {roundtripHoursFormatted} hours ({effectiveRoundtripMinutes} mins)
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    💡 <strong className="text-slate-300">Why this matters:</strong> You start each day with a 12-spoon baseline. Travelling {roundtripHoursFormatted}h burns ~{computeEstCommuteDrain()} spoons purely from sensory overwhelm. SpoonSense respects this and protects your recovery windows.
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── STEP 3: Campus Classes & Labs ── */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-full border border-sky-500/20">
                    College Commitments
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-3 tracking-tight">
                    Typical Lecture & Lab Load
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
                    How many hours are you physically engaged in classes or practical workshops on typical days?
                  </p>
                </div>

                <div className="space-y-5 pt-2">
                  <div className="p-4 rounded-2xl bg-slate-800/50 border border-white/5 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-300">Average lecture hours per day:</span>
                      <span className="font-bold text-sky-400 font-mono text-sm">
                        {campusHours} hours / day
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
                  </div>

                  <label className="p-4 rounded-2xl bg-slate-800/40 border border-white/5 flex items-center gap-3 cursor-pointer hover:bg-slate-800/60 transition-colors">
                    <input
                      type="checkbox"
                      checked={hasIntenseLab}
                      onChange={(e) => setHasIntenseLab(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-0"
                    />
                    <div>
                      <div className="text-xs font-bold text-white">
                        I regularly have intensive 2-3 hour practical labs
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Automatically accounts for hands-on sensory exertion (-0.8 spoons).
                      </div>
                    </div>
                  </label>
                </div>
              </motion.div>
            )}

            {/* ── STEP 4: Life Chores & Energy Recovery ── */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    Holistic Capacity
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-3 tracking-tight">
                    Chores, Sleep & Sensory Environment
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
                    Life maintenance isn't "free time". Meal prep, cleaning, and sensory noise cost real spoons.
                  </p>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="p-4 rounded-2xl bg-slate-800/50 border border-white/5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-300">Daily chores & life tasks:</span>
                      <span className="font-bold text-emerald-400 font-mono text-sm">
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
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-2xl bg-slate-800/40 border border-white/5 space-y-2">
                      <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                        <Bed className="w-3.5 h-3.5 text-indigo-400" />
                        Average Sleep Quality
                      </span>
                      <select
                        value={sleepQuality}
                        onChange={(e) => setSleepQuality(e.target.value)}
                        className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                      >
                        <option value="poor">😫 Poor / Frequent Insomnia (-1.5 Sp)</option>
                        <option value="fair">😐 Fair / Average (-0.5 Sp)</option>
                        <option value="rested">😊 Rested & Consistent (Normal)</option>
                        <option value="excellent">⚡ High Sleep Recovery (+0.5 Sp)</option>
                      </select>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-800/40 border border-white/5 space-y-2">
                      <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                        <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                        Sensory Environment
                      </span>
                      <select
                        value={sensoryLoad}
                        onChange={(e) => setSensoryLoad(e.target.value)}
                        className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50"
                      >
                        <option value="low">🎧 Quiet Library / Low Sensory</option>
                        <option value="medium">🏫 Normal College Noise</option>
                        <option value="high">📢 High Crowd / Sensory Overload (-1.0 Sp)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-8 mt-6 border-t border-white/10">
            {step > 1 ? (
              <button
                type="button"
                onClick={handlePrev}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : (
              <div />
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/25 transition-all ml-auto"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/25 transition-all ml-auto disabled:opacity-50"
              >
                {loading ? (
                  <span>Initializing Your Space...</span>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Calculate My Spoons & Start</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-4 text-xs text-slate-500 flex items-center justify-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <span>Zero-Shame Cognitive Pacing. Your data never leaves your control.</span>
      </footer>
    </div>
  );
}
