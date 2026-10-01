use crate::notifications::PulseNotification;
use axum::{routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::time::sleep;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadItem {
    pub id: String,
    pub filename: String,
    pub status: String,
    pub downloaded_bytes: f64,
    pub total_bytes: Option<f64>,
    pub speed: Option<f64>,
    pub source: String,
    pub timestamp: u64,
    pub paused: bool,
    pub can_resume: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadEvent {
    pub event_type: String,
    pub download: DownloadItem,
}

pub fn init(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Build our application with a route
        let app = Router::new()
            .route(
                "/download-event",
                post({
                    let app_handle = app_handle.clone();
                    move |Json(payload): Json<DownloadEvent>| {
                        let handle = app_handle.clone();
                        async move {
                            let _ = handle.emit("download-event", payload);
                            "OK"
                        }
                    }
                }),
            )
            .route(
                "/web-notification",
                post({
                    let app_handle = app_handle.clone();
                    move |Json(payload): Json<PulseNotification>| {
                        let handle = app_handle.clone();
                        async move {
                            let _ = handle.emit("pulse://notification", payload);
                            "OK"
                        }
                    }
                }),
            );

        // Run our app with hyper, listening globally on port 40523
        loop {
            if crate::APP_SHUTTING_DOWN.load(std::sync::atomic::Ordering::Relaxed) {
                return;
            }
            let listener = match tokio::net::TcpListener::bind("127.0.0.1:40523").await {
                Ok(listener) => listener,
                Err(error) => {
                    eprintln!(
                        "[Download] bridge bind failed on 127.0.0.1:40523; retrying: {error}"
                    );
                    sleep(Duration::from_secs(5)).await;
                    continue;
                }
            };
            if let Ok(address) = listener.local_addr() {
                println!("[Download] bridge listening on {address}");
            }
            let server = axum::serve(listener, app.clone()).with_graceful_shutdown(async {
                while !crate::APP_SHUTTING_DOWN.load(std::sync::atomic::Ordering::Relaxed) {
                    sleep(Duration::from_millis(250)).await;
                }
            });
            if let Err(error) = server.await {
                eprintln!("[Download] bridge stopped; retrying in 5 seconds: {error}");
                sleep(Duration::from_secs(5)).await;
            }
        }
    });
}
