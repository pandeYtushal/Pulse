import { AnimatePresence, motion } from 'framer-motion';
import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bell, Cable, Check, Music2, Shield } from 'lucide-react';
import { useSettingsStore } from '../settings/store';
import { usePulseStore } from '../store/pulseStore';
import { PositionControls } from './PositionControls';

const STEPS = ['Welcome', 'How Pulse works', 'Position', 'Privacy', 'Ready'] as const;

function PulsePreview() {
  return <div className="onboarding-monitor" aria-label="Pulse positioned at the top of your desktop">
    <div className="onboarding-monitor-pill"><span />Pulse</div>
    <div className="onboarding-monitor-caption">Your desktop, with Pulse close at hand</div>
  </div>;
}

function PrivacySwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} onClick={() => onChange(!checked)} className="onboarding-privacy-row">
    <span>{label}</span><span className={`settings-switch ${checked ? 'is-on' : ''}`}><span /></span>
  </button>;
}

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const { settings, setSetting, completeOnboarding } = useSettingsStore();
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const activeStep = useRef(0);
  const transitionLocked = useRef(false);
  const complete = () => { completeOnboarding(); onComplete(); };
  const next = () => {
    if (transitionLocked.current) return;
    if (stepIndex === STEPS.length - 1) complete();
    else {
      transitionLocked.current = true;
      setIsTransitioning(true);
      setDirection(1);
      const nextStep = Math.min(STEPS.length - 1, stepIndex + 1);
      activeStep.current = nextStep;
      setStepIndex(nextStep);
    }
  };
  const back = () => {
    if (transitionLocked.current || stepIndex === 0) return;
    transitionLocked.current = true;
    setIsTransitioning(true);
    setDirection(-1);
    const previousStep = Math.max(0, stepIndex - 1);
    activeStep.current = previousStep;
    setStepIndex(previousStep);
  };
  const openSettings = () => {
    completeOnboarding();
    usePulseStore.getState().setMode('settings');
    onComplete();
  };
  const changePosition = (position: typeof settings.position) => setSetting('position', position);

  return <div className="onboarding-shell">
    <header className="onboarding-header">
      <div className="onboarding-brand"><span className="onboarding-brand-mark">P</span><span>Pulse</span></div>
      <span className="onboarding-step-count">{String(stepIndex + 1).padStart(2, '0')} / 05</span>
    </header>
    <div className="onboarding-progress" aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}>
      {STEPS.map((step, index) => <span key={step} className={index <= stepIndex ? 'is-complete' : ''} />)}
    </div>

    <main className="onboarding-content" aria-live="polite">
      <AnimatePresence mode="wait" custom={direction}>
        <motion.section key={stepIndex} custom={direction}
          initial={{ opacity: 0, x: direction * 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: direction * -10 }}
          onAnimationComplete={() => {
            // Ignore the outgoing step's completion; unlock when the active
            // step has finished entering so rapid clicks cannot skip steps.
            if (activeStep.current === stepIndex && transitionLocked.current) {
              transitionLocked.current = false;
              setIsTransitioning(false);
            }
          }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="onboarding-step">
          {stepIndex === 0 && <>
            <PulsePreview />
            <div className="onboarding-heading"><p className="onboarding-eyebrow">A quieter desktop</p><h1>Meet Pulse</h1><p>A quiet system companion for Windows.</p></div>
          </>}
          {stepIndex === 1 && <>
            <div className="onboarding-heading"><p className="onboarding-eyebrow">At a glance</p><h1>Everything important, right where you need it.</h1></div>
            <div className="onboarding-examples">
              <div><Music2 /><span><strong>Music</strong><small>See what’s playing and use media controls.</small></span></div>
              <div><Bell /><span><strong>Notifications</strong><small>See alerts from Windows in Pulse.</small></span></div>
              <div><ArrowRight /><span><strong>Downloads</strong><small>Follow downloads shared by the Pulse browser extension.</small></span></div>
              <div><Cable /><span><strong>System activity</strong><small>Notice device, clipboard, and power activity.</small></span></div>
            </div>
          </>}
          {stepIndex === 2 && <>
            <div className="onboarding-heading"><p className="onboarding-eyebrow">Your workspace</p><h1>Choose where Pulse lives</h1><p>Preview changes as you make them.</p></div>
            <PositionControls value={settings.position} onChange={changePosition} compact />
          </>}
          {stepIndex === 3 && <>
            <div className="onboarding-heading"><p className="onboarding-eyebrow">Your preferences</p><h1>Private by design</h1><p>Choose which details Pulse can show. You can change these later.</p></div>
            <div className="onboarding-privacy-list">
              <PrivacySwitch label="Notification previews" checked={settings.showNotificationPreview} onChange={value => setSetting('showNotificationPreview', value)} />
              <PrivacySwitch label="Camera and microphone indicator" checked={settings.cameraMicIndicator} onChange={value => setSetting('cameraMicIndicator', value)} />
              <PrivacySwitch label="Clipboard text preview" checked={settings.clipboardPreview} onChange={value => setSetting('clipboardPreview', value)} />
            </div>
            <div className="onboarding-privacy-note"><Shield size={15} /> Pulse shows these details only when their corresponding controls are enabled.</div>
          </>}
          {stepIndex === 4 && <>
            <div className="onboarding-ready-icon"><Check size={23} /></div>
            <div className="onboarding-heading"><p className="onboarding-eyebrow">Setup complete</p><h1>Pulse is ready.</h1><p>You can change these settings anytime.</p></div>
            <PulsePreview />
          </>}
        </motion.section>
      </AnimatePresence>
    </main>

    <footer className="onboarding-footer">
      <button type="button" className="onboarding-back" onClick={back} disabled={stepIndex === 0 || isTransitioning} aria-label="Previous step">
        <ArrowLeft size={15} /> Back
      </button>
      <div className="onboarding-footer-actions">
        {stepIndex === 4 && <button type="button" className="onboarding-settings-link" onClick={openSettings} disabled={isTransitioning}>Open Settings</button>}
        <button type="button" className="onboarding-primary" onClick={next} disabled={isTransitioning}>
          {stepIndex === 4 ? 'Start using Pulse' : 'Continue'} {stepIndex < 4 && <ArrowRight size={15} />}
        </button>
      </div>
    </footer>
  </div>;
}
