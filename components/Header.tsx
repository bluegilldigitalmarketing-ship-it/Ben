
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="bg-slate-900 text-white py-4 px-6 flex justify-between items-center shadow-lg border-b border-slate-800">
      <div className="flex items-center space-x-3">
        <div className="bg-red-600 p-2 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
        <h1 className="text-xl font-bold tracking-tight uppercase">PRIME <span className="text-red-600">ROOFING</span></h1>
      </div>
      <div className="hidden md:flex space-x-6 text-sm font-medium">
        <span className="text-slate-400">Official Voice Receptionist</span>
        <span className="flex items-center space-x-1">
          <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></span>
          <span>Live Support</span>
        </span>
      </div>
    </header>
  );
};

export default Header;
