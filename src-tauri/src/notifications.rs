use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PulseNotification {
    pub id: String,
    pub app_name: String,
    pub title: String,
    pub body: String,
    pub timestamp: u64,
}

#[cfg(windows)]
pub mod windows_notifications {
    use super::*;
    use windows::UI::Notifications::Management::{
        UserNotificationListener, UserNotificationListenerAccessStatus,
    };
    use windows::UI::Notifications::NotificationKinds;

    #[tauri::command]
    pub fn check_notification_permission() -> String {
        println!("[Pulse] Diagnosing UserNotificationListener...");

        match UserNotificationListener::Current() {
            Ok(listener) => {
                println!("[Pulse] UserNotificationListener::Current() -> OK");
                match listener.GetAccessStatus() {
                    Ok(status) => {
                        let status_str = match status {
                            UserNotificationListenerAccessStatus::Allowed => "Allowed",
                            UserNotificationListenerAccessStatus::Denied => "Denied",
                            UserNotificationListenerAccessStatus::Unspecified => "Unspecified",
                            _ => "Unknown",
                        };
                        println!("[Pulse] GetAccessStatus() -> {}", status_str);
                        return status_str.to_string();
                    }
                    Err(e) => {
                        println!("[Pulse] GetAccessStatus() failed: {:?}", e);
                        return format!("Error: {:?}", e);
                    }
                }
            }
            Err(e) => {
                println!(
                    "[Pulse] UserNotificationListener::Current() failed: {:?}",
                    e
                );
                return format!("Error: {:?}", e);
            }
        }
    }

    #[tauri::command]
    pub fn request_notification_permission() -> String {
        println!("[Pulse] Requesting notification access...");
        match UserNotificationListener::Current() {
            Ok(listener) => match listener.RequestAccessAsync() {
                Ok(operation) => match operation.get() {
                    Ok(status) => {
                        let status_str = match status {
                            UserNotificationListenerAccessStatus::Allowed => "Allowed",
                            UserNotificationListenerAccessStatus::Denied => "Denied",
                            UserNotificationListenerAccessStatus::Unspecified => "Unspecified",
                            _ => "Unknown",
                        };
                        println!("[Pulse] RequestAccessAsync completed: {}", status_str);
                        return status_str.to_string();
                    }
                    Err(e) => {
                        println!("[Pulse] RequestAccessAsync .get() failed: {:?}", e);
                        return format!("Error: {:?}", e);
                    }
                },
                Err(e) => {
                    println!("[Pulse] RequestAccessAsync initiation failed: {:?}", e);
                    return format!("Error: {:?}", e);
                }
            },
            Err(e) => {
                println!("[Pulse] Cannot request access, UserNotificationListener::Current() failed: {:?}", e);
                return format!("Error: {:?}", e);
            }
        }
    }

    #[tauri::command]
    pub fn open_notification_settings() {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "ms-settings:notifications"])
            .spawn();
    }

    #[tauri::command]
    pub fn check_notification_diagnostics() {
        println!("[Pulse] --- check_notification_diagnostics ---");
        match UserNotificationListener::Current() {
            Ok(listener) => {
                println!("[Pulse] UserNotificationListener::Current() -> OK");
                match listener.GetAccessStatus() {
                    Ok(status) => println!("[Pulse] GetAccessStatus() -> {:?}", status),
                    Err(e) => println!("[Pulse] GetAccessStatus() failed: {:?}", e),
                }
                match listener.GetNotificationsAsync(NotificationKinds::Toast) {
                    Ok(future) => match future.get() {
                        Ok(notifs) => println!(
                            "[Pulse] GetNotificationsAsync count: {}",
                            notifs.Size().unwrap_or(0)
                        ),
                        Err(e) => println!("[Pulse] GetNotificationsAsync.get() failed: {:?}", e),
                    },
                    Err(e) => println!("[Pulse] GetNotificationsAsync failed: {:?}", e),
                }
            }
            Err(e) => println!(
                "[Pulse] UserNotificationListener::Current() failed: {:?}",
                e
            ),
        }
    }

    #[tauri::command]
    pub fn check_package_identity() {
        println!("[Pulse] Package identity diagnostic");
        if let Ok(exe) = std::env::current_exe() {
            println!("[Pulse] Executable path: {}", exe.display());
        }

        unsafe {
            use windows::core::PWSTR;
            use windows::Win32::Foundation::{
                APPMODEL_ERROR_NO_PACKAGE, ERROR_INSUFFICIENT_BUFFER,
            };
            use windows::Win32::Storage::Packaging::Appx::{
                GetCurrentPackageFamilyName, GetCurrentPackageFullName,
            };

            let mut length: u32 = 0;
            let err = GetCurrentPackageFullName(&mut length, PWSTR(std::ptr::null_mut()));

            if err == APPMODEL_ERROR_NO_PACKAGE {
                println!("[Pulse] Has package identity: NO (APPMODEL_ERROR_NO_PACKAGE)");
            } else if err == ERROR_INSUFFICIENT_BUFFER {
                println!("[Pulse] Has package identity: YES");

                let mut buffer = vec![0u16; length as usize];
                let err2 = GetCurrentPackageFullName(&mut length, PWSTR(buffer.as_mut_ptr()));
                if err2.is_ok() {
                    let name = String::from_utf16_lossy(&buffer[..((length - 1) as usize)]);
                    println!("[Pulse] Package full name: {}", name);
                } else {
                    println!("[Pulse] Failed to read Package full name: {:?}", err2);
                }

                let mut fam_length: u32 = 0;
                let fam_err =
                    GetCurrentPackageFamilyName(&mut fam_length, PWSTR(std::ptr::null_mut()));
                if fam_err == ERROR_INSUFFICIENT_BUFFER {
                    let mut fam_buffer = vec![0u16; fam_length as usize];
                    if GetCurrentPackageFamilyName(&mut fam_length, PWSTR(fam_buffer.as_mut_ptr()))
                        .is_ok()
                    {
                        let fam_name =
                            String::from_utf16_lossy(&fam_buffer[..((fam_length - 1) as usize)]);
                        println!("[Pulse] Package family name: {}", fam_name);
                    }
                }
            } else {
                println!("[Pulse] Has package identity: ERROR {:?}", err);
            }
        }
    }

    pub fn start_notification_listener(app: AppHandle) {
        println!("[Pulse] Notification service starting");

        thread::spawn(move || {
            unsafe {
                let _ = windows::Win32::System::Com::CoInitializeEx(
                    None,
                    windows::Win32::System::Com::COINIT_MULTITHREADED,
                );
            }

            let app_clone = app.clone();
            while !crate::APP_SHUTTING_DOWN.load(std::sync::atomic::Ordering::Relaxed) {
                let listener = match UserNotificationListener::Current() {
                    Ok(listener) => listener,
                    Err(error) => {
                        eprintln!("[Notification] listener unavailable; retrying: {error:?}");
                        thread::sleep(std::time::Duration::from_secs(5));
                        continue;
                    }
                };

                let status = match listener.GetAccessStatus() {
                    Ok(status) => status,
                    Err(error) => {
                        eprintln!("[Notification] access check failed; retrying: {error:?}");
                        thread::sleep(std::time::Duration::from_secs(5));
                        continue;
                    }
                };
                if status != UserNotificationListenerAccessStatus::Allowed {
                    println!("[Notification] access unavailable ({status:?}); checking again in 15 seconds");
                    thread::sleep(std::time::Duration::from_secs(15));
                    continue;
                }
                println!("[Notification] listener ready");

                let mut recent_seen = std::collections::HashSet::new();

                // Seed the current OS snapshot so existing notifications are not replayed.
                if let Ok(future) = listener.GetNotificationsAsync(NotificationKinds::Toast) {
                    if let Ok(notifications) = future.get() {
                        let size = notifications.Size().unwrap_or(0);
                        for i in 0..size {
                            if let Ok(notif) = notifications.GetAt(i) {
                                if let Ok(id) = notif.Id() {
                                    let app_name = extract_app_name(&notif);
                                    let title = extract_title(&notif);
                                    let body = extract_body(&notif);
                                    let mut hasher = DefaultHasher::new();
                                    id.hash(&mut hasher);
                                    app_name.hash(&mut hasher);
                                    title.hash(&mut hasher);
                                    body.hash(&mut hasher);
                                    recent_seen.insert(hasher.finish());
                                }
                            }
                        }
                    }
                }

                let mut consecutive_failures = 0;
                while !crate::APP_SHUTTING_DOWN.load(std::sync::atomic::Ordering::Relaxed) {
                    thread::sleep(std::time::Duration::from_millis(1000));

                    match listener.GetNotificationsAsync(NotificationKinds::Toast) {
                        Ok(notifications_future) => {
                            match notifications_future.get() {
                                Ok(notifications) => {
                                    consecutive_failures = 0;
                                    let size = notifications.Size().unwrap_or(0);
                                    // println!("[Pulse] Windows notification count: {}", size);

                                    let mut current_fingerprints = std::collections::HashSet::new();

                                    for i in 0..size {
                                        if let Ok(notif) = notifications.GetAt(i) {
                                            if let Ok(id) = notif.Id() {
                                                let app_name = extract_app_name(&notif);
                                                let title = extract_title(&notif);
                                                let body = extract_body(&notif);

                                                let mut hasher = DefaultHasher::new();
                                                id.hash(&mut hasher);
                                                app_name.hash(&mut hasher);
                                                title.hash(&mut hasher);
                                                body.hash(&mut hasher);
                                                let fingerprint = hasher.finish();

                                                current_fingerprints.insert(fingerprint);

                                                if !recent_seen.contains(&fingerprint) {
                                                    println!("[Pulse] New notification detected");
                                                    // Never log app names, titles, or notification bodies.

                                                    let p_notif = PulseNotification {
                                                        id: id.to_string(),
                                                        app_name,
                                                        title,
                                                        body,
                                                        timestamp: SystemTime::now()
                                                            .duration_since(UNIX_EPOCH)
                                                            .unwrap_or_default()
                                                            .as_millis()
                                                            as u64,
                                                    };

                                                    let _ = app_clone
                                                        .emit("pulse://notification", p_notif);
                                                }
                                            }
                                        }
                                    }

                                    recent_seen = current_fingerprints;
                                }
                                Err(e) => {
                                    consecutive_failures += 1;
                                    eprintln!("[Notification] snapshot failed ({consecutive_failures}/5): {e:?}");
                                }
                            }
                        }
                        Err(e) => {
                            consecutive_failures += 1;
                            eprintln!(
                                "[Notification] request failed ({consecutive_failures}/5): {e:?}"
                            );
                        }
                    }
                    if consecutive_failures >= 5 {
                        eprintln!("[Notification] restarting listener after repeated failures");
                        break;
                    }
                }
                if !crate::APP_SHUTTING_DOWN.load(std::sync::atomic::Ordering::Relaxed) {
                    thread::sleep(std::time::Duration::from_secs(3));
                }
            }
        });
    }

    fn extract_app_name(notif: &windows::UI::Notifications::UserNotification) -> String {
        if let Ok(app_info) = notif.AppInfo() {
            if let Ok(display_info) = app_info.DisplayInfo() {
                if let Ok(name) = display_info.DisplayName() {
                    return name.to_string_lossy();
                }
            }
        }
        String::new()
    }

    fn extract_title(notif: &windows::UI::Notifications::UserNotification) -> String {
        if let Ok(toast) = notif.Notification() {
            if let Ok(visual) = toast.Visual() {
                if let Ok(bindings) = visual.Bindings() {
                    if let Ok(binding) = bindings.GetAt(0) {
                        if let Ok(texts) = binding.GetTextElements() {
                            if texts.Size().unwrap_or(0) > 0 {
                                if let Ok(elem) = texts.GetAt(0) {
                                    if let Ok(text) = elem.Text() {
                                        return text.to_string_lossy();
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        String::new()
    }

    fn extract_body(notif: &windows::UI::Notifications::UserNotification) -> String {
        if let Ok(toast) = notif.Notification() {
            if let Ok(visual) = toast.Visual() {
                if let Ok(bindings) = visual.Bindings() {
                    if let Ok(binding) = bindings.GetAt(0) {
                        if let Ok(texts) = binding.GetTextElements() {
                            if texts.Size().unwrap_or(0) > 1 {
                                if let Ok(elem) = texts.GetAt(1) {
                                    if let Ok(text) = elem.Text() {
                                        return text.to_string_lossy();
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        String::new()
    }
}

#[cfg(not(windows))]
pub mod windows_notifications {
    use super::*;

    #[tauri::command]
    pub fn check_notification_permission() -> String {
        "Unsupported".to_string()
    }

    #[tauri::command]
    pub fn request_notification_permission() -> String {
        "Unsupported".to_string()
    }

    #[tauri::command]
    pub fn open_notification_settings() {}

    #[tauri::command]
    pub fn check_notification_diagnostics() {}

    #[tauri::command]
    pub fn check_package_identity() {}

    pub fn start_notification_listener(_app: AppHandle) {}
}
