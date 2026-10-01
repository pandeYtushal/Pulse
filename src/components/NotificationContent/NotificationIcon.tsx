import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Mail, Calendar, Image as ImageIcon } from "lucide-react";
import { pulseMotion } from "../../utils/motion";

interface NotificationIconProps {
  appName: string;
  icon?: string;
  count?: number;
  size?: number;
}

export function NotificationIcon({ appName, icon, count, size = 32 }: NotificationIconProps) {
  const lower = appName.toLowerCase();
  
  let FallbackIcon = MessageCircle;
  if (lower.includes("mail") || lower.includes("outlook")) FallbackIcon = Mail;
  else if (lower.includes("calendar")) FallbackIcon = Calendar;
  else if (lower.includes("photos") || lower.includes("instagram")) FallbackIcon = ImageIcon;

  return (
    <motion.div
      layout
      className="relative flex-shrink-0"
      animate={{ width: size, height: size }}
      transition={pulseMotion.spring}
    >
      <motion.div
        layout
        className="absolute inset-0 flex items-center justify-center bg-blue-500 overflow-hidden shadow-inner border border-white/10"
        animate={{
          borderRadius: size > 32 ? 12 : 999, // circle when small, rounded rect when large
        }}
        transition={pulseMotion.spring}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={icon || appName}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: pulseMotion.timing.fast }}
            className="absolute inset-0 w-full h-full flex items-center justify-center"
          >
            {icon ? (
              <img src={icon} className="w-full h-full object-cover" />
            ) : (
              <FallbackIcon size={size * 0.45} className="text-white" />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {count && count > 1 && (
          <motion.div
            key="count"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-[rgba(20,20,22,1)] z-10 shadow-sm flex items-center justify-center"
          >
            {count}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
