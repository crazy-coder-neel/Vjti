import React, { useEffect, useRef, useState } from 'react';
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Sparkles, Brain, Volume2, Video, RefreshCw, Key, Check } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export default function AzureAvatarModal({ isOpen, onClose, userId = 'demo_student', snapshot = null }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const sessionRef = useRef(null);

  const [synthesizer, setSynthesizer] = useState(null);
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState('Connecting to Azure WebRTC...');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hasLiveStream, setHasLiveStream] = useState(false);
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [azureKeyInput, setAzureKeyInput] = useState('');
  const [azureRegionInput, setAzureRegionInput] = useState('eastus');
  const [avatarCharInput, setAvatarCharInput] = useState('Celine');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [activeCharacter, setActiveCharacter] = useState('Celine');
  const [chatLog, setChatLog] = useState([
    {
      sender: 'avatar',
      text: "Hi! I'm Celine, your SpoonSense study buddy. I'm keeping track of your transit and timetable so you don't burn out. How are you feeling right now?",
    },
  ]);

  const cleanup = () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    try {
      session?.avatar?.close();
    } catch (e) {
      /* ignore */
    }
    try {
      session?.peer?.close();
    } catch (e) {
      /* ignore */
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    setSynthesizer(null);
    setIsConnected(false);
    setHasLiveStream(false);
  };

  const initAvatarSession = async () => {
    cleanup();
    setIsConnecting(true);
    setStatus('Requesting Azure credentials...');

    const session = {};
    sessionRef.current = session;

    try {
      // 1. Fetch short-lived token and WebRTC relay credentials from backend
      const res = await fetch(`${API_BASE}/api/avatar/token`);
      const data = await res.json();

      if (data.character) {
        setActiveCharacter(data.character);
      }

      if (!data.token) {
        setStatus('Azure Speech Key not configured in .env. Interactive Celine mode active.');
        setIsConnecting(false);
        setIsConnected(true);
        return;
      }

      setStatus('Establishing WebRTC Peer Connection with Azure...');

      // 2. Configure Speech SDK
      const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(data.token, data.region);
      speechConfig.speechSynthesisVoiceName = 'en-US-JennyNeural';

      // 3. Configure Avatar (supports character from backend e.g. "Celine" or "lisa")
      const charName = data.character || 'Celine';
      const charStyle = charName.toLowerCase() === 'lisa' ? 'casual-sitting' : '';
      const avatarConfig = new SpeechSDK.AvatarConfig(charName, charStyle);
      const avatarSynth = new SpeechSDK.AvatarSynthesizer(speechConfig, avatarConfig);
      session.avatar = avatarSynth;

      // 4. Set up RTCPeerConnection with Azure ICE relay credentials
      const peer = new RTCPeerConnection({ iceServers: data.iceServers || [] });
      session.peer = peer;

      peer.ontrack = (event) => {
        const element = event.track.kind === 'video' ? videoRef.current : audioRef.current;
        if (element) {
          element.srcObject = new MediaStream([event.track]);
          element.play?.().catch(() => {});
          if (event.track.kind === 'video') {
            setHasLiveStream(true);
          }
        }
      };

      peer.addTransceiver('video', { direction: 'sendrecv' });
      peer.addTransceiver('audio', { direction: 'sendrecv' });

      // 5. Connect avatar WebRTC stream
      const result = await avatarSynth.startAvatarAsync(peer);

      if (sessionRef.current !== session) return;

      if (result.reason === SpeechSDK.ResultReason.Canceled) {
        throw new Error(result.errorDetails || 'Avatar connection failed');
      }

      setSynthesizer(avatarSynth);
      setStatus(`Azure Avatar (${charName}) Live via WebRTC`);
      setIsConnected(true);
      setHasLiveStream(true);
    } catch (err) {
      console.error('Azure Avatar Init Error:', err);
      setStatus('Azure stream offline: ' + (err.message || String(err)) + '. Interactive voice active.');
      setIsConnected(true);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSaveAzureConfig = async (e) => {
    e?.preventDefault();
    if (!azureKeyInput.trim()) return;

    setIsSavingKey(true);
    try {
      const res = await fetch(`${API_BASE}/api/avatar/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speech_key: azureKeyInput.trim(),
          speech_region: azureRegionInput.trim() || 'eastus',
          avatar_character: avatarCharInput.trim() || 'Celine',
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setShowKeyConfig(false);
        setAzureKeyInput('');
        await initAvatarSession();
      }
    } catch (err) {
      console.error('Failed to configure Azure:', err);
    } finally {
      setIsSavingKey(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      initAvatarSession();
    } else {
      cleanup();
      setIsConnecting(false);
    }
    return () => cleanup();
  }, [isOpen]);

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    const userMsg = inputText.trim();
    setInputText('');
    setChatLog((prev) => [...prev, { sender: 'user', text: userMsg }]);
    setIsSpeaking(true);

    try {
      // 1. Query RAG Context endpoint
      const res = await fetch(`${API_BASE}/api/avatar/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, message: userMsg }),
      });
      const data = await res.json();
      const reply = data.reply || "I'm with you. Let's pace your day gently.";

      setChatLog((prev) => [...prev, { sender: 'avatar', text: reply }]);

      // 2. Speak via Azure Avatar Synthesizer or Fallback Web Speech
      if (synthesizer) {
        await synthesizer.speakTextAsync(reply);
      } else {
        const utterance = new SpeechSynthesisUtterance(reply);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setIsSpeaking(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-600/20 text-violet-400 flex items-center justify-center border border-violet-500/30">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">SpoonSense Study Buddy: {activeCharacter}</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                  {hasLiveStream ? 'Azure WebRTC Live' : 'Interactive Avatar'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{status}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowKeyConfig(!showKeyConfig)}
              className="p-1.5 text-xs text-violet-300 hover:text-white bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 rounded-lg transition-colors flex items-center gap-1"
              title="Configure Azure API Key"
            >
              <Key className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Set Azure Key</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Optional Collapsible Azure Key Config Panel */}
        <AnimatePresence>
          {showKeyConfig && (
            <motion.form
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              onSubmit={handleSaveAzureConfig}
              className="mt-3 p-3 bg-violet-950/40 border border-violet-500/30 rounded-2xl flex flex-col sm:flex-row gap-2 shrink-0 overflow-hidden"
            >
              <input
                type="password"
                placeholder="Paste Azure Speech Key (KEY 1)..."
                value={azureKeyInput}
                onChange={(e) => setAzureKeyInput(e.target.value)}
                className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
              />
              <input
                type="text"
                placeholder="Region (e.g. eastus)"
                value={azureRegionInput}
                onChange={(e) => setAzureRegionInput(e.target.value)}
                className="w-28 bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
              />
              <button
                type="submit"
                disabled={isSavingKey || !azureKeyInput.trim()}
                className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1 shadow-md shadow-violet-600/30"
              >
                {isSavingKey ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save & Connect</span>
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Video Canvas for Azure WebRTC Stream or Celine Avatar Portrait */}
        <div className="relative w-full h-56 sm:h-72 bg-slate-950 rounded-2xl my-3 overflow-hidden border border-white/10 flex items-center justify-center shrink-0">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-cover ${hasLiveStream ? 'block' : 'hidden'}`}
          />
          <audio ref={audioRef} autoPlay />

          {/* Interactive Photorealistic Avatar Face when Live WebRTC is connecting or mock */}
          {!hasLiveStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-950/70 via-slate-900/90 to-slate-950/90 p-4 text-center">
              {/* Avatar Face with Breathing Glow and Audio Waves */}
              <div className="relative mb-2">
                {isSpeaking && (
                  <>
                    <span className="absolute -inset-2 rounded-full border-2 border-violet-400 animate-ping opacity-75"></span>
                    <span className="absolute -inset-4 rounded-full border border-indigo-400 animate-pulse opacity-50"></span>
                  </>
                )}
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-violet-400/80 shadow-2xl shadow-violet-600/40 bg-slate-800">
                  <img
                    src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80"
                    alt="Celine AI Study Buddy"
                    className="w-full h-full object-cover scale-105"
                  />
                </div>
              </div>

              <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>{activeCharacter}</span>
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-violet-600/30 text-violet-300 border border-violet-500/30">
                  AI Study Buddy
                </span>
              </h4>
              <p className="text-[11px] text-slate-400 max-w-sm mt-0.5">
                {isSpeaking
                  ? 'Speaking with SpoonSense empathetic context...'
                  : 'Listening to your spoons & transit load. Ready to chat!'}
              </p>

              {/* Animated Equalizer Waveform while speaking */}
              {isSpeaking ? (
                <div className="flex items-center gap-1 mt-2.5 h-4">
                  <span className="w-1 bg-violet-400 rounded-full animate-bounce h-3"></span>
                  <span className="w-1 bg-indigo-400 rounded-full animate-bounce h-4 delay-75"></span>
                  <span className="w-1 bg-pink-400 rounded-full animate-bounce h-2 delay-150"></span>
                  <span className="w-1 bg-violet-400 rounded-full animate-bounce h-4 delay-100"></span>
                  <span className="w-1 bg-purple-400 rounded-full animate-bounce h-3 delay-200"></span>
                </div>
              ) : (
                <button
                  onClick={() => setShowKeyConfig(true)}
                  className="mt-2 text-[10px] text-violet-300 hover:text-white underline underline-offset-2 flex items-center gap-1"
                >
                  <Key className="w-3 h-3" />
                  Have Azure Speech Key? Click to connect real-time video stream
                </button>
              )}
            </div>
          )}

          {/* Speaking Indicator */}
          {isSpeaking && (
            <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono flex items-center gap-1.5 backdrop-blur-md">
              <Volume2 className="w-3 h-3 animate-bounce" />
              <span>{activeCharacter} Speaking...</span>
            </div>
          )}
        </div>

        {/* Chat Log with Contextual Insights */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 my-1 max-h-40">
          {chatLog.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] p-2.5 rounded-2xl text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-violet-600 text-white rounded-br-none'
                    : 'bg-slate-800/80 border border-white/5 text-slate-200 rounded-bl-none'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSendMessage} className="flex gap-2 pt-2 border-t border-white/10 shrink-0">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Tell me what feels heavy or ask about your schedule..."
            className="flex-1 bg-slate-800/90 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
          />
          <button
            type="submit"
            disabled={isSpeaking || !inputText.trim()}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-violet-600/30 transition-all cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Talk</span>
          </button>
        </form>
      </motion.div>
    </div>
  );
}
