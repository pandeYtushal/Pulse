import { motion, useReducedMotion } from 'framer-motion';
import { DownloadItem } from '../store/pulseStore';
import { useSettingsStore } from '../settings/store';
import { Download, CheckCircle, XCircle, PauseCircle } from 'lucide-react';

interface DownloadContentProps {
  downloads: DownloadItem[];
  mode: string;
}

export function DownloadContent({ downloads, mode }: DownloadContentProps) {
  const settings = useSettingsStore(state => state.settings);
  const reduceMotion = useReducedMotion();
  
  if (!downloads || downloads.length === 0) return null;
  
  const activeDownload = downloads[0];
  const isExpanded = mode === 'expanded-download';

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const truncate = (str: string, max: number) => {
    return str.length > max ? str.substring(0, max - 3) + '...' : str;
  };

  if (!isExpanded) {
    // Collapsed View
    const getIcon = () => {
      if (activeDownload.status === 'complete') return (
        <motion.div
          initial={reduceMotion ? false : { scale: 0.65, rotate: -18, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.45, ease: 'easeOut' }}
        >
          <CheckCircle className="w-5 h-5 text-emerald-400" />
        </motion.div>
      );
      if (activeDownload.status === 'interrupted') return <XCircle className="w-5 h-5 text-rose-400" />;
      if (activeDownload.paused) return <PauseCircle className="w-5 h-5 text-amber-400" />;
      return <Download className="w-4 h-4 text-indigo-400" />;
    };

    const progress = activeDownload.totalBytes 
      ? Math.round((activeDownload.downloadedBytes / activeDownload.totalBytes) * 100)
      : null;

    let text = truncate(activeDownload.filename, 20);
    if (activeDownload.status === 'complete') text = 'Download complete';
    if (activeDownload.status === 'interrupted') text = 'Download failed';

    return (
      <div className="flex items-center justify-between w-full h-full px-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <motion.div
            className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 shrink-0"
            animate={activeDownload.status === 'in_progress' && !activeDownload.paused && !reduceMotion
              ? { y: [0, -2, 0], scale: [1, 1.04, 1] }
              : { y: 0, scale: 1 }}
            transition={{ duration: 1.8, ease: 'easeInOut', repeat: activeDownload.status === 'in_progress' && !activeDownload.paused && !reduceMotion ? Infinity : 0 }}
          >
            {getIcon()}
          </motion.div>
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <span className="text-[13px] font-medium text-white truncate">
              {text}
            </span>
            {activeDownload.status === 'in_progress' && (
              <div className="mt-1 w-full h-[2px] rounded-full bg-white/10 overflow-hidden" aria-label={progress === null ? 'Download in progress' : `${progress}% downloaded`}>
                {progress === null ? (
                  <motion.div
                    className="h-full w-1/3 rounded-full bg-indigo-400"
                    initial={{ x: '-100%' }}
                    animate={reduceMotion ? { x: 0 } : { x: ['0%', '200%'] }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 1.8, ease: 'easeInOut', repeat: Infinity }}
                  />
                ) : (
                  <motion.div
                    className="h-full rounded-full bg-indigo-400"
                    initial={false}
                    animate={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
                    transition={{ duration: reduceMotion ? 0 : 0.65, ease: 'easeOut' }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
        
        {activeDownload.status === 'in_progress' && progress !== null && (
          <div className="text-[13px] font-medium text-white/70 tabular-nums">
            {progress}%
          </div>
        )}
      </div>
    );
  }

  // Expanded View
  return (
    <div className="flex flex-col w-full h-full p-4 overflow-hidden">
      <div className="flex items-center gap-2 mb-4">
        <Download className="w-5 h-5 text-indigo-400" />
        <h3 className="text-sm font-semibold text-white">Downloads</h3>
      </div>
      
      <div className="flex flex-col gap-3 overflow-y-auto no-scrollbar pb-2">
        {downloads.map(download => {
          const progress = download.totalBytes 
            ? Math.round((download.downloadedBytes / download.totalBytes) * 100)
            : null;
            
          const progressPercent = progress !== null ? Math.min(Math.max(progress, 0), 100) : 0;
          
          return (
            <div key={download.id} className="flex flex-col bg-white/5 rounded-xl p-3 gap-2">
              <div className="flex justify-between items-center">
                <span className="text-[13px] font-medium text-white truncate max-w-[200px]">
                  {download.filename}
                </span>
                {download.status === 'in_progress' && progress !== null && (
                  <span className="text-[12px] text-white/70 tabular-nums">{progress}%</span>
                )}
                {download.status === 'complete' && (
                  <span className="flex items-center gap-1 text-[12px] text-emerald-400">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Complete
                  </span>
                )}
                {download.status === 'interrupted' && (
                  <span className="text-[12px] text-rose-400">Failed</span>
                )}
              </div>
              
              {download.status === 'in_progress' && (
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-indigo-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ ease: "easeOut", duration: 0.3 }}
                  />
                </div>
              )}
              
              {(settings.showDownloadSpeed || settings.showDownloadETA || download.totalBytes) && download.status === 'in_progress' && (
                <div className="flex justify-between items-center text-[11px] text-white/50">
                  <span>
                    {formatBytes(download.downloadedBytes)} {download.totalBytes ? `/ ${formatBytes(download.totalBytes)}` : ''}
                  </span>
                  
                  <div className="flex gap-2">
                    {settings.showDownloadSpeed && download.speed && (
                      <span>{formatBytes(download.speed)}/s</span>
                    )}
                    {settings.showDownloadETA && download.speed && download.totalBytes && (
                      <span>{Math.round((download.totalBytes - download.downloadedBytes) / download.speed)}s left</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
