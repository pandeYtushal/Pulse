import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { ChevronRight, X, Shield, Monitor, Music2, Keyboard, Cable, Check } from 'lucide-react';
import { useSettingsStore } from '../settings/store';
import { invoke } from '@tauri-apps/api/core';

// ─── Motion presets ───────────────────────────────────────────────────────────
const SLIDE = {
  initial: (dir: number) => ({ opacity: 0, x: dir * 18 }),
  animate: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -18 }),
  transition: { duration: 0.25, ease: [0.23, 1, 0.32, 1] as const },
};

// ─── Mini Pulse visual ────────────────────────────────────────────────────────
function MiniPill({ label, wide }: { label?: string; wide?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center gap-2 bg-[rgba(30,30,33,0.9)] border border-white/10 rounded-full text-white/60 text-[11px] font-medium ${wide ? 'px-4 py-2 w-44' : 'px-3 py-1.5 w-28'}`}
      style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}
    >
      {label ?? (
        <>
          <span className="w-2 h-2 rounded-full bg-emerald-400/70 animate-pulse" />
          <span>Pulse</span>
        </>
      )}
    </div>
  );
}

// ─── Keyboard shortcut pill ───────────────────────────────────────────────────
function KeyPill({ keys }: { keys: string[] }) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((k) => (
        <span key={k} className="px-2 py-0.5 rounded-md bg-white/8 border border-white/10 text-[11px] font-mono text-white/60">
          {k}
        </span>
      ))}
    </div>
  );
}

// ─── Step wrapper ─────────────────────────────────────────────────────────────
function Step({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-5 w-full">
      <div className="w-10 h-10 rounded-2xl bg-white/6 border border-white/8 flex items-center justify-center">
        <Icon size={18} className="text-white/50" />
      </div>
      <h2 className="text-[15px] font-semibold text-white/90 tracking-tight leading-snug">{title}</h2>
      <div className="flex flex-col gap-3 w-full text-[12.5px] text-white/55 leading-relaxed">
        {children}
      </div>
    </div>
  );
}

// ─── Steps config ─────────────────────────────────────────────────────────────
const STEPS = ['welcome', 'controls', 'activity', 'privacy', 'startup', 'ready'] as const;
type StepId = typeof STEPS[number];

// ─── Main Onboarding ──────────────────────────────────────────────────────────
interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const { settings, setSetting, completeOnboarding } = useSettingsStore();
  const [stepIndex, setStepIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const currentStep: StepId = STEPS[stepIndex];

  const goNext = () => {
    if (stepIndex < STEPS.length - 1) {
      setDir(1);
      setStepIndex(i => i + 1);
    } else {
      finish();
    }
  };

  const finish = () => {
    completeOnboarding();
    onComplete();
  };

  const skip = () => {
    completeOnboarding();
    onComplete();
  };

  const handleStartWithWindows = (enabled: boolean) => {
    setSetting('startWithWindows', enabled);
  };

  const handleOpenNotifSettings = async () => {
    try {
      await invoke('open_notification_settings');
    } catch (e) {
      console.warn('[Pulse] Could not open notification settings:', e);
    }
  };

  const PrivacyOption = ({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) => (
    <button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)} className="flex items-center justify-between w-full px-3 py-2 text-left rounded-lg hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
      <span className="text-[11px] text-white/65">{label}</span>
      <span className={`w-8 h-[18px] rounded-full p-[2px] transition-colors ${value ? 'bg-indigo-500' : 'bg-white/15'}`}><motion.span className="block w-[14px] h-[14px] bg-white rounded-full" animate={{ x: value ? 12 : 0 }} /></span>
    </button>
  );

  const stepLabel = currentStep === 'welcome' ? 'Get Started'
    : currentStep === 'ready' ? 'Finish'
      : 'Continue';

  return (
    <div className="w-full h-full flex flex-col bg-[rgba(14,14,16,0.97)] rounded-[inherit] overflow-hidden">
      {/* Skip */}
      <div className="flex justify-end px-4 pt-3.5 flex-shrink-0">
        {currentStep !== 'welcome' && (
          <button
            onClick={skip}
            className="text-[11px] text-white/25 hover:text-white/50 transition-colors flex items-center gap-1"
          >
            <X size={10} /> Skip
          </button>
        )}
      </div>

      {/* Step dots */}
      {currentStep !== 'welcome' && (
        <div className="flex items-center justify-center gap-1.5 pt-1 pb-2 flex-shrink-0">
          {STEPS.slice(1).map((s, i) => (
            <div
              key={s}
              className={`rounded-full transition-all duration-300 ${STEPS.indexOf(currentStep) - 1 === i
                  ? 'w-4 h-[3px] bg-white/60'
                  : 'w-[3px] h-[3px] bg-white/20'
                }`}
            />
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-4 overflow-hidden">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={currentStep}
            custom={dir}
            variants={SLIDE}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={SLIDE.transition}
            className="flex flex-col items-center gap-6 w-full"
          >
            {/* ── WELCOME ── */}
            {currentStep === 'welcome' && (
              <div className="flex flex-col items-center text-center gap-5">
                <div className="mt-2">
                  <MiniPill wide />
                </div>
                <div>
                  <h1 className="text-[20px] font-bold text-white/95 tracking-tight mb-2">Pulse</h1>
                  <p className="text-[13px] text-white/55 leading-relaxed max-w-[240px]">
                    Your Windows status, at a glance.
                  </p>
                </div>
                <p className="text-[12px] text-white/35 leading-relaxed max-w-[240px]">
                  Music, notifications, and system activity — surfaced through one small, focused interface.
                </p>
              </div>
            )}

            {/* ── CONTROLS ── */}
            {currentStep === 'controls' && (
              <Step icon={Monitor} title="Simple, focused controls">
                <p>Pulse lives at the top of your screen and adapts to what you're doing.</p>
                <div className="flex flex-col gap-2.5 mt-1">
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/4 border border-white/6">
                    <span className="text-white/60">Click Pulse</span>
                    <span className="text-white/40 text-[11px]">Expand</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/4 border border-white/6">
                    <span className="text-white/60">Move cursor away</span>
                    <span className="text-white/40 text-[11px]">Collapse</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/4 border border-white/6">
                    <span className="text-white/60">Global shortcut</span>
                    <KeyPill keys={['Ctrl', 'Alt', 'P']} />
                  </div>
                </div>
              </Step>
            )}

            {currentStep === 'activity' && (
              <Step icon={Cable} title="Your activity, at a glance">
                <p>Pulse can surface activity already available to Windows and supported apps.</p>
                <div className="grid grid-cols-2 gap-2 mt-1 text-left">
                  {[['♪', 'Media'], ['◉', 'Notifications'], ['⌁', 'Devices'], ['▣', 'Clipboard']].map(([symbol, label]) => <div key={label} className="flex items-center gap-2 px-3 py-3 rounded-xl bg-white/4 border border-white/6"><span className="text-white/60">{symbol}</span><span className="text-white/65">{label}</span></div>)}
                </div>
              </Step>
            )}

            {/* ── PRIVACY ── */}
            {currentStep === 'privacy' && (
              <Step icon={Shield} title="Private by default">
                <p>Pulse processes activity on this device. Notification text is held temporarily in memory for display; previews are off until you enable them.</p>
                <div className="rounded-xl bg-white/4 border border-white/6 p-1">
                  <PrivacyOption label="Notification previews" value={settings.showNotificationPreview} onChange={(value) => setSetting('showNotificationPreview', value)} />
                  <PrivacyOption label="Camera and microphone indicator" value={settings.cameraMicIndicator} onChange={(value) => setSetting('cameraMicIndicator', value)} />
                  <PrivacyOption label="Clipboard text preview" value={settings.clipboardPreview} onChange={(value) => setSetting('clipboardPreview', value)} />
                </div>
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={handleOpenNotifSettings}
                    className="flex items-center justify-between w-full px-3 py-2 rounded-xl bg-indigo-500/8 border border-indigo-500/15 text-indigo-400/80 hover:text-indigo-400 hover:bg-indigo-500/12 transition-all text-[11.5px] group"
                  >
                    <span>Allow notification access in Windows</span>
                    <ChevronRight size={11} className="text-indigo-400/40 group-hover:text-indigo-400/70 transition-colors" />
                  </button>
                </div>
              </Step>
            )}

            {/* ── STARTUP ── */}
            {currentStep === 'startup' && (
              <Step icon={Keyboard} title="Ready when you are">
                <p>Configure how Pulse starts — you can always change this in Settings.</p>
                <div className="mt-1 px-3 py-3 rounded-xl bg-white/4 border border-white/6 flex items-center justify-between">
                  <div>
                    <p className="text-[12.5px] text-white/70 font-medium text-left">Start Pulse with Windows</p>
                    <p className="text-[10.5px] text-white/35 text-left mt-0.5">Pulse will launch silently in the tray.</p>
                  </div>
                  <button
                    onClick={() => handleStartWithWindows(!settings.startWithWindows)}
                    className={`w-9 h-[20px] rounded-full relative transition-colors duration-200 flex-shrink-0 ${settings.startWithWindows ? 'bg-indigo-500' : 'bg-white/15'}`}
                  >
                    <motion.div
                      className="w-[14px] h-[14px] bg-white rounded-full absolute top-[3px] left-[3px]"
                      animate={{ x: settings.startWithWindows ? 18 : 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  </button>
                </div>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/4 border border-white/6">
                  <Music2 size={13} className="text-white/40 flex-shrink-0" />
                  <p className="text-[11px] text-white/40 text-left">Media controls, notifications, and the privacy indicator work automatically once Pulse is running.</p>
                </div>
              </Step>
            )}

            {currentStep === 'ready' && (
              <Step icon={Check} title="Pulse is ready">
                <div className="py-4"><MiniPill wide /></div>
                <p>You can change activity and privacy preferences any time in Settings.</p>
              </Step>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="px-5 pb-5 flex-shrink-0">
        <motion.button
          onClick={goNext}
          whileTap={{ scale: 0.97 }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 hover:border-white/16 text-white/80 hover:text-white text-[13px] font-medium transition-all duration-150"
        >
          {stepLabel}
          {currentStep !== 'ready' && <ChevronRight size={13} className="text-white/40" />}
        </motion.button>
      </div>
    </div>
  );
}
