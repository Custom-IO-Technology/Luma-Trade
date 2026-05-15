use polars::prelude::*;
use crate::core::traits::Indicator;

pub struct AtrIndicator {
    pub period: usize,
}

impl AtrIndicator {
    pub fn new(period: usize) -> Self {
        Self { period }
    }
}

impl Indicator for AtrIndicator {
    fn name(&self) -> &'static str {
        "ATR"
    }

    fn compute(&self, df: DataFrame) -> Result<DataFrame, PolarsError> {
        let out = df.lazy()
            .with_column(col("close").shift(lit(1)).alias("prev_close"))
            .with_columns([
                (col("high") - col("low")).alias("tr1"),
                (col("high") - col("prev_close")).abs().alias("tr2"),
                (col("low") - col("prev_close")).abs().alias("tr3")
            ])
            .with_column(
                max_horizontal([col("tr1"), col("tr2"), col("tr3")])?.alias("true_range")
            )
            .with_column(
                col("true_range").rolling_mean(RollingOptions {
                    window_size: Duration::parse(&format!("{}i", self.period)),
                    min_periods: self.period,
                    weights: None,
                    center: false,
                    by: None,
                    closed_window: None,
                    fn_params: None,
                    warn_if_unsorted: true,
                }).alias("atr_14")
            )
            .select([col("*").exclude(["prev_close", "tr1", "tr2", "tr3", "true_range"])])
            .collect()?;

        Ok(out)
    }
}
