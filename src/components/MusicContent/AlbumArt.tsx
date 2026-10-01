import { motion, AnimatePresence } from "framer-motion";
import { Music } from "lucide-react";
import { pulseMotion } from "../../utils/motion";

interface AlbumArtProps {
  src?: string;
  size: number;
  expanded?: boolean;
}

export function AlbumArt({ src, size, expanded = false }: AlbumArtProps) {
  const borderRadius = expanded ? 12 : 8;

  return (
    <motion.div
      layout
      className="relative flex-shrink-0 flex items-center justify-center bg-white/5 overflow-hidden shadow-md"
      animate={{
        width: size,
        height: size,
        borderRadius: borderRadius,
      }}
      transition={pulseMotion.spring}
    >
      <AnimatePresence mode="popLayout">
        <motion.div
          key={src || "empty"}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.94 }}
          transition={{ duration: pulseMotion.timing.normal, ease: "easeInOut" }}
          className="absolute inset-0 w-full h-full flex items-center justify-center"
        >
          {src ? (
            <img src={src} className="w-full h-full object-cover" alt="Album Art" />
          ) : (
            <Music size={size * 0.5} className="text-white/40" />
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
