import { motion, AnimatePresence } from "framer-motion";
import { pulseMotion } from "../../utils/motion";

interface TrackInfoProps {
  title: string;
  artist: string;
  expanded?: boolean;
}

export function TrackInfo({ title, artist, expanded = false }: TrackInfoProps) {
  return (
    <div className="flex flex-col justify-center flex-1 min-w-0 relative overflow-hidden">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={title + artist}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: pulseMotion.timing.normal, ease: pulseMotion.contentTransition.ease }}
          className="flex flex-col min-w-0 w-full"
        >
          <motion.span
            layout
            className="font-medium text-[rgba(255,255,255,0.95)] truncate block leading-tight"
            animate={{ fontSize: expanded ? "15px" : "13.5px" }}
            transition={pulseMotion.spring}
          >
            {title || "Unknown Title"}
          </motion.span>
          <motion.span
            layout
            className="text-[rgba(255,255,255,0.55)] truncate block leading-tight mt-[2px]"
            animate={{ fontSize: expanded ? "12px" : "11.5px" }}
            transition={pulseMotion.spring}
          >
            {artist || "Unknown Artist"}
          </motion.span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
