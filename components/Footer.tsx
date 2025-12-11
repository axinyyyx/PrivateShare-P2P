import React from 'react';
import { Instagram } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full py-6 mt-8 border-t border-gray-800 flex justify-center items-center">
      <span className="text-sm font-medium">Developed by </span>
      <a 
        href="https://instagram.com/rishabhsahill" 
        target="_blank" 
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-gray-400 hover:text-pink-500 transition-colors duration-300"
      >
        <span className="font-bold text-lg">@rishabhsahill</span>
        <Instagram size={20} />
      </a>
    </footer>
  );
};