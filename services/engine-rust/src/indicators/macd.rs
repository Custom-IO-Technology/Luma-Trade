use polars::prelude::*;
use crate::core::traits::Indicator;

pub struct MacdIndicator {
    pub fast: usize,
    pub slow: usize,
    pub signal: usize,
}

impl MacdIndicator {
    pub fn new(fast: usize, slow: usize, signal: usize) -> Self {
        Self { fast, slow, signal }
    }
}

impl Indicator for MacdIndicator {
    fn name(&self) -> &'static str {
        "MACD"
    }

    fn compute(&self, df: DataFrame) -> Result<DataFrame, PolarsError> {
        let out = df.lazy()
            .with_columns([
                (
                    col("close").ewm_mean(EWMOptions {
                        alpha: 2.0 / (self.fast as f64 + 1.0),
                        adjust: true,
                        min_periods: 1,
                        ignore_nulls: true,
                        bias: false,
                    }) - 
                    col("close").ewm_mean(EWMOptions {
                        alpha: 2.0 / (self.slow as f64 + 1.0),
                        adjust: true,
                        min_periods: 1,
                        ignore_nulls: true,
                        bias: false,
                    })
                ).alias("macd_line")
            ])
            .with_columns([
                col("macd_line").ewm_mean(EWMOptions {
                    alpha: 2.0 / (self.signal as f64 + 1.0),
                    adjust: true,
                    min_periods: 1,
                    ignore_nulls: true,
                    bias: false,
                }).alias("macd_signal")
            ])
            .with_columns([
                (col("macd_line") - col("macd_signal")).alias("macd_histogram")
            ])
            .collect()?;

        Ok(out)
    }
}
