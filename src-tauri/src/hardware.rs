use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::time::sleep;
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BatteryStatus {
    pub percentage: u8,
    pub is_charging: bool,
    pub is_low: bool,
}

pub fn start_hardware_monitor(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut last_charging_state: Option<bool> = None;
        let mut last_low_state: Option<bool> = None;

        while !crate::APP_SHUTTING_DOWN.load(std::sync::atomic::Ordering::Relaxed) {
            let mut status = SYSTEM_POWER_STATUS::default();
            let success = unsafe { GetSystemPowerStatus(&mut status) };

            if success.is_ok() {
                let is_charging = status.ACLineStatus == 1;
                let percentage = status.BatteryLifePercent;

                if percentage <= 100 {
                    let is_low = percentage <= 20 && !is_charging;
                    let battery_status = BatteryStatus {
                        percentage,
                        is_charging,
                        is_low,
                    };

                    let mut should_alert = false;

                    // Alert if charging state changed (e.g. just plugged in or unplugged)
                    if let Some(last_charging) = last_charging_state {
                        if last_charging != is_charging {
                            should_alert = true;
                        }
                    }

                    // Alert if we just entered low battery state
                    if let Some(last_low) = last_low_state {
                        if !last_low && is_low {
                            should_alert = true;
                        }
                    }

                    if should_alert {
                        println!(
                            "[Pulse] Battery State Changed: {}% (Charging: {})",
                            percentage, is_charging
                        );
                        let _ = app.emit("battery-alert", battery_status.clone());
                    }

                    last_charging_state = Some(is_charging);
                    last_low_state = Some(is_low);
                }
            }

            // Check every 3 seconds for snappy response
            sleep(Duration::from_secs(3)).await;
        }
    });
}
