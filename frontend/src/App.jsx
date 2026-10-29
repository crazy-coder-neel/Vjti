import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import EnergyGauge from './components/EnergyGauge';
import ChatInput from './components/ChatInput';
import VoiceButton from './components/VoiceButton';
import SmartCalendar from './components/SmartCalendar';
import ReasoningPanel from './components/ReasoningPanel';
import MetricCard from './components/MetricCard';
import NeuralBackground from './components/NeuralBackground';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import SpoonMeter from './components/SpoonMeter';
import WhyPanelModal from './components/WhyPanelModal';
import EnergyWeatherBar from './components/EnergyWeatherBar';
import PulseGameModal from './components/PulseGameModal';
import TaskPlanner from './components/TaskPlanner';
import ForgivingGarden from './components/ForgivingGarden';
import EveningCheckinModal from './components/EveningCheckinModal';
import DopamineMenuModal from './components/DopamineMenuModal';
import ExtensionEmailModal from './components/ExtensionEmailModal';
import TaskShrinkerModal from './components/TaskShrinkerModal';
import { getTodaySnapshot, getForecast, overrideSpoons, getGarden, seedDemoProfile } from './api';
import Login from './pages/Login';
import Signup from './pages/Signup';
import DeepWorkMode from './pages/DeepWorkMode';
import CognitiveInsights from './pages/CognitiveInsights';
import RecoveryCycles from './pages/RecoveryCycles';
import Settings from './pages/Settings';
import PrivacyPage from './pages/PrivacyPage';
import LandingPage from './pages/LandingPage';
import { supabase, enableAutoRefresh } from './supabaseClient';
import { Zap, Menu, Bell, LogOut, Settings as SettingsIcon, User, Search, Coffee, Moon } from 'lucide-react';

const DashboardLayout = ({ theme, userRole, energyLevel, metrics, userName, userEmail, userId }) => {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [isReasoningOpen, setReasoningOpen] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [garden, setGarden] = useState(null);
  const [isPulseOpen, setIsPulseOpen] = useState(false);
  const [isWhyOpen, setIsWhyOpen] = useState(false);
  const [isEveningOpen, setIsEveningOpen] = useState(false);
  const [isDopamineOpen, setIsDopamineOpen] = useState(false);
  const [isExtensionOpen, setIsExtensionOpen] = useState(false);
  const [extensionTask, setExtensionTask] = useState(null);
  const [isShrinkOpen, setIsShrinkOpen] = useState(false);
  const [shrinkTargetTask, setShrinkTargetTask] = useState(null);
  const [selectedForecastDay, setSelectedForecastDay] = useState(null);
  const [activePersona, setActivePersona] = useState('demo');
  const [personaLoading, setPersonaLoading] = useState(false);
  const navigate = useNavigate();

  const handleSwitchPersona = async (persona) => {
    setActivePersona(persona);
    setPersonaLoading(true);
    const effectiveUserId = userId || 'demo_student';
    try {
      await seedDemoProfile(persona, effectiveUserId);
      await fetchSpoonData();
    } catch (e) {
      console.warn('Failed to seed persona:', e);
    } finally {
      setPersonaLoading(false);
    }
  };

  // Load SpoonSense snapshot, 7-day forecast, and forgiving garden
  const fetchSpoonData = async () => {
    try {
      const effectiveUserId = userId || 'demo_student';
      const [snapData, forecastData, gardenData] = await Promise.all([
        getTodaySnapshot(effectiveUserId).catch(() => null),
        getForecast(effectiveUserId).catch(() => null),
        getGarden(effectiveUserId).catch(() => null),
      ]);
      if (snapData) {
        setSnapshot(snapData.snapshot || snapData);
      }
      if (forecastData && forecastData.forecast) {
        setForecast(forecastData.forecast);
      }
      if (gardenData && gardenData.garden) {
        setGarden(gardenData.garden);
      }
    } catch (e) {
      console.warn('Could not load SpoonSense data:', e);
    }
  };

  useEffect(() => {
    fetchSpoonData();
  }, [userId]);

  const handleGameCompleted = async (result) => {
    console.log('Game probe completed:', result);
    await fetchSpoonData();
  };

  const handleOverrideSpoons = async (newSpoons) => {
    try {
      const effectiveUserId = userId || 'demo_student';
      await overrideSpoons(effectiveUserId, newSpoons);
      await fetchSpoonData();
    } catch (err) {
      console.error('Failed to update spoon override:', err);
    }
  };

  const handleOpenShrink = (task) => {
    setShrinkTargetTask(task);
    setIsShrinkOpen(true);
  };

  const handleShrinkStepCompleted = async (stepInfo) => {
    // Update garden after step completion
    const effectiveUserId = userId || 'demo_student';
    try {
      const gardenData = await getGarden(effectiveUserId);
      if (gardenData && gardenData.garden) {
        setGarden(gardenData.garden);
      }
    } catch (e) {
      console.warn('Garden refresh after shrink step:', e);
    }
  };

  // Helper functions for status types
  const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

  const getStatusType = (level, mode = 'negative_is_bad') => {
    const isBad = mode === 'negative_is_bad';
    switch (level?.toLowerCase()) {
      case 'low': return isBad ? 'success' : 'error';
      case 'medium': return 'warning';
      case 'high': return isBad ? 'error' : 'success';
      case 'stable': return 'success';
      case 'none': return 'success';
      default: return 'success';
    }
  };

  const getToneType = (tone) => {
    switch (tone?.toLowerCase()) {
      case 'positive': return 'success';
      case 'neutral': return 'warning';
      case 'negative': return 'error';
      default: return 'success';
    }
  };

  const handleSendMessage = (msg) => {
    console.log("Message sent:", msg);
  };

  const updateDashboardFromAPI = (apiResponse) => {
    console.log("Updating dashboard from API response:", apiResponse);

    if (!apiResponse || apiResponse.status !== 'success') return;

    // This will be handled by the parent App component
    // We'll pass this up through a callback
    window.dispatchEvent(new CustomEvent('dashboardUpdate', { detail: apiResponse }));
  };

  const location = useLocation();

  const getPageTitle = () => {
    const path = location.pathname;
    switch (path) {
      case '/dashboard': return 'Dashboard';
      case '/tasks': return 'Task Manager';
      case '/insights': return 'Cognitive Insights';
      case '/recovery': return 'Recovery Cycles';
      case '/settings': return 'Settings';
      default: return 'Dashboard';
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const initials = userName
    ? userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'NP';

  const handleSignOut = async () => {
    setShowProfileMenu(false);
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Sign out error:', e);
    }
    navigate('/login');
  };

  const renderContent = () => {
    const path = location.pathname;

    switch (path) {
      case '/dashboard':
        return (
          <div className="max-w-[1400px] mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
            {/* Welcome Banner & Demo Persona Switcher (FEAT-A3) */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/40 border border-white/[0.06]">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-semibold text-white">
                    {getGreeting()}, <span className="text-emerald-400">{activePersona === 'aarav' ? 'Aarav Sharma' : activePersona === 'meera' ? 'Meera Patel' : userName || 'User'}</span>
                  </h2>
                  {activePersona !== 'demo' && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                      {activePersona} Profile Active
                    </span>
                  )}
                </div>
                <p className="text-slate-400 text-sm mt-1">
                  {activePersona === 'aarav'
                    ? "Heavy Commute Student: 240m daily crowded transit + 9h campus -> 2.4 Spoons (Stormy Weather)."
                    : activePersona === 'meera'
                    ? "Walk-to-Campus Student: 20m daily walk + 9h campus -> 7.4 Spoons (Sunny Weather)."
                    : "Load-aware cognitive capacity & timetable rhythm with 12-spoon daily budget."}
                </p>
              </div>

              {/* Persona Switcher Buttons for Hackathon Demo */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-800/80 border border-white/10 text-xs">
                  <span className="text-[10px] uppercase font-bold text-slate-400 px-1.5">Preset:</span>
                  <button
                    onClick={() => handleSwitchPersona('aarav')}
                    disabled={personaLoading}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all text-xs flex items-center gap-1.5 ${
                      activePersona === 'aarav'
                        ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Aarav: 4hr daily transit -> 2.4 spoons, Stormy"
                  >
                    <span>🚆 Aarav (4h Transit)</span>
                  </button>
                  <button
                    onClick={() => handleSwitchPersona('meera')}
                    disabled={personaLoading}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all text-xs flex items-center gap-1.5 ${
                      activePersona === 'meera'
                        ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Meera: 10min walk -> 7.4 spoons, Sunny"
                  >
                    <span>🚶 Meera (Walk)</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsDopamineOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition-all text-xs font-semibold shadow-sm"
                    title="Low-friction micro-activities off-ramp"
                  >
                    <Coffee className="w-3.5 h-3.5 text-amber-400" />
                    <span>Dopamine Menu</span>
                  </button>
                  <button
                    onClick={() => setIsEveningOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 transition-all text-xs font-semibold shadow-sm"
                    title="One-tap 10s evening check-in"
                  >
                    <Moon className="w-3.5 h-3.5 text-purple-400" />
                    <span>Evening</span>
                  </button>
                  <button
                    onClick={() => setIsPulseOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-300 hover:bg-violet-600/30 transition-all text-xs font-semibold shadow-sm"
                  >
                    <Zap className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
                    <span>20s Pulse</span>
                  </button>
                </div>
              </div>
            </div>

            {/* SpoonSense 7-Day Energy Weather Strip (FEAT-A3, FEAT-E1) */}
            <EnergyWeatherBar
              forecast={forecast}
              selectedDate={selectedForecastDay?.date}
              onSelectDate={(day) => {
                setSelectedForecastDay(day);
                setIsWhyOpen(true);
              }}
            />

            {/* SpoonSense 12-Spoon Capacity Meter (FEAT-E1) */}
            <SpoonMeter
              snapshot={snapshot}
              onOpenWhy={() => setIsWhyOpen(true)}
              onOpenPulse={() => setIsPulseOpen(true)}
              onOverrideSpoons={handleOverrideSpoons}
            />

            {/* The Forgiving Garden (FEAT-E2) — Streak that never wilts */}
            <ForgivingGarden
              garden={garden}
              userId={userId || 'demo_student'}
              onGardenUpdate={(g) => setGarden(g)}
            />

            {/* Cognitive Reality Metrics Row (Replacing clinical diagnostic cards with Zero-Shame load metrics) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                title="Energy Weather"
                value={
                  snapshot?.weather === 'sunny'
                    ? 'Sunny'
                    : snapshot?.weather === 'partly_cloudy'
                    ? 'Partly Cloudy'
                    : snapshot?.weather === 'cloudy'
                    ? 'Rainy'
                    : snapshot?.weather === 'stormy'
                    ? 'Stormy'
                    : 'Clear'
                }
                unit={snapshot?.range_text || 'Active Forecast'}
                type="success"
                icon="focus"
              />
              <MetricCard
                title="Transit Load"
                value={
                  (snapshot?.commute_cost ?? snapshot?.factors?.commute_cost)
                    ? `-${Number(snapshot?.commute_cost ?? snapshot?.factors?.commute_cost).toFixed(1)} Sp`
                    : '0.0 Sp'
                }
                unit={
                  (snapshot?.commute_cost ?? snapshot?.factors?.commute_cost) > 0
                    ? 'Transit & Crowd'
                    : 'Zero Transit / WFH'
                }
                type="warning"
                icon="recovery"
              />
              <MetricCard
                title="Campus Load"
                value={
                  (snapshot?.campus_cost ?? snapshot?.factors?.campus_cost)
                    ? `-${Number(snapshot?.campus_cost ?? snapshot?.factors?.campus_cost).toFixed(1)} Sp`
                    : '0.0 Sp'
                }
                unit="Lectures & Labs"
                type="warning"
                icon="burnout"
              />
              <MetricCard
                title="Protected Buffer"
                value={
                  snapshot
                    ? `${(Math.min(2.4, (snapshot.live_spoons || snapshot.prior_spoons || 6.0) * 0.2)).toFixed(1)} Sp`
                    : '1.2 Sp'
                }
                unit="20% Burnout Protection"
                type="success"
                icon="risk"
              />
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Energy Gauge */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="lg:col-span-4 bg-slate-800/40 border border-white/[0.06] rounded-2xl flex flex-col items-center justify-center p-6 relative overflow-visible min-h-[320px]"
              >
                <EnergyGauge energyLevel={energyLevel} />
              </motion.div>

              {/* Chat Input Area */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="lg:col-span-8 flex flex-col justify-center min-h-[320px]"
              >
                <div className="mb-6">
                  <h3 className="text-xl font-semibold text-white mb-1">Neural Assistant</h3>
                  <p className="text-slate-400 text-sm">
                    Operating at <span className="text-violet-300 font-medium">{(snapshot?.live_spoons ?? snapshot?.prior_spoons ?? 6.0).toFixed(1)} spoons</span> budget. Ask to break down tasks, plan around transit, or micro-shrink assignments.
                  </p>
                </div>
                {userRole !== 'parent' && <ChatInput onSendMessage={handleSendMessage} onAnalysisComplete={updateDashboardFromAPI} userId={userId} />}
              </motion.div>
            </div>

            {/* Schedule + Reasoning Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" style={{ minHeight: '460px' }}>
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="lg:col-span-2 h-full"
              >
                <SmartCalendar />
              </motion.div>

              <div className="hidden lg:block h-full">
                <div className="bg-slate-800/40 border border-white/[0.06] rounded-2xl h-full relative overflow-hidden">
                  <ReasoningPanel isOpen={isReasoningOpen} setOpen={setReasoningOpen} />
                </div>
              </div>
            </div>
          </div>
        );
      case '/tasks':
        if (userRole === 'parent') return <div className="p-8 text-center text-slate-400">Access Restricted</div>;
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-5xl mx-auto h-full flex flex-col space-y-6 pb-20"
          >
            <TaskPlanner
              userId={userId || 'demo_student'}
              snapshot={snapshot}
              onOpenExtension={(t) => {
                setExtensionTask(t);
                setIsExtensionOpen(true);
              }}
              onOpenDopamine={() => setIsDopamineOpen(true)}
              onOpenShrink={handleOpenShrink}
            />
          </motion.div>
        );
      case '/insights':
        return <CognitiveInsights />;
      case '/recovery':
        return <RecoveryCycles />;
      case '/settings':
        if (userRole === 'parent') return <div className="p-8 text-center text-slate-400">Access Restricted</div>;
        return <Settings />;
      default:
        return (
          <div className="flex items-center justify-center h-full text-slate-500">
            <p>Module Under Construction</p>
          </div>
        );
    }
  }

  return (
    <div className="flex h-screen overflow-hidden relative bg-[#0a0e1a]">
      <Sidebar
        isOpen={isSidebarOpen}
        toggleSidebar={() => setSidebarOpen(!isSidebarOpen)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        userRole={userRole}
        userName={userName}
        userEmail={userEmail}
      />

      <main className="flex-1 relative z-10 flex flex-col h-full overflow-hidden">
        {/* Top Navigation Bar */}
        <header className="h-14 border-b border-white/[0.06] flex items-center justify-between px-6 bg-[#0a0e1a]/90 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="md:hidden p-2 hover:bg-white/5 rounded-lg text-slate-400"
            >
              <Menu size={18} />
            </button>
            <span className="text-sm font-semibold text-white tracking-tight">{getPageTitle()}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <button className="p-2.5 hover:bg-white/[0.04] rounded-xl text-slate-400 hover:text-white transition-colors">
              <Search size={17} />
            </button>

            {/* Notifications */}
            <button className="p-2.5 relative hover:bg-white/[0.04] rounded-xl text-slate-400 hover:text-white transition-colors">
              <Bell size={17} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_6px_rgba(99,102,241,0.8)]"></span>
            </button>

            {/* Profile */}
            <div className="relative ml-1">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/[0.04] transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center text-[10px] font-bold text-white border border-white/10 shadow-[0_0_10px_rgba(99,102,241,0.3)]">
                  {initials}
                </div>
              </button>

              <AnimatePresence>
                {showProfileMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    className="absolute right-0 top-12 w-56 bg-[#0d1117] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="p-4 border-b border-white/[0.06]">
                      <p className="text-sm font-semibold text-white truncate">{userName || 'User'}</p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{userEmail || ''}</p>
                    </div>
                    <div className="p-1.5">
                      <button
                        onClick={() => { setShowProfileMenu(false); navigate('/settings'); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:bg-white/[0.04] rounded-xl transition-colors"
                      >
                        <SettingsIcon size={14} /> Settings
                      </button>
                      <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                      >
                        <LogOut size={14} /> Sign Out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide relative bg-[#0a0e1a]">
          {renderContent()}

          {/* SpoonSense Global Modals */}
          <PulseGameModal
            isOpen={isPulseOpen}
            onClose={() => setIsPulseOpen(false)}
            userId={userId || 'demo_student'}
            onComplete={handleGameCompleted}
          />

          <WhyPanelModal
            isOpen={isWhyOpen}
            onClose={() => setIsWhyOpen(false)}
            snapshot={selectedForecastDay || snapshot}
          />

          <EveningCheckinModal
            isOpen={isEveningOpen}
            onClose={() => setIsEveningOpen(false)}
            userId={userId || 'demo_student'}
            onCheckinSuccess={fetchSpoonData}
          />

          <DopamineMenuModal
            isOpen={isDopamineOpen}
            onClose={() => setIsDopamineOpen(false)}
            userId={userId || 'demo_student'}
            onEngageSuccess={fetchSpoonData}
          />

          <ExtensionEmailModal
            isOpen={isExtensionOpen}
            onClose={() => setIsExtensionOpen(false)}
            initialData={extensionTask || {}}
            userName={userName}
          />

          <TaskShrinkerModal
            isOpen={isShrinkOpen}
            onClose={() => { setIsShrinkOpen(false); setShrinkTargetTask(null); }}
            task={shrinkTargetTask}
            userId={userId || 'demo_student'}
            liveSpoons={snapshot?.live_spoons ?? snapshot?.prior_spoons ?? 6.0}
            onStepCompleted={handleShrinkStepCompleted}
          />
        </div>
      </main>
    </div>
  );
};

const App = () => {
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState('student');
  const [userName, setUserName] = useState('User');
  const [userEmail, setUserEmail] = useState('');
  const [energyLevel, setEnergyLevel] = useState(72);
  const [metrics, setMetrics] = useState({
    stress: { value: 'Low', unit: 'Score', type: 'success' },
    anxiety: { value: 'Stable', unit: 'Score', type: 'success' },
    depression: { value: 'None', unit: 'Risk', type: 'success' },
    tone: { value: 'Calm', unit: 'Analysis', type: 'success' },
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.warn("Supabase auth error:", error.message);

        const currentSession = data?.session || null;
        setSession(currentSession);

        if (currentSession?.user) {
          fetchUserProfile(currentSession.user.id);
          setUserEmail(currentSession.user.email);
        }
      } catch (err) {
        console.warn("Auth init error:", err.message);
        setSession(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    let subscription;
    try {
      const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
        // Reset user-specific data whenever auth state changes
        if (newSession?.user?.id !== session?.user?.id) {
          setEnergyLevel(72);
          setMetrics({
            stress: { value: 'Low', unit: 'Score', type: 'success' },
            anxiety: { value: 'Stable', unit: 'Score', type: 'success' },
            depression: { value: 'None', unit: 'Risk', type: 'success' },
            tone: { value: 'Calm', unit: 'Analysis', type: 'success' },
          });
        }
        setSession(newSession);
        if (newSession?.user) {
          fetchUserProfile(newSession.user.id);
          setUserEmail(newSession.user.email);
        }
      });
      subscription = data?.subscription;
    } catch (err) {
      console.warn("Auth state listener error:", err.message);
    }

    return () => {
      if (subscription?.unsubscribe) {
        subscription.unsubscribe();
      }
    };
  }, []);

  const fetchUserProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('users_profile')
        .select('*')
        .eq('id', userId)
        .single();

      if (data) {
        setUserName(data.full_name || 'User');
        setUserRole(data.role || 'student');
        if (data.email) setUserEmail(data.email);
      }
    } catch (e) {
      console.error("Profile fetch error:", e);
    }
  };

  // Dashboard Data Listener (from ChatInput/Backend)
  useEffect(() => {
    const handleDashboardUpdate = (event) => {
      const data = event.detail;
      console.log('Dashboard update received:', data);

      // Update energy level
      if (data.energy_flow) {
        const newEnergy = data.energy_flow.energy_score || data.energy_flow.final_energy_score;
        if (newEnergy) setEnergyLevel(newEnergy);
      }

      // Extract classification levels from the correct location
      // Backend returns levels under energy_flow.classified_levels
      const levels = data.energy_flow?.classified_levels || {};
      // Also check direct analysis keys as fallback
      const analysis = data.analysis || {};

      const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

      const getStatusType = (level) => {
        switch (level?.toLowerCase()) {
          case 'low': case 'none': return 'success';
          case 'medium': case 'moderate': return 'warning';
          case 'high': return 'error';
          default: return 'success';
        }
      };
      const getToneType = (tone) => {
        switch (tone?.toLowerCase()) {
          case 'positive': return 'success';
          case 'neutral': return 'warning';
          case 'negative': return 'error';
          default: return 'success';
        }
      };

      const stressVal = capitalize(levels.stress || analysis.stress_level || 'Low');
      const anxietyVal = capitalize(levels.anxiety || analysis.anxiety_level || 'Stable');
      const depressionVal = capitalize(levels.depression || analysis.depression_level || 'None');
      const toneVal = capitalize(levels.tone || analysis.tone || 'Calm');

      setMetrics({
        stress: { value: stressVal, unit: `Score: ${(analysis.stress || 0).toFixed?.(2) || '0.00'}`, type: getStatusType(stressVal) },
        anxiety: { value: anxietyVal, unit: `Score: ${(analysis.anxiety || 0).toFixed?.(2) || '0.00'}`, type: getStatusType(anxietyVal) },
        depression: { value: depressionVal, unit: `Score: ${(analysis.depression || 0).toFixed?.(2) || '0.00'}`, type: getStatusType(depressionVal) },
        tone: { value: toneVal, unit: 'Analysis', type: getToneType(toneVal) },
      });
    };

    window.addEventListener('dashboardUpdate', handleDashboardUpdate);
    return () => window.removeEventListener('dashboardUpdate', handleDashboardUpdate);
  }, [energyLevel]);


  // Handle login success — reset all user-specific state for clean session
  const handleLoginSuccess = (loginSession) => {
    // Reset dashboard state for fresh user
    setEnergyLevel(72);
    setMetrics({
      stress: { value: 'Low', unit: 'Score', type: 'success' },
      anxiety: { value: 'Stable', unit: 'Score', type: 'success' },
      depression: { value: 'None', unit: 'Risk', type: 'success' },
      tone: { value: 'Calm', unit: 'Analysis', type: 'success' },
    });
    setUserName('User');
    setUserEmail('');
    setSession(loginSession);
  };

  if (loading) {
    return <div className="h-screen w-screen bg-[#0a0e1a] flex items-center justify-center text-emerald-400">Loading NeuroMind...</div>;
  }

  const layoutProps = { theme: 'dark', userRole, energyLevel, metrics, userName, userEmail, userId: session?.user?.id || null };

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login onLoginSuccess={handleLoginSuccess} />} />
      <Route path="/signup" element={<Signup />} />

      {/* Deep Work Mode - Standalone Page (accessible without auth, handles anonymous internally) */}
      <Route path="/deep-work" element={<DeepWorkMode />} />

      {/* Dashboard Routes with Layout */}
      <Route path="/dashboard" element={session ? <DashboardLayout {...layoutProps} /> : <Navigate to="/login" />} />
      <Route path="/tasks" element={session ? <DashboardLayout {...layoutProps} /> : <Navigate to="/login" />} />
      <Route path="/insights" element={session ? <DashboardLayout {...layoutProps} /> : <Navigate to="/login" />} />
      <Route path="/recovery" element={session ? <DashboardLayout {...layoutProps} /> : <Navigate to="/login" />} />
      {/* Settings & Privacy Pages */}
      <Route path="/settings" element={session ? <DashboardLayout {...layoutProps} /> : <Navigate to="/login" />} />
      <Route path="/privacy" element={<PrivacyPage />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};

export default App;
