
import React, { useEffect, useRef } from 'react';
import { TranscriptionEntry } from '../types';

interface TranscriptionPanelProps {
  entries: TranscriptionEntry[];
}

const TranscriptionPanel: React.FC<TranscriptionPanelProps> = ({ entries }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  return (
    <div className="flex-1 bg-white rounded-xl shadow-inner border border-slate-200 overflow-y-auto p-4 space-y-4 max-h-[400px]">
      {entries.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 opacity-60">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-sm italic">Start the session to see the live conversation</p>
        </div>
      ) : (
        entries.map((entry, idx) => (
          <div
            key={idx}
            className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                entry.role === 'user'
                  ? 'bg-slate-800 text-white rounded-tr-none'
                  : 'bg-orange-100 text-slate-900 rounded-tl-none border border-orange-200'
              }`}
            >
              <div className="text-[10px] uppercase font-bold opacity-60 mb-1">
                {entry.role === 'user' ? 'You' : 'Assistant'}
              </div>
              <p>{entry.text}</p>
            </div>
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
};

export default TranscriptionPanel;
