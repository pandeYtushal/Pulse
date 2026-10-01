use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct MediaState {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_art: Option<String>,
    pub duration: u64,
    pub position: u64,
    pub playback_status: String,
    pub can_play: bool,
    pub can_pause: bool,
    pub can_skip_previous: bool,
    pub can_skip_next: bool,
    pub timestamp: u128,
}

#[cfg(windows)]
pub mod windows_media {
    use super::MediaState;
    use std::sync::mpsc;
    use std::thread;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    use tauri::{AppHandle, Emitter};

    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use windows::Foundation::TypedEventHandler;
    use windows::Media::Control::{
        CurrentSessionChangedEventArgs, GlobalSystemMediaTransportControlsSession,
        GlobalSystemMediaTransportControlsSessionManager, MediaPropertiesChangedEventArgs,
        PlaybackInfoChangedEventArgs, TimelinePropertiesChangedEventArgs,
    };
    use windows::Storage::Streams::DataReader;

    fn get_current_session() -> Option<GlobalSystemMediaTransportControlsSession> {
        if let Ok(manager_future) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        {
            if let Ok(manager) = manager_future.get() {
                if let Ok(session) = manager.GetCurrentSession() {
                    return Some(session);
                }
            }
        }
        None
    }

    fn winrt_datetime_to_unix_ms(dt: &windows::Foundation::DateTime) -> u128 {
        let ut = dt.UniversalTime;
        let epoch_diff = 116444736000000000_i64;
        if ut > epoch_diff {
            ((ut - epoch_diff) / 10000) as u128
        } else {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis()
        }
    }

    #[tauri::command]
    pub fn media_toggle() -> Result<String, String> {
        println!("[Pulse Media] TOGGLE requested");

        let session = get_current_session().ok_or_else(|| {
            println!("[Pulse Media] Current session: false");
            "No active GSMTC session".to_string()
        })?;

        println!("[Pulse Media] Current session: true");

        let info = session
            .GetPlaybackInfo()
            .map_err(|e| format!("Failed to get playback info: {:?}", e))?;
        let status = info
            .PlaybackStatus()
            .map_err(|e| format!("Failed to get playback status: {:?}", e))?
            .0;
        let controls = info
            .Controls()
            .map_err(|e| format!("Failed to get controls: {:?}", e))?;

        let is_playing = status == 4; // 4 = Playing

        println!(
            "[Pulse Media] Playback status: {}",
            if is_playing {
                "Playing"
            } else {
                "Paused/Stopped"
            }
        );
        println!(
            "[Pulse Media] Can play: {}",
            controls.IsPlayEnabled().unwrap_or(false)
        );
        println!(
            "[Pulse Media] Can pause: {}",
            controls.IsPauseEnabled().unwrap_or(false)
        );

        if is_playing {
            println!("[Pulse Media] Sending PAUSE");
            let future = session
                .TryTogglePlayPauseAsync()
                .map_err(|e| format!("Failed to execute toggle command: {:?}", e))?;
            match future.get() {
                Ok(true) => {
                    println!("[Pulse Media] PAUSE completed: true");
                    Ok("paused".to_string())
                }
                Ok(false) => {
                    println!("[Pulse Media] PAUSE failed: false returned");
                    Err("Pause command returned false".to_string())
                }
                Err(e) => {
                    println!("[Pulse Media] PAUSE failed: {:?}", e);
                    Err(format!("Failed to execute pause command: {:?}", e))
                }
            }
        } else {
            println!("[Pulse Media] Sending PLAY");
            let future = session
                .TryTogglePlayPauseAsync()
                .map_err(|e| format!("Failed to execute toggle command: {:?}", e))?;
            match future.get() {
                Ok(true) => {
                    println!("[Pulse Media] PLAY completed: true");
                    Ok("playing".to_string())
                }
                Ok(false) => {
                    println!("[Pulse Media] PLAY failed: false returned");
                    Err("Play command returned false".to_string())
                }
                Err(e) => {
                    println!("[Pulse Media] PLAY failed: {:?}", e);
                    Err(format!("Failed to execute play command: {:?}", e))
                }
            }
        }
    }

    #[tauri::command]
    pub fn media_next() {
        println!("[Pulse Media] NEXT requested");
        if let Some(session) = get_current_session() {
            match session.TrySkipNextAsync() {
                Ok(future) => {
                    if let Err(e) = future.get() {
                        println!("[Pulse Media] Next failed: {:?}", e);
                    } else {
                        println!("[Pulse Media] Next command sent");
                    }
                }
                Err(e) => println!("[Pulse Media] TrySkipNextAsync failed: {:?}", e),
            }
        }
    }

    #[tauri::command]
    pub fn media_prev() {
        println!("[Pulse Media] PREVIOUS requested");
        if let Some(session) = get_current_session() {
            match session.TrySkipPreviousAsync() {
                Ok(future) => {
                    if let Err(e) = future.get() {
                        println!("[Pulse Media] Previous failed: {:?}", e);
                    } else {
                        println!("[Pulse Media] Previous command sent");
                    }
                }
                Err(e) => println!("[Pulse Media] TrySkipPreviousAsync failed: {:?}", e),
            }
        }
    }

    #[tauri::command]
    pub fn diagnose_media() {
        println!("\n[Pulse Media Diagnostic]");
        if let Some(session) = get_current_session() {
            println!("Session: available");
            println!(
                "Source App: {:?}",
                session.SourceAppUserModelId().unwrap_or_default()
            );

            if let Ok(info) = session.GetPlaybackInfo() {
                if let Ok(status) = info.PlaybackStatus() {
                    println!("Playback Status: {:?}", status);
                }
                if let Ok(controls) = info.Controls() {
                    println!("Can Play: {:?}", controls.IsPlayEnabled().unwrap_or(false));
                    println!(
                        "Can Pause: {:?}",
                        controls.IsPauseEnabled().unwrap_or(false)
                    );
                    println!(
                        "Can Skip Next: {:?}",
                        controls.IsNextEnabled().unwrap_or(false)
                    );
                    println!(
                        "Can Skip Previous: {:?}",
                        controls.IsPreviousEnabled().unwrap_or(false)
                    );
                }
            }

            if let Ok(timeline) = session.GetTimelineProperties() {
                println!("\nTimeline:");
                println!(
                    "Position: {:?}",
                    timeline.Position().unwrap_or_default().Duration
                );
                println!(
                    "Start: {:?}",
                    timeline.StartTime().unwrap_or_default().Duration
                );
                println!("End: {:?}", timeline.EndTime().unwrap_or_default().Duration);
                if let Ok(last_updated) = timeline.LastUpdatedTime() {
                    println!("Last Updated (Raw): {:?}", last_updated.UniversalTime);
                    println!(
                        "Last Updated (Unix ms): {:?}",
                        winrt_datetime_to_unix_ms(&last_updated)
                    );
                }
            }
        } else {
            println!("Session: unavailable");
        }
        println!("--------------------------\n");
    }

    pub fn start_media_listener(app: AppHandle) {
        thread::spawn(move || {
            let (tx, rx) = mpsc::channel::<()>();

            let mut current_session: Option<GlobalSystemMediaTransportControlsSession> = None;

            let manager = loop {
                if crate::APP_SHUTTING_DOWN.load(std::sync::atomic::Ordering::Relaxed) {
                    return;
                }
                match GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
                    .and_then(|f| f.get())
                {
                    Ok(manager) => break manager,
                    Err(error) => {
                        eprintln!("[Media] GSMTC manager unavailable; retrying: {error:?}");
                        thread::sleep(Duration::from_secs(3));
                    }
                }
            };

            let tx_session = tx.clone();
            let handler = TypedEventHandler::<
                GlobalSystemMediaTransportControlsSessionManager,
                CurrentSessionChangedEventArgs,
            >::new(move |_, _| {
                println!("[Pulse Media] SessionChanged event received");
                let _ = tx_session.send(());
                Ok(())
            });
            let _ = manager.CurrentSessionChanged(&handler);

            let mut last_artwork: Option<String> = None;
            let mut last_artwork_title = String::new();
            let mut last_emitted_state: Option<MediaState> = None;

            while !crate::APP_SHUTTING_DOWN.load(std::sync::atomic::Ordering::Relaxed) {
                let new_session = manager.GetCurrentSession().ok();

                let session_changed = match (&current_session, &new_session) {
                    (Some(c), Some(n)) => {
                        c.SourceAppUserModelId().unwrap_or_default()
                            != n.SourceAppUserModelId().unwrap_or_default()
                    }
                    (None, Some(_)) | (Some(_), None) => true,
                    (None, None) => false,
                };

                if session_changed {
                    current_session = new_session;

                    if let Some(ref session) = current_session {
                        println!(
                            "[Pulse Media] Session connected to {:?}",
                            session.SourceAppUserModelId().unwrap_or_default()
                        );

                        let tx_media = tx.clone();
                        let _ = session.MediaPropertiesChanged(&TypedEventHandler::<
                            GlobalSystemMediaTransportControlsSession,
                            MediaPropertiesChangedEventArgs,
                        >::new(
                            move |_, _| {
                                println!("[Pulse Media] MediaPropertiesChanged event received");
                                let _ = tx_media.send(());
                                Ok(())
                            },
                        ));

                        let tx_playback = tx.clone();
                        let _ = session.PlaybackInfoChanged(&TypedEventHandler::<
                            GlobalSystemMediaTransportControlsSession,
                            PlaybackInfoChangedEventArgs,
                        >::new(
                            move |_, _| {
                                println!("[Pulse Media] PlaybackInfoChanged event received");
                                let _ = tx_playback.send(());
                                Ok(())
                            },
                        ));

                        let tx_timeline = tx.clone();
                        let _ = session.TimelinePropertiesChanged(&TypedEventHandler::<
                            GlobalSystemMediaTransportControlsSession,
                            TimelinePropertiesChangedEventArgs,
                        >::new(
                            move |_, _| {
                                println!("[Pulse Media] TimelinePropertiesChanged event received");
                                let _ = tx_timeline.send(());
                                Ok(())
                            },
                        ));
                    }
                }

                let mut state = MediaState {
                    title: None,
                    artist: None,
                    album: None,
                    album_art: None,
                    duration: 0,
                    position: 0,
                    playback_status: "Stopped".to_string(),
                    can_play: false,
                    can_pause: false,
                    can_skip_previous: false,
                    can_skip_next: false,
                    timestamp: SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_millis(), // Fallback
                };

                if let Some(ref session) = current_session {
                    if let Ok(info) = session.GetPlaybackInfo() {
                        if let Ok(status) = info.PlaybackStatus() {
                            state.playback_status = match status.0 {
                                1 => "Closed".to_string(),
                                2 => "Changing".to_string(),
                                3 => "Stopped".to_string(),
                                4 => "Playing".to_string(),
                                5 => "Paused".to_string(),
                                _ => "Unknown".to_string(),
                            };
                        }
                        if let Ok(controls) = info.Controls() {
                            state.can_play = controls.IsPlayEnabled().unwrap_or(false);
                            state.can_pause = controls.IsPauseEnabled().unwrap_or(false);
                            state.can_skip_next = controls.IsNextEnabled().unwrap_or(false);
                            state.can_skip_previous = controls.IsPreviousEnabled().unwrap_or(false);
                        }
                    }

                    if let Ok(timeline) = session.GetTimelineProperties() {
                        state.position = timeline.Position().unwrap_or_default().Duration as u64;
                        state.duration = timeline.EndTime().unwrap_or_default().Duration as u64;
                        if let Ok(last_updated) = timeline.LastUpdatedTime() {
                            state.timestamp = winrt_datetime_to_unix_ms(&last_updated);
                        }
                    }

                    if let Ok(properties_future) = session.TryGetMediaPropertiesAsync() {
                        if let Ok(properties) = properties_future.get() {
                            if let Ok(t) = properties.Title() {
                                let t_str = t.to_string_lossy();
                                if !t_str.is_empty() {
                                    state.title = Some(t_str);
                                }
                            }
                            if let Ok(a) = properties.Artist() {
                                let a_str = a.to_string_lossy();
                                if !a_str.is_empty() {
                                    state.artist = Some(a_str);
                                }
                            }
                            if let Ok(a) = properties.AlbumTitle() {
                                let a_str = a.to_string_lossy();
                                if !a_str.is_empty() {
                                    state.album = Some(a_str);
                                }
                            }

                            let title_for_cache = state.title.clone().unwrap_or_default();
                            if !title_for_cache.is_empty() && title_for_cache == last_artwork_title
                            {
                                state.album_art = last_artwork.clone();
                            } else {
                                if let Ok(thumbnail_ref) = properties.Thumbnail() {
                                    if let Ok(stream_future) = thumbnail_ref.OpenReadAsync() {
                                        if let Ok(stream) = stream_future.get() {
                                            let size = stream.Size().unwrap_or(0) as u32;
                                            if size > 0 {
                                                if let Ok(reader) =
                                                    DataReader::CreateDataReader(&stream)
                                                {
                                                    if let Ok(load_future) = reader.LoadAsync(size)
                                                    {
                                                        if load_future.get().is_ok() {
                                                            let mut buffer =
                                                                vec![0u8; size as usize];
                                                            if reader.ReadBytes(&mut buffer).is_ok()
                                                            {
                                                                let b64 = STANDARD.encode(&buffer);
                                                                let mime = stream.ContentType().unwrap_or(windows::core::HSTRING::from("image/jpeg")).to_string_lossy();
                                                                let data_uri = format!(
                                                                    "data:{};base64,{}",
                                                                    mime, b64
                                                                );
                                                                state.album_art =
                                                                    Some(data_uri.clone());
                                                                last_artwork = Some(data_uri);
                                                                last_artwork_title =
                                                                    title_for_cache;
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                let mut should_emit = false;
                if let Some(last) = &last_emitted_state {
                    if last.title != state.title
                        || last.artist != state.artist
                        || last.playback_status != state.playback_status
                        || last.position != state.position
                        || last.duration != state.duration
                        || last.can_play != state.can_play
                        || last.can_pause != state.can_pause
                        || last.can_skip_next != state.can_skip_next
                        || last.can_skip_previous != state.can_skip_previous
                    {
                        should_emit = true;
                    }
                } else {
                    should_emit = true;
                }

                if should_emit {
                    let _ = app.emit("media-state", state.clone());
                    last_emitted_state = Some(state.clone());
                } else if state.playback_status == "Playing" {
                    let _ = app.emit("media-state", state.clone());
                    last_emitted_state = Some(state);
                }

                let _ = rx.recv_timeout(Duration::from_millis(500));
            }
        });
    }
}

#[cfg(not(windows))]
pub mod windows_media {
    use super::MediaState;
    use tauri::AppHandle;

    #[tauri::command]
    pub fn media_toggle() -> Result<String, String> {
        Err("Not implemented".to_string())
    }

    #[tauri::command]
    pub fn media_next() {}

    #[tauri::command]
    pub fn media_prev() {}

    #[tauri::command]
    pub fn diagnose_media() {}

    pub fn start_media_listener(_app: AppHandle) {}
}
