use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State};

#[cfg(windows)]
use windows::Win32::Foundation::POINT;
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionConfig {
    pub horizontal: String,
    pub vertical_offset: i32,
    pub display: String,
}

impl Default for PositionConfig {
    fn default() -> Self {
        Self {
            horizontal: "center".into(),
            vertical_offset: 10,
            display: "active".into(),
        }
    }
}

fn position_config() -> &'static Mutex<PositionConfig> {
    static CONFIG: OnceLock<Mutex<PositionConfig>> = OnceLock::new();
    CONFIG.get_or_init(|| Mutex::new(PositionConfig::default()))
}

fn current_position_config() -> PositionConfig {
    position_config()
        .lock()
        .map(|config| config.clone())
        .unwrap_or_default()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayInfo {
    id: String,
    name: String,
    primary: bool,
}

fn display_id(monitor: &tauri::Monitor) -> String {
    if let Some(name) = monitor.name() {
        format!("monitor:{name}")
    } else {
        let position = monitor.position();
        format!("monitor:{}:{}", position.x, position.y)
    }
}

#[tauri::command]
pub fn get_displays(window: tauri::WebviewWindow) -> Vec<DisplayInfo> {
    let primary_id = window
        .primary_monitor()
        .ok()
        .flatten()
        .as_ref()
        .map(display_id);
    window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|monitor| DisplayInfo {
            id: display_id(monitor),
            name: monitor.name().cloned().unwrap_or_else(|| {
                let size = monitor.size();
                format!("Display ({} × {})", size.width, size.height)
            }),
            primary: primary_id.as_deref() == Some(display_id(monitor).as_str()),
        })
        .collect()
}

pub struct HitRegion {
    pub width: f64,
    pub height: f64,
    pub retraction_enabled: bool,
}

const RETRACTION_ENTER_DISTANCE: f64 = 16.0;
const RETRACTION_EXIT_DISTANCE: f64 = 44.0;
const RETRACTION_DEBOUNCE: Duration = Duration::from_millis(110);

fn update_retraction_state(
    retracted: &mut bool,
    approach_started: &mut Option<Instant>,
    exit_started: &mut Option<Instant>,
    enabled: bool,
    cursor_in_pulse: bool,
    cursor_in_trigger_enter: bool,
    cursor_in_trigger_exit: bool,
    now: Instant,
) -> Option<bool> {
    if !enabled {
        *approach_started = None;
        *exit_started = None;
        if *retracted {
            *retracted = false;
            return Some(false);
        }
        return None;
    }

    if !*retracted {
        *exit_started = None;
        if cursor_in_trigger_enter && !cursor_in_pulse {
            let started = approach_started.get_or_insert(now);
            if now.duration_since(*started) >= RETRACTION_DEBOUNCE {
                *retracted = true;
                *approach_started = None;
                return Some(true);
            }
        } else {
            *approach_started = None;
        }
        return None;
    }

    // When retracted, we only return if we are out of the exit trigger zone
    *approach_started = None;
    if !cursor_in_trigger_exit {
        let started = exit_started.get_or_insert(now);
        if now.duration_since(*started) >= RETRACTION_DEBOUNCE {
            *retracted = false;
            *exit_started = None;
            return Some(false);
        }
    } else {
        *exit_started = None;
    }
    None
}

fn active_monitor(window: &tauri::WebviewWindow) -> Option<tauri::Monitor> {
    #[cfg(windows)]
    if let Ok(monitors) = window.available_monitors() {
        let mut cursor = POINT { x: 0, y: 0 };
        if unsafe { GetCursorPos(&mut cursor) }.is_ok() {
            if let Some(monitor) = monitors.into_iter().find(|monitor| {
                let position = monitor.position();
                let size = monitor.size();
                cursor.x >= position.x
                    && cursor.y >= position.y
                    && (cursor.x as i64) < position.x as i64 + size.width as i64
                    && (cursor.y as i64) < position.y as i64 + size.height as i64
            }) {
                return Some(monitor);
            }
        }
    }

    window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
}

fn selected_monitor(window: &tauri::WebviewWindow) -> Option<tauri::Monitor> {
    let config = current_position_config();
    match config.display.as_str() {
        "primary" => window.primary_monitor().ok().flatten(),
        "active" => active_monitor(window),
        selected => window
            .available_monitors()
            .ok()?
            .into_iter()
            .find(|monitor| display_id(monitor) == selected)
            .or_else(|| window.primary_monitor().ok().flatten()),
    }
}

pub fn position_pulse(window: &tauri::WebviewWindow) {
    let config = current_position_config();
    if let Some(monitor) = selected_monitor(window).or_else(|| active_monitor(window)) {
        let scale_factor = monitor.scale_factor();
        let work_area = monitor.work_area();

        let wa_width = work_area.size.width as f64 / scale_factor;
        let wa_height = work_area.size.height as f64 / scale_factor;
        let offset = (config.vertical_offset.clamp(0, 40) as f64).min((wa_height - 1.0).max(0.0));
        let width = wa_width.min(800.0).max(1.0);
        let height = (wa_height - offset).min(600.0).max(1.0);
        let physical_width = (width * scale_factor).round().max(1.0) as u32;
        let physical_height = (height * scale_factor).round().max(1.0) as u32;

        let x = match config.horizontal.as_str() {
            "left" => work_area.position.x as f64,
            "right" => {
                (work_area.position.x + work_area.size.width as i32 - physical_width as i32) as f64
            }
            _ => {
                (work_area.position.x as f64)
                    + (work_area.size.width as f64 - physical_width as f64) / 2.0
            }
        };
        let y = work_area.position.y as f64 + offset * scale_factor;

        let expected_size = (physical_width, physical_height);
        if let Ok(current_size) = window.inner_size() {
            if current_size.width != expected_size.0 || current_size.height != expected_size.1 {
                let _ = window.set_size(PhysicalSize::new(physical_width, physical_height));
            }
        }
        let _ = window.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
    }
}

fn normalize_position_config(mut config: PositionConfig) -> PositionConfig {
    config.vertical_offset = config.vertical_offset.clamp(0, 40);
    if !matches!(config.horizontal.as_str(), "left" | "center" | "right") {
        config.horizontal = "center".into();
    }
    if !matches!(config.display.as_str(), "active" | "primary")
        && !config.display.starts_with("monitor:")
    {
        config.display = "active".into();
    }
    config
}

#[tauri::command]
pub fn set_position_config(app: AppHandle, config: PositionConfig) {
    let config = normalize_position_config(config);
    if let Ok(mut current) = position_config().lock() {
        *current = config;
    }
    if let Some(window) = app.get_webview_window("main") {
        position_pulse(&window);
    }
}

pub fn setup_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_decorations(false);
        let _ = window.set_shadow(false);
        let _ = window.set_always_on_top(true);
        let _ = window.set_skip_taskbar(true);

        // The native window starts visible so production cannot remain hidden if
        // frontend hydration or its first IPC call is delayed. The transparent
        // frontend still gates Pulse content until persisted settings are ready.
        position_pulse(&window);

        // Spawn hit-testing tracker
        #[cfg(windows)]
        {
            let w = window.clone();
            let app_handle = app.clone();
            let state = app.state::<Arc<Mutex<HitRegion>>>();
            let region_state = state.inner().clone();

            thread::spawn(move || {
                let mut last_ignore_cursor_events = None;
                let mut retracted = false;
                let mut approach_started: Option<Instant> = None;
                let mut exit_started: Option<Instant> = None;

                while !crate::APP_SHUTTING_DOWN.load(std::sync::atomic::Ordering::Relaxed) {
                    thread::sleep(Duration::from_millis(16));

                    let now = Instant::now();
                    if !w.is_visible().unwrap_or(false) {
                        approach_started = None;
                        exit_started = None;
                        if retracted {
                            retracted = false;
                            let _ = app_handle.emit("pulse-proximity", false);
                        }
                        if last_ignore_cursor_events != Some(true) {
                            last_ignore_cursor_events = Some(true);
                            let _ = w.set_ignore_cursor_events(true);
                        }
                        continue;
                    }

                    let mut pt = POINT { x: 0, y: 0 };
                    if unsafe { GetCursorPos(&mut pt) }.is_err() {
                        approach_started = None;
                        exit_started = None;
                        if retracted {
                            retracted = false;
                            let _ = app_handle.emit("pulse-proximity", false);
                        }
                        continue;
                    }

                    if let (Ok(pos), Ok(size)) = (w.outer_position(), w.outer_size()) {
                        let scale = w.scale_factor().unwrap_or(1.0).max(0.01);
                        let mx = pt.x as f64 / scale;
                        let my = pt.y as f64 / scale;
                        let wx = pos.x as f64 / scale;
                        let wy = pos.y as f64 / scale;
                        let ww = size.width as f64 / scale;

                        let (hw, hh, retraction_enabled) = {
                            let region = region_state
                                .lock()
                                .unwrap_or_else(|poisoned| poisoned.into_inner());
                            (region.width, region.height, region.retraction_enabled)
                        };

                        let horizontal = current_position_config().horizontal;
                        let hit_x = match horizontal.as_str() {
                            "left" => wx,
                            "right" => wx + ww - hw,
                            _ => wx + (ww / 2.0) - (hw / 2.0),
                        };
                        let hit_y = wy;
                        let hit_right = hit_x + hw;
                        let hit_bottom = hit_y + hh;
                        let is_inside =
                            mx >= hit_x && mx <= hit_right && my >= hit_y && my <= hit_bottom;

                        let pad_x = 16.0;
                        let pad_y = 12.0;
                        let cursor_in_pulse = mx >= hit_x - pad_x
                            && mx <= hit_right + pad_x
                            && my >= hit_y - pad_y
                            && my <= hit_bottom + pad_y;

                        let trigger_x_min = hit_x - 200.0;
                        let trigger_x_max = hit_right + 200.0;
                        let cursor_in_trigger_enter = my <= hit_y + RETRACTION_ENTER_DISTANCE
                            && mx >= trigger_x_min
                            && mx <= trigger_x_max;
                        let cursor_in_trigger_exit = my <= hit_y + RETRACTION_EXIT_DISTANCE
                            && mx >= trigger_x_min
                            && mx <= trigger_x_max;

                        if let Some(is_retracted) = update_retraction_state(
                            &mut retracted,
                            &mut approach_started,
                            &mut exit_started,
                            retraction_enabled,
                            cursor_in_pulse,
                            cursor_in_trigger_enter,
                            cursor_in_trigger_exit,
                            now,
                        ) {
                            let _ = app_handle.emit("pulse-proximity", is_retracted);
                        }

                        // Outside the live Pulse hit area, clicks pass through to the
                        // app underneath. While retracted, the shell also yields input.
                        let ignore_cursor_events = retracted || !is_inside;
                        if last_ignore_cursor_events != Some(ignore_cursor_events) {
                            last_ignore_cursor_events = Some(ignore_cursor_events);
                            let _ = w.set_ignore_cursor_events(ignore_cursor_events);
                        }
                    }
                }
            });
        }
    }
}

#[tauri::command]
pub fn set_hit_region(state: State<'_, Arc<Mutex<HitRegion>>>, width: f64, height: f64) {
    if let Ok(mut region) = state.lock() {
        region.width = width;
        region.height = height;
    }
}

#[tauri::command]
pub fn set_retraction_enabled(state: State<'_, Arc<Mutex<HitRegion>>>, enabled: bool) {
    if let Ok(mut region) = state.lock() {
        region.retraction_enabled = enabled;
    }
}

#[tauri::command]
pub fn force_position_pulse(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        position_pulse(&window);
    }
}

/// Spawn a background thread that detects display config changes (wake/resolution/DPI)
/// and repositions Pulse automatically. Runs once per app lifetime.
pub fn start_display_recovery_loop(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let win = window.clone();
        thread::spawn(move || {
            // Track resolution to detect changes
            let mut last_width: u32 = 0;
            let mut last_height: u32 = 0;
            let mut last_x: i32 = i32::MIN;
            let mut last_y: i32 = i32::MIN;
            let mut last_scale: f64 = 0.0;
            let mut last_work_area: Option<(i32, i32, u32, u32)> = None;
            let mut last_display_id: Option<String> = None;
            while !crate::APP_SHUTTING_DOWN.load(std::sync::atomic::Ordering::Relaxed) {
                thread::sleep(Duration::from_millis(500));
                if let Some(monitor) = selected_monitor(&win) {
                    let w = monitor.size().width;
                    let h = monitor.size().height;
                    let position = monitor.position();
                    let x = position.x;
                    let y = position.y;
                    let s = monitor.scale_factor();
                    let selected_id = display_id(&monitor);
                    let area = monitor.work_area();
                    let work_area = Some((
                        area.position.x,
                        area.position.y,
                        area.size.width,
                        area.size.height,
                    ));
                    if w != last_width
                        || h != last_height
                        || x != last_x
                        || y != last_y
                        || (s - last_scale).abs() > 0.01
                        || work_area != last_work_area
                        || last_display_id.as_deref() != Some(selected_id.as_str())
                    {
                        #[cfg(debug_assertions)]
                        println!("[Window] active display geometry changed; repositioning Pulse");
                        position_pulse(&win);
                        last_width = w;
                        last_height = h;
                        last_x = x;
                        last_y = y;
                        last_scale = s;
                        last_work_area = work_area;
                        last_display_id = Some(selected_id);
                    }
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn position_preferences_are_bounded_and_keep_a_valid_monitor_choice() {
        let normalized = normalize_position_config(PositionConfig {
            horizontal: "diagonal".into(),
            vertical_offset: 120,
            display: "monitor:\\\\.\\DISPLAY2".into(),
        });

        assert_eq!(normalized.horizontal, "center");
        assert_eq!(normalized.vertical_offset, 40);
        assert_eq!(normalized.display, "monitor:\\\\.\\DISPLAY2");
    }

    #[test]
    fn negative_position_offset_is_clamped_without_changing_alignment() {
        let normalized = normalize_position_config(PositionConfig {
            horizontal: "right".into(),
            vertical_offset: -4,
            display: "primary".into(),
        });

        assert_eq!(normalized.horizontal, "right");
        assert_eq!(normalized.vertical_offset, 0);
        assert_eq!(normalized.display, "primary");
    }

    #[test]
    fn retraction_uses_debounce_and_separate_exit_threshold() {
        let started = Instant::now();
        let mut retracted = false;
        let mut approach_started = None;
        let mut exit_started = None;

        assert_eq!(
            update_retraction_state(
                &mut retracted,
                &mut approach_started,
                &mut exit_started,
                true,
                false,
                true,
                true,
                started
            ),
            None
        );
        assert_eq!(
            update_retraction_state(
                &mut retracted,
                &mut approach_started,
                &mut exit_started,
                true,
                false,
                true,
                true,
                started + Duration::from_millis(109)
            ),
            None
        );
        assert_eq!(
            update_retraction_state(
                &mut retracted,
                &mut approach_started,
                &mut exit_started,
                true,
                false,
                true,
                true,
                started + Duration::from_millis(110)
            ),
            Some(true)
        );

        assert_eq!(
            update_retraction_state(
                &mut retracted,
                &mut approach_started,
                &mut exit_started,
                true,
                false,
                false,
                true,
                started + Duration::from_millis(120)
            ),
            None
        );
        assert!(
            retracted,
            "the gap between the thresholds must retain the current state"
        );
        assert_eq!(
            update_retraction_state(
                &mut retracted,
                &mut approach_started,
                &mut exit_started,
                true,
                false,
                false,
                false,
                started + Duration::from_millis(200)
            ),
            None
        );
        assert_eq!(
            update_retraction_state(
                &mut retracted,
                &mut approach_started,
                &mut exit_started,
                true,
                false,
                false,
                false,
                started + Duration::from_millis(310)
            ),
            Some(false)
        );
        assert!(!retracted);
    }

    #[test]
    fn disabling_retraction_immediately_restores_visible_state() {
        let mut retracted = true;
        let mut approach_started = Some(Instant::now());
        let mut exit_started = Some(Instant::now());

        assert_eq!(
            update_retraction_state(
                &mut retracted,
                &mut approach_started,
                &mut exit_started,
                false,
                false,
                false,
                false,
                Instant::now()
            ),
            Some(false)
        );
        assert!(!retracted);
        assert!(approach_started.is_none());
        assert!(exit_started.is_none());
    }

    #[test]
    fn leaving_the_enter_zone_cancels_the_pending_retraction() {
        let started = Instant::now();
        let mut retracted = false;
        let mut approach_started = None;
        let mut exit_started = None;

        assert_eq!(
            update_retraction_state(
                &mut retracted,
                &mut approach_started,
                &mut exit_started,
                true,
                false,
                true,
                true,
                started
            ),
            None
        );
        assert_eq!(
            update_retraction_state(
                &mut retracted,
                &mut approach_started,
                &mut exit_started,
                true,
                false,
                false,
                true,
                started + Duration::from_millis(50)
            ),
            None
        );
        assert!(approach_started.is_none());
    }

    #[test]
    fn pointer_over_pulse_cancels_retraction_even_at_top_edge() {
        let started = Instant::now();
        let mut retracted = false;
        let mut approach_started = None;
        let mut exit_started = None;

        assert_eq!(
            update_retraction_state(
                &mut retracted,
                &mut approach_started,
                &mut exit_started,
                true,
                true,
                true,
                true,
                started
            ),
            None
        );
        assert_eq!(
            update_retraction_state(
                &mut retracted,
                &mut approach_started,
                &mut exit_started,
                true,
                true,
                true,
                true,
                started + Duration::from_millis(200)
            ),
            None
        );
        assert!(
            !retracted,
            "active pointer interaction must outrank proximity retraction"
        );
        assert!(
            approach_started.is_none(),
            "the pending retraction timer must be canceled while interacting"
        );
    }
}
