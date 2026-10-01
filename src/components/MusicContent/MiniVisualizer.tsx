import { motion, AnimatePresence } from "framer-motion";
import { pulseMotion } from "../../utils/motion";

interface MiniVisualizerProps {
  playbackStatus: string;
}

export function MiniVisualizer({ playbackStatus }: MiniVisualizerProps) {
  const isPlaying = playbackStatus === "Playing";
  const isStopped = playbackStatus === "Stopped" || playbackStatus === "Closed";

  return (
    <AnimatePresence>
      {!isStopped && (
        <motion.div 
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: "auto" }}
          exit={{ opacity: 0, width: 0 }}
          transition={{ duration: pulseMotion.timing.normal }}
          className="flex items-end justify-between w-[22px] h-[12px] overflow-hidden"
        >
          {[0, 1, 2, 3, 4].map((bar) => {
            const activeVariants = [
              ["30%", "70%", "40%", "90%", "30%"],
              ["50%", "100%", "40%", "80%", "50%"],
              ["40%", "80%", "90%", "50%", "40%"],
              ["60%", "90%", "40%", "100%", "60%"],
              ["40%", "70%", "50%", "90%", "40%"],
            ];
            
            return (
              <motion.div
                key={bar}
                animate={{
                  height: isPlaying ? activeVariants[bar] : "20%",
                  opacity: isPlaying ? 0.68 : 0.32,
                }}
                transition={{
                  duration: isPlaying ? 0.8 : 0.4,
                  repeat: isPlaying ? Infinity : 0,
                  repeatType: "mirror",
                  ease: "easeInOut",
                  delay: isPlaying ? bar * 0.15 : 0,
                }}
                className="w-[2px] bg-white/80 rounded-full origin-bottom"
                style={{ minHeight: "15%" }}
              />
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
