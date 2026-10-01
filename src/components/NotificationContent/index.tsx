import { motion, AnimatePresence } from "framer-motion";
import { NotificationIcon } from "./NotificationIcon";
import { PulseNotification } from "../../store/pulseStore";
import { pulseMotion } from "../../utils/motion";

interface NotificationContentProps {
  notifications: PulseNotification[];
  mode: string;
  showPreview: boolean;
  onClear: () => void;
}

export function NotificationContent({ notifications, mode, showPreview, onClear }: NotificationContentProps) {
  const current = notifications[0];
  const isExpanded = mode === "expanded-notification";
  const isMultiple = notifications.length > 1;

  if (!current) return null;

  const hasPreviewBody = showPreview && current.body;

  if (isExpanded) {
    if (isMultiple) {
      return (
        <motion.div 
          layout
          className="flex flex-col w-full h-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0 border-b border-white/5">
            <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">
              Notifications ({notifications.length})
            </span>
            <button 
              type="button"
              aria-label="Clear all notifications"
              onClick={(e) => { e.stopPropagation(); onClear(); }} 
              className="text-[11px] text-white/40 hover:text-white transition-colors"
            >
              Clear All
            </button>
          </div>
          <div className="flex flex-col overflow-y-auto custom-scrollbar flex-1 pb-2">
            <AnimatePresence>
              {notifications.map((notif) => (
                <motion.div 
                  key={notif.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={pulseMotion.spring}
                  className="flex flex-col px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-white/40 uppercase">{notif.appName}</span>
                  </div>
                  <span className="text-sm font-medium text-white truncate">{notif.title}</span>
                  {showPreview && notif.body && (
                    <span className="text-xs text-white/60 line-clamp-2 mt-0.5 leading-snug">{notif.body}</span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      );
    } else {
      // Single expanded
      return (
        <motion.div 
          layout
          className="flex flex-col w-full h-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <NotificationIcon appName={current.appName} icon={current.icon} size={20} />
              <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">{current.appName}</span>
            </div>
            <span className="text-[11px] text-white/40">Now</span>
          </div>
          <div className="px-5 pb-4 flex flex-col gap-1.5 flex-1 min-w-0 mt-2">
            <span className="text-[15px] font-medium text-white leading-tight">{current.title}</span>
            {showPreview && current.body && (
              <span className="text-[13px] text-white/70 line-clamp-3 leading-snug mt-1">{current.body}</span>
            )}
            {!showPreview && current.body && (
              <span className="text-[12px] text-white/40 italic mt-1">Content hidden</span>
            )}
          </div>
          <div className="flex items-center gap-3 px-5 pb-5 mt-auto">
            <button 
              type="button"
              className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-[13px] font-semibold text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
            >
              Dismiss
            </button>
          </div>
        </motion.div>
      );
    }
  }

  // Collapsed Notification
  return (
    <motion.div 
      layout
      className="flex items-center w-full h-full px-2.5 gap-3"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: pulseMotion.timing.normal, ease: pulseMotion.contentTransition.ease }}
    >
      <NotificationIcon 
        appName={current.appName} 
        icon={current.icon} 
        size={32} 
      />
      <div className="flex flex-col justify-center flex-1 min-w-0">
        <span className="text-[11.5px] font-medium text-[rgba(255,255,255,0.55)] uppercase tracking-wide leading-tight mb-[2px]">
          {current.appName}
        </span>
        <motion.div layout className="flex items-center gap-1.5">
          <span className="text-[13.5px] font-medium text-[rgba(255,255,255,0.95)] truncate leading-tight">
            {current.title}{hasPreviewBody ? ` · ${current.body}` : ''}
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
}
