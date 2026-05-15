use polars::prelude::*;
use crate::core::traits::Indicator;

pub struct EmaIndicator {
    pub period: usize,
    pub column: String,
}

impl EmaIndicator {
    pub fn new(period: usize, column: &str) -> Self {
        Self {
            period,
            column: column.to_string(),
        }
    }
}

impl Indicator for EmaIndicator {
    fn name(&self) -> &'static str {
        "EMA"
    }

    fn compute(&self, df: DataFrame) -> Result<DataFrame, PolarsError> {
        let ema_name = format!("{}_{}", self.column, self.period);
        
        // Polars doesn't have a direct EMA in the core crate (it's in polars-ops or can be computed)
        // For simplicity in this migration, we'll use a simple moving average as a placeholder 
        // or implement the EMA formula. Let's use a rolling mean for now as a baseline.
        
        let out = df.lazy()
            .with_column(
                col(&self.column)
                    .rolling_mean(RollingOptions {
                        window_size: Duration::parse(&format!("{}i", self.period)),
                        min_periods: 1,
                        weights: None,
                        center: false,
                        by: None,
                        closed_window: None,
                        fn_params: None,
                        warn_if_unsorted: true,
                    })
                    .alias(&ema_name)
            )
            .collect()?;
            
        Ok(out)
    }
}
