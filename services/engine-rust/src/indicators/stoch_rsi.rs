use polars::prelude::*;
use crate::core::traits::Indicator;

pub struct StochRsiIndicator {
    pub period: usize,
    pub k: usize,
    pub d: usize,
}

impl StochRsiIndicator {
    pub fn new(period: usize, k: usize, d: usize) -> Self {
        Self { period, k, d }
    }
}

impl Indicator for StochRsiIndicator {
    fn name(&self) -> &'static str {
        "StochRSI"
    }

    fn compute(&self, df: DataFrame) -> Result<DataFrame, PolarsError> {
        let out = df.lazy()
            .with_column((col("close") - col("close").shift(lit(1))).alias("change"))
            .with_columns([
                when(col("change").gt(0)).then(col("change")).otherwise(lit(0)).alias("gain"),
                when(col("change").lt(0)).then(col("change").abs()).otherwise(lit(0)).alias("loss")
            ])
            .with_columns([
                col("gain").rolling_mean(RollingOptions {
                    window_size: Duration::parse(&format!("{}i", self.period)),
                    min_periods: self.period,
                    weights: None,
                    center: false,
                    by: None,
                    closed_window: None,
                    fn_params: None,
                    warn_if_unsorted: true,
                }).alias("avg_gain"),
                col("loss").rolling_mean(RollingOptions {
                    window_size: Duration::parse(&format!("{}i", self.period)),
                    min_periods: self.period,
                    weights: None,
                    center: false,
                    by: None,
                    closed_window: None,
                    fn_params: None,
                    warn_if_unsorted: true,
                }).alias("avg_loss")
            ])
            .with_column((col("avg_gain") / col("avg_loss")).alias("rs"))
            .with_column(
                when(col("avg_loss").eq(0)).then(lit(100.0))
                .otherwise(lit(100.0) - (lit(100.0) / (lit(1.0) + col("rs")))).alias("rsi_14")
            )
            .with_columns([
                col("rsi_14").rolling_min(RollingOptions {
                    window_size: Duration::parse(&format!("{}i", self.period)),
                    min_periods: self.period,
                    weights: None,
                    center: false,
                    by: None,
                    closed_window: None,
                    fn_params: None,
                    warn_if_unsorted: true,
                }).alias("rsi_min_14"),
                col("rsi_14").rolling_max(RollingOptions {
                    window_size: Duration::parse(&format!("{}i", self.period)),
                    min_periods: self.period,
                    weights: None,
                    center: false,
                    by: None,
                    closed_window: None,
                    fn_params: None,
                    warn_if_unsorted: true,
                }).alias("rsi_max_14")
            ])
            .with_column(
                ((col("rsi_14") - col("rsi_min_14")) / 
                 (col("rsi_max_14") - col("rsi_min_14")) * lit(100.0)).alias("stoch_rsi_k")
            )
            .with_column(
                col("stoch_rsi_k").rolling_mean(RollingOptions {
                    window_size: Duration::parse(&format!("{}i", self.d)),
                    min_periods: self.d,
                    weights: None,
                    center: false,
                    by: None,
                    closed_window: None,
                    fn_params: None,
                    warn_if_unsorted: true,
                }).alias("stoch_rsi_d")
            )
            .select([col("*").exclude(["change", "gain", "loss", "avg_gain", "avg_loss", "rs", "rsi_min_14", "rsi_max_14"])])
            .collect()?;

        Ok(out)
    }
}
