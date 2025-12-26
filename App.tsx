
import React, { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import Header from './components/Header';
import TranscriptionPanel from './components/TranscriptionPanel';
import { ConnectionStatus, TranscriptionEntry } from './types';
import { decode, decodeAudioData, createPcmBlob } from './services/audioUtils';

const SYSTEM_INSTRUCTION = `
You are the professional after-hours voice receptionist for "Prime Roofing". 
Your tone should be helpful, authoritative on roofing matters, and reassuring. 

Prime Roofing is a premier roofing contractor. 
When a customer calls:
1. Greet them: "Thanks for calling Prime Roofing, this is the AI receptionist. How can I help you tonight?"
2. Ask for their name and a good phone number for a callback.
3. Determine the type of service:
   - Emergency Leak: Reassure them we prioritize urgent repairs.
   - Storm/Hail Damage: Mention we have experience with insurance claims.
   - New Roof/Estimate: Ask for the property address.
4. Inform them that the Prime Roofing team is based in the area and will review this immediately in the morning.
5. Emphasize quality and reliability. Do not promise specific costs, but offer to schedule a professional inspection.

Keep your responses concise and natural for a voice conversation.
`;

const App: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [entries, setEntries] = useState<TranscriptionEntry[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  const currentInputTranscription = useRef<string>('');
  const currentOutputTranscription = useRef<string>('');
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const stopSession = useCallback(async () => {
    if (sessionPromiseRef.current) {
      const session = await sessionPromiseRef.current;
      session.close();
      sessionPromiseRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }

    if (inputAudioContextRef.current) {
      await inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }

    if (outputAudioContextRef.current) {
      await outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }

    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    setStatus(ConnectionStatus.DISCONNECTED);
  }, []);

  const startSession = useCallback(async () => {
    try {
      setStatus(ConnectionStatus.CONNECTING);
      setErrorMsg(null);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }, 
          },
          systemInstruction: SYSTEM_INSTRUCTION,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              }).catch(() => {});
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) {
              currentOutputTranscription.current += message.serverContent.outputTranscription.text;
            } else if (message.serverContent?.inputTranscription) {
              currentInputTranscription.current += message.serverContent.inputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              const userInput = currentInputTranscription.current;
              const modelOutput = currentOutputTranscription.current;
              
              setEntries(prev => [
                ...prev,
                ...(userInput ? [{ role: 'user', text: userInput, timestamp: Date.now() } as TranscriptionEntry] : []),
                ...(modelOutput ? [{ role: 'model', text: modelOutput, timestamp: Date.now() } as TranscriptionEntry] : []),
              ]);

              currentInputTranscription.current = '';
              currentOutputTranscription.current = '';
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              
              source.onended = () => {
                sourcesRef.current.delete(source);
              };
              
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => {
                try { s.stop(); } catch(e) {}
              });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error('Live API Error:', e);
            setStatus(ConnectionStatus.ERROR);
            setErrorMsg('Connection error. Please check your internet and try again.');
          },
          onclose: () => {
            setStatus(ConnectionStatus.DISCONNECTED);
          },
        }
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (err: any) {
      console.error('Failed to start session:', err);
      setStatus(ConnectionStatus.ERROR);
      setErrorMsg(err.message || 'Failed to access microphone or connect.');
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />
      
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 flex flex-col space-y-6">
        
        {/* Intro Section */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Prime Roofing AI Assistant</h2>
              <p className="text-slate-500 mt-1 max-w-lg">
                This is a live demo of our automated voice receptionist. 
                Our AI handles after-hours emergency calls and repair requests for Prime Roofing customers.
              </p>
            </div>
            <div className="flex-shrink-0">
              <img 
                src="https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&w=200&h=120&q=80" 
                alt="Modern roof shingles" 
                className="rounded-lg object-cover shadow-sm border border-slate-100"
              />
            </div>
          </div>
        </section>

        {/* Live Interface */}
        <div className="flex-1 flex flex-col space-y-4">
          
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center space-x-2">
              <div className={`h-3 w-3 rounded-full ${
                status === ConnectionStatus.CONNECTED ? 'bg-green-500 animate-pulse' :
                status === ConnectionStatus.CONNECTING ? 'bg-yellow-500 animate-bounce' :
                status === ConnectionStatus.ERROR ? 'bg-red-500' : 'bg-slate-300'
              }`}></div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Status: {status}
              </span>
            </div>
            {status === ConnectionStatus.CONNECTED && (
               <div className="text-[10px] text-red-600 font-bold bg-red-50 px-2 py-1 rounded border border-red-100 uppercase tracking-widest">
                Voice AI Engaged
              </div>
            )}
          </div>

          <TranscriptionPanel entries={entries} />

          {errorMsg && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg border border-red-100 text-sm flex items-center space-x-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Controls */}
          <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-100 flex flex-col items-center space-y-4">
            
            <div className="relative group">
              {status === ConnectionStatus.CONNECTED && (
                <div className="absolute -inset-1 bg-red-600 rounded-full blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
              )}
              <button
                onClick={status === ConnectionStatus.CONNECTED ? stopSession : startSession}
                disabled={status === ConnectionStatus.CONNECTING}
                className={`relative px-12 py-5 rounded-full font-bold text-lg transition-all transform active:scale-95 flex items-center space-x-3 ${
                  status === ConnectionStatus.CONNECTED
                    ? 'bg-slate-800 hover:bg-slate-900 text-white shadow-lg'
                    : 'bg-red-600 hover:bg-red-700 text-white shadow-xl shadow-red-200'
                } ${status === ConnectionStatus.CONNECTING ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {status === ConnectionStatus.CONNECTED ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Hang Up</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    <span>Start Voice Call</span>
                  </>
                )}
              </button>
            </div>
            
            <p className="text-[10px] text-slate-400 text-center max-w-xs uppercase tracking-widest font-medium">
              Secure line. Prime Roofing respect your privacy.
            </p>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            { title: '24/7 Availability', desc: 'Prime Roofing never misses an emergency leak call.' },
            { title: 'Jacksonville Local', desc: 'AI specialized in our local service areas and weather patterns.' },
            { title: 'Instant Intake', desc: 'Automated job details capture for faster crew dispatch.' },
          ].map((f, i) => (
            <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 text-sm mb-1">{f.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

      </main>

      <footer className="py-8 border-t border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-sm text-slate-500 font-medium">Prime Roofing &copy; 2025</p>
          <p className="text-[10px] text-slate-400 mt-1">Built with Gemini 2.5 Real-Time Audio</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
