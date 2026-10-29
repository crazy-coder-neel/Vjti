import React from 'react';
import { motion } from 'framer-motion';
import {
  Sun,
  CloudSun,
  CloudRain,
  CloudLightning,
  ChevronRight,
  Calendar,
} from 'lucide-react';

/**
 * EnergyWeatherBar Component (FEAT-A3, FEAT-E1)
 *
 * 7-Day horizontal cognitive energy forecast strip:
 * - Maps upcoming days to weather states based on predicted prior spoon budgets.
 * - Highlights today with a distinct badge.
 * - Shows primary driving factor (commute, deadlines, labs, free afternoon).
 * - Clickable days to inspect or plan ahead.
 */
export default function EnergyWeatherBar({
  forecast = [],
  selectedDate = null,
  onSelectDate = null,
  className = '',
}) {
  const weatherIcons = {
    sunny: { icon: Sun, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    partly_cloudy: { icon: CloudSun, color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
    cloudy: { icon: CloudRain, color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
    stormy: { icon: CloudLightning, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const formatDay = (dateStr) => {
    if (!dateStr) return '';
    try {
      const parts = String(dateStr).split('T')[0].split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return d.toLocaleDateString('en-US', { weekday: 'short' });
      }
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'short' });
    } catch {
      return '';
    }
  };

  const formatDateNum = (dateStr) => {
    if (!dateStr) return '';
    try {
      const parts = String(dateStr).split('T')[0].split('-');
      if (parts.length === 3) {
        return parseInt(parts[2], 10);
      }
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? '' : d.getDate();
    } catch {
      return '';
    }
  };

  return (
    <div
      className={`bg-slate-900/80 border border-white/10 rounded-2xl p-4 backdrop-blur-xl shadow-lg ${className}`}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-white tracking-wide">
            7-Day Cognitive Weather Forecast
          </h3>
        </div>
        <span className="text-[11px] text-slate-400">
          Load-aware forecast based on your timetable
        </span>
      </div>

      {/* Horizontal Scrollable Day Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5 overflow-x-auto pb-1">
        {forecast && forecast.length > 0 ? (
          forecast.slice(0, 7).map((day, idx) => {
            const dayDate = day.date || day.target_date;
            const isToday = dayDate === todayStr || idx === 0;
            const isSelected = selectedDate === dayDate;
            const weatherKey = day.weather || 'partly_cloudy';
            const { icon: Icon, color, bg } = weatherIcons[weatherKey] || weatherIcons.partly_cloudy;
            const spoons = Number(day.prior_spoons ?? day.estimated_spoons ?? day.prior ?? 6.0);
            const driver = day.driver || day.driving_factor || (spoons >= 8 ? 'Light day' : spoons >= 5 ? 'Balanced' : 'High load');

            return (
              <motion.div
                key={dayDate || idx}
                whileHover={{ y: -2 }}
                onClick={() => onSelectDate && onSelectDate({ ...day, date: dayDate })}
                className={`relative flex flex-col items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none text-center ${
                  isSelected
                    ? 'bg-violet-600/20 border-violet-500 shadow-md shadow-violet-500/20'
                    : isToday
                    ? 'bg-slate-800/80 border-violet-500/50 shadow-sm'
                    : 'bg-slate-800/40 border-white/5 hover:border-white/15'
                }`}
              >
                {/* Today Ribbon */}
                {isToday && (
                  <span className="absolute -top-2 px-1.5 py-0.5 rounded-full bg-violet-500 text-[9px] font-bold text-white tracking-wider uppercase shadow-sm">
                    Today
                  </span>
                )}

                {/* Day Header */}
                <div className="mt-1">
                  <div className="text-xs font-semibold text-slate-300">
                    {formatDay(dayDate)}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {formatDateNum(dayDate)}
                  </div>
                </div>

                {/* Weather Icon */}
                <div className={`p-2 rounded-xl my-2 border ${bg}`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>

                {/* Spoons Forecast */}
                <div className="text-sm font-bold text-white">
                  {spoons.toFixed(1)}{' '}
                  <span className="text-[10px] font-normal text-slate-400">spoons</span>
                </div>

                {/* Driving Factor */}
                <div
                  className="mt-1 text-[10px] text-slate-400 line-clamp-1 max-w-full px-1 py-0.5 rounded bg-white/5"
                  title={driver}
                >
                  {driver}
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="col-span-7 p-4 text-center text-xs text-slate-400">
            Loading 7-day energy weather forecast...
          </div>
        )}
      </div>
    </div>
  );
}
