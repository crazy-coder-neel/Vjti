import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, BrainCircuit, Activity, Zap, ShieldCheck } from 'lucide-react';

const ReasoningPanel = ({ isOpen, setOpen, snapshot = null, burnoutRisk = null }) => {
  const liveSpoons = snapshot?.live_spoons ?? snapshot?.prior_spoons ?? 6.0;
  const fatiguePercent = Math.min(95, Math.max(15, Math.round(((12 - liveSpoons) / 12) * 100)));
  const energyLevelText = liveSpoons >= 8 ? 'High' : liveSpoons >= 5 ? 'Moderate' : 'Low';

  const reasoningSteps = [
    `Analyzing current cognitive load (Live: ${Number(liveSpoons).toFixed(1)} / 12 spoons)...`,
    `Transit & timetable mapped: estimated fatigue at ${fatiguePercent}%.`,
    "Circadian peak identified for complex academic deep work.",
    "Auto-buffer & 20% breathing room reserved to prevent task paralysis."
  ];
  const [visibleSteps, setVisibleSteps] = useState([]);

  useEffect(() => {
    if (isOpen) {
      setVisibleSteps([]);
      let idx = 0;
      const timer = setInterval(() => {
        if (idx < reasoningSteps.length) {
          setVisibleSteps((prev) => [...prev, reasoningSteps[idx]]);
          idx++;
        } else {
          clearInterval(timer);
        }
      }, 600);
      return () => clearInterval(timer);
    } else {
      setVisibleSteps([]);
    }
  }, [isOpen, liveSpoons, fatiguePercent]);

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{
        width: isOpen ? 300 : 0,
        opacity: isOpen ? 1 : 0
      }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="h-full overflow-hidden relative flex-shrink-0"
    >
      <div className="p-5 h-full flex flex-col w-[300px]">
        <div className="flex items-center justify-between mb-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
            <BrainCircuit className="w-4 h-4" />
            AI Reasoning
          </h3>
          <button
            onClick={() => setOpen(false)}
            className="p-1 hover:bg-white/5 rounded text-slate-500 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Reasoning Steps */}
        <div className="space-y-3 flex-1 overflow-y-auto">
          <AnimatePresence>
            {visibleSteps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white/[0.03] border border-white/[0.04] rounded-lg p-2.5 text-xs text-slate-300 relative"
              >
                <div className="absolute top-2.5 left-0 w-[2px] h-3 bg-emerald-500 rounded-r-full" />
                <p className="pl-2.5">{step}</p>
              </motion.div>
            ))}
          </AnimatePresence>

          {visibleSteps.length === reasoningSteps.length && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-4 pt-4 border-t border-white/[0.04]"
            >
              <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Live Factors</h4>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/[0.03] p-2.5 rounded-lg text-center border border-white/[0.04]">
                  <Activity size={14} className="text-amber-400 mx-auto mb-1" />
                  <span className="block text-lg font-bold text-white">{fatiguePercent}%</span>
                  <span className="text-[9px] text-slate-400">Fatigue Load</span>
                </div>
                <div className="bg-white/[0.03] p-2.5 rounded-lg text-center border border-white/[0.04]">
                  <Zap size={14} className="text-emerald-400 mx-auto mb-1" />
                  <span className="block text-lg font-bold text-white">{energyLevelText}</span>
                  <span className="text-[9px] text-slate-400">Cognitive Energy</span>
                </div>
              </div>

              <div className="mt-3 bg-emerald-500/[0.06] border border-emerald-500/15 p-2.5 rounded-lg flex items-start gap-2">
                <ShieldCheck className="text-emerald-400 flex-shrink-0 mt-0.5" size={14} />
                <div>
                  <h5 className="text-xs font-medium text-emerald-300">Load Protected</h5>
                  <p className="text-[10px] text-emerald-500/80 mt-0.5">
                    Tasks auto-sized around your commute & sleep capacity.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ReasoningPanel;
