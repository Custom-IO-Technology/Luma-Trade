use polars::prelude::*;
use crate::models::RuleResult;

pub trait Indicator: Send + Sync {
    fn name(&self) -> &'static str;
    fn compute(&self, df: DataFrame) -> Result<DataFrame, PolarsError>;
}

pub trait Rule: Send + Sync {
    fn name(&self) -> &'static str;
    fn evaluate(&self, df: &DataFrame, direction: &str) -> bool;
    fn max_points(&self) -> u8;
    fn is_hard_rule(&self) -> bool;
    fn category(&self) -> &'static str {
        "entry"
    }

    fn get_details(&self, df: &DataFrame, direction: &str) -> RuleResult {
        let passed = self.evaluate(df, direction);
        RuleResult {
            name: self.name().to_string(),
            passed,
            points: if passed { self.max_points() } else { 0 },
            weight: self.max_points(), // Using max_points as weight for UI
            comment: if passed { "Confirmed".to_string() } else { "Not met".to_string() },
        }
    }
}
