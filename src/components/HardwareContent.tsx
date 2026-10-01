import { motion } from 'framer-motion';
import { BatteryWarning, BatteryCharging } from 'lucide-react';
import { HardwareAlert } from '../store/pulseStore';
import { pulseMotion } from '../utils/motion';

interface HardwareContentProps {
  alert: HardwareAlert;
  mode: string;
}

export function HardwareContent({ alert, mode }: HardwareContentProps) {
  const isExpanded = mode === 'expanded-hardware';
  const percentage = alert.data?.percentage || 0;
  const isCharging = alert.data?.isCharging || false;

  return (
    <motion.div
      layout
      className="flex w-full h-full box-border items-center"
      animate={{
        flexDirection: isExpanded ? "column" : "row",
        justifyContent: isExpanded ? "center" : "flex-start",
        padding: isExpanded ? "20px" : "0 16px",
        gap: isExpanded ? "16px" : "12px",
      }}
      transition={pulseMotion.spring}
    >
      <motion.div 
        layout
        className={`flex items-center justify-center rounded-full ${
          isCharging ? 'bg-emerald-500/20 text-emerald-400 animate-charging-pulse' : 
          (percentage <= 20 ? 'bg-rose-500/20 text-rose-400' : 'bg-white/10 text-white/80')
        }`}
        animate={{
          width: isExpanded ? 64 : 32,
          height: isExpanded ? 64 : 32,
        }}
        transition={pulseMotion.spring}
      >
        {isCharging ? (
          <BatteryCharging size={isExpanded ? 32 : 18} />
        ) : (
          <BatteryWarning size={isExpanded ? 32 : 18} />
        )}
      </motion.div>

      <motion.div layout className="flex flex-col flex-1 min-w-0" style={{ alignItems: isExpanded ? 'center' : 'flex-start' }}>
        <motion.span layout className="text-[13px] font-semibold text-white tracking-wide truncate">
          {isCharging ? 'Battery Charging' : (percentage <= 20 ? 'Low Battery' : 'On Battery')}
        </motion.span>
        
        {isExpanded ? (
          <motion.span layout className="text-[12px] text-white/50 tracking-wide mt-1 text-center">
            {isCharging 
              ? `Plugged in at ${percentage}%. You can safely continue working.`
              : `Battery is down to ${percentage}%. Please plug in your charger soon.`}
          </motion.span>
        ) : (
          <motion.span layout className="text-[11px] text-white/50 tracking-wide truncate">
            {percentage}% remaining
          </motion.span>
        )}
      </motion.div>
    </motion.div>
  );
}
