export const pulseMotion = {
  timing: {
    fast: 0.18,
    normal: 0.28,
    slow: 0.42,
  },
  spring: {
    type: "tween" as const,
    duration: 0.24,
    ease: [0.22, 1, 0.36, 1] as const,
  },
  contentTransition: {
    duration: 0.28,
    ease: [0.23, 1, 0.32, 1] as const // Apple-like easeOut
  }
};
