import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Circle,
  Plus,
  RefreshCw,
  Mail,
  Sparkles,
  Coffee,
  Calendar,
  Clock,
  ShieldCheck,
  AlertCircle,
  Layers,
  ArrowRight,
  Send,
} from 'lucide-react';
import {
  getTasks,
  addTask,
  completeTask,
  addRestBlock,
  planToday,
  reshufflePlan,
  syncCalendar,
} from '../api';

/**
 * TaskPlanner Component (FEAT-C1, FEAT-C2, FEAT-C3, FEAT-C5)
 *
 * Capacity-sized cognitive day planner:
 * - Displays spoon cost badges (🥄 2.5) auto-calculated from type & duration
 * - Day plan respects 80% plannable capacity and protects 20% breathing room
 * - Rest blocks credit spoons (+0.5) and sit alongside academic tasks
 * - Low-capacity auto-reshuffler with calm toast notifications & 1-tap undo
 * - Empathetic shrink offer when task moved >= 3 times
 * - Polite extension email drafter trigger
 */
export default function TaskPlanner({
  userId,
  snapshot,
  onOpenExtension,
  onOpenDopamine,
  onOpenShrink,
  className = '',
}) {
  const [tasks, setTasks] = useState([]);
  const [todayPlan, setTodayPlan] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isReshuffling, setIsReshuffling] = useState(false);
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
  const [reshuffleToast, setReshuffleToast] = useState(null);

  // New task form state
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('reading');
  const [newDifficulty, setNewDifficulty] = useState('normal');
  const [newMinutes, setNewMinutes] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [isFixedDeadline, setIsFixedDeadline] = useState(false);

  // Calculated preview spoon cost
  const defaultDurations = { reading: 20, writing: 30, problem_solving: 45, admin: 10, other: 20 };
  const typeRates = { reading: 0.067, writing: 0.09, problem_solving: 0.089, admin: 0.05, other: 0.067 };
  const diffMultipliers = { easy: 0.8, normal: 1.0, hard: 1.2 };

  const previewMinutes = newMinutes ? parseInt(newMinutes) : defaultDurations[newType] || 20;
  const previewCost = (
    previewMinutes *
    (typeRates[newType] || 0.067) *
    (diffMultipliers[newDifficulty] || 1.0)
  ).toFixed(1);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [tasksRes, planRes] = await Promise.all([
        getTasks(userId, false).catch(() => ({ tasks: [] })),
        planToday(userId).catch(() => ({ plan: null })),
      ]);
      if (tasksRes && tasksRes.tasks) setTasks(tasksRes.tasks);
      if (planRes && planRes.plan) setTodayPlan(planRes.plan);
    } catch (err) {
      console.error('Failed to load planner data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      await addTask(userId, {
        title: newTitle,
        task_type: newType,
        difficulty: newDifficulty,
        estimated_minutes: newMinutes ? parseInt(newMinutes) : null,
        due_date: newDueDate || null,
        is_fixed_deadline: isFixedDeadline,
      });
      setNewTitle('');
      setNewMinutes('');
      setNewDueDate('');
      setIsAddingTask(false);
      await loadData();
    } catch (err) {
      console.error('Add task error:', err);
    }
  };

  const handleAddRest = async () => {
    try {
      await addRestBlock(userId, '20m Recharge & Chai', 20);
      await loadData();
    } catch (err) {
      console.error('Add rest block error:', err);
    }
  };

  const handleComplete = async (taskId) => {
    try {
      await completeTask(userId, taskId);
      await loadData();
    } catch (err) {
      console.error('Complete task error:', err);
    }
  };

  const handleReshuffle = async () => {
    setIsReshuffling(true);
    try {
      const res = await reshufflePlan(userId);
      if (res && res.reshuffled) {
        setReshuffleToast(res.message);
        if (res.updated_plan) setTodayPlan(res.updated_plan);
        await loadData();
      } else {
        setReshuffleToast('Everything is well-paced! No reshuffling needed.');
      }
    } catch (err) {
      console.error('Reshuffle error:', err);
    } finally {
      setIsReshuffling(false);
      setTimeout(() => setReshuffleToast(null), 6000);
    }
  };

  const handleSyncToCalendar = async () => {
    setIsSyncingCalendar(true);
    try {
      const res = await syncCalendar(userId, tasks);
      setReshuffleToast(
        res?.message || 'Daily schedule synced to Google Calendar as [SpoonSense] blocks!'
      );
    } catch (err) {
      console.error('Calendar sync error:', err);
      setReshuffleToast('Failed to sync to Google Calendar. Check connection.');
    } finally {
      setIsSyncingCalendar(false);
      setTimeout(() => setReshuffleToast(null), 6000);
    }
  };

  const liveSpoons = snapshot?.live_spoons ?? snapshot?.prior_spoons ?? 6.0;
  const plannableCapacity = todayPlan?.planned_capacity ?? (liveSpoons * 0.8).toFixed(1);
  const reservedBuffer = todayPlan?.reserved_spoons ?? (liveSpoons * 0.2).toFixed(1);
  const totalPlannedCost = todayPlan?.total_planned_cost ?? tasks.reduce((acc, t) => acc + Math.max(0, t.spoon_cost), 0).toFixed(1);
  const remainingCapacity = todayPlan?.remaining_capacity ?? Math.max(0, plannableCapacity - totalPlannedCost).toFixed(1);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Reshuffle Notification Banner (Zero-Shame Toast) */}
      <AnimatePresence>
        {reshuffleToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between shadow-lg"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>{reshuffleToast}</span>
            </div>
            <button
              onClick={() => setReshuffleToast(null)}
              className="text-[11px] font-semibold text-amber-300 hover:text-white ml-3 underline"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Planner Header Card */}
      <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 backdrop-blur-xl shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider uppercase text-violet-400">
                Cognitive Capacity Planner
              </span>
              <span className="px-2 py-0.5 text-[10px] rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                80% Rule Protected
              </span>
            </div>
            <h3 className="text-xl font-bold text-white mt-0.5">Today's Focus Budget</h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Add Rest Button */}
            <button
              onClick={handleAddRest}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 transition-all text-xs font-medium"
              title="Add a 20-min rest block to restore spoons"
            >
              <Coffee className="w-3.5 h-3.5 text-emerald-400" />
              <span>Add Rest (+0.5 🥄)</span>
            </button>

            {/* Auto Reshuffle Button */}
            <button
              onClick={handleReshuffle}
              disabled={isReshuffling}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition-all text-xs font-medium"
              title="Autonomous load reshuffle to lighter days"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isReshuffling ? 'animate-spin' : ''}`} />
              <span>Auto-Reshuffle</span>
            </button>

            {/* Sync to Google Calendar Button */}
            <button
              onClick={handleSyncToCalendar}
              disabled={isSyncingCalendar}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 hover:bg-sky-500/25 transition-all text-xs font-medium"
              title="Sync your capacity-protected schedule to Google Calendar"
            >
              <Calendar className={`w-3.5 h-3.5 text-sky-400 ${isSyncingCalendar ? 'animate-spin' : ''}`} />
              <span>{isSyncingCalendar ? 'Syncing...' : 'Sync to GCal'}</span>
            </button>

            {/* Add Task Button */}
            <button
              onClick={() => setIsAddingTask(!isAddingTask)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-all text-xs font-semibold shadow-sm shadow-violet-600/30"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Task</span>
            </button>
          </div>
        </div>

        {/* Capacity Slicing Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-white/5">
          <div className="p-3 rounded-xl bg-slate-800/40 border border-white/5">
            <span className="text-[11px] text-slate-400 block">Plannable Budget</span>
            <span className="text-lg font-bold text-white">{plannableCapacity} 🥄</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/40 border border-white/5">
            <span className="text-[11px] text-slate-400 block">Total Planned Cost</span>
            <span className="text-lg font-bold text-violet-300">{totalPlannedCost} 🥄</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/40 border border-white/5">
            <span className="text-[11px] text-slate-400 block">Remaining Room</span>
            <span className="text-lg font-bold text-sky-300">{remainingCapacity} 🥄</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/40 border border-white/5">
            <span className="text-[11px] text-emerald-400 block">Protected Buffer</span>
            <span className="text-lg font-bold text-emerald-300">{reservedBuffer} 🥄</span>
          </div>
        </div>
      </div>

      {/* Add Task Form Drawer */}
      <AnimatePresence>
        {isAddingTask && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleAddTask}
            className="p-5 rounded-2xl bg-slate-900 border border-violet-500/30 shadow-xl space-y-4 overflow-hidden"
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h4 className="text-sm font-bold text-white">Add Load-Aware Task</h4>
              <span className="text-xs text-violet-300 font-semibold">
                Est. Cost: 🥄 {previewCost} spoons
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Task Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Read Operating Systems Chapter 5"
                  required
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Task Category
                </label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="reading">Reading (0.067 sp/min, def: 20m)</option>
                  <option value="writing">Writing / Reports (0.09 sp/min, def: 30m)</option>
                  <option value="problem_solving">Problem Solving / Coding (0.089 sp/min, def: 45m)</option>
                  <option value="admin">Admin / Logistics (0.05 sp/min, def: 10m)</option>
                  <option value="other">General Task (0.067 sp/min, def: 20m)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Estimated Minutes (Optional)
                </label>
                <input
                  type="number"
                  value={newMinutes}
                  onChange={(e) => setNewMinutes(e.target.value)}
                  placeholder={`Default: ${defaultDurations[newType]}m`}
                  min="1"
                  max="480"
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Subjective Difficulty
                </label>
                <select
                  value={newDifficulty}
                  onChange={(e) => setNewDifficulty(e.target.value)}
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="easy">Easy (0.8x cost multiplier)</option>
                  <option value="normal">Normal (1.0x)</option>
                  <option value="hard">Hard / Taxing (1.2x)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Due Date (Optional)
                </label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={isFixedDeadline}
                  onChange={(e) => setIsFixedDeadline(e.target.checked)}
                  className="accent-violet-500 rounded"
                />
                <span>Hard external deadline (cannot be auto-reshuffled)</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingTask(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs transition-colors"
                >
                  Add with 🥄 {previewCost} Cost
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Task List */}
      <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 backdrop-blur-xl shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-white tracking-wide">
            Scheduled Focus Tasks ({tasks.length})
          </h4>
          <span className="text-[11px] text-slate-400">
            Ordered by deadline & cognitive fit
          </span>
        </div>

        {tasks.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No pending tasks. Enjoy your breathing room or tap "Add Task" to schedule one.
          </div>
        ) : (
          <div className="space-y-2.5">
            {tasks.map((task) => {
              const isRest = task.is_rest_block;
              const isCompleted = task.completed;
              const reshuffledOften = (task.reshuffle_count || 0) >= 3;

              return (
                <div
                  key={task.task_id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isRest
                      ? 'bg-emerald-950/20 border-emerald-500/30'
                      : isCompleted
                      ? 'bg-slate-800/30 border-white/5 opacity-60'
                      : 'bg-slate-800/50 border-white/5 hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    {/* Completion Checkbox */}
                    <button
                      onClick={() => handleComplete(task.task_id)}
                      className="text-slate-400 hover:text-emerald-400 transition-colors flex-shrink-0"
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>

                    {/* Task Title & Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-semibold truncate ${
                            isCompleted ? 'line-through text-slate-400' : 'text-white'
                          }`}
                        >
                          {task.title}
                        </span>
                        {isRest && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold">
                            Rest Block
                          </span>
                        )}
                        {task.is_fixed_deadline && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-semibold">
                            Fixed Deadline
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-slate-400">
                        <span>{task.estimated_minutes || 20}m duration</span>
                        <span>•</span>
                        <span className="capitalize">{task.task_type.replace('_', ' ')}</span>
                        {task.due_date && (
                          <>
                            <span>•</span>
                            <span className="text-amber-300/90 flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> Due {task.due_date}
                            </span>
                          </>
                        )}
                        {task.reshuffle_count > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-purple-300">
                              Reshuffled {task.reshuffle_count}x
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Cost Badge & Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold border ${
                          isRest
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                            : 'bg-violet-500/15 border-violet-500/30 text-violet-200'
                        }`}
                      >
                        {isRest ? `+${Math.abs(task.spoon_cost)} 🥄` : `${task.spoon_cost} 🥄`}
                      </span>

                      {/* Request Extension Button (FEAT-C4) */}
                      {task.due_date && !isCompleted && onOpenExtension && (
                        <button
                          onClick={() => onOpenExtension(task)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-violet-300 hover:bg-white/5 transition-colors"
                          title="Draft a polite extension email"
                        >
                          <Mail className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Anti-Paralysis Shrink Offer (FEAT-C3, FEAT-D1) */}
                  {reshuffledOften && !isCompleted && onOpenShrink && (
                    <div className="mt-3 p-2.5 rounded-xl bg-violet-950/40 border border-violet-500/30 flex items-center justify-between text-xs text-violet-200">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                        <span>This task was moved 3 times. Want to shrink it into a 2-minute step?</span>
                      </div>
                      <button
                        onClick={() => onOpenShrink(task)}
                        className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-semibold transition-colors flex-shrink-0"
                      >
                        Shrink it
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
