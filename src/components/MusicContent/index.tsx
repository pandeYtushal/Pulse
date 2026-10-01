import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, SkipBack, SkipForward, Settings } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { AlbumArt } from "./AlbumArt";
import { TrackInfo } from "./TrackInfo";
import { MiniVisualizer } from "./MiniVisualizer";
import { Progress } from "./Progress";
import { MediaState, usePulseStore } from "../../store/pulseStore";
import { useSetting } from "../../settings/store";
import { pulseMotion } from "../../utils/motion";

interface MusicContentProps {
  media: MediaState;
  mode: string;
  isHovered?: boolean;
}

export function MusicContent({ media, mode, isHovered = false }: MusicContentProps) {
  const isExpanded = mode === "expanded-music";
  const privacy = usePulseStore(state => state.privacy);
  const setMode = usePulseStore(state => state.setMode);
  const privacyActive = privacy?.microphone_active || privacy?.camera_active;
  const cameraMicEnabled = useSetting('cameraMicIndicator');

  const handlePlayPause = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const result = await invoke("media_toggle");
      console.log("[Pulse Media] Toggle result:", result);
    } catch (err) {
      console.error("[Pulse Media] Toggle failed:", err);
    }
  };

  const handleNext = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await invoke("media_next");
  };

  const handlePrev = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await invoke("media_prev");
  };

  return (
    <motion.div
      layout
      className="flex w-full h-full relative box-border"
      animate={{
        flexDirection: isExpanded ? "column" : "row",
        alignItems: isExpanded ? "center" : "center",
        justifyContent: isExpanded ? "flex-start" : "space-between",
        padding: isExpanded ? "16px" : "0 14px 0 10px",
        gap: isExpanded ? "10px" : "10px",
      }}
      transition={pulseMotion.spring}
    >
      <motion.div layout className="flex items-center gap-[10px] w-full flex-1 min-w-0" style={{ justifyContent: isExpanded ? "center" : "flex-start" }}>
        {isExpanded && (
          <motion.button
            type="button"
            aria-label="Open Pulse settings"
            title="Settings"
            onClick={(e) => { e.stopPropagation(); setMode('settings'); }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            className="absolute right-4 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/10 hover:text-white/85"
          >
            <Settings size={15} aria-hidden="true" />
          </motion.button>
        )}
        <AlbumArt src={media.album_art} size={isExpanded ? 56 : 32} expanded={isExpanded} />
        
        {!isExpanded && (
          <AnimatePresence mode="sync" initial={false}>
            {!isHovered ? (
              <motion.div key="track-info" initial={{ opacity: 0, x: 2 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -2 }} transition={{ duration: 0.18 }} layout className="flex-1 min-w-0 flex items-center h-full">
                <TrackInfo title={media.title || ""} artist={media.artist || ""} expanded={false} />
              </motion.div>
            ) : (
              <motion.div key="hover-controls" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.5 }} layout className="flex flex-1 min-w-0 items-center justify-center gap-2 h-full">
                <motion.button
                  type="button"
                  aria-label="Previous track"
                  disabled={!media.can_skip_previous}
                  onClick={handlePrev}
                  className={`flex items-center justify-center w-7 h-8 rounded transition-colors disabled:cursor-not-allowed ${media.can_skip_previous ? 'text-white/65 hover:text-white hover:bg-white/10' : 'text-white/25'}`}
                >
                  <SkipBack size={15} aria-hidden="true" />
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  type="button"
                  aria-label={media.playback_status === "Playing" ? "Pause playback" : "Start playback"}
                  aria-pressed={media.playback_status === "Playing"}
                  onClick={handlePlayPause}
                  className={`flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-white text-black transition-colors ${media.can_play || media.can_pause ? 'hover:bg-gray-200' : 'opacity-50'}`}
                >
                  {media.playback_status === "Playing" ? (
                    <Pause size={15} className="fill-current" aria-hidden="true" />
                  ) : (
                    <Play size={15} className="fill-current ml-0.5" aria-hidden="true" />
                  )}
                </motion.button>
                <motion.button
                  type="button"
                  aria-label="Next track"
                  disabled={!media.can_skip_next}
                  onClick={handleNext}
                  className={`flex items-center justify-center w-7 h-8 rounded transition-colors disabled:cursor-not-allowed ${media.can_skip_next ? 'text-white/65 hover:text-white hover:bg-white/10' : 'text-white/25'}`}
                >
                  <SkipForward size={15} aria-hidden="true" />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </motion.div>

      {isExpanded && (
        <motion.div layout className="w-full text-center">
          <TrackInfo title={media.title || ""} artist={media.artist || ""} expanded={true} />
        </motion.div>
      )}

      {!isExpanded && (
        <motion.div layout className="flex-shrink-0 flex items-center gap-2.5 pr-1">
          <motion.div
            className="w-[22px] h-4 flex items-center justify-end overflow-hidden"
            animate={{ opacity: isHovered ? 0 : 1 }}
            transition={{ duration: 0.18 }}
            aria-hidden="true"
          >
            <MiniVisualizer playbackStatus={media.playback_status} />
          </motion.div>
          
          <AnimatePresence>
            {privacyActive && cameraMicEnabled && (
              <motion.div
                key="privacy-dot"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: [1, 0.45, 1], scale: [1, 1.15, 1] }}
                exit={{
                  opacity: 0,
                  scale: 0,
                  transition: {
                    opacity: { duration: 0.12, repeat: 0 },
                    scale: { duration: 0.12, repeat: 0 },
                  },
                }}
                transition={{
                  opacity: { repeat: Infinity, duration: 1.4, ease: "easeInOut" },
                  scale:   { repeat: Infinity, duration: 1.4, ease: "easeInOut" },
                }}
                className="w-[5px] h-[5px] rounded-full bg-emerald-400/75 flex-shrink-0"
              />
            )}
          </AnimatePresence>
        </motion.div>
      )}

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: pulseMotion.timing.normal, ease: pulseMotion.contentTransition.ease }}
            className="flex flex-col w-full gap-2 mt-auto"
          >
            <Progress media={media} />
            
            <div className="flex items-center justify-center gap-7">
              <motion.button
                type="button"
                aria-label="Previous track"
                disabled={!media.can_skip_previous}
                onClick={handlePrev}
                className={`flex items-center justify-center w-9 h-9 rounded transition-colors disabled:cursor-not-allowed ${media.can_skip_previous ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-white/20'}`}
              >
                <SkipBack size={20} aria-hidden="true" />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                type="button"
                aria-label={media.playback_status === "Playing" ? "Pause playback" : "Start playback"}
                aria-pressed={media.playback_status === "Playing"}
                onClick={handlePlayPause}
                className={`flex items-center justify-center w-10 h-10 rounded-full bg-white text-black transition-colors ${media.can_play || media.can_pause ? 'hover:bg-gray-200' : 'opacity-50'}`}
              >
                {media.playback_status === "Playing" ? (
                  <Pause size={20} className="fill-current" aria-hidden="true" />
                ) : (
                  <Play size={20} className="fill-current ml-0.5" aria-hidden="true" />
                )}
              </motion.button>
              <motion.button
                type="button"
                aria-label="Next track"
                disabled={!media.can_skip_next}
                onClick={handleNext}
                className={`flex items-center justify-center w-9 h-9 rounded transition-colors disabled:cursor-not-allowed ${media.can_skip_next ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-white/20'}`}
              >
                <SkipForward size={20} aria-hidden="true" />
              </motion.button>
            </div>

            <AnimatePresence>
              {privacyActive && cameraMicEnabled && (
                <motion.span
                  key="expanded-privacy-dot"
                  aria-label="Camera or microphone active"
                  title="Camera or microphone active"
                  className="absolute right-5 bottom-5 w-[5px] h-[5px] rounded-full bg-emerald-400/75"
                  animate={{ opacity: [1, 0.45, 1] }}
                  exit={{
                    opacity: 0,
                    transition: { opacity: { duration: 0.12, repeat: 0 } },
                  }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
