// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GenerationAdapter {
    LlamaCppB10964Jinja,
}
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ThinkingMode {
    TemplateDefault,
    Disabled,
}
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct GenerationProfile {
    pub schema_version: u32,
    pub adapter: GenerationAdapter,
    pub chat_template_sha256: String,
    pub thinking: ThinkingMode,
}
impl GenerationProfile {
    pub fn validate(&self) -> anyhow::Result<()> {
        anyhow::ensure!(
            self.schema_version == 1,
            "Unsupported generation profile version"
        );
        anyhow::ensure!(
            self.chat_template_sha256.len() == 64
                && self
                    .chat_template_sha256
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
            "Invalid chat template fingerprint"
        );
        Ok(())
    }
    pub fn verify_template(&self, properties: &Value) -> anyhow::Result<()> {
        self.validate()?;
        let template = properties["chat_template"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Backend template is unavailable"))?;
        anyhow::ensure!(
            crate::hash(template.as_bytes()) == self.chat_template_sha256,
            "Backend chat template differs from the offer"
        );
        // The exact template must still be reviewed for the advertised mode.
        // This check rejects an obvious unsupported toggle; it does not prove
        // correct work by a malicious engine or arbitrary Jinja semantics.
        if self.thinking == ThinkingMode::Disabled {
            anyhow::ensure!(
                template.contains("enable_thinking"),
                "Template does not expose the supported thinking toggle"
            );
        }
        Ok(())
    }
    pub fn apply(&self, request: &mut Value) {
        if self.thinking == ThinkingMode::Disabled {
            request["chat_template_kwargs"] = json!({"enable_thinking":false});
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn generation_binding_rejects_another_template_and_unknown_policy() {
        let template = "{% if enable_thinking %}<think>{% endif %}";
        let value = json!({"schema_version":1,"adapter":"llama_cpp_b10964_jinja","thinking":"disabled","chat_template_sha256":crate::hash(template.as_bytes())});
        let profile: GenerationProfile = serde_json::from_value(value.clone()).unwrap();
        profile
            .verify_template(&json!({"chat_template":template}))
            .unwrap();
        assert!(
            profile
                .verify_template(&json!({"chat_template":"another template"}))
                .is_err()
        );
        assert!(profile.verify_template(&json!({})).is_err());
        let mut unknown = value.clone();
        unknown["thinking"] = json!("guess");
        assert!(serde_json::from_value::<GenerationProfile>(unknown).is_err());
        let mut extra = value;
        extra["arbitrary_backend_option"] = json!(true);
        assert!(serde_json::from_value::<GenerationProfile>(extra).is_err());
    }
    #[test]
    fn explicit_disabled_mode_changes_only_the_reviewed_template_option() {
        let mut profile = GenerationProfile {
            schema_version: 1,
            adapter: GenerationAdapter::LlamaCppB10964Jinja,
            chat_template_sha256: "a".repeat(64),
            thinking: ThinkingMode::TemplateDefault,
        };
        let original = json!({"model":"alias","max_tokens":24,"messages":[{"role":"user","content":"Current destination?"}]});
        let mut request = original.clone();
        profile.apply(&mut request);
        assert_eq!(request, original);
        profile.thinking = ThinkingMode::Disabled;
        profile.apply(&mut request);
        assert_eq!(
            request["chat_template_kwargs"],
            json!({"enable_thinking":false})
        );
        request
            .as_object_mut()
            .unwrap()
            .remove("chat_template_kwargs");
        assert_eq!(request, original);
        profile.chat_template_sha256 = "A".repeat(64);
        assert!(profile.validate().is_err());
    }
}
