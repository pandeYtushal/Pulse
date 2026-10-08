pub mod clipboard;
pub mod downloads;
pub mod hardware;
pub mod media;
pub mod notifications;
pub mod privacy;
pub mod system_activities;
pub mod window;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use window::HitRegion;

pub static APP_SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn enable_autostart(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        let _ = app;
        eprintln!("[Pulse] Autostart is available only in production builds");
        Err("Start with Windows is available in the production app".to_string())
    }
    #[cfg(not(debug_assertions))]
    {
        use tauri_plugin_autostart::ManagerExt;
        app.autolaunch()
            .enable()
            .map_err(|error| error.to_string())?;
        println!("[Pulse] Autostart enabled");
        Ok(())
    }
}

#[tauri::command]
fn disable_autostart(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        let _ = app;
        eprintln!("[Pulse] Autostart is available only in production builds");
        Err("Start with Windows is available in the production app".to_string())
    }
    #[cfg(not(debug_assertions))]
    {
        use tauri_plugin_autostart::ManagerExt;
        app.autolaunch()
            .disable()
            .map_err(|error| error.to_string())?;
        println!("[Pulse] Autostart disabled");
        Ok(())
    }
}

#[tauri::command]
fn show_pulse_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Pulse window is unavailable".to_string())?;
    window::position_pulse(&window);
    window.show().map_err(|error| error.to_string())
}

#[tauri::command]
fn set_clipboard_options(enabled: bool, preview: bool) {
    clipboard::set_options(enabled, preview);
}

#[tauri::command]
fn set_system_activity_options(bluetooth: bool, usb: bool, screenshots: bool) {
    system_activities::set_options(bluetooth, usb, screenshots);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("Pulse")
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                crate::window::position_pulse(&window);
                let _ = window.show();
                let _ = window.set_focus();
                let _ = app.emit("tray-event", "show");
            }
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if shortcut.matches(Modifiers::CONTROL | Modifiers::ALT, Code::KeyP) {
                            if let Some(window) = app.get_webview_window("main") {
                                let is_visible = window.is_visible().unwrap_or(false);
                                if !is_visible {
                                    crate::window::position_pulse(&window);
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                    let _ = app.emit("tray-event", "show");
                                } else {
                                    let _ = app.emit("tray-event", "toggle");
                                }
                            }
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            window::set_hit_region,
            window::set_retraction_enabled,
            window::force_position_pulse,
            window::get_displays,
            window::set_position_config,
            show_pulse_window,
            enable_autostart,
            disable_autostart,
            set_clipboard_options,
            set_system_activity_options,
            media::windows_media::media_toggle,
            media::windows_media::media_next,
            media::windows_media::media_prev,
            media::windows_media::diagnose_media,
            notifications::windows_notifications::check_notification_permission,
            notifications::windows_notifications::request_notification_permission,
            notifications::windows_notifications::open_notification_settings,
            notifications::windows_notifications::check_notification_diagnostics,
            notifications::windows_notifications::check_package_identity,
        ])
        .setup(|app| {
            // Set up system tray
            let show_i = MenuItem::with_id(app, "show", "Show Pulse", true, None::<&str>)?;
            let hide_i = MenuItem::with_id(app, "hide", "Hide Pulse", true, None::<&str>)?;
            let toggle_i = MenuItem::with_id(app, "toggle", "Toggle Pulse", true, None::<&str>)?;
            let settings_i = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let pause_notifs_i = MenuItem::with_id(
                app,
                "pause_notifs",
                "Pause Notifications",
                true,
                None::<&str>,
            )?;
            let getting_started_i =
                MenuItem::with_id(app, "onboarding", "Getting Started", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit Pulse", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &show_i,
                    &hide_i,
                    &toggle_i,
                    &settings_i,
                    &pause_notifs_i,
                    &getting_started_i,
                    &quit_i,
                ],
            )?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if !window.is_visible().unwrap_or(false) {
                                crate::window::position_pulse(&window);
                                let _ = window.show();
                                let _ = app.emit("tray-event", "show");
                            }
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = app.emit("tray-event", "hide");
                            let _ = window.hide();
                        }
                    }
                    "toggle" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if !is_visible {
                                crate::window::position_pulse(&window);
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = app.emit("tray-event", "show");
                            } else {
                                let _ = app.emit("tray-event", "toggle");
                            }
                        }
                    }
                    "settings" | "onboarding" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if !window.is_visible().unwrap_or(false) {
                                crate::window::position_pulse(&window);
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = app.emit("tray-event", "show");
                            }
                        }
                        let _ = app.emit("tray-event", event.id.as_ref());
                    }
                    "pause_notifs" => {
                        let _ = app.emit("tray-event", "pause_notifs");
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // Register global shortcut
            let ctrl_alt_p = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyP);
            match app.global_shortcut().register(ctrl_alt_p) {
                Ok(_) => println!("[Pulse] Registered Ctrl+Alt+P global shortcut"),
                Err(e) => println!("[Pulse] Failed to register global shortcut: {:?}", e),
            }

            // Initialize hit region state
            app.handle().manage(Arc::new(Mutex::new(HitRegion {
                width: 140.0,
                height: 40.0,
                retraction_enabled: false,
            })));

            // Position the hidden window. The frontend reveals it only after
            // persisted settings hydrate and onboarding/normal UI has rendered.
            window::setup_window(app.handle());

            // Start monitor event listener for display change recovery
            if let Some(window) = app.get_webview_window("main") {
                let w_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::ScaleFactorChanged { .. } = event {
                        crate::window::position_pulse(&w_clone);
                    }
                });
            }

            // Start media listener (Windows only)
            media::windows_media::start_media_listener(app.handle().clone());

            // Start notification listener
            notifications::windows_notifications::start_notification_listener(app.handle().clone());

            // Start privacy listener
            privacy::start_privacy_listener(app.handle().clone());

            // Start downloads bridge
            downloads::init(app.handle().clone());

            // Start hardware/battery monitor
            hardware::start_hardware_monitor(app.handle().clone());

            // Start display change recovery loop (handles sleep/wake, DPI change, monitor disconnect)
            window::start_display_recovery_loop(app.handle());

            // Own one event-driven native listener for the life of the application.
            clipboard::start(app.handle().clone());
            system_activities::start(app.handle().clone());

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                APP_SHUTTING_DOWN.store(true, Ordering::Relaxed);
                clipboard::stop();
                system_activities::stop();
            }
        });
}
