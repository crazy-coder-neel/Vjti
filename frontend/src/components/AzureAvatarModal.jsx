import React, { useEffect, useRef, useState } from 'react';
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';
import { motion } from 'framer-motion';
import { X, Send, Sparkles, Brain, Volume2, Video, RefreshCw } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export default function AzureAvatarModal({ isOpen, onClose, userId = 'demo_student', snapshot = null }) {
  const videoRef = useRef(null);
  const [synthesizer, setSynthesizer] = useState(null);
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState('Connecting to Azure WebRTC...');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [chatLog, setChatLog] = useState([
    {
      sender: 'avatar',
      text: "Hi! I'm your SpoonSense companion. I'm keeping track of your transit and timetable so you don't burn out. How are you feeling right now?",
    },
  ]);

  const initAvatarSession = async () => {
    setIsConnecting(true);
    setStatus('Requesting Azure credentials...');

    try {
      // 1. Fetch short-lived token from backend
      const res = await fetch(`${API_BASE}/api/avatar/token`);
      const data = await res.json();

      if (!data.token) {
        setStatus('Azure Speech Key not configured in .env. Running interactive mock mode.');
        setIsConnecting(false);
        setIsConnected(true);
        return;
      }

      setStatus('Establishing WebRTC Peer Connection with Azure...');

      // 2. Configure Speech SDK
      const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(data.token, data.region);
      speechConfig.speechSynthesisVoiceName = 'en-US-JennyNeural';

      // 3. Configure Avatar (Character "lisa", style "casual-sitting")
      const avatarConfig = new SpeechSDK.AvatarConfig('lisa', 'casual-sitting', SpeechSDK.MediaStreamFormat.AudioVideo);

      const avatarSynth = new SpeechSDK.AvatarSynthesizer(speechConfig, avatarConfig);

      avatarSynth.avatarConnected = () => {
        setStatus('Avatar Live & Connected via WebRTC');
        setIsConnected(true);
        setIsConnecting(false);
      };

      avatarSynth.videoStreamReceived = (s, e) => {
        if (videoRef.current && e.mediaStream) {
          videoRef.current.srcObject = e.mediaStream;
          videoRef.current.play().catch(console.error);
        }
      };

      await avatarSynth.startSynthesizingAsync();
      setSynthesizer(avatarSynth);
    } catch (err) {
      console.error('Azure Avatar Init Error:', err);
      setStatus('Failed to connect to Azure. Ready in local conversational mode.');
      setIsConnecting(false);
      setIsConnected(true);
    }
  };

  useEffect(() => {
    if (isOpen) {
      initAvatarSession();
    } else {
      if (synthesizer) {
        try {
          synthesizer.close();
        } catch {
          /* ignore */
        }
        setSynthesizer(null);
      }
      setIsConnected(false);
      setIsConnecting(false);
    }
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
        className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-600/20 text-violet-400 flex items-center justify-center border border-violet-500/30">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">SpoonSense Real-Time Avatar</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                  Azure TTS Avatar
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{status}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Canvas for Azure WebRTC Stream */}
        <div className="relative w-full h-56 sm:h-72 bg-slate-950 rounded-2xl my-3 overflow-hidden border border-white/10 flex items-center justify-center shrink-0">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />

          {/* Placeholder when Azure stream is connecting or in mock mode */}
          {(!synthesizer || isConnecting) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-950/60 via-slate-900/90 to-slate-950/90 p-4 text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-xl shadow-violet-500/20 mb-3 border-2 border-white/20">
                <Video className="w-8 h-8 text-white animate-pulse" />
              </div>
              <h4 className="text-sm font-bold text-white">Photorealistic AI Study Buddy</h4>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                {isConnecting ? 'Establishing low-latency WebRTC video stream...' : 'Live WebRTC Video Stream directly from Azure Speech.'}
              </p>
              {!isConnected && !isConnecting && (
                <button
                  onClick={initAvatarSession}
                  className="mt-3 px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-lg shadow-violet-600/30 flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Connect Azure Avatar
                </button>
              )}
            </div>
          )}

          {/* Speaking Indicator */}
          {isSpeaking && (
            <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono flex items-center gap-1.5 backdrop-blur-md">
              <Volume2 className="w-3 h-3 animate-bounce" />
              <span>Avatar Speaking...</span>
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
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-violet-600/30 transition-all"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Talk</span>
          </button>
        </form>
      </motion.div>
    </div>
  );
}
