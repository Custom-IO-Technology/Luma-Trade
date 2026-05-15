use polars::prelude::*;
use crate::core::traits::Rule;
use crate::models::{ScoreResult, RuleResult};
use crate::config::Settings;
use chrono::Utc;

pub struct ConfidenceScorer {
    rules: Vec<Box<dyn Rule>>,
}

impl ConfidenceScorer {
    pub fn new(rules: Vec<Box<dyn Rule>>) -> Self {
        Self { rules }
    }

    pub fn score(&self, df: &DataFrame, symbol: &str, direction: &str, settings: &Settings) -> ScoreResult {
        let mut total_score = 0;
        let mut hard_rules_met = true;
        let mut rules_payload = Vec::new();

        for rule in &self.rules {
            let details = rule.get_details(df, direction);
            
            if rule.is_hard_rule() && !details.passed {
                hard_rules_met = false;
            }
            
            total_score += details.points as i32;
            rules_payload.push(details);
        }

        let mut status = if hard_rules_met { "PASS" } else { "REJECTED" }.to_string();
        let mut decision = "NO TRADE".to_string();
        let mut level = "⏳ EVALUATING".to_string();

        if hard_rules_met {
            if total_score >= settings.score_full_size_threshold {
                decision = "ENTER FULL SIZE".to_string();
                level = "🟢 A - PRIME SETUP".to_string();
            } else if total_score >= settings.score_scaled_size_threshold {
                decision = "ENTER SCALED SIZE".to_string();
                level = "🟡 B - GOOD SETUP".to_string();
            } else {
                status = "REJECTED".to_string();
                decision = "SCORE TOO LOW".to_string();
                level = "🟠 C - WEAK SETUP".to_string();
            }
        } else {
            level = "🔴 NO TRADE".to_string();
        }

        ScoreResult {
            msg_type: "score_update".to_string(),
            symbol: symbol.to_string(),
            score: total_score,
            status,
            level,
            decision,
            hard_rules_met,
            rules_payload,
            timestamp: Utc::now().timestamp(),
        }
    }
}
