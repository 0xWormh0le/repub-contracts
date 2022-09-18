use anchor_lang::{
    prelude::*,
    solana_program::clock::{self, UnixTimestamp},
};
use anchor_spl::token::{self, Mint, MintTo, TokenAccount};
use bigint::U256;
use std::ops::{Add, Div, Mul, Sub};

/// Equals number of decimals in the interest rate
const INTEREST_MUL_FACTOR: u64 = 1_000_000;
/// Limits the exponent for one interest calc iteration to avoid overflows
const MAX_DAYS_INTEREST_ACCRUE: u64 = 10;

/// Calculate the users shares after staking
pub fn calculate_new_shares(total_shares: u64, total_staked: u64, amount: u64) -> u64 {
    if total_shares == 0 {
        return amount;
    }

    let total_shares_bn: U256 = total_shares.into();
    let total_staked_bn: U256 = total_staked.into();
    let amount_bn: U256 = amount.into();
    return total_shares_bn.mul(amount_bn).div(total_staked_bn).as_u64();
}

/// After calculate_accrued_interest total_staked will increase and the user shares_to_burn will be less than amount.
/// The difference between amount and shares_to_burn is the user's income. This difference can be unstaked later.
pub fn calculate_shares_to_burn(total_shares: u64, total_staked: u64, amount: u64) -> u64 {
    let total_shares_bn: U256 = total_shares.into();
    let total_staked_bn: U256 = total_staked.into();
    let amount_bn: U256 = amount.into();
    return total_shares_bn.mul(amount_bn).div(total_staked_bn).as_u64();
}

/// Calculates the interest that should be accrued to date and the timestamp this accrual happened at.
pub fn calculate_accrued_interest(
    last_interest_accrued_timestamp: UnixTimestamp,
    current_timestamp: UnixTimestamp,
    total_staked: u64,
    interest_rate: u64,
) -> (u64, UnixTimestamp) {
    let mut timestamp = last_interest_accrued_timestamp;
    let mut interest = 0;

    let timestamp_diff = current_timestamp
        .checked_sub(last_interest_accrued_timestamp)
        .unwrap();
    // If there is went more than one day by last accrued interest
    if timestamp_diff > (clock::SECONDS_PER_DAY as i64) {
        let days_elapsed = timestamp_diff.div(clock::SECONDS_PER_DAY as i64) as u64;
        let mut new_balance: U256 = total_staked.into();

        let interest_mul_factor: U256 = INTEREST_MUL_FACTOR.into();
        let daily_rate: U256 = INTEREST_MUL_FACTOR.add(interest_rate).into();

        // Overflow check
        let mut days_remain = days_elapsed;
        while days_remain > 0 {
            if days_remain < MAX_DAYS_INTEREST_ACCRUE {
                new_balance = new_balance
                    .mul(daily_rate.pow(days_remain.into()))
                    .div(interest_mul_factor.pow(days_remain.into()));
                days_remain = 0;
            } else {
                new_balance = new_balance
                    .mul(daily_rate.pow(MAX_DAYS_INTEREST_ACCRUE.into()))
                    .div(interest_mul_factor.pow(MAX_DAYS_INTEREST_ACCRUE.into()));
                days_remain = days_remain.sub(MAX_DAYS_INTEREST_ACCRUE);
            }
        }

        interest = new_balance.as_u64().sub(total_staked);
        timestamp = current_timestamp;
    }

    return (interest, timestamp);
}

/// Accrues interest to date. Internal function for calling from instruction functions.
pub fn accrue_interest_internal<'info>(
    program_id: &Pubkey,
    staking_data: &mut ProgramAccount<'info, crate::StakingData>,
    holding_wallet: &CpiAccount<'info, TokenAccount>,
    staking_token_metadata: &AccountInfo<'info>,
    mint: &CpiAccount<'info, Mint>,
    mint_authority: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    clock: &Sysvar<'info, Clock>,
) -> ProgramResult {
    let (mut tokens_to_mint, new_timestamp) = calculate_accrued_interest(
        staking_data.last_interest_accrued_timestamp,
        clock.unix_timestamp,
        staking_data.total_staked,
        staking_data.interest_rate_daily,
    );

    let new_supply = mint.supply + tokens_to_mint;
    if new_supply > staking_data.cap {
        msg!("Token supply cap exceeded");
        tokens_to_mint = 0;
    }

    msg!("Tokens to mint: {}", tokens_to_mint);
    if tokens_to_mint > 0 {
        // Mint tokens to HoldingWallet account
        let seeds = &[
            program_id.as_ref(),
            staking_data.to_account_info().key.as_ref(),
            staking_token_metadata.key.as_ref(),
            &[staking_data.mint_auth_bump],
        ];
        let signer = &[&seeds[..]];
        token::mint_to(
            CpiContext::new_with_signer(
                token_program.clone(),
                MintTo {
                    mint: mint.to_account_info().clone(),
                    to: holding_wallet.to_account_info().clone(),
                    authority: mint_authority.to_account_info().clone(),
                },
                signer,
            ),
            tokens_to_mint,
        )?;

        staking_data.last_interest_accrued_timestamp = new_timestamp;
        staking_data.total_staked = staking_data
            .total_staked
            .checked_add(tokens_to_mint)
            .unwrap();
    }

    Ok(())
}

// Unit tests
#[cfg(test)]
mod test {
    use super::*;

    const DEFAULT_TOKEN_DECIMALS: u8 = 9; // equals number of decimals in the SPL Staking token

    /// Convert the UI representation of a token amount (using the decimals field defined in its mint)
    /// to the raw amount
    fn ui_amount_to_amount(ui_amount: f64) -> u64 {
        (ui_amount * 10_usize.pow(DEFAULT_TOKEN_DECIMALS as u32) as f64) as u64
    }

    #[test]
    fn test_calculate_shares() {
        let user1_initial_balance = 25_000_000_000;
        let user2_initial_balance = 11_500_000_000;
        let mut user1_ownership_shares = 0;
        let mut user2_ownership_shares = 0;
        let mut total_shares = 0;
        let mut total_staked = 0;

        // User1 first time stake tokens
        let amount = user1_initial_balance;
        let new_shares = calculate_new_shares(total_shares, total_staked, amount);
        assert_eq!(new_shares, user1_initial_balance);

        user1_ownership_shares += new_shares;
        total_staked += amount;
        total_shares += new_shares;

        // User2 first time stake tokens
        let amount = user2_initial_balance;
        let new_shares = calculate_new_shares(total_shares, total_staked, amount);
        assert_eq!(new_shares, user2_initial_balance);

        user2_ownership_shares += new_shares;
        total_staked += amount;
        total_shares += new_shares;

        // Interest for 5 days (~10% per year)
        let interest_rate = 261;
        let last_interest_accrued_timestamp = 0;
        let current_timestamp =
            last_interest_accrued_timestamp + 5 * clock::SECONDS_PER_DAY as i64 + 1;
        let (tokens_to_mint, _) = calculate_accrued_interest(
            last_interest_accrued_timestamp,
            current_timestamp,
            total_staked,
            interest_rate,
        );
        assert_eq!(tokens_to_mint, 47657370);
        total_staked += tokens_to_mint;

        // User1 unstake tokens after 5 days
        let amount = user1_initial_balance;
        let shares_to_burn = calculate_shares_to_burn(total_shares, total_staked, amount);
        assert_eq!(shares_to_burn, 24_967_400_530); // the remainder is interest

        total_shares -= shares_to_burn;
        total_staked -= amount;
        user1_ownership_shares -= shares_to_burn;

        // User1 unstake more in this day (more than initial balance)
        let amount = 10_000_000;
        let shares_to_burn = calculate_shares_to_burn(total_shares, total_staked, amount);
        assert_eq!(shares_to_burn, 9_986_960); // division error

        total_shares -= shares_to_burn;
        total_staked -= amount;
        user1_ownership_shares -= shares_to_burn;

        // after 365 days test
        let last_interest_accrued_timestamp = 0;
        let current_timestamp =
            last_interest_accrued_timestamp + 365 * clock::SECONDS_PER_DAY as i64 + 1;
        let (tokens_to_mint, _) = calculate_accrued_interest(
            last_interest_accrued_timestamp,
            current_timestamp,
            total_staked,
            interest_rate,
        );
        assert_eq!(tokens_to_mint, 1_153_034_591); // ~10% off 11537657370
        total_staked += tokens_to_mint;

        // To cover future interest
        assert!(total_staked > total_shares);
        assert_eq!(
            total_shares,
            user1_ownership_shares + user2_ownership_shares
        );
    }

    #[test]
    fn test_calculate_accrued_interest() {
        // Case: 0 days from last accrued timestamp
        let last_interest_accrued_timestamp = 1631012856;
        let current_timestamp = last_interest_accrued_timestamp;
        let (interest, timestamp) =
            calculate_accrued_interest(last_interest_accrued_timestamp, current_timestamp, 0, 0);
        assert_eq!(interest, 0);
        assert_eq!(timestamp, last_interest_accrued_timestamp);

        // Case: 10% per year for 35 days of total_staked: 10.0 tokens
        let last_interest_accrued_timestamp = 1631012856;
        let total_staked = ui_amount_to_amount(10.0);
        let interest_rate = 261; // 1.10 ^ (1/365) - 1.0
        let current_timestamp =
            last_interest_accrued_timestamp + 35 * clock::SECONDS_PER_DAY as i64 + 1;
        let (interest, timestamp) = calculate_accrued_interest(
            last_interest_accrued_timestamp,
            current_timestamp,
            total_staked,
            interest_rate,
        );
        assert_eq!(interest, 91756484);
        assert_eq!(timestamp, current_timestamp);

        // Case: 10% per year for 365 days of total_staked: 25.5 tokens
        let last_interest_accrued_timestamp = 1631012856;
        let total_staked = ui_amount_to_amount(25.5);
        let interest_rate = 261;
        let current_timestamp =
            last_interest_accrued_timestamp + 365 * clock::SECONDS_PER_DAY as i64 + 1;
        let (interest, timestamp) = calculate_accrued_interest(
            last_interest_accrued_timestamp,
            current_timestamp,
            total_staked,
            interest_rate,
        );
        assert_eq!(interest, 2548384076); // ~ 2.55
        assert_eq!(timestamp, current_timestamp);

        // Case: 6% per year for 365 days of total_staked: 1150.11223344 tokens
        let last_interest_accrued_timestamp = 1631012856;
        let total_staked = ui_amount_to_amount(1150.11223344);
        let interest_rate = 159;
        let current_timestamp =
            last_interest_accrued_timestamp + 365 * clock::SECONDS_PER_DAY as i64 + 1;
        let (interest, timestamp) = calculate_accrued_interest(
            last_interest_accrued_timestamp,
            current_timestamp,
            total_staked,
            interest_rate,
        );
        assert_eq!(interest, 68715982681);
        assert_eq!(timestamp, current_timestamp);
    }
}
