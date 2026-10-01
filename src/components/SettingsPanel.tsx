import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import { Bell, Cable, RotateCcw, Settings, Shield, X } from 'lucide-react';
import { useSettingsStore } from '../settings/store';
import { usePulseStore } from '../store/pulseStore';
import type { PulseSettings } from '../settings/types';

type Page = 'general' | 'activity' | 'privacy';

function Toggle({ label, description, checked, onChange }: {
  label: string; description?: string; checked: boolean; onChange: (value: boolean) => void;
}) {
  return <div className="settings-row">
    <div className="min-w-0"><div className="settings-label">{label}</div>{description && <div className="settings-description">{description}</div>}</div>
    <button type="button" role="switch" aria-label={label} aria-checked={checked} onClick={() => onChange(!checked)} className={`settings-switch ${checked ? 'is-on' : ''}`}>
      <motion.span animate={{ x: checked ? 16 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 34 }} />
    </button>
  </div>;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="settings-group"><h3>{title}</h3>{children}</section>;
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { settings, setSetting, resetSettings } = useSettingsStore();
  const [page, setPage] = useState<Page>('general');
  const [confirmReset, setConfirmReset] = useState(false);
  const set = <K extends keyof PulseSettings>(key: K, value: PulseSettings[K]) => setSetting(key, value);
  const setStartup = (enabled: boolean) => set('startWithWindows', enabled);
  const reset = () => {
    resetSettings();
    usePulseStore.getState().setNotificationsEnabled(true);
    usePulseStore.getState().setShowNotificationContent(false);
    void invoke('enable_autostart').catch((error) => console.warn('[Startup] Could not restore startup registration', error));
    setConfirmReset(false);
  };

  const pages: { id: Page; label: string; icon: typeof Settings }[] = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'activity', label: 'Activity', icon: Cable },
    { id: 'privacy', label: 'Privacy', icon: Shield },
  ];

  return <div className="settings-panel" onClick={(event) => event.stopPropagation()}>
    <header className="settings-header"><div><div className="settings-title">Settings</div><div className="settings-caption">Pulse preferences</div></div>
      <button className="settings-close" aria-label="Close settings" onClick={onClose}><X size={15} /></button></header>
    <nav className="settings-nav" aria-label="Settings pages">
      {pages.map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined} onClick={() => setPage(id)}><Icon size={14} />{label}</button>)}
    </nav>
    <div className="settings-content">
      {page === 'general' && <>
        <Group title="Startup"><Toggle label="Start Pulse with Windows" description="Open Pulse in the background after you sign in." checked={settings.startWithWindows} onChange={setStartup} /></Group>
        <Group title="Position"><div className="settings-row"><div><div className="settings-label">Top offset</div><div className="settings-description">Distance from the top of the screen</div></div><label className="settings-value"><input aria-label="Top offset" type="number" min={0} max={40} value={settings.topOffset} onChange={(event) => set('topOffset', Math.max(0, Math.min(40, Number(event.target.value) || 0)))} /> px</label></div></Group>
        <Group title="Shortcut"><div className="settings-row"><div><div className="settings-label">Toggle Pulse</div><div className="settings-description">Show or hide the Pulse surface</div></div><kbd>Ctrl&nbsp; + &nbsp;Alt&nbsp; + &nbsp;P</kbd></div></Group>
        <Group title="Reset"><div className="settings-row"><div><div className="settings-label">Restore default settings</div><div className="settings-description">Your onboarding status stays complete.</div></div><button className="settings-reset" onClick={() => setConfirmReset(true)}><RotateCcw size={13} /> Reset</button></div></Group>
      </>}
      {page === 'activity' && <>
        <Group title="Windows activity">
          <Toggle label="Bluetooth and headphones" description="Show device connection changes." checked={settings.bluetoothActivity} onChange={(v) => set('bluetoothActivity', v)} />
          <Toggle label="USB devices" description="Show device connection changes." checked={settings.usbActivity} onChange={(v) => set('usbActivity', v)} />
          <Toggle label="Screenshots" description="Show captures saved to the Screenshots folder." checked={settings.screenshotActivity} onChange={(v) => set('screenshotActivity', v)} />
        </Group>
        <Group title="Downloads"><Toggle label="Browser downloads" description="Show download progress from the Pulse browser extension." checked={settings.showDownloads} onChange={(v) => set('showDownloads', v)} />
          <Toggle label="Download speed" checked={settings.showDownloadSpeed} onChange={(v) => set('showDownloadSpeed', v)} />
          <Toggle label="Estimated time remaining" checked={settings.showDownloadETA} onChange={(v) => set('showDownloadETA', v)} />
        </Group>
        <Group title="Clipboard"><Toggle label="Clipboard activity" description="Show a temporary indicator when the clipboard changes." checked={settings.clipboardActivity} onChange={(v) => set('clipboardActivity', v)} />
          <Toggle label="Text preview" description="Temporarily show a sanitized text preview." checked={settings.clipboardPreview} onChange={(v) => set('clipboardPreview', v)} />
        </Group>
      </>}
      {page === 'privacy' && <>
        <Group title="Notifications"><Toggle label="Show notifications" description="Surface incoming Windows notifications in Pulse." checked={settings.notificationsEnabled} onChange={(v) => { set('notificationsEnabled', v); usePulseStore.getState().setNotificationsEnabled(v); }} />
          <Toggle label="Show notification previews" description="Display notification text. Sensitive app content remains hidden." checked={settings.showNotificationPreview} onChange={(v) => { set('showNotificationPreview', v); usePulseStore.getState().setShowNotificationContent(v); }} />
          <div className="settings-row"><div><div className="settings-label">Notification display time</div><div className="settings-description">How long a collapsed notification stays visible</div></div><select aria-label="Notification display time" value={settings.notificationDuration} onChange={(e) => set('notificationDuration', Number(e.target.value) as PulseSettings['notificationDuration'])}><option value={3000}>3 seconds</option><option value={4500}>4.5 seconds</option><option value={6000}>6 seconds</option></select></div>
        </Group>
        <Group title="Indicators"><Toggle label="Camera and microphone indicator" description="Show a dot when Windows reports either device is in use." checked={settings.cameraMicIndicator} onChange={(v) => set('cameraMicIndicator', v)} /></Group>
        <p className="settings-note"><Bell size={13} /> Activity is processed locally. Pulse does not keep a notification history.</p>
      </>}
    </div>
    {confirmReset && <div className="settings-confirm" role="alertdialog" aria-modal="true" aria-label="Reset settings"><div className="settings-confirm-box"><strong>Reset Pulse settings?</strong><p>This restores default preferences. Onboarding will stay complete.</p><div><button onClick={() => setConfirmReset(false)}>Cancel</button><button className="danger" onClick={reset}>Reset settings</button></div></div></div>}
  </div>;
}
