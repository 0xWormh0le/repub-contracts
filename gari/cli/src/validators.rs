///! Helper validation functions

pub fn is_valid_len(string: String, len: usize) -> Result<(), String> {
    if string.len() > len {
        return Err(format!("Invalid NAME len {}, max {}", string.len(), len));
    }

    Ok(())
}

pub fn is_valid_decimals(string: String) -> Result<(), String> {
    match string.parse::<u8>() {
        Ok(_) => Ok(()),
        Err(_) => Err(format!("Invalid input {}", string)),
    }
}

pub fn is_valid_name(string: String) -> Result<(), String> {
    is_valid_len(string, spl_token_metadata::state::MAX_NAME_LENGTH)
}

pub fn is_valid_symbol(string: String) -> Result<(), String> {
    is_valid_len(string, spl_token_metadata::state::MAX_SYMBOL_LENGTH)
}

pub fn is_valid_hash_len(string: String) -> Result<(), String> {
    is_valid_len(string, governance::MAX_IPFS_HASH_LEN)
}

pub fn is_valid_uint(string: String) -> Result<(), String> {
    match string.parse::<u64>() {
        Ok(_) => Ok(()),
        Err(_) => Err(format!("Invalid input {}", string)),
    }
}

pub fn is_valid_int(string: String) -> Result<(), String> {
    match string.parse::<i64>() {
        Ok(_) => Ok(()),
        Err(_) => Err(format!("Invalid input {}", string)),
    }
}

pub fn is_valid_bool(string: String) -> Result<(), String> {
    match string.parse::<bool>() {
        Ok(_) => Ok(()),
        Err(_) => Err(format!("Invalid input {}", string)),
    }
}

pub fn is_valid_ui_amount(string: String) -> Result<(), String> {
    match string.parse::<f64>() {
        Ok(_) => Ok(()),
        Err(_) => Err(format!("Invalid input amount {}", string)),
    }
}
