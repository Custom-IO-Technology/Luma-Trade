use polars::prelude::*;
use crate::core::traits::Rule;

pub struct MacdCrossRule;

impl Rule for MacdCrossRule {
    fn name(&self) -> &'static str {
        "MACD K above D"
    }

    fn max_points(&self) -> u8 {
        10
    }

    fn is_hard_rule(&self) -> bool {
        false
    }

    fn category(&self) -> &'static str {
        "momentum"
    }

    fn evaluate(&self, df: &DataFrame, direction: &str) -> bool {
        if df.height() < 1 {
            return false;
        }

        let hist_col = match df.column("macd_histogram").and_then(|c| c.f64()) {
            Ok(c) => c,
            Err(_) => return false,
        };

        let hist = hist_col.get(df.height() - 1).unwrap_or(0.0);

        if direction == "LONG" {
            hist > 0.0
        } else {
            hist < 0.0
        }
    }
}
