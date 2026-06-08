'use client';

import { motion } from 'framer-motion';

interface ProgressRingProps {
  value: number;
  size?: number;
  strokeWidth?: number;
}

export default function ProgressRing({ value, size = 56, strokeWidth = 3 }: ProgressRingProps) {
  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90"
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth={strokeWidth}
      />
      <motion.circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="white"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
    </svg>
  );
}
