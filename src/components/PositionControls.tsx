import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Monitor } from 'lucide-react';
import type { PulseSettings } from '../settings/types';

type Position = PulseSettings['position'];
type DisplayOption = { id: string; name: string; primary: boolean };

export function PositionControls({ value, onChange, compact = false }: {
  value: Position;
  onChange: (value: Position) => void;
  compact?: boolean;
}) {
  const [displays, setDisplays] = useState<DisplayOption[]>([]);

  useEffect(() => {
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const items = await invoke<DisplayOption[]>('get_displays');
        if (!disposed) setDisplays(items);
      } catch {
        if (!disposed) setDisplays([]);
      }
      if (!disposed) timeout = setTimeout(refresh, 3000);
    };
    void refresh();
    return () => { disposed = true; if (timeout) clearTimeout(timeout); };
  }, []);

  const change = (next: Partial<Position>) => onChange({ ...value, ...next });
  const horizontalOptions: { id: Position['horizontal']; label: string }[] = [
    { id: 'left', label: 'Left' }, { id: 'center', label: 'Center' }, { id: 'right', label: 'Right' },
  ];
  const selectedDisplay = displays.find(display => display.id === value.display);
  const selectedName = selectedDisplay?.name ?? (value.display === 'primary' ? 'Primary display' : 'Active display');

  return <div className={`position-controls ${compact ? 'is-compact' : ''}`}>
    <div key={value.display} className="position-preview" role="img" aria-label={`Preview: Pulse at the ${value.horizontal} of ${selectedName}`}>
      <div className="position-preview-topline" />
      <div className={`position-preview-pill align-${value.horizontal}`} style={{ top: `${7 + Math.round(value.verticalOffset * 0.45)}px` }}>
        <span className="position-preview-dot" />Pulse
      </div>
      <div className="position-preview-desktop"><Monitor size={13} /> {selectedName}</div>
    </div>

    <fieldset className="position-fieldset">
      <legend>Horizontal position</legend>
      <div className="position-segmented" role="group" aria-label="Horizontal position">
        {horizontalOptions.map(option => <button type="button" key={option.id} aria-pressed={value.horizontal === option.id} onClick={() => change({ horizontal: option.id })}>{option.label}</button>)}
      </div>
    </fieldset>

    <label className="position-label" htmlFor={compact ? 'onboarding-display' : 'settings-display'}>Display
      <select id={compact ? 'onboarding-display' : 'settings-display'} value={value.display} onChange={event => change({ display: event.target.value as Position['display'] })}>
        <option value="active">Active display</option>
        <option value="primary">Primary display</option>
        {value.display.startsWith('monitor:') && !displays.some(display => display.id === value.display) && <option value={value.display} disabled>Previously selected display (unavailable)</option>}
        {displays.map(display => <option key={display.id} value={display.id}>{display.name}{display.primary ? ' · Primary' : ''}</option>)}
      </select>
    </label>

    <label className="position-offset" htmlFor={compact ? 'onboarding-offset' : 'settings-offset'}>
      <span>Vertical offset <output>{value.verticalOffset} px</output></span>
      <input id={compact ? 'onboarding-offset' : 'settings-offset'} type="range" min="0" max="40" step="1" value={value.verticalOffset} onChange={event => change({ verticalOffset: Number(event.target.value) })} />
    </label>
  </div>;
}
