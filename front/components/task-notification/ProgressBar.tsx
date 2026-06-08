'use client';

import { motion } from 'framer-motion';

export default function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
        initial={false}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      />
    </div>
  );
}
