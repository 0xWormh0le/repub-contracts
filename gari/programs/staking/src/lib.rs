//! Program for staking SPL Tokens

use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock::SECONDS_PER_DAY;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::token::{self, Mint, TokenAccount, Transfer};
use std::ops::Sub;

pub mod utils;

#[program]
pub mod staking {
    use super::*;

    /// Creating and configuring new staking pool
    ///
    /// Accounts expected by this instruction:
    /// 0. `[writable, signer]` StakingData account
    /// 1. `[signer]` StakingData account owner
    /// 2. `[]` StakingHoldingWallet account
    /// 3. `[]` StakingHoldingWallet owner pda of [staking_program_id, staking_data]
    /// 4. `[]` Staking token metadata account
    /// 5. `[]` Staking token Mint
    /// 6. `[]` System program
    /// 7. `[]` Clock sysvar
    /// 8. `[]` Rent sysvar
    ///
    /// \param token: the pubkey of SPL Token to stake
    /// \param starting_timestamp: launch time and initialization of last_interest_accrued_timestamp
    /// \param max_interest_rate: the hard cap for interest rate
    /// \param starting_interest_rate: initialization for daily interest rate
    /// \param cap: the hard cap for staking token supply
    /// \param holding_bump: PDA bump for staking token holding account
    /// \param mint_auth_bump: PDA bump for new mint authority for staking token
    pub fn initialize_staking(
        ctx: Context<InitializeStaking>,
        token: Pubkey,
        starting_timestamp: i64,
        max_interest_rate: u64,
        starting_interest_rate: u64,
        cap: u64,
        holding_bump: u8,
        mint_auth_bump: u8,
    ) -> ProgramResult {
        msg!("Instruction: initialize staking");

        let current_timestamp = ctx.accounts.clock.unix_timestamp;
        if starting_timestamp < current_timestamp.sub(SECONDS_PER_DAY as i64) {
            msg!("Error:  Setting the start of staking more than 1 day in the past");
            msg!("current timestamp: {}", current_timestamp);
            msg!("Starting timestamp: {}", starting_timestamp);
            return Err(StakingError::InvalidStartingTimestamp.into());
        }

        if token != ctx.accounts.staking_token_metadata.key() {
            msg!("Token argument don't match the token account key");
            return Err(ProgramError::InvalidArgument);
        }

        if max_interest_rate == 0 {
            msg!("Error: Max interest rate cannot be zero");
            return Err(StakingError::InvalidInterestRate.into());
        }
        if starting_interest_rate == 0 {
            msg!("Error: Starting interest rate cannot be zero");
            return Err(StakingError::InvalidInterestRate.into());
        }
        if starting_interest_rate > max_interest_rate {
            msg!("Error: Initial interest rate is higher than maximum");
            return Err(StakingError::InvalidInterestRate.into());
        }

        if cap < ctx.accounts.staking_token_mint.supply {
            msg!("Error: Token supply cap must be bigger than current token supply");
            return Err(StakingError::InvalidCap.into());
        }

        let staking_data = &mut ctx.accounts.staking_data;
        staking_data.owner = *ctx.accounts.staking_owner.key;
        staking_data.stake_token_metadata = token;
        staking_data.holding_wallet = *ctx.accounts.holding_wallet.to_account_info().key;
        staking_data.total_staked = 0;
        staking_data.total_shares = 0;
        staking_data.interest_rate_daily = starting_interest_rate;
        staking_data.max_interest_rate_daily = max_interest_rate;
        staking_data.last_interest_accrued_timestamp = starting_timestamp;
        staking_data.holding_bump = holding_bump;
        staking_data.mint_auth_bump = mint_auth_bump;
        staking_data.cap = cap;

        Ok(())
    }

    /// Initialize new StakingUserData account for provided StakingData. Every user who wants to stake tokens should
    /// first initialize StakingUserData account.
    ///
    /// Accounts expected by this instruction:
    /// 0. `[writable, signer]` UserStakingData account
    /// 1. `[]` User Token Wallet (SPL Token Account)
    /// 2. `[signer]` User Token Wallet owner
    /// 3. `[]` Staking data account
    /// 4. `[]` Staking token metadata
    /// 5. `[]` System program
    /// 6. `[]` Rent sysvar
    pub fn initialize_staking_user(ctx: Context<InitializeStakingUser>) -> ProgramResult {
        let staking_user_data = &mut ctx.accounts.staking_user_data;
        staking_user_data.user_token_wallet = *ctx.accounts.user_token_wallet.to_account_info().key;
        staking_user_data.staking_data = *ctx.accounts.staking_data.to_account_info().key;
        staking_user_data.ownership_share = 0;

        Ok(())
    }

    /// Set `interest_rate_daily` for provided StakingData account to provided
    /// `new_interest_rate` value. Accrues interest first.
    ///
    /// Accounts expected by this instruction:
    /// 0. `[writable]` StakingData account
    /// 1. `[signer]` StakingData owner
    /// 2. `[writable]` StakingHoldingWallet account
    /// 3. `[]` Staking Token Metadata account
    /// 4. `[writable]` Token Mint account
    /// 5. `[]` TokenMetadata Mint mint_authority (pda of [staking_program_id, staking_data, token_metadata])
    /// 6. `[]` SPL Token program account
    /// 7. `[]` Clock Sysvar
    ///
    /// \param new_interest_rate: new value for interest rate daily
    pub fn set_interest_rate(
        ctx: Context<SetInterestRate>,
        new_interest_rate: u64,
    ) -> ProgramResult {
        msg!("Instruction: set interest rate");

        if new_interest_rate > ctx.accounts.staking_data.max_interest_rate_daily {
            msg!("Error: New interest rate is higher than allowed maximum");
            msg!("New interest rate: {}", new_interest_rate);
            return Err(StakingError::InvalidInterestRate.into());
        }

        // Accrue interest
        utils::accrue_interest_internal(
            ctx.program_id,
            &mut ctx.accounts.staking_data,
            &ctx.accounts.holding_wallet,
            &ctx.accounts.staking_token_metadata,
            &ctx.accounts.mint,
            &ctx.accounts.mint_authority,
            &ctx.accounts.token_program,
            &ctx.accounts.clock,
        )?;

        let staking_data = &mut ctx.accounts.staking_data;
        staking_data.interest_rate_daily = new_interest_rate;

        Ok(())
    }

    /// Stake the tokens to staking pool. Accrues interest first.
    ///
    /// Accounts expected by this instruction:
    /// 0. `[writable]` StakingUserData account
    /// 1. `[writable]` User SPL Token account
    /// 2. `[signer]` User SPL Token owner
    /// 3. `[writable]` StakingData account
    /// 4. `[writable]` StakingHoldingWallet account
    /// 5. `[]` TokenMetadata account
    /// 6. `[writable]` TokenMetadata Mint account
    /// 7. `[]` TokenMetadata Mint authority is pda of [staking_program_id, staking_data, token_metadata]
    /// 8. `[]` SPL token program account
    /// 9. `[]` Clock sysvar
    ///
    /// \param amount: the amount to stake
    pub fn stake(ctx: Context<Stake>, amount: u64) -> ProgramResult {
        msg!("Instruction: stake");

        // Attempt to unlock amount
        if ctx.accounts.clock.unix_timestamp >= ctx.accounts.staking_user_data.locked_until {
            let staking_user_data = &mut ctx.accounts.staking_user_data;
            staking_user_data.locked_amount = 0;
            staking_user_data.locked_until = 0;
        }

        // Accrue interest
        utils::accrue_interest_internal(
            ctx.program_id,
            &mut ctx.accounts.staking_data,
            &ctx.accounts.holding_wallet,
            &ctx.accounts.staking_token_metadata,
            &ctx.accounts.mint,
            &ctx.accounts.mint_authority,
            &ctx.accounts.token_program,
            &ctx.accounts.clock,
        )?;

        if amount == 0 {
            msg!("Error: Stake amount cannot be zero");
            return Err(StakingError::InvalidAmount.into());
        }

        if ctx.accounts.user_token_wallet.amount < amount {
            msg!("Error: User's SPL wallet balance is less than requested stake amount");
            return Err(ProgramError::InsufficientFunds);
        }

        // Transfer SPL Tokens from user wallet to holding wallet
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.clone(),
                Transfer {
                    from: ctx.accounts.user_token_wallet.to_account_info().clone(),
                    to: ctx.accounts.holding_wallet.to_account_info().clone(),
                    authority: ctx.accounts.user_token_wallet_owner.clone(),
                },
            ),
            amount,
        )?;

        // Calculate new shares
        let staking_data = &ctx.accounts.staking_data;
        let new_shares = utils::calculate_new_shares(
            staking_data.total_shares,
            staking_data.total_staked,
            amount,
        );
        msg!("New shares: {}", new_shares);

        // Save accounts data
        let staking_data = &mut ctx.accounts.staking_data;
        let staking_user_data = &mut ctx.accounts.staking_user_data;
        staking_data.total_staked = staking_data.total_staked.checked_add(amount).unwrap();
        staking_data.total_shares = staking_data.total_shares.checked_add(new_shares).unwrap();
        staking_user_data.ownership_share = staking_user_data
            .ownership_share
            .checked_add(new_shares)
            .unwrap();

        Ok(())
    }

    /// User takes tokens from deposit with interest rate. Accrues interest first.
    ///
    /// Accounts expected by this instruction:
    /// 0. `[writable]` StakingUserData account
    /// 1. `[writable]` User SPL Token account
    /// 2. `[signer]` User SPL Token owner
    /// 3. `[writable]` StakingData account
    /// 4. `[writable]` StakingHoldingWallet account
    /// 5. `[]`  StakingHoldingWallet owner (pda of [staking_program_id, staking_data])
    /// 6. `[]` TokenMetadata account
    /// 7. `[writable]` TokenMetadata Mint account
    /// 8. `[]` TokenMetadata Mint authority (pda of [staking_program_id, staking_data, token_metadata])
    /// 9. `[]` SPL token program account
    /// 10. `[]` Clock sysvar
    ///
    /// \param amount: the amount to unstake
    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> ProgramResult {
        msg!("Instruction: unstake");

        // Attempt to unlock amount
        if ctx.accounts.clock.unix_timestamp >= ctx.accounts.staking_user_data.locked_until {
            let staking_user_data = &mut ctx.accounts.staking_user_data;
            staking_user_data.locked_amount = 0;
            staking_user_data.locked_until = 0;
        }

        if amount == 0 {
            msg!("Error: Unstake amount cannot be zero");
            return Err(StakingError::InvalidAmount.into());
        }

        // Accrue interest
        utils::accrue_interest_internal(
            ctx.program_id,
            &mut ctx.accounts.staking_data,
            &ctx.accounts.holding_wallet,
            &ctx.accounts.staking_token_metadata,
            &ctx.accounts.mint,
            &ctx.accounts.mint_authority,
            &ctx.accounts.token_program,
            &ctx.accounts.clock,
        )?;

        let staking_data = &mut ctx.accounts.staking_data;
        let shares_to_burn = utils::calculate_shares_to_burn(
            staking_data.total_shares,
            staking_data.total_staked,
            amount,
        );
        msg!("Shares to burn: {}", shares_to_burn);

        if shares_to_burn == 0 {
            msg!("Staking: User tries to unstake 0 or there are no stakers");
            return Err(StakingError::UnstakeFundsError.into());
        }

        let avail_amount;
        if ctx.accounts.staking_user_data.locked_amount
            > ctx.accounts.staking_user_data.ownership_share
        {
            avail_amount = ctx.accounts.staking_user_data.locked_amount;
        } else {
            avail_amount = ctx.accounts.staking_user_data.ownership_share
                - ctx.accounts.staking_user_data.locked_amount;
        }
        if shares_to_burn > avail_amount {
            msg!("Staking: User tries to unstake more than their available balance");
            return Err(ProgramError::InsufficientFunds);
        }

        let staking_user_data = &mut ctx.accounts.staking_user_data;
        staking_user_data.ownership_share = staking_user_data
            .ownership_share
            .checked_sub(shares_to_burn)
            .unwrap();
        staking_data.total_shares = staking_data
            .total_shares
            .checked_sub(shares_to_burn)
            .unwrap();
        staking_data.total_staked = staking_data.total_staked.checked_sub(amount).unwrap();

        // Transfer amount of tokens from holding wallet to user
        let seeds = &[
            ctx.program_id.as_ref(),
            ctx.accounts.staking_data.to_account_info().key.as_ref(),
            &[ctx.accounts.staking_data.holding_bump],
        ];
        let signer = &[&seeds[..]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.clone(),
                Transfer {
                    from: ctx.accounts.holding_wallet.to_account_info().clone(),
                    to: ctx.accounts.user_token_wallet.to_account_info().clone(),
                    authority: ctx.accounts.holding_wallet_owner.clone(),
                },
                signer,
            ),
            amount,
        )?;

        Ok(())
    }

    /// Accrue the interest from the staked tokens
    ///
    /// Accounts expected by this instruction:
    /// 0. `[writable]` StakingData account
    /// 1. `[writable]` StakingHoldingWallet account
    /// 2. `[]` Token Metadata account
    /// 3. `[writable]` Token Mint account
    /// 4. `[]` Token Metadata Mint authority is pda of [staking_program_id, staking_data, token_metadata]
    /// 5. `[]` SPL Token program account
    /// 6. `[]` Clock sysvar
    pub fn accrue_interest(ctx: Context<AccrueInterest>) -> ProgramResult {
        msg!("Instruction: accrue interest");

        // Accrue interest
        utils::accrue_interest_internal(
            ctx.program_id,
            &mut ctx.accounts.staking_data,
            &ctx.accounts.holding_wallet,
            &ctx.accounts.staking_token_metadata,
            &ctx.accounts.mint,
            &ctx.accounts.mint_authority,
            &ctx.accounts.token_program,
            &ctx.accounts.clock,
        )?;

        Ok(())
    }

    /// Lock the current user ownership share. Instruction for cross program invocation
    /// from Governance program.
    pub fn lock_amount(ctx: Context<LockAmount>, until: i64, amount: u64) -> ProgramResult {
        msg!("Instruction: lock amount");
        if until < ctx.accounts.staking_user_data.locked_until {
            msg!("Trying to unlock by time.");
            return Err(StakingError::InvalidLockParams.into());
        }
        if amount < ctx.accounts.staking_user_data.locked_amount {
            msg!("Trying to unlock amount. Do nothing.");
            return Ok(());
        }

        let staking_user_data = &mut ctx.accounts.staking_user_data;
        staking_user_data.locked_amount = amount;
        staking_user_data.locked_until = until;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeStaking<'info> {
    #[account(init, payer = staking_owner, space = StakingData::LEN)]
    staking_data: ProgramAccount<'info, StakingData>,
    #[account(signer)]
    staking_owner: AccountInfo<'info>,
    #[account(
        constraint = holding_wallet.owner == *holding_wallet_owner.key,
    )]
    holding_wallet: CpiAccount<'info, TokenAccount>,
    // pda [staking_program_id, staking_data]
    holding_wallet_owner: AccountInfo<'info>,
    staking_token_metadata: AccountInfo<'info>,
    staking_token_mint: CpiAccount<'info, Mint>,
    system_program: AccountInfo<'info>,
    clock: Sysvar<'info, Clock>,
    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct InitializeStakingUser<'info> {
    #[account(init, payer = user_token_wallet_owner, space = StakingUserData::LEN)]
    staking_user_data: ProgramAccount<'info, StakingUserData>,
    #[account(
        constraint = user_token_wallet.owner == *user_token_wallet_owner.key,
    )]
    user_token_wallet: CpiAccount<'info, TokenAccount>,
    #[account(signer)]
    user_token_wallet_owner: AccountInfo<'info>,
    #[account(
        constraint = staking_data.stake_token_metadata == staking_token_metadata.key(),
    )]
    staking_data: ProgramAccount<'info, StakingData>,
    staking_token_metadata: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct SetInterestRate<'info> {
    #[account(mut, constraint = staking_data.owner == *staking_owner.key)]
    staking_data: ProgramAccount<'info, StakingData>,
    #[account(signer)]
    staking_owner: AccountInfo<'info>,
    #[account(mut,
        constraint = holding_wallet.mint == mint.key(),
    )]
    holding_wallet: CpiAccount<'info, TokenAccount>,
    staking_token_metadata: AccountInfo<'info>,
    #[account(mut,
        constraint = mint.mint_authority == COption::Some(*mint_authority.key)
    )]
    mint: CpiAccount<'info, Mint>,
    #[account(
        seeds = [
            program_id.as_ref(),
            staking_data.to_account_info().key.as_ref(),
            staking_token_metadata.key.as_ref()
        ],
        bump = staking_data.mint_auth_bump,
    )]
    mint_authority: AccountInfo<'info>,
    #[account(constraint = token_program.key == &anchor_spl::token::ID)]
    token_program: AccountInfo<'info>,
    clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut,
        constraint = staking_user_data.user_token_wallet == user_token_wallet.key(),
        constraint = staking_user_data.staking_data == staking_data.key(),
    )]
    staking_user_data: ProgramAccount<'info, StakingUserData>,
    #[account(mut,
        constraint = user_token_wallet.owner == *user_token_wallet_owner.key,
        constraint = user_token_wallet.mint == mint.key(),
    )]
    user_token_wallet: CpiAccount<'info, TokenAccount>,
    #[account(signer)]
    user_token_wallet_owner: AccountInfo<'info>,
    #[account(mut)]
    staking_data: ProgramAccount<'info, StakingData>,
    #[account(mut,
        constraint = holding_wallet.mint == mint.key(),
    )]
    holding_wallet: CpiAccount<'info, TokenAccount>,
    staking_token_metadata: AccountInfo<'info>,
    #[account(mut,
        constraint = mint.mint_authority == COption::Some(*mint_authority.key)
    )]
    mint: CpiAccount<'info, Mint>,
    #[account(
        seeds = [
            program_id.as_ref(),
            staking_data.to_account_info().key.as_ref(),
            staking_token_metadata.key.as_ref()
        ],
        bump = staking_data.mint_auth_bump,
    )]
    mint_authority: AccountInfo<'info>,
    #[account(constraint = token_program.key == &anchor_spl::token::ID)]
    token_program: AccountInfo<'info>,
    clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut,
        constraint = staking_user_data.user_token_wallet == user_token_wallet.key(),
        constraint = staking_user_data.staking_data == staking_data.key(),
    )]
    staking_user_data: ProgramAccount<'info, StakingUserData>,
    #[account(mut,
        constraint = user_token_wallet.owner == *user_token_wallet_owner.key,
        constraint = user_token_wallet.mint == mint.key(),
    )]
    user_token_wallet: CpiAccount<'info, TokenAccount>,
    #[account(signer)]
    user_token_wallet_owner: AccountInfo<'info>,
    #[account(mut)]
    staking_data: ProgramAccount<'info, StakingData>,
    #[account(mut,
        constraint = holding_wallet.owner == *holding_wallet_owner.key,
        constraint = holding_wallet.mint == mint.key(),
    )]
    holding_wallet: CpiAccount<'info, TokenAccount>,
    #[account(
        seeds = [program_id.as_ref(), staking_data.to_account_info().key.as_ref()],
        bump = staking_data.holding_bump,
    )]
    holding_wallet_owner: AccountInfo<'info>,
    staking_token_metadata: AccountInfo<'info>,
    #[account(mut,
        constraint = mint.mint_authority == COption::Some(*mint_authority.key)
    )]
    mint: CpiAccount<'info, Mint>,
    #[account(
        seeds = [
            program_id.as_ref(),
            staking_data.to_account_info().key.as_ref(),
            staking_token_metadata.key.as_ref()
        ],
        bump = staking_data.mint_auth_bump,
    )]
    mint_authority: AccountInfo<'info>,
    #[account(constraint = token_program.key == &anchor_spl::token::ID)]
    token_program: AccountInfo<'info>,
    clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct AccrueInterest<'info> {
    #[account(mut)]
    staking_data: ProgramAccount<'info, StakingData>,
    #[account(mut,
        constraint = holding_wallet.mint == mint.key(),
    )]
    holding_wallet: CpiAccount<'info, TokenAccount>,
    staking_token_metadata: AccountInfo<'info>,
    #[account(mut,
        constraint = mint.mint_authority == COption::Some(*mint_authority.key)
    )]
    mint: CpiAccount<'info, Mint>,
    #[account(
        seeds = [
            program_id.as_ref(),
            staking_data.to_account_info().key.as_ref(),
            staking_token_metadata.key.as_ref()
        ],
        bump = staking_data.mint_auth_bump,
    )]
    mint_authority: AccountInfo<'info>,
    #[account(constraint = token_program.key == &anchor_spl::token::ID)]
    token_program: AccountInfo<'info>,
    clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct LockAmount<'info> {
    pub staking_data: CpiAccount<'info, StakingData>,
    #[account(mut,
        constraint = staking_user_data.user_token_wallet == user_token_wallet.key(),
        constraint = staking_user_data.staking_data == staking_data.key()
    )]
    pub staking_user_data: ProgramAccount<'info, StakingUserData>,
    #[account(
        constraint = user_token_wallet.owner == *user_token_wallet_owner.key,
    )]
    pub user_token_wallet: CpiAccount<'info, TokenAccount>,
    #[account(signer)]
    pub user_token_wallet_owner: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
}

// Program accounts
pub const DISCRIMINATOR_LEN: usize = 8;

/// Account for storing common information about staking pool.
#[account]
pub struct StakingData {
    /// Staking pool owner
    pub owner: Pubkey,
    /// Staking token
    pub stake_token_metadata: Pubkey,
    /// Wallet for storing staking token
    pub holding_wallet: Pubkey,
    /// PDA bump for holding wallet (needs for signatures)
    pub holding_bump: u8,
    /// PDA bump for staking token mint authority (needs for signatures)
    pub mint_auth_bump: u8,
    pub total_staked: u64,
    pub total_shares: u64,
    /// Daily interest rate in 1e-6 (1/100 of a basis point)
    pub interest_rate_daily: u64,
    pub max_interest_rate_daily: u64,
    pub last_interest_accrued_timestamp: i64,
    /// Hard cap for staking token supply
    pub cap: u64,
}

impl StakingData {
    pub const LEN: usize = DISCRIMINATOR_LEN + 32 + 32 + 32 + 1 + 1 + 8 + 8 + 8 + 8 + 8 + 8;
}

/// Account for storing common information about staking pool user.
#[account]
pub struct StakingUserData {
    /// User wallet for holding staking token
    pub user_token_wallet: Pubkey,
    /// Link to staking pool
    pub staking_data: Pubkey,
    pub ownership_share: u64,
    /// Amount of shares locked for the governance proposal vote
    pub locked_amount: u64,
    pub locked_until: i64,
}

impl StakingUserData {
    pub const LEN: usize = DISCRIMINATOR_LEN + 32 + 32 + 8 + 8 + 8;
}

#[error]
pub enum StakingError {
    #[msg("Invalid starting timestamp")]
    InvalidStartingTimestamp,
    #[msg("Invalid interest rate")]
    InvalidInterestRate,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Unstake funds error")]
    UnstakeFundsError,
    #[msg("Trying to unlock amount")]
    InvalidLockParams,
    #[msg("Invalid token supply cap")]
    InvalidCap,
}
