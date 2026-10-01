import { motion, useAnimationControls } from "framer-motion";
import React from "react";
import { useEffect } from "react";

interface PulseShellProps {
  children: React.ReactNode;
  width: number | string;
  height: number | string;
  borderRadius: number | string;
  onClick?: (e: React.MouseEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  windowShown: boolean;
  revealToken: number;
  presentationState: 'visible' | 'retracting' | 'retracted' | 'returning';
  onPresentationAnimationComplete: () => void;
}

export function PulseShell({ children, width, height, borderRadius, onClick, onKeyDown, onMouseEnter, onMouseLeave, windowShown, revealToken, presentationState, onPresentationAnimationComplete }: PulseShellProps) {
  const controls = useAnimationControls();
  const collapsedMask = "inset(0 48% 100% 48% round 50%)";
  const finalRadius = typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius;
  const isRetracted = presentationState === 'retracting' || presentationState === 'retracted';
  // Keep the retraction travel stable if the content mode changes mid-motion.
  const retractDistance = 38;

  const shellAnimation = {
    width,
    height,
    borderRadius,
    y: presentationState === 'retracting'
      ? [0, -retractDistance - 1.5, -retractDistance]
      : presentationState === 'returning'
        ? [-retractDistance, 1.5, 0]
        : isRetracted ? -retractDistance : 0,
    scaleY: presentationState === 'retracting'
      ? [1, 0.86, 0.88]
      : presentationState === 'returning'
        ? [0.88, 1.015, 1]
        : isRetracted ? 0.88 : 1,
    opacity: isRetracted ? 0.92 : 1,
  };

  useEffect(() => {
    if (!windowShown) {
      controls.stop();
      controls.set({ clipPath: collapsedMask, scaleY: 0.04, transformOrigin: 'top center' });
      return;
    }

    controls.stop();
    controls.set({ clipPath: collapsedMask, scaleY: 0.04, transformOrigin: 'top center' });
    void controls.start({
      clipPath: [
        collapsedMask,
        'inset(0 38% 68% 38% round 50%)',
        `inset(0 -1% -1% -1% round ${finalRadius})`,
        `inset(0 0 0 0 round ${finalRadius})`,
      ],
      scaleY: [0.04, 0.48, 1.012, 1],
      transition: {
        duration: 0.4,
        ease: [0.16, 1, 0.3, 1],
        times: [0, 0.3, 0.82, 1],
      },
    });
  }, [controls, revealToken, windowShown]);

  return (
    <motion.div
      layout
      initial={false}
      animate={shellAnimation}
      onAnimationComplete={onPresentationAnimationComplete}
      transition={{
        width: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
        height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
        borderRadius: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
        y: {
          duration: presentationState === 'retracting' ? 0.24 : 0.29,
          ease: presentationState === 'retracting' ? [0.22, 0.88, 0.25, 1] : [0.16, 1, 0.3, 1],
          times: [0, 0.82, 1],
        },
        scaleY: {
          duration: presentationState === 'retracting' ? 0.24 : 0.29,
          ease: [0.22, 0.88, 0.25, 1],
          times: [0, 0.82, 1],
        },
        opacity: { duration: 0.16, ease: 'easeOut' },
      }}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="pointer-events-auto relative overflow-hidden text-white flex flex-col cursor-pointer"
      role="region"
      aria-label="Pulse status panel"
      tabIndex={0}
      style={{ transformOrigin: 'top center' }}
    >
      <motion.div
        initial={{ clipPath: collapsedMask, scaleY: 0.04, transformOrigin: 'top center' }}
        animate={controls}
        className="absolute inset-0 box-border h-full w-full"
        style={{
          transformOrigin: 'top center',
          borderRadius,
          backgroundColor: 'rgba(18, 18, 20, 0.97)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          backdropFilter: 'blur(4px)',
          boxShadow: '0 2px 7px rgba(0,0,0,0.16)',
          transition: 'border-radius 0.24s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <motion.div
          className="absolute inset-0"
          animate={{ opacity: isRetracted ? 0.16 : 1, scaleY: isRetracted ? 0.72 : 1 }}
          transition={{ duration: isRetracted ? 0.14 : 0.18, ease: [0.22, 0.88, 0.25, 1] }}
          style={{ transformOrigin: 'top center', pointerEvents: isRetracted ? 'none' : 'auto' }}
        >
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
