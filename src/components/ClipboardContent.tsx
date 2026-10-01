import { motion } from 'framer-motion';
import { Copy, FileText, Image as ImageIcon } from 'lucide-react';
import type { ClipboardData } from '../store/pulseStore';
import { pulseMotion } from '../utils/motion';

interface ClipboardContentProps {
  data: ClipboardData;
  mode: string;
}

export function ClipboardContent({ data, mode }: ClipboardContentProps) {
  const isExpanded = mode === 'expanded-clipboard';
  const isFiles = data.kind === 'file' || data.kind === 'multiple_files';
  const Icon = data.kind === 'image' ? ImageIcon : isFiles ? FileText : Copy;
  const label = data.kind === 'image'
    ? 'Image copied'
    : data.kind === 'multiple_files'
      ? `${data.fileCount ?? 0} files copied`
      : data.kind === 'file'
        ? 'File copied'
        : 'Copied';

  return (
    <motion.div
      layout
      className="flex w-full h-full box-border items-center cursor-default"
      animate={{
        flexDirection: isExpanded ? 'column' : 'row',
        justifyContent: isExpanded ? 'center' : 'flex-start',
        padding: isExpanded ? '20px' : '0 16px',
        gap: isExpanded ? '12px' : '10px',
      }}
      transition={pulseMotion.spring}
    >
      <motion.div
        layout
        className="flex items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 shrink-0"
        animate={{ width: isExpanded ? 48 : 30, height: isExpanded ? 48 : 30 }}
      >
        <Icon size={isExpanded ? 21 : 15} />
      </motion.div>
      <motion.div
        layout
        className="flex flex-col min-w-0"
        style={{ alignItems: isExpanded ? 'center' : 'flex-start' }}
      >
        <motion.span className={`text-white font-medium tracking-wide ${isExpanded ? 'text-[13px]' : 'text-[12px] truncate'}`}>
          {label}
        </motion.span>
        {data.preview && (
          <motion.span
            className={`text-white/45 mt-0.5 max-w-full ${isExpanded ? 'text-[12px] text-center' : 'text-[10px] truncate'}`}
            aria-label="Temporary clipboard preview"
          >
            “{data.preview}”
          </motion.span>
        )}
      </motion.div>
    </motion.div>
  );
}
