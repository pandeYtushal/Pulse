use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Mutex, OnceLock,
};
use std::thread::{self, JoinHandle};
use tauri::{AppHandle, Emitter};

static APP: OnceLock<AppHandle> = OnceLock::new();
static BLUETOOTH_ENABLED: AtomicBool = AtomicBool::new(true);
static USB_ENABLED: AtomicBool = AtomicBool::new(true);
static SCREENSHOTS_ENABLED: AtomicBool = AtomicBool::new(true);
static STOP: AtomicBool = AtomicBool::new(false);
static STARTED: AtomicBool = AtomicBool::new(false);
static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static THREAD: OnceLock<Mutex<Option<JoinHandle<()>>>> = OnceLock::new();

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeActivity {
    id: String,
    kind: &'static str,
    action: Option<&'static str>,
    device_name: Option<String>,
    device_class: Option<&'static str>,
}

pub fn set_options(bluetooth: bool, usb: bool, screenshots: bool) {
    BLUETOOTH_ENABLED.store(bluetooth, Ordering::Release);
    USB_ENABLED.store(usb, Ordering::Release);
    SCREENSHOTS_ENABLED.store(screenshots, Ordering::Release);
}

pub fn start(app: AppHandle) {
    if STARTED.swap(true, Ordering::AcqRel) {
        return;
    }
    STOP.store(false, Ordering::Release);
    let _ = APP.set(app);
    #[cfg(windows)]
    {
        match thread::Builder::new()
            .name("pulse-device-activity-listener".into())
            .spawn(device_listener)
        {
            Ok(handle) => *THREAD.get_or_init(|| Mutex::new(None)).lock().unwrap() = Some(handle),
            Err(_) => {
                STARTED.store(false, Ordering::Release);
                log_dev("[SystemActivity] device listener failed to start");
            }
        }
        let result = thread::Builder::new()
            .name("pulse-screenshot-watcher".into())
            .spawn(screenshot_watcher);
        if let Ok(handle) = result {
            SCREENSHOT_THREAD
                .get_or_init(|| Mutex::new(None))
                .lock()
                .unwrap()
                .replace(handle);
        }
    }
}

pub fn stop() {
    STOP.store(true, Ordering::Release);
    #[cfg(windows)]
    unsafe {
        let id = DEVICE_THREAD_ID.load(Ordering::Acquire);
        if id != 0 {
            let _ = windows::Win32::UI::WindowsAndMessaging::PostThreadMessageW(
                id,
                windows::Win32::UI::WindowsAndMessaging::WM_QUIT,
                windows::Win32::Foundation::WPARAM(0),
                windows::Win32::Foundation::LPARAM(0),
            );
        }
        let screenshot_thread = SCREENSHOT_THREAD_ID.load(Ordering::Acquire);
        if screenshot_thread != 0 {
            if let Ok(thread) = windows::Win32::System::Threading::OpenThread(
                windows::Win32::System::Threading::THREAD_TERMINATE,
                false,
                screenshot_thread,
            ) {
                let _ = windows::Win32::System::IO::CancelSynchronousIo(thread);
                let _ = windows::Win32::Foundation::CloseHandle(thread);
            }
        }
    }
    if let Some(lock) = THREAD.get() {
        if let Ok(mut h) = lock.lock() {
            if let Some(h) = h.take() {
                let _ = h.join();
            }
        }
    }
    if let Some(lock) = SCREENSHOT_THREAD.get() {
        if let Ok(mut h) = lock.lock() {
            if let Some(h) = h.take() {
                let _ = h.join();
            }
        }
    }
    STARTED.store(false, Ordering::Release);
}

fn log_dev(_message: &str) {
    #[cfg(debug_assertions)]
    eprintln!("{_message}");
}

fn emit(
    kind: &'static str,
    action: Option<&'static str>,
    name: Option<String>,
    class: Option<&'static str>,
) {
    if STOP.load(Ordering::Acquire) {
        return;
    }
    let payload = NativeActivity {
        id: format!("system-{}", NEXT_ID.fetch_add(1, Ordering::Relaxed)),
        kind,
        action,
        device_name: name,
        device_class: class,
    };
    if let Some(app) = APP.get() {
        let _ = app.emit("system-activity", payload);
    }
    match kind {
        "bluetooth" => log_dev(if action == Some("connected") {
            "[Bluetooth] device connected"
        } else {
            "[Bluetooth] device disconnected"
        }),
        "usb" => log_dev(if action == Some("connected") {
            "[USB] device connected"
        } else {
            "[USB] device removed"
        }),
        _ => log_dev("[Screenshot] screenshot detected"),
    }
}

#[cfg(windows)]
static SCREENSHOT_THREAD: OnceLock<Mutex<Option<JoinHandle<()>>>> = OnceLock::new();
#[cfg(windows)]
static SCREENSHOT_THREAD_ID: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
#[cfg(windows)]
static DEVICE_THREAD_ID: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

#[cfg(windows)]
mod win {
    use super::*;
    use std::{collections::HashSet, mem::size_of, ptr, sync::OnceLock, time::Instant};
    use windows::{
        core::{w, PCWSTR},
        Win32::{
            Devices::{
                Bluetooth::{
                    BluetoothFindDeviceClose, BluetoothFindFirstDevice, BluetoothFindFirstRadio,
                    BluetoothFindNextDevice, BluetoothFindRadioClose, BluetoothGetDeviceInfo,
                    BLUETOOTH_DEVICE_INFO, BLUETOOTH_DEVICE_SEARCH_PARAMS,
                    BLUETOOTH_FIND_RADIO_PARAMS, BTH_HCI_EVENT_INFO, GUID_BLUETOOTH_HCI_EVENT,
                },
                Usb::GUID_DEVINTERFACE_USB_DEVICE,
            },
            Foundation::{CloseHandle, HANDLE, HINSTANCE, HWND, LPARAM, LRESULT, WPARAM},
            System::{LibraryLoader::GetModuleHandleW, Threading::GetCurrentThreadId},
            UI::WindowsAndMessaging::{
                CreateWindowExW, DefWindowProcW, DispatchMessageW, PeekMessageW, RegisterClassW,
                RegisterDeviceNotificationW, TranslateMessage, UnregisterDeviceNotification,
                DBT_CUSTOMEVENT, DBT_DEVICEARRIVAL, DBT_DEVICEREMOVECOMPLETE,
                DBT_DEVTYP_DEVICEINTERFACE, DBT_DEVTYP_HANDLE, DEVICE_NOTIFY_WINDOW_HANDLE,
                DEV_BROADCAST_DEVICEINTERFACE_W, DEV_BROADCAST_HANDLE, DEV_BROADCAST_HDR,
                HWND_MESSAGE, MSG, PM_REMOVE, WINDOW_STYLE, WM_DEVICECHANGE, WNDCLASSW,
                WS_EX_NOACTIVATE,
            },
        },
    };
    static USB_ACTIVE: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    static BT_ACTIVE: OnceLock<Mutex<HashSet<u64>>> = OnceLock::new();
    static RADIO: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);
    static BT_NOTIFY: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);

    // HCI notifications are not consistently raised for every Bluetooth profile.
    // A connected-device snapshot fills those gaps and shares BT_ACTIVE so it cannot
    // duplicate an event already delivered by the native notification path.
    unsafe fn connected_bluetooth_devices() -> Option<Vec<(u64, String, Option<&'static str>)>> {
        let search = BLUETOOTH_DEVICE_SEARCH_PARAMS {
            dwSize: size_of::<BLUETOOTH_DEVICE_SEARCH_PARAMS>() as u32,
            fReturnConnected: true.into(),
            ..Default::default()
        };
        let mut info = BLUETOOTH_DEVICE_INFO {
            dwSize: size_of::<BLUETOOTH_DEVICE_INFO>() as u32,
            ..Default::default()
        };
        let find = match BluetoothFindFirstDevice(&search, &mut info) {
            Ok(find) => find,
            Err(error) if error.code().0 as u32 == 0x8007_0103 => return Some(Vec::new()), // ERROR_NO_MORE_ITEMS
            Err(_) => return None,
        };

        let mut devices = Vec::new();
        loop {
            if info.fConnected.as_bool() {
                let name_len = info
                    .szName
                    .iter()
                    .position(|c| *c == 0)
                    .unwrap_or(info.szName.len());
                let name = String::from_utf16_lossy(&info.szName[..name_len])
                    .trim()
                    .to_string();
                let major_class = (info.ulClassofDevice >> 8) & 0x1f;
                let device_class = (major_class == 4).then_some("audio");
                devices.push((info.Address.Anonymous.ullLong, name, device_class));
            }
            info = BLUETOOTH_DEVICE_INFO {
                dwSize: size_of::<BLUETOOTH_DEVICE_INFO>() as u32,
                ..Default::default()
            };
            if BluetoothFindNextDevice(find, &mut info).is_err() {
                break;
            }
        }
        let _ = BluetoothFindDeviceClose(find);
        Some(devices)
    }

    unsafe fn reconcile_bluetooth_devices(
        devices: Vec<(u64, String, Option<&'static str>)>,
        initialized: &mut bool,
        enabled: bool,
    ) {
        let snapshot: HashSet<u64> = devices.iter().map(|(address, _, _)| *address).collect();
        let active = BT_ACTIVE.get_or_init(|| Mutex::new(HashSet::new()));
        let mut current = active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if !*initialized {
            *current = snapshot;
            *initialized = true;
            return;
        }

        let connected: Vec<_> = snapshot.difference(&current).copied().collect();
        let disconnected: Vec<_> = current.difference(&snapshot).copied().collect();
        *current = snapshot;
        drop(current);

        if enabled {
            for address in connected {
                let device = devices
                    .iter()
                    .find(|(candidate, _, _)| *candidate == address);
                let name = device
                    .map(|(_, name, _)| name.clone())
                    .filter(|name| !name.is_empty());
                let device_class = device.and_then(|(_, _, class)| *class);
                emit("bluetooth", Some("connected"), name, device_class);
            }
            for _ in disconnected {
                emit("bluetooth", Some("disconnected"), None, None);
            }
        }
    }
    static USB_NOTIFY: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);

    pub fn listener() {
        unsafe {
            let tid = GetCurrentThreadId();
            let mut msg = MSG::default();
            let _ = PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE);
            DEVICE_THREAD_ID.store(tid, Ordering::Release);
            let Ok(module) = GetModuleHandleW(PCWSTR::null()) else {
                return;
            };
            let class = w!("PulseDeviceActivityListener");
            let wc = WNDCLASSW {
                lpfnWndProc: Some(proc),
                hInstance: HINSTANCE(module.0),
                lpszClassName: class,
                ..Default::default()
            };
            if RegisterClassW(&wc) == 0 {
                return;
            }
            let Ok(hwnd) = CreateWindowExW(
                WS_EX_NOACTIVATE,
                class,
                w!(""),
                WINDOW_STYLE(0),
                0,
                0,
                0,
                0,
                HWND_MESSAGE,
                None,
                HINSTANCE(module.0),
                None,
            ) else {
                return;
            };
            let mut usb = DEV_BROADCAST_DEVICEINTERFACE_W {
                dbcc_size: size_of::<DEV_BROADCAST_DEVICEINTERFACE_W>() as u32,
                dbcc_devicetype: DBT_DEVTYP_DEVICEINTERFACE.0,
                dbcc_classguid: GUID_DEVINTERFACE_USB_DEVICE,
                ..Default::default()
            };
            if let Ok(h) = RegisterDeviceNotificationW(
                hwnd,
                &mut usb as *mut _ as *const _,
                DEVICE_NOTIFY_WINDOW_HANDLE,
            ) {
                USB_NOTIFY.store(h.0 as isize, Ordering::Release);
            }
            let mut radio = HANDLE::default();
            let params = BLUETOOTH_FIND_RADIO_PARAMS {
                dwSize: size_of::<BLUETOOTH_FIND_RADIO_PARAMS>() as u32,
            };
            if let Ok(find) = BluetoothFindFirstRadio(&params, &mut radio) {
                RADIO.store(radio.0 as isize, Ordering::Release);
                let mut filter = DEV_BROADCAST_HANDLE {
                    dbch_size: size_of::<DEV_BROADCAST_HANDLE>() as u32,
                    dbch_devicetype: DBT_DEVTYP_HANDLE.0,
                    dbch_handle: radio,
                    dbch_eventguid: GUID_BLUETOOTH_HCI_EVENT,
                    ..Default::default()
                };
                if let Ok(h) = RegisterDeviceNotificationW(
                    hwnd,
                    &mut filter as *mut _ as *const _,
                    DEVICE_NOTIFY_WINDOW_HANDLE,
                ) {
                    BT_NOTIFY.store(h.0 as isize, Ordering::Release);
                }
                let _ = BluetoothFindRadioClose(find);
            }
            log_dev("[Bluetooth] listener started");
            log_dev("[USB] listener started");
            let mut bluetooth_initialized = false;
            let mut next_bluetooth_check = Instant::now();
            while !STOP.load(Ordering::Acquire) {
                while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
                if Instant::now() >= next_bluetooth_check {
                    if let Some(devices) = connected_bluetooth_devices() {
                        reconcile_bluetooth_devices(
                            devices,
                            &mut bluetooth_initialized,
                            BLUETOOTH_ENABLED.load(Ordering::Acquire),
                        );
                    }
                    next_bluetooth_check = Instant::now() + std::time::Duration::from_secs(1);
                }
                std::thread::sleep(std::time::Duration::from_millis(40));
            }
            for raw in [
                USB_NOTIFY.swap(0, Ordering::AcqRel),
                BT_NOTIFY.swap(0, Ordering::AcqRel),
            ] {
                if raw != 0 {
                    let _ = UnregisterDeviceNotification(
                        windows::Win32::UI::WindowsAndMessaging::HDEVNOTIFY(raw as _),
                    );
                }
            }
            let radio = RADIO.swap(0, Ordering::AcqRel);
            if radio != 0 {
                let _ = CloseHandle(HANDLE(radio as _));
            }
            log_dev("[Bluetooth] listener stopped");
            log_dev("[USB] listener stopped");
        }
    }

    unsafe extern "system" fn proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if msg == WM_DEVICECHANGE {
            let event = wparam.0 as u32;
            if lparam.0 != 0 {
                let hdr = &*(lparam.0 as *const DEV_BROADCAST_HDR);
                if hdr.dbch_devicetype == DBT_DEVTYP_DEVICEINTERFACE {
                    let device = &*(lparam.0 as *const DEV_BROADCAST_DEVICEINTERFACE_W);
                    let ptr = device.dbcc_name.as_ptr();
                    let mut len = 0usize;
                    while *ptr.add(len) != 0 {
                        len += 1;
                    }
                    let key = String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len))
                        .to_lowercase();
                    let active = USB_ACTIVE.get_or_init(|| Mutex::new(HashSet::new()));
                    if USB_ENABLED.load(Ordering::Acquire) {
                        if event == DBT_DEVICEARRIVAL && active.lock().unwrap().insert(key.clone())
                        {
                            emit(
                                "usb",
                                Some("connected"),
                                Some("USB device".into()),
                                Some("other"),
                            );
                        }
                        if event == DBT_DEVICEREMOVECOMPLETE && active.lock().unwrap().remove(&key)
                        {
                            emit(
                                "usb",
                                Some("disconnected"),
                                Some("USB device".into()),
                                Some("other"),
                            );
                        }
                    }
                } else if hdr.dbch_devicetype == DBT_DEVTYP_HANDLE && event == DBT_CUSTOMEVENT {
                    let handle = &*(lparam.0 as *const DEV_BROADCAST_HANDLE);
                    if handle.dbch_eventguid == GUID_BLUETOOTH_HCI_EVENT
                        && handle.dbch_size as usize
                            >= size_of::<DEV_BROADCAST_HANDLE>() + size_of::<BTH_HCI_EVENT_INFO>()
                                - 1
                        && BLUETOOTH_ENABLED.load(Ordering::Acquire)
                    {
                        let hci = ptr::read_unaligned(
                            handle.dbch_data.as_ptr() as *const BTH_HCI_EVENT_INFO
                        );
                        let active = BT_ACTIVE.get_or_init(|| Mutex::new(HashSet::new()));
                        let mut set = active.lock().unwrap();
                        let connected = hci.connected != 0;
                        let changed = if connected {
                            set.insert(hci.bthAddress)
                        } else {
                            set.remove(&hci.bthAddress)
                        };
                        drop(set);
                        if changed {
                            let mut info = BLUETOOTH_DEVICE_INFO {
                                dwSize: size_of::<BLUETOOTH_DEVICE_INFO>() as u32,
                                ..Default::default()
                            };
                            info.Address.Anonymous.ullLong = hci.bthAddress;
                            let radio = HANDLE(RADIO.load(Ordering::Acquire) as _);
                            let name = if BluetoothGetDeviceInfo(radio, &mut info) == 0 {
                                let len = info
                                    .szName
                                    .iter()
                                    .position(|c| *c == 0)
                                    .unwrap_or(info.szName.len());
                                let value = String::from_utf16_lossy(&info.szName[..len])
                                    .trim()
                                    .to_string();
                                if value.is_empty() {
                                    None
                                } else {
                                    Some(value)
                                }
                            } else {
                                None
                            };
                            let device_class =
                                ((info.ulClassofDevice >> 8) & 0x1f == 4).then_some("audio");
                            emit(
                                "bluetooth",
                                Some(if connected {
                                    "connected"
                                } else {
                                    "disconnected"
                                }),
                                name,
                                device_class,
                            );
                        }
                    }
                }
            }
        }
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }
}

#[cfg(windows)]
fn device_listener() {
    win::listener();
}

#[cfg(not(windows))]
fn device_listener() {}

#[cfg(windows)]
fn screenshot_watcher() {
    use std::{
        os::windows::ffi::{OsStrExt, OsStringExt},
        path::PathBuf,
    };
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::{
        Foundation::{CloseHandle, HANDLE},
        Storage::FileSystem::{
            CreateFileW, ReadDirectoryChangesW, FILE_FLAG_BACKUP_SEMANTICS, FILE_LIST_DIRECTORY,
            FILE_NOTIFY_CHANGE_FILE_NAME, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
            OPEN_EXISTING,
        },
        UI::Shell::{FOLDERID_Screenshots, SHGetKnownFolderPath, KF_FLAG_DEFAULT},
    };
    let thread_id = unsafe { GetCurrentThreadId() };
    SCREENSHOT_THREAD_ID.store(thread_id, Ordering::Release);
    let folder =
        unsafe { SHGetKnownFolderPath(&FOLDERID_Screenshots, KF_FLAG_DEFAULT, HANDLE::default()) };
    let Ok(folder_ptr) = folder else {
        log_dev("[Screenshot] standard Screenshots folder unavailable");
        SCREENSHOT_THREAD_ID.store(0, Ordering::Release);
        return;
    };
    let folder_path = PathBuf::from(unsafe { std::ffi::OsString::from_wide(folder_ptr.as_wide()) });
    unsafe {
        let _ = windows::Win32::System::Com::CoTaskMemFree(Some(folder_ptr.as_ptr() as _));
    }
    let wide: Vec<u16> = folder_path
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let handle = unsafe {
        CreateFileW(
            windows::core::PCWSTR(wide.as_ptr()),
            FILE_LIST_DIRECTORY.0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            None,
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            None,
        )
    };
    let Ok(handle) = handle else {
        log_dev("[Screenshot] standard Screenshots folder unavailable");
        SCREENSHOT_THREAD_ID.store(0, Ordering::Release);
        return;
    };
    log_dev("[Screenshot] watcher started");
    let mut seen = std::collections::HashMap::<String, u64>::new();
    let mut buffer = [0u8; 8192];
    while !STOP.load(Ordering::Acquire) {
        let mut transferred = 0u32;
        let result = unsafe {
            ReadDirectoryChangesW(
                handle,
                buffer.as_mut_ptr() as _,
                buffer.len() as u32,
                false,
                FILE_NOTIFY_CHANGE_FILE_NAME,
                Some(&mut transferred),
                None,
                None,
            )
        };
        if result.is_err() || transferred == 0 {
            if STOP.load(Ordering::Acquire) {
                break;
            }
            log_dev("[Screenshot] watcher failed");
            break;
        }
        if !SCREENSHOTS_ENABLED.load(Ordering::Acquire) {
            continue;
        }
        let mut offset = 0usize;
        while offset + 12 <= transferred as usize {
            let next = u32::from_ne_bytes(buffer[offset..offset + 4].try_into().unwrap()) as usize;
            let action = u32::from_ne_bytes(buffer[offset + 4..offset + 8].try_into().unwrap());
            let bytes =
                u32::from_ne_bytes(buffer[offset + 8..offset + 12].try_into().unwrap()) as usize;
            if bytes <= transferred as usize - offset - 12 {
                let name = String::from_utf16_lossy(unsafe {
                    std::slice::from_raw_parts(
                        buffer.as_ptr().add(offset + 12) as *const u16,
                        bytes / 2,
                    )
                });
                if action == 1
                    && is_screenshot_name(&name)
                    && SCREENSHOTS_ENABLED.load(Ordering::Acquire)
                {
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;
                    let recent = seen
                        .get(&name)
                        .is_some_and(|t| now.saturating_sub(*t) < 1500);
                    if !recent {
                        seen.insert(name, now);
                        emit("screenshot", None, None, None);
                    }
                }
            }
            if next == 0 {
                break;
            }
            offset += next;
        }
        seen.retain(|_, t| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64
                - *t
                < 10_000
        });
    }
    unsafe {
        let _ = CloseHandle(handle);
    }
    log_dev("[Screenshot] watcher stopped");
    SCREENSHOT_THREAD_ID.store(0, Ordering::Release);
}

#[cfg(not(windows))]
fn screenshot_watcher() {}

fn is_screenshot_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    let Some(stem) = lower.strip_suffix(".png") else {
        return false;
    };
    let Some(number) = stem
        .strip_prefix("screenshot (")
        .and_then(|s| s.strip_suffix(')'))
    else {
        return false;
    };
    !number.is_empty() && number.chars().all(|c| c.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::is_screenshot_name;
    #[test]
    fn only_windows_screenshot_filename_pattern_is_accepted() {
        assert!(is_screenshot_name("Screenshot (12).png"));
        assert!(!is_screenshot_name("holiday.png"));
        assert!(!is_screenshot_name("Screenshot.png"));
        assert!(!is_screenshot_name("Screenshot (2).jpg"));
    }
}
