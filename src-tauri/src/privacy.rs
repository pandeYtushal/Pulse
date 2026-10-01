use serde::{Deserialize, Serialize};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use winreg::enums::*;
use winreg::RegKey;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PrivacyState {
    pub microphone_active: bool,
    pub camera_active: bool,
    pub active_apps: Vec<String>,
}

pub fn start_privacy_listener(app: AppHandle) {
    println!("[Privacy] detector starting");
    
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let camera_path = "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\webcam";
    match hkcu.open_subkey(camera_path) {
        Ok(_) => println!("[Privacy] camera detection initialized"),
        Err(e) => println!("[Privacy] Camera initialization FAILED: {}", e),
    }

    let mic_path = "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone";
    match hkcu.open_subkey(mic_path) {
        Ok(_) => println!("[Privacy] microphone detection initialized"),
        Err(e) => println!("[Privacy] Microphone initialization FAILED: {}", e),
    }

    thread::spawn(move || {
        let mut last_camera = false;
        let mut last_mic = false;

        while !crate::APP_SHUTTING_DOWN.load(std::sync::atomic::Ordering::Relaxed) {
            let mut state = PrivacyState {
                microphone_active: false,
                camera_active: false,
                active_apps: Vec::new(),
            };

            check_device(
                "microphone",
                &mut state.microphone_active,
                &mut state.active_apps,
            );
            check_device(
                "webcam",
                &mut state.camera_active,
                &mut state.active_apps,
            );

            if state.camera_active != last_camera {
                println!("[Privacy] emitting camera-active={}", state.camera_active);
                last_camera = state.camera_active;
                if state.camera_active {
                    println!("[Privacy] Camera ACTIVE");
                } else {
                    println!("[Privacy] Camera INACTIVE");
                }
            }

            if state.microphone_active != last_mic {
                println!("[Privacy] emitting microphone-active={}", state.microphone_active);
                last_mic = state.microphone_active;
                if state.microphone_active {
                    println!("[Privacy] Microphone ACTIVE");
                } else {
                    println!("[Privacy] Microphone INACTIVE");
                }
            }

            let _ = app.emit("privacy-state", state);
            thread::sleep(Duration::from_millis(2000));
        }
    });
}

fn check_device(
    device: &str,
    is_active: &mut bool,
    active_apps: &mut Vec<String>,
) {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let base_path = format!(
        "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\{}",
        device
    );

    // Check Packaged Apps
    if let Ok(device_key) = hkcu.open_subkey(&base_path) {
        check_apps_in_key(&device_key, is_active, active_apps, false);
    }

    // Check NonPackaged Apps
    let non_packaged_path = format!("{}\\NonPackaged", base_path);
    if let Ok(non_packaged_key) = hkcu.open_subkey(&non_packaged_path) {
        check_apps_in_key(&non_packaged_key, is_active, active_apps, true);
    }
}

fn check_apps_in_key(
    key: &RegKey,
    is_active: &mut bool,
    active_apps: &mut Vec<String>,
    is_non_packaged: bool,
) {
    if let Ok(enum_keys) = key
        .enum_keys()
        .collect::<Result<Vec<String>, std::io::Error>>()
    {
        for app_name in enum_keys {
            if let Ok(app_key) = key.open_subkey(&app_name) {
                let start: u64 = app_key
                    .get_value::<u64, _>("LastUsedTimeStart")
                    .unwrap_or(0u64);
                let stop: u64 = app_key
                    .get_value::<u64, _>("LastUsedTimeStop")
                    .unwrap_or(1u64);

                if start > 0 && stop == 0 {
                    let clean_name = if is_non_packaged {
                        app_name
                            .split('#')
                            .last()
                            .unwrap_or(&app_name)
                            .replace(".exe", "")
                    } else {
                        app_name.split('_').next().unwrap_or(&app_name).to_string()
                    };

                    *is_active = true;
                    if !active_apps.contains(&clean_name) {
                        active_apps.push(clean_name);
                    }
                }
            }
        }
    }
}
