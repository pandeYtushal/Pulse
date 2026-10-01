import test from 'node:test';
import assert from 'node:assert/strict';
import { usePulseStore } from '../src/store/pulseStore.ts';
import { EventBus } from '../src/engine/events/bus.ts';
import { pulseEventBus } from '../src/engine/events/bus.ts';
import { EventType } from '../src/engine/events/types.ts';
import { ActivityEngine } from '../src/engine/activities/engine.ts';

function resetStore() {
  usePulseStore.setState({
    mode: 'idle',
    media: null,
    notifications: [],
    downloads: [],
    completedDownload: null,
    hardwareAlert: null,
    clipboardData: null,
    systemActivity: null,
  });
}

function media(title) {
  return {
    title,
    artist: 'Test Artist',
    duration: 100,
    position: 10,
    playback_status: 'Playing',
    can_play: true,
    can_pause: true,
    can_skip_previous: true,
    can_skip_next: true,
    timestamp: Date.now(),
  };
}

function download(id, status = 'in_progress') {
  return {
    id,
    filename: `${id}.zip`,
    status,
    downloadedBytes: 50,
    totalBytes: 100,
    speed: 5,
    source: 'test',
    timestamp: Date.now(),
    paused: false,
    canResume: false,
  };
}

function notification(id) {
  return { id, appName: 'Test App', title: 'Update', body: 'Private body', timestamp: Date.now() };
}

test('terminal download IDs cannot be re-added by late progress', () => {
  resetStore();
  const state = usePulseStore.getState();
  state.updateDownload(download('terminal-a'), 'started');
  state.finishDownload(download('terminal-a', 'complete'));
  state.updateDownload(download('terminal-a'), 'progress');

  assert.equal(usePulseStore.getState().downloads.some(item => item.id === 'terminal-a'), false);
  assert.equal(usePulseStore.getState().completedDownload.id, 'terminal-a');
});

test('one download completing leaves other active downloads untouched', () => {
  resetStore();
  const state = usePulseStore.getState();
  state.updateDownload(download('active-b'), 'started');
  state.updateDownload(download('done-a'), 'started');
  state.finishDownload(download('done-a', 'complete'));

  assert.deepEqual(usePulseStore.getState().downloads.map(item => item.id), ['active-b']);
});

test('cancelled download cannot remain active or be presented as completed', () => {
  resetStore();
  const state = usePulseStore.getState();
  state.setMode('download');
  state.updateDownload(download('cancelled-c'), 'started');
  state.updateDownload(download('cancelled-c', 'interrupted'), 'canceled');

  assert.equal(usePulseStore.getState().downloads.length, 0);
  assert.equal(usePulseStore.getState().completedDownload, null);
});

test('consumed notification IDs cannot contribute to active counts again', () => {
  resetStore();
  const state = usePulseStore.getState();
  state.addNotification(notification('consumed-n'));
  state.removeNotification('consumed-n');
  state.addNotification(notification('consumed-n'));

  assert.equal(usePulseStore.getState().notifications.length, 0);
});

test('download completion feedback holds its view then resolves against current media', () => {
  resetStore();
  const state = usePulseStore.getState();
  state.setMedia(media('Track A'));
  state.setMode('download');
  state.updateDownload(download('finish-d'), 'started');
  state.finishDownload(download('finish-d', 'complete'));

  assert.equal(usePulseStore.getState().mode, 'download');
  assert.equal(usePulseStore.getState().downloads.length, 0);
  assert.equal(usePulseStore.getState().completedDownload.id, 'finish-d');

  usePulseStore.getState().setMedia(media('Track B'));
  usePulseStore.getState().clearDownloadCompletion('finish-d');
  assert.equal(usePulseStore.getState().mode, 'music');
  assert.equal(usePulseStore.getState().media.title, 'Track B');
});

test('temporary notification consumption does not mutate source media state', () => {
  resetStore();
  const state = usePulseStore.getState();
  state.setMedia(media('Persistent Track'));
  state.setMode('notification');
  state.addNotification(notification('temporary-n'));
  state.removeNotification('temporary-n');

  assert.equal(usePulseStore.getState().media.title, 'Persistent Track');
  assert.equal(usePulseStore.getState().mode, 'music');
});

test('event bus deduplicates subscriptions and disposers release ownership', () => {
  const bus = new EventBus();
  const handler = () => {};
  const dispose = bus.subscribe(handler);
  const duplicateDispose = bus.subscribe(handler);

  assert.equal(bus.listenerCount, 1);
  duplicateDispose();
  assert.equal(bus.listenerCount, 1);
  dispose();
  assert.equal(bus.listenerCount, 0);
});

test('event bus can cancel queued dispatch during shutdown', async () => {
  const bus = new EventBus();
  let calls = 0;
  bus.subscribe(() => { calls += 1; });
  bus.emit({ id: 'queued', type: 'MEDIA_CHANGED', source: 'test', timestamp: Date.now(), priority: 'NORMAL', payload: null });
  bus.clearPending();
  await new Promise(resolve => setTimeout(resolve, 5));

  assert.equal(calls, 0);
});

test('activity engine owns one subscription, holds completion 2.5 seconds, and rejects stale progress', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  resetStore();
  const engine = new ActivityEngine();
  try {
    engine.start();
    engine.start();
    assert.equal(pulseEventBus.listenerCount, 1);

    const startedAt = Date.now();
    pulseEventBus.emit({
      id: 'download-engine-test', type: EventType.DOWNLOAD_STARTED, source: 'test', timestamp: startedAt,
      priority: 'NORMAL', payload: download('download-engine-test'),
    });
    t.mock.timers.tick(0);
    assert.equal(usePulseStore.getState().downloads.length, 1);

    pulseEventBus.emit({
      id: 'download-engine-test', type: EventType.DOWNLOAD_COMPLETED, source: 'test', timestamp: startedAt + 1,
      priority: 'HIGH', payload: download('download-engine-test', 'complete'),
    });
    t.mock.timers.tick(0);
    assert.equal(usePulseStore.getState().downloads.length, 0);
    assert.equal(usePulseStore.getState().completedDownload.id, 'download-engine-test');

    t.mock.timers.tick(2499);
    assert.equal(usePulseStore.getState().completedDownload.id, 'download-engine-test');
    t.mock.timers.tick(1);
    assert.equal(usePulseStore.getState().completedDownload, null);
    assert.equal(usePulseStore.getState().mode, 'idle');

    pulseEventBus.emit({
      id: 'download-engine-test', type: EventType.DOWNLOAD_PROGRESS, source: 'test', timestamp: startedAt,
      priority: 'NORMAL', payload: download('download-engine-test'),
    });
    t.mock.timers.tick(0);
    assert.equal(usePulseStore.getState().downloads.length, 0);
  } finally {
    engine.stop();
    t.mock.timers.reset();
  }
  assert.equal(pulseEventBus.listenerCount, 0);
});

test('clipboard is a temporary overlay and expiry restores the latest media state', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  resetStore();
  const engine = new ActivityEngine();
  try {
    const store = usePulseStore.getState();
    store.setMedia(media('Original track'));
    store.setMode('music');
    engine.start();

    pulseEventBus.emit({
      id: 'clipboard-101', type: EventType.CLIPBOARD_CHANGED, source: 'test', timestamp: Date.now(),
      priority: 'LOW', payload: { kind: 'text', preview: null, durationMs: 2000 },
    });
    t.mock.timers.tick(0);
    assert.equal(usePulseStore.getState().mode, 'clipboard');
    assert.equal(usePulseStore.getState().media.title, 'Original track');
    assert.equal(usePulseStore.getState().clipboardData.preview, null);

    usePulseStore.getState().setMedia(media('Latest track'));
    t.mock.timers.tick(1999);
    assert.equal(usePulseStore.getState().mode, 'clipboard');
    t.mock.timers.tick(1);

    assert.equal(usePulseStore.getState().clipboardData, null);
    assert.equal(usePulseStore.getState().mode, 'music');
    assert.equal(usePulseStore.getState().media.title, 'Latest track');
  } finally {
    engine.stop();
  }
});

test('clipboard replaces rapid clipboard activity and expires to idle without persisting content', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  resetStore();
  const engine = new ActivityEngine();
  try {
    engine.start();
    const emitClipboard = (id, kind, durationMs = 1500) => pulseEventBus.emit({
      id, type: EventType.CLIPBOARD_CHANGED, source: 'test', timestamp: Date.now(), priority: 'LOW',
      payload: { kind, preview: null, fileCount: kind === 'multiple_files' ? 5 : null, durationMs },
    });
    emitClipboard('clipboard-201', 'image');
    t.mock.timers.tick(0);
    assert.equal(usePulseStore.getState().clipboardData.kind, 'image');
    emitClipboard('clipboard-202', 'multiple_files', 2500);
    t.mock.timers.tick(0);
    assert.equal(usePulseStore.getState().clipboardData.kind, 'multiple_files');
    assert.equal(usePulseStore.getState().clipboardData.fileCount, 5);
    t.mock.timers.tick(2499);
    assert.equal(usePulseStore.getState().mode, 'clipboard');
    t.mock.timers.tick(1);
    assert.equal(usePulseStore.getState().mode, 'idle');
    assert.equal(usePulseStore.getState().clipboardData, null);
    assert.equal(usePulseStore.getState().media, null);
  } finally {
    engine.stop();
  }
});

test('clipboard activity does not interrupt notifications or expanded music', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  resetStore();
  const engine = new ActivityEngine();
  try {
    const store = usePulseStore.getState();
    store.addNotification(notification('priority-n'));
    store.setMode('notification');
    engine.start();
    pulseEventBus.emit({
      id: 'clipboard-301', type: EventType.CLIPBOARD_CHANGED, source: 'test', timestamp: Date.now(),
      priority: 'LOW', payload: { kind: 'text', preview: null, durationMs: 2000 },
    });
    t.mock.timers.tick(0);
    assert.equal(usePulseStore.getState().mode, 'notification');
    assert.equal(usePulseStore.getState().clipboardData, null);

    usePulseStore.getState().setMode('expanded-music');
    pulseEventBus.emit({
      id: 'clipboard-302', type: EventType.CLIPBOARD_CHANGED, source: 'test', timestamp: Date.now(),
      priority: 'LOW', payload: { kind: 'text', preview: null, durationMs: 2000 },
    });
    t.mock.timers.tick(0);
    assert.equal(usePulseStore.getState().mode, 'expanded-music');
    assert.equal(usePulseStore.getState().clipboardData, null);
  } finally {
    engine.stop();
  }
});

test('system activities expire through ActivityEngine and restore the latest media state', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  resetStore();
  const engine = new ActivityEngine();
  try {
    usePulseStore.getState().setMedia(media('Before device event'));
    usePulseStore.getState().setMode('music');
    engine.start();
    pulseEventBus.emit({
      id: 'system-bt-1', type: EventType.BLUETOOTH_ACTIVITY, source: 'test', timestamp: Date.now(), priority: 'LOW',
      payload: { kind: 'bluetooth', action: 'connected', deviceName: 'Headphones' },
    });
    t.mock.timers.tick(0);
    assert.equal(usePulseStore.getState().mode, 'system-activity');
    assert.equal(usePulseStore.getState().systemActivity.deviceName, 'Headphones');
    usePulseStore.getState().setMedia(media('Current track'));
    t.mock.timers.tick(2499);
    assert.equal(usePulseStore.getState().mode, 'system-activity');
    t.mock.timers.tick(1);
    assert.equal(usePulseStore.getState().systemActivity, null);
    assert.equal(usePulseStore.getState().mode, 'music');
    assert.equal(usePulseStore.getState().media.title, 'Current track');
    assert.equal(engine.activeCount, 0);

    pulseEventBus.emit({
      id: 'system-bt-1', type: EventType.BLUETOOTH_ACTIVITY, source: 'test', timestamp: Date.now() + 1, priority: 'LOW',
      payload: { kind: 'bluetooth', action: 'connected', deviceName: 'Stale event' },
    });
    t.mock.timers.tick(0);
    assert.equal(usePulseStore.getState().systemActivity, null);
  } finally {
    engine.stop();
    t.mock.timers.reset();
  }
});

test('system activity does not interrupt notification presentation and a newer event replaces its timer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  resetStore();
  const engine = new ActivityEngine();
  try {
    engine.start();
    usePulseStore.getState().addNotification(notification('system-priority-n'));
    usePulseStore.getState().setMode('notification');
    pulseEventBus.emit({
      id: 'system-usb-priority', type: EventType.USB_ACTIVITY, source: 'test', timestamp: Date.now(), priority: 'LOW',
      payload: { kind: 'usb', action: 'connected', deviceName: 'USB device' },
    });
    t.mock.timers.tick(0);
    assert.equal(usePulseStore.getState().mode, 'notification');
    assert.equal(usePulseStore.getState().systemActivity, null);

    usePulseStore.getState().clearNotifications();
    pulseEventBus.emit({
      id: 'system-shot-1', type: EventType.SCREENSHOT_ACTIVITY, source: 'test', timestamp: Date.now() + 1, priority: 'LOW',
      payload: { kind: 'screenshot' },
    });
    t.mock.timers.tick(0);
    t.mock.timers.tick(2000);
    pulseEventBus.emit({
      id: 'system-shot-2', type: EventType.SCREENSHOT_ACTIVITY, source: 'test', timestamp: Date.now() + 2, priority: 'LOW',
      payload: { kind: 'screenshot' },
    });
    t.mock.timers.tick(0);
    t.mock.timers.tick(2499);
    assert.equal(usePulseStore.getState().systemActivity.id, 'system-shot-2');
    t.mock.timers.tick(1);
    assert.equal(usePulseStore.getState().systemActivity, null);
  } finally {
    engine.stop();
    t.mock.timers.reset();
  }
});
