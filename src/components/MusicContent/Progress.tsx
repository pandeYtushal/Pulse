import { motion } from "framer-motion";
import { useState, useEffect } from "react";

import { MediaState } from "../../store/pulseStore";

interface ProgressProps {
  media: MediaState;
}

function formatTime(ticks: number) {
  const seconds = Math.floor(ticks / 10000000);
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function Progress({ media }: ProgressProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [displayedPosition, setDisplayedPosition] = useState(media.position);

  useEffect(() => {
    let animationFrameId: number;
    const updateProgress = () => {
      if (media.playback_status === "Playing") {
        const now = Date.now();
        const elapsedMs = Math.max(0, now - media.timestamp);
        const elapsedUnits = elapsedMs * 10000; 
        const newPos = Math.min(media.position + elapsedUnits, media.duration);
        setDisplayedPosition(newPos);
        animationFrameId = requestAnimationFrame(updateProgress);
      } else {
        setDisplayedPosition(media.position);
      }
    };
    updateProgress();
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [media]);

  // Ensure we don't go over 100% due to interpolation lag
  const safePosition = Math.min(displayedPosition, media.duration);
  const progressPercent = media.duration > 0 ? (safePosition / media.duration) * 100 : 0;

  return (
    <div className="w-full flex flex-col gap-1.5 mt-2">
      <div 
        className="w-full h-1 bg-white/20 rounded-full relative cursor-pointer flex items-center"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <motion.div
          className="absolute left-0 h-full bg-white rounded-full"
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.1, ease: "linear" }}
        />
        <motion.div
          className="absolute w-2 h-2 bg-white rounded-full shadow-sm"
          animate={{ 
            left: `calc(${progressPercent}% - 4px)`,
            scale: isHovered ? 1.5 : 1
          }}
          transition={{
            left: { duration: 0.1, ease: "linear" },
            scale: { duration: 0.2, ease: "easeOut" }
          }}
        />
      </div>
      <div className="flex justify-between items-center text-[10px] text-white/50 font-medium px-0.5">
        <span>{formatTime(safePosition)}</span>
        <span>-{formatTime(media.duration - safePosition)}</span>
      </div>
    </div>
  );
}
