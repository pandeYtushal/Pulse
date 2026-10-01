use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ClipboardKind {
    Text,
    Image,
    File,
    MultipleFiles,
    Other,
}

#[derive(Clone, Debug, Serialize)]
pub struct ClipboardChange {
    pub sequence: u32,
    pub kind: ClipboardKind,
    pub preview: Option<String>,
    pub file_count: Option<u32>,
}

#[cfg(windows)]
mod windows_listener {
    use super::{ClipboardChange, ClipboardKind};
    use std::{
        sync::{
            atomic::{AtomicBool, AtomicU32, Ordering},
            Mutex, OnceLock,
        },
        thread::{self, JoinHandle},
    };
    use tauri::{AppHandle, Emitter};
    use windows::{
        core::{w, PCWSTR},
        Win32::{
            Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM},
            System::{
                DataExchange::{
                    AddClipboardFormatListener, CloseClipboard, GetClipboardData,
                    GetClipboardSequenceNumber, IsClipboardFormatAvailable, OpenClipboard,
                    RegisterClipboardFormatW, RemoveClipboardFormatListener,
                },
                LibraryLoader::GetModuleHandleW,
                Memory::{GlobalLock, GlobalSize, GlobalUnlock},
                Ole::{CF_BITMAP, CF_DIB, CF_DIBV5, CF_HDROP, CF_UNICODETEXT},
                Threading::GetCurrentThreadId,
            },
            UI::{
                Shell::{DragQueryFileW, HDROP},
                WindowsAndMessaging::{
                    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW,
                    PeekMessageW, PostThreadMessageW, RegisterClassW, TranslateMessage,
                    HWND_MESSAGE, PM_REMOVE, WINDOW_STYLE, WM_CLIPBOARDUPDATE, WM_QUIT, WNDCLASSW,
                    WS_EX_NOACTIVATE,
                },
            },
        },
    };

    static APP: OnceLock<AppHandle> = OnceLock::new();
    static ENABLED: AtomicBool = AtomicBool::new(false);
    static PREVIEW_ENABLED: AtomicBool = AtomicBool::new(false);
    static LISTENER_STARTED: AtomicBool = AtomicBool::new(false);
    static STOP_REQUESTED: AtomicBool = AtomicBool::new(false);
    static LISTENER_THREAD_ID: AtomicU32 = AtomicU32::new(0);
    static LISTENER_THREAD: OnceLock<Mutex<Option<JoinHandle<()>>>> = OnceLock::new();

    pub fn set_options(enabled: bool, preview: bool) {
        PREVIEW_ENABLED.store(enabled && preview, Ordering::Release);
        ENABLED.store(enabled, Ordering::Release);
    }

    pub fn start(app: AppHandle) {
        if LISTENER_STARTED.swap(true, Ordering::AcqRel) {
            return;
        }
        STOP_REQUESTED.store(false, Ordering::Release);
        let _ = APP.set(app);
        let result = thread::Builder::new()
            .name("pulse-clipboard-listener".into())
            .spawn(listener_thread);
        match result {
            Ok(handle) => {
                let thread = LISTENER_THREAD.get_or_init(|| Mutex::new(None));
                if let Ok(mut owned) = thread.lock() {
                    *owned = Some(handle);
                }
            }
            Err(_) => {
                LISTENER_STARTED.store(false, Ordering::Release);
                #[cfg(debug_assertions)]
                eprintln!("[Clipboard] listener thread could not start");
            }
        }
    }

    pub fn stop() {
        ENABLED.store(false, Ordering::Release);
        PREVIEW_ENABLED.store(false, Ordering::Release);
        STOP_REQUESTED.store(true, Ordering::Release);
        let thread_id = LISTENER_THREAD_ID.load(Ordering::Acquire);
        if thread_id != 0 {
            unsafe {
                let _ = PostThreadMessageW(thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
            }
        }
        if let Some(thread) = LISTENER_THREAD.get() {
            if let Ok(mut owned) = thread.lock() {
                if let Some(handle) = owned.take() {
                    let _ = handle.join();
                }
            }
        }
    }

    fn listener_thread() {
        unsafe {
            let thread_id = GetCurrentThreadId();
            // Creating the queue before publishing its ID avoids a shutdown race.
            let mut queue_message = windows::Win32::UI::WindowsAndMessaging::MSG::default();
            let _ = PeekMessageW(&mut queue_message, None, 0, 0, PM_REMOVE);
            LISTENER_THREAD_ID.store(thread_id, Ordering::Release);
            if STOP_REQUESTED.load(Ordering::Acquire) {
                listener_finished("listener stopped before initialization");
                return;
            }

            let Ok(module) = GetModuleHandleW(PCWSTR::null()) else {
                listener_finished("could not resolve the Pulse module handle");
                return;
            };
            let module_instance = HINSTANCE(module.0);
            let class_name = w!("PulseClipboardListenerWindow");
            let window_class = WNDCLASSW {
                lpfnWndProc: Some(clipboard_window_proc),
                hInstance: module_instance,
                lpszClassName: class_name,
                ..Default::default()
            };
            if RegisterClassW(&window_class) == 0 {
                listener_finished("could not register the clipboard listener window");
                return;
            }

            let Ok(hwnd) = CreateWindowExW(
                WS_EX_NOACTIVATE,
                class_name,
                class_name,
                WINDOW_STYLE(0),
                0,
                0,
                0,
                0,
                HWND_MESSAGE,
                None,
                module_instance,
                None,
            ) else {
                listener_finished("could not create the clipboard message window");
                return;
            };

            if AddClipboardFormatListener(hwnd).is_err() {
                let _ = DestroyWindow(hwnd);
                listener_finished("Windows rejected clipboard listener registration");
                return;
            }

            #[cfg(debug_assertions)]
            eprintln!("[Clipboard] native listener ready");

            let mut message = windows::Win32::UI::WindowsAndMessaging::MSG::default();
            loop {
                let result = GetMessageW(&mut message, None, 0, 0).0;
                if result <= 0 {
                    break;
                }
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }

            let _ = RemoveClipboardFormatListener(hwnd);
            let _ = DestroyWindow(hwnd);
            listener_finished("listener stopped");
        }
    }

    unsafe fn listener_finished(reason: &str) {
        #[cfg(debug_assertions)]
        eprintln!("[Clipboard] {reason}");
        let _ = reason;
        LISTENER_THREAD_ID.store(0, Ordering::Release);
        LISTENER_STARTED.store(false, Ordering::Release);
    }

    unsafe extern "system" fn clipboard_window_proc(
        hwnd: HWND,
        message: u32,
        _wparam: WPARAM,
        _lparam: LPARAM,
    ) -> LRESULT {
        if message == WM_CLIPBOARDUPDATE {
            if ENABLED.load(Ordering::Acquire) {
                let sequence = GetClipboardSequenceNumber();
                if sequence != 0 {
                    if let Some(change) = classify_clipboard(sequence) {
                        if let Some(app) = APP.get() {
                            let _ = app.emit("clipboard-changed", change);
                        }
                    }
                }
            }
            return LRESULT(0);
        }
        DefWindowProcW(hwnd, message, _wparam, _lparam)
    }

    unsafe fn available(format: u16) -> bool {
        IsClipboardFormatAvailable(format as u32).is_ok()
    }

    unsafe fn registered_format_available(format: PCWSTR) -> bool {
        let registered = RegisterClipboardFormatW(format);
        registered != 0 && IsClipboardFormatAvailable(registered).is_ok()
    }

    unsafe fn classify_clipboard(sequence: u32) -> Option<ClipboardChange> {
        let file_format = available(CF_HDROP.0);
        let text_format = available(CF_UNICODETEXT.0);
        let image_format = available(CF_BITMAP.0)
            || available(CF_DIB.0)
            || available(CF_DIBV5.0)
            || [w!("PNG"), w!("image/png"), w!("JFIF")]
                .iter()
                .any(|format| registered_format_available(*format));

        if file_format {
            let Ok(()) = OpenClipboard(HWND::default()) else {
                return None;
            };
            let count = GetClipboardData(CF_HDROP.0.into())
                .ok()
                .map(|handle| DragQueryFileW(HDROP(handle.0), u32::MAX, None));
            let _ = CloseClipboard();
            let count = count?;
            return Some(ClipboardChange {
                sequence,
                kind: if count > 1 {
                    ClipboardKind::MultipleFiles
                } else {
                    ClipboardKind::File
                },
                preview: None,
                file_count: Some(count),
            });
        }

        if image_format {
            return Some(ClipboardChange {
                sequence,
                kind: ClipboardKind::Image,
                preview: None,
                file_count: None,
            });
        }

        if text_format {
            let preview = if PREVIEW_ENABLED.load(Ordering::Acquire) {
                read_safe_preview()
            } else {
                None
            };
            return Some(ClipboardChange {
                sequence,
                kind: ClipboardKind::Text,
                preview,
                file_count: None,
            });
        }

        Some(ClipboardChange {
            sequence,
            kind: ClipboardKind::Other,
            preview: None,
            file_count: None,
        })
    }

    unsafe fn read_safe_preview() -> Option<String> {
        OpenClipboard(HWND::default()).ok()?;
        let _clipboard = ClipboardGuard;
        let handle = GetClipboardData(CF_UNICODETEXT.0.into()).ok()?;
        let memory = windows::Win32::Foundation::HGLOBAL(handle.0);
        let byte_len = GlobalSize(memory);
        if byte_len < 2 {
            return None;
        }
        let pointer = GlobalLock(memory).cast::<u16>();
        if pointer.is_null() {
            return None;
        }
        let max_units = (byte_len / 2).min(4096);
        let units = std::slice::from_raw_parts(pointer, max_units);
        let end = units
            .iter()
            .position(|unit| *unit == 0)
            .unwrap_or(units.len());
        let raw = String::from_utf16_lossy(&units[..end]);
        let _ = GlobalUnlock(memory);
        make_safe_preview(&raw)
    }

    struct ClipboardGuard;

    impl Drop for ClipboardGuard {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseClipboard();
            }
        }
    }

    fn make_safe_preview(text: &str) -> Option<String> {
        if looks_sensitive(text) {
            return None;
        }
        let normalized = text
            .chars()
            .filter(|character| !character.is_control())
            .collect::<String>()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if normalized.is_empty() {
            return None;
        }
        let mut preview = normalized.chars().take(80).collect::<String>();
        if normalized.chars().count() > 80 {
            preview.push('…');
        }
        Some(preview)
    }

    fn looks_sensitive(text: &str) -> bool {
        let lower = text.to_ascii_lowercase();
        let sensitive_markers = [
            "password",
            "passwd",
            "passphrase",
            "api_key",
            "apikey",
            "access_token",
            "refresh_token",
            "client_secret",
            "authorization: bearer",
            "-----begin ",
            "private key-----",
            "secret_key",
        ];
        if sensitive_markers
            .iter()
            .any(|marker| lower.contains(marker))
        {
            return true;
        }

        let digits = text
            .chars()
            .filter(|character| character.is_ascii_digit())
            .count();
        let only_code_chars = text.chars().all(|character| {
            character.is_ascii_digit() || character.is_whitespace() || character == '-'
        });
        if only_code_chars && (4..=8).contains(&digits) {
            return true;
        }
        let card_digits = text
            .chars()
            .filter(|character| character.is_ascii_digit())
            .collect::<String>();
        if (13..=19).contains(&card_digits.len()) && passes_luhn(&card_digits) {
            return true;
        }

        // Conservatively hide long opaque, unspaced values commonly used as keys/tokens.
        let compact = text.trim();
        compact.chars().count() >= 32
            && !compact.chars().any(char::is_whitespace)
            && compact
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || "_-./+=".contains(character))
            && compact
                .chars()
                .any(|character| character.is_ascii_alphabetic())
            && compact.chars().any(|character| character.is_ascii_digit())
    }

    fn passes_luhn(digits: &str) -> bool {
        let sum = digits
            .chars()
            .rev()
            .enumerate()
            .map(|(index, character)| {
                let mut digit = character.to_digit(10).unwrap_or(0);
                if index % 2 == 1 {
                    digit *= 2;
                    if digit > 9 {
                        digit -= 9;
                    }
                }
                digit
            })
            .sum::<u32>();
        sum % 10 == 0
    }

    #[cfg(test)]
    mod tests {
        use super::{looks_sensitive, make_safe_preview};

        #[test]
        fn sensitive_text_never_becomes_a_preview() {
            assert_eq!(make_safe_preview("password=correct horse"), None);
            assert_eq!(make_safe_preview("123 456"), None);
            assert_eq!(make_safe_preview("4111 1111 1111 1111"), None);
            assert_eq!(
                make_safe_preview("eyJhbGciOiJIUzI1NiJ9.1234567890.abcdefghijklmnopqrstuv"),
                None
            );
            assert!(looks_sensitive("-----BEGIN PRIVATE KEY-----"));
        }

        #[test]
        fn preview_is_single_line_and_bounded() {
            assert_eq!(
                make_safe_preview("Hello\n  world"),
                Some("Hello world".to_string())
            );
            let preview = make_safe_preview(&"a".repeat(100)).unwrap();
            assert_eq!(preview.chars().count(), 81);
            assert!(preview.ends_with('…'));
        }
    }
}

#[cfg(windows)]
pub use windows_listener::{set_options, start, stop};

#[cfg(not(windows))]
pub fn set_options(_enabled: bool, _preview: bool) {}

#[cfg(not(windows))]
pub fn start(_app: tauri::AppHandle) {}

#[cfg(not(windows))]
pub fn stop() {}
