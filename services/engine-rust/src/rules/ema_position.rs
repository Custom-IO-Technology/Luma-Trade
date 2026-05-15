use polars::prelude::*;
use crate::core::traits::Rule;

pub struct EmaPositionRule;

impl Rule for EmaPositionRule {
    fn name(&self) -> &'static str {
        "EMA Position"
    }

    fn max_points(&self) -> u8 {
        15
    }

    fn is_hard_rule(&self) -> bool {
        true
    }

    fn category(&self) -> &'static str {
        "trend"
    }

    fn evaluate(&self, df: &DataFrame, direction: &str) -> bool {
        if df.height() < 1 {
            return false;
        }

        let close_col = match df.column("close").and_then(|c| c.f64()) {
            Ok(c) => c,
            Err(_) => return false,
        };
        let ema_55_col = match df.column("ema_55").and_then(|c| c.f64()) {
            Ok(c) => c,
            Err(_) => return false,
        };
        let ema_200_col = match df.column("ema_200").and_then(|c| c.f64()) {
            Ok(c) => c,
            Err(_) => return false,
        };

        let idx = df.height() - 1;
        let close = close_col.get(idx).unwrap_or(0.0);
        let ema_55 = ema_55_col.get(idx).unwrap_or(0.0);
        let ema_200 = ema_200_col.get(idx).unwrap_or(0.0);

        if direction == "LONG" {
            close > ema_55 && ema_55 > ema_200
        } else {
            close < ema_55 && ema_55 < ema_200
        }
    }
}
