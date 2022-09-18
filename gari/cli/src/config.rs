//! CLI Client configuration
use serde::{Deserialize, Serialize};
use std::fs::File;

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct ProgramIds {
    pub metadata_id: String,
    pub staking_id: String,
    pub governance_id: String,
}

/// Custom CLI Config structure
#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct CLIConfig {
    pub fee_payer_path: String,
    pub network: String,
    pub program_ids: ProgramIds,
}

impl Default for CLIConfig {
    fn default() -> Self {
        let fee_payer_path = {
            let mut fee_payer_path = dirs_next::home_dir().expect("home directory");
            fee_payer_path.extend(&[".config", "solana", "id.json"]);
            fee_payer_path.to_str().unwrap().to_string()
        };
        let network = "devnet".to_string();

        let program_ids = ProgramIds {
            metadata_id: "5gwJwtY6K8ScN8fd5Mp5dtVaaNPpfT8DWkvGi9cHzXBd".to_string(),
            staking_id: "GAhAErsedUEA6j268TS3fjxjXMoE1cVLK5eUqkQ9zRC1".to_string(),
            governance_id: "HECZUtVYnYDox3iwhcruL7HLJzBaUhrxVHZjERgHmFLD".to_string(),
        };

        Self {
            fee_payer_path,
            network,
            program_ids,
        }
    }
}

impl CLIConfig {
    /// Loading CLI Config from file
    pub fn load(config_file: &str) -> Result<Self, std::io::Error> {
        let file = File::open(config_file)?;
        let config: Self = serde_json::from_reader(file)
            .map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, format!("{:?}", err)))?;
        Ok(config)
    }
}
