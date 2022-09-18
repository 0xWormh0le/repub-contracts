//! Governance program for making and voting for proposals

use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey::MAX_SEED_LEN;
use anchor_spl::token::{self, Mint, TokenAccount, Transfer};
use staking::{LockAmount, StakingData, StakingUserData};

#[program]
pub mod governance {
    use super::*;

    /// Initialize and configure new Governance with provided common parameters.
    ///
    /// Accounts expected by this instruction:
    /// 0. `[writable, signer]` Governance account key to initialize
    /// 1. `[writable, signer]` Account creation fee payer
    /// 2. `[]` Treasury owner (pda of ['treasury', governance program id, governance])
    /// 3. `[]` System program
    /// 4. `[]` Rent sysvar
    /// 5. `[]` Clock sysvar
    ///
    /// \param staking_data_key: staking pool address
    /// \param approval_fixed_period_in_seconds: approval fixed period in seconds
    /// \param min_approval_percent: minimum percent of pros vote to approve proposal
    /// \param min_stake_to_propose: minimum amount of staked tokens to proposal creating
    /// \param min_vote_participation_percent: minimum percent of participation to approve proposal
    /// \param payment_period_sec: fixed payment period
    /// \param treasury_owner_bump: PDA bump for treasury owner (needs for signatures)
    /// \param sponsors: initial list of sponsors (system accounts addresses)
    pub fn initialize_governance(
        ctx: Context<InitializeGovernance>,
        staking_data_key: Pubkey,
        approval_fixed_period_in_seconds: i64,
        min_approval_percent: u8,
        min_stake_to_propose: u64,
        min_vote_participation_percent: u8,
        payment_period_sec: i64,
        treasury_owner_bump: u8,
        sponsors: Vec<Pubkey>,
    ) -> ProgramResult {
        msg!("Instruction: initialize governance");

        if sponsors.len() < MIN_SPONSORS {
            msg!("Not enough sponsors");
            return Err(GovernanceError::NotEnoughSponsors.into());
        }
        if sponsors.len() > MAX_SPONSORS {
            msg!("Sponsors limit exceeded");
            return Err(GovernanceError::SponsorsLimitExceeded.into());
        }

        if min_vote_participation_percent > 100 {
            msg!("Invalid minimum vote participation percent");
            return Err(GovernanceError::InvalidMinVoteParticipationPercent.into());
        }

        let governance_data = &mut ctx.accounts.governance;
        governance_data.staking_data = staking_data_key;
        governance_data.approval_fixed_period_in_seconds = approval_fixed_period_in_seconds;
        governance_data.min_approval_percent = min_approval_percent;
        governance_data.treasury_owner_bump = treasury_owner_bump;
        governance_data.min_stake_to_propose = min_stake_to_propose;
        governance_data.min_vote_participation_percent = min_vote_participation_percent;
        governance_data.sponsors = sponsors;
        governance_data.payment_period_start = ctx.accounts.clock.unix_timestamp;
        governance_data.payment_period_sec = payment_period_sec;

        Ok(())
    }

    /// Initialize and configure new Governance with provided common parameters.
    ///
    /// Accounts expected by this instruction:
    /// 0. `[]` Governance account
    /// 1. `[writable, signer]` Treasury Stats Account to initialize (pda of ['treasury_stats', governance program id, governance, treasury])
    /// 2. `[]` Treasury account
    /// 3. `[]` Treasury owner account
    /// 4. `[writable, signer]` Account creation fee payer
    /// 5. `[]` System program
    /// 6. `[]` Rent sysvar
    ///
    /// \param max_proposal_payment_percent: hard cap for proposal payment amount (percent of highest balance)
    /// \param payment_amount_in_period_limit_percent: hard cap for proposal payment amount in period (percent of highest balance)
    /// \param _treasury_stats_bump: bump for account creation, not saved
    pub fn initialize_treasury_stats(
        ctx: Context<InitializeTreasuryStats>,
        max_proposal_payment_percent: u8,
        payment_amount_in_period_limit_percent: u8,
        _treasury_stats_bump: u8,
    ) -> ProgramResult {
        msg!("Instruction: initialize treasury stats");

        if max_proposal_payment_percent > 100 {
            msg!("Invalid max proposal payment percent");
            return Err(GovernanceError::InvalidMaxProposalPaymentPercent.into());
        }
        if payment_amount_in_period_limit_percent > 100 {
            msg!("Invalid payment amount in period percent");
            return Err(GovernanceError::InvalidPaymentAmountInPeriodPercent.into());
        }

        let treasury_stats_data = &mut ctx.accounts.treasury_stats;
        treasury_stats_data.treasury = ctx.accounts.treasury.key();
        treasury_stats_data.max_proposal_payment_percent = max_proposal_payment_percent;
        treasury_stats_data.payment_amount_in_period_limit_percent =
            payment_amount_in_period_limit_percent;
        treasury_stats_data.payment_amount_in_period = 0;
        treasury_stats_data.highest_balance = 0;

        Ok(())
    }

    /// Push new sponsor address into sponsors list.
    ///
    /// Accounts expected by this instruction:
    /// 0. `[writable]` Governance data key
    /// 1+N. `[singer]` The N signer accounts of current sponsors. Needs the 60% of sponsors to approve this instruction.
    pub fn add_sponsor(ctx: Context<AddSponsor>, sponsor: Pubkey) -> ProgramResult {
        if ctx.accounts.governance.sponsors.contains(&sponsor) {
            msg!("Sponsor is already in list");
            return Err(GovernanceError::SponsorAlreadyInList.into());
        }
        if ctx.accounts.governance.sponsors.len() == MAX_SPONSORS {
            msg!("Sponsors limit exceeded");
            return Err(GovernanceError::SponsorsLimitExceeded.into());
        }

        if ctx.remaining_accounts.len() == 0 {
            msg!("Not enough signers to change sponsors list");
            return Err(GovernanceError::MissingSponsorsSignatures.into());
        }

        // There is no access to HashSet
        let mut sponsors_keys_set = vec![];
        let mut signature_count = 0;
        for account in ctx.remaining_accounts {
            if sponsors_keys_set.contains(account.key) {
                msg!("Skip sponsor key duplicate");
                continue;
            }
            sponsors_keys_set.push(account.key());

            if ctx.accounts.governance.sponsors.contains(account.key) && account.is_signer {
                signature_count += 1;
            }
        }

        let signature_count = signature_count as f64;
        let sponsors_len = ctx.accounts.governance.sponsors.len() as f64;
        let signers_percent = ((signature_count / sponsors_len) * 100.0) as u8;
        msg!("Signers percent: {}", signers_percent);
        if signers_percent < SPONSORS_LIST_APPROVAL_PERCENT {
            msg!("Not enough signers to change sponsors list");
            return Err(GovernanceError::MissingSponsorsSignatures.into());
        }

        msg!("Sponsors list changing approved");
        let governance_data = &mut ctx.accounts.governance;
        governance_data.sponsors.push(sponsor);

        Ok(())
    }

    /// Remove sponsor address from sponsors list.
    ///
    /// Accounts expected by this instruction:
    /// 0. `[writable]` Governance data key
    /// 1+N. `[singer]` The N signer accounts of current sponsors. Needs the 60% of sponsors to approve this instruction.
    pub fn remove_sponsor(ctx: Context<RemoveSponsor>, sponsor: Pubkey) -> ProgramResult {
        if !ctx.accounts.governance.sponsors.contains(&sponsor) {
            msg!("Sponsor is already not in list");
            return Err(GovernanceError::SponsorAlreadyNotInList.into());
        }
        if ctx.accounts.governance.sponsors.len() == MIN_SPONSORS {
            msg!("Sponsors minimum limit exceeded");
            return Err(GovernanceError::SponsorsLimitExceeded.into());
        }

        if ctx.remaining_accounts.len() == 0 {
            msg!("Not enough signers to change sponsors list");
            return Err(GovernanceError::MissingSponsorsSignatures.into());
        }

        // There is no access to HashSet
        let mut sponsors_keys_set = vec![];
        let mut signature_count = 0;
        for account in ctx.remaining_accounts {
            if sponsors_keys_set.contains(account.key) {
                msg!("Skip sponsor key duplicate");
                continue;
            }
            sponsors_keys_set.push(account.key());

            if ctx.accounts.governance.sponsors.contains(account.key) && account.is_signer {
                signature_count += 1;
            }
        }

        let signature_count = signature_count as f64;
        let sponsors_len = ctx.accounts.governance.sponsors.len() as f64;
        let signers_percent = ((signature_count / sponsors_len) * 100.0) as u8;
        msg!("Signers percent: {}", signers_percent);
        if signers_percent < SPONSORS_LIST_APPROVAL_PERCENT {
            msg!("Not enough signers to change sponsors list");
            return Err(GovernanceError::MissingSponsorsSignatures.into());
        }

        // Change sponsors list
        msg!("Sponsors list changing approved");
        let governance_data = &mut ctx.accounts.governance;
        let mut sponsors_updated = vec![];
        for sponsor_pk in &governance_data.sponsors {
            if *sponsor_pk != sponsor {
                sponsors_updated.push(*sponsor_pk);
            }
        }
        governance_data.sponsors = sponsors_updated;

        Ok(())
    }

    /// Funding the governance treasury.
    ///
    /// Accounts expected by this instruction:
    /// 0. `[]` Governance account
    /// 1. `[writable]` User SPL Token wallet to funding
    /// 2. `[signer]` User SPL Token wallet owner
    /// 3. `[writable]` Treasury to fund
    /// 4. `[]` Treasury mint
    /// 5. `[writable]` Treasury stats account
    /// 6. `[]` SPL Token program
    ///
    /// \param amount: amount of tokens to funding
    pub fn fund_treasury(ctx: Context<FundTreasury>, amount: u64) -> ProgramResult {
        msg!("Instruction: Fund treasury");

        // Update highest balance
        if ctx.accounts.treasury.amount + amount > ctx.accounts.treasury_stats.highest_balance {
            let treasury_stats_data = &mut ctx.accounts.treasury_stats;
            treasury_stats_data.highest_balance = ctx.accounts.treasury.amount + amount;
        }

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.clone(),
                Transfer {
                    from: ctx.accounts.user_token_wallet.to_account_info().clone(),
                    to: ctx.accounts.treasury.to_account_info().clone(),
                    authority: ctx.accounts.user_token_wallet_owner.clone(),
                },
            ),
            amount,
        )?;

        Ok(())
    }

    /// Create new proposal with provided parameters. Every proposal is describing by Proposal account.
    ///
    /// Accounts expected by this instruction:
    /// 0. `[writable]` Governance account
    /// 1. `[]` Governance treasury account
    /// 2. `[writable]` Governance treasury stats account
    /// 3. `[]` Staking user data account of proposal author
    /// 4. `[]` Proposal author token wallet
    /// 5. `[]` Proposal author token wallet owner (authority to making proposal)
    /// 6. `[writable, singer]` The proposal data account (pda of ['proposal', governance_program_id, governance, ipfs_hash[0..32]])
    /// 7. `[]` SPL Token wallet of payment amount recipient
    /// 8. `[]` Fee payer
    /// 9. `[]` System program
    /// 10. `[]` Rent sysvar
    /// 11. `[]` Clock sysvar
    ///
    /// \param payment_amount: the proposal payment amount
    /// \param _proposal_bump: PDA bump for proposal account (needs for creating account, never saved)
    /// \param ipfs_hash: ipfs hash for proposal details
    pub fn make_proposal(
        ctx: Context<MakeProposal>,
        payment_amount: u64,
        _proposal_bump: u8,
        ipfs_hash: String,
    ) -> ProgramResult {
        msg!("Instruction: make proposal");

        if ipfs_hash.len() > MAX_IPFS_HASH_LEN {
            return Err(GovernanceError::InvalidIPFSHashSize.into());
        }

        // Check sender has staked tokens
        if ctx.accounts.staking_user_data.ownership_share == 0 {
            msg!("Only Staking token holders can make proposals");
            return Err(GovernanceError::InvalidStakingHolder.into());
        }

        // Check min_stake_to_propose
        if ctx.accounts.staking_user_data.ownership_share
            < ctx.accounts.governance.min_stake_to_propose
        {
            msg!("There is not enough staked tokens to make proposal");
            return Err(GovernanceError::InsufficientStakedTokens.into());
        }

        // Check payment amount
        if payment_amount > ctx.accounts.treasury.amount {
            msg!("There is not enough tokens in governance to make proposal");
            return Err(GovernanceError::InsufficientFunds.into());
        }

        // Check max proposal amount limit (percent)
        let highest_balance = ctx.accounts.treasury_stats.highest_balance as f64;
        let max_proposal_payment_percent =
            ctx.accounts.treasury_stats.max_proposal_payment_percent as f64 / 100.0;
        let max_proposal_payment_amount = (highest_balance * max_proposal_payment_percent) as u64;
        if payment_amount > max_proposal_payment_amount {
            msg!("Max proposal payment amount limit exceeded");
            return Err(GovernanceError::MaxProposalAmountLimit.into());
        }

        // Check ending of the period
        let period_ending_time = ctx.accounts.governance.payment_period_start
            + ctx.accounts.governance.payment_period_sec;
        if ctx.accounts.clock.unix_timestamp >= period_ending_time {
            // Reset payment counter if period ends
            let governance_data = &mut ctx.accounts.governance;
            governance_data.payment_period_start = ctx.accounts.clock.unix_timestamp;
            let treasury_stats_data = &mut ctx.accounts.treasury_stats;
            treasury_stats_data.payment_amount_in_period = 0;
        }

        // Check payment amount in period limit (percent)
        let payment_amount_in_period_limit_percent =
            ctx.accounts
                .treasury_stats
                .payment_amount_in_period_limit_percent as f64
                / 100.0;
        let payment_amount_in_period_limit =
            (highest_balance * payment_amount_in_period_limit_percent) as u64;
        if (payment_amount + ctx.accounts.treasury_stats.payment_amount_in_period)
            > payment_amount_in_period_limit
        {
            msg!("This proposal exceeds the maximum amount that can be paid for current period");
            return Err(GovernanceError::PaymentAmountLimitExceeded.into());
        }

        // update treasury stats
        let treasury_stats_data = &mut ctx.accounts.treasury_stats;
        treasury_stats_data.payment_amount_in_period += payment_amount;

        // Initialize new proposal
        let proposal_data = &mut ctx.accounts.proposal;
        proposal_data.governance = ctx.accounts.governance.key();
        proposal_data.is_closed = false;
        proposal_data.starting_timestamp = ctx.accounts.clock.unix_timestamp;
        proposal_data.recipient = ctx.accounts.recipient.key();
        proposal_data.payment_amount = payment_amount;
        proposal_data.ipfs_hash = ipfs_hash;
        proposal_data.pros_weight = 0;
        proposal_data.cons_weight = 0;
        proposal_data.is_sponsored = false;

        Ok(())
    }

    /// Vote for/against the proposal. Vote weight equals the staking shares.
    /// User shares locked after voting for all period of proposal voting.
    ///
    /// Accounts expected by this instruction:
    /// 0. `[]` Governance account
    /// 1. `[writable]` User staking data account
    /// 2. `[]` User token wallet
    /// 3. `[signer]` User token wallet owner (authority to approve)
    /// 4. `[]` Staking data account
    /// 5. `[writable]` Proposal account
    /// 6. `[]` Vote marker account (needs to avoid duplicate votes)
    /// 7. `[]` Fee payer
    /// 8. `[]` Staking program
    /// 9. `[]` System program
    /// 10. `[]` Clock sysvar
    ///
    /// \param vote: bool true for pros/false for cons
    /// \param marker_bump: PDA bump for vote marker account
    pub fn approve_proposal(
        ctx: Context<ApproveProposal>,
        vote: bool,
        marker_bump: u8,
    ) -> ProgramResult {
        msg!("Instruction: approve proposal");

        // Check proposal is still open
        let approval_period_ending = ctx.accounts.proposal.starting_timestamp
            + ctx.accounts.governance.approval_fixed_period_in_seconds;
        if ctx.accounts.clock.unix_timestamp >= approval_period_ending {
            msg!("Propose is already closed");
            return Err(GovernanceError::ClosedProposal.into());
        }

        // Check user has staked tokens
        if ctx.accounts.staking_user_data.ownership_share == 0 {
            msg!("Only Staking token holders can approve proposals");
            return Err(GovernanceError::InvalidStakingHolder.into());
        }

        // Lock the tokens on StakingUserData
        let remaining_approval_period = approval_period_ending - ctx.accounts.clock.unix_timestamp;
        let mut locked_until = ctx.accounts.clock.unix_timestamp + remaining_approval_period;
        // Amount always locked into recent proposal
        if locked_until < ctx.accounts.staking_user_data.locked_until {
            locked_until = ctx.accounts.staking_user_data.locked_until;
        }

        // Calculate and lock vote weight
        let (possible_interest, _) = staking::utils::calculate_accrued_interest(
            ctx.accounts.staking_data.last_interest_accrued_timestamp,
            approval_period_ending,
            ctx.accounts.staking_data.total_staked,
            ctx.accounts.staking_data.interest_rate_daily,
        );
        msg!("Possible interest: {}", possible_interest);
        let vote_weight = ctx.accounts.staking_user_data.ownership_share + possible_interest;

        staking::cpi::lock_amount(
            CpiContext::new(
                ctx.accounts.staking_program.clone(),
                LockAmount {
                    staking_data: ctx.accounts.staking_data.clone(),
                    staking_user_data: ctx.accounts.staking_user_data.clone().into(),
                    user_token_wallet: ctx.accounts.user_token_wallet.clone(),
                    user_token_wallet_owner: ctx.accounts.user_token_wallet_owner.clone(),
                    clock: ctx.accounts.clock.clone(),
                },
            ),
            locked_until,
            vote_weight,
        )?;

        // Update proposal weight
        let proposal_data = &mut ctx.accounts.proposal;
        if vote {
            proposal_data.pros_weight += vote_weight;
        } else {
            proposal_data.cons_weight += vote_weight;
        }

        // Check sponsored
        let sponsors = &ctx.accounts.governance.sponsors;
        if sponsors.contains(&ctx.accounts.user_token_wallet_owner.key()) {
            msg!("Proposal was sponsored");
            proposal_data.is_sponsored = true;
        }

        let marker = &mut ctx.accounts.vote_marker;
        marker.bump = marker_bump;

        Ok(())
    }

    /// Trying finalize the proposal. Check all conditions and make decision: do nothing or
    /// approve proposal and transfer amount or close proposal and don't transfer amount.
    ///
    /// Accounts expected by this instruction:
    /// 0. `[]` Governance account
    /// 1. `[]` Staking data account
    /// 2. `[writable]` Proposal account
    /// 3. `[writable]` Governance treasury account
    /// 4. `[signer]` Governance treasury owner
    /// 5. `[]` Governance treasury mint
    /// 6. `[writable]` Recipient SPL Token account
    /// 7. `[]` SPL Token program
    /// 8. `[]` Clock sysvar
    pub fn finalize_proposal(ctx: Context<FinalizeProposal>) -> ProgramResult {
        msg!("Instruction: finalize proposal");

        // Check proposal is still open
        if ctx.accounts.proposal.is_closed {
            msg!("Proposal is already closed");
            return Err(GovernanceError::ClosedProposal.into());
        }

        // Check the vote is still in progress
        let approval_period_ending = ctx.accounts.proposal.starting_timestamp
            + ctx.accounts.governance.approval_fixed_period_in_seconds;
        if ctx.accounts.clock.unix_timestamp < approval_period_ending {
            msg!("The vote in progress");
            return Err(GovernanceError::VoteInProgress.into());
        }

        ctx.accounts.proposal.is_closed = true;

        // Count the votes
        let pros_weight = ctx.accounts.proposal.pros_weight as f64;
        let cons_weight = ctx.accounts.proposal.cons_weight as f64;
        msg!("pros_weight: {}", pros_weight);
        msg!("cons_weight: {}", cons_weight);

        let full_weight = pros_weight + cons_weight;
        // Check min vote participation percent
        let total_staked = ctx.accounts.staking_data.total_staked as f64;
        let participation_percent = ((full_weight / total_staked) * 100.0) as u8;
        msg!("participation_percent: {}", participation_percent);
        if participation_percent < ctx.accounts.governance.min_vote_participation_percent {
            msg!("The minimum participation percent not reached");
            msg!("Amount will not be sent");
            return Ok(());
        }

        // Check minimum approval percent
        let approval_percent = ((pros_weight / full_weight) * 100.0) as u8;
        msg!("approval_percent: {}", approval_percent);
        if approval_percent < ctx.accounts.governance.min_approval_percent {
            msg!("The minimum approval percent not reached");
            msg!("Amount will not be sent");
            return Ok(());
        }

        // Check sponsored
        if !ctx.accounts.proposal.is_sponsored {
            msg!("The proposal is not sponsored");
            msg!("Amount will not be sent");
            return Ok(());
        }

        msg!("Sending amount to recipient");
        let seeds = &[
            TREASURY_PREFIX.as_bytes(),
            ctx.program_id.as_ref(),
            ctx.accounts.governance.to_account_info().key.as_ref(),
            &[ctx.accounts.governance.treasury_owner_bump],
        ];
        let signer = &[&seeds[..]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.clone(),
                Transfer {
                    from: ctx.accounts.treasury.to_account_info().clone(),
                    to: ctx.accounts.recipient.to_account_info().clone(),
                    authority: ctx.accounts.treasury_owner.clone(),
                },
                signer,
            ),
            ctx.accounts.proposal.payment_amount,
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(
    staking_data_key: Pubkey,
    approval_fixed_period_in_seconds: i64,
    min_approval_percent: u8,
    min_stake_to_propose: u64,
    min_vote_participation_percent: u8,
    payment_period_sec: i64,
    treasury_owner_bump: u8,
    sponsors: Vec<Pubkey>
)]
pub struct InitializeGovernance<'info> {
    #[account(init, payer = payer, space = Governance::LEN)]
    governance: ProgramAccount<'info, Governance>,
    payer: AccountInfo<'info>,
    // pda of ["treasury", governance_program_id, governance_data, treasury_mint]
    #[account(seeds = [
            TREASURY_PREFIX.as_bytes(),
            program_id.as_ref(),
            governance.key().as_ref()
        ],
        bump = treasury_owner_bump
    )]
    treasury_owner: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    rent: Sysvar<'info, Rent>,
    clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
#[instruction(
    max_proposal_payment_percent: u8,
    payment_amount_in_period_limit_percent: u8,
    _treasury_stats_bump: u8
)]
pub struct InitializeTreasuryStats<'info> {
    governance: ProgramAccount<'info, Governance>,
    // pda of ['treasury_stats', governance program id, governance, treasury]
    #[account(init, payer = payer, space = TreasuryStats::LEN,
        seeds = [
            TREASURY_STATS_PREFIX.as_bytes(),
            program_id.as_ref(),
            governance.key().as_ref(),
            treasury.key().as_ref()
        ],
        bump = _treasury_stats_bump,
    )]
    treasury_stats: ProgramAccount<'info, TreasuryStats>,
    #[account(constraint = treasury.owner == treasury_owner.key())]
    treasury: CpiAccount<'info, TokenAccount>,
    #[account(seeds = [
            TREASURY_PREFIX.as_bytes(),
            program_id.as_ref(),
            governance.key().as_ref()
        ],
        bump = governance.treasury_owner_bump
    )]
    treasury_owner: AccountInfo<'info>,
    payer: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AddSponsor<'info> {
    #[account(mut)]
    governance: ProgramAccount<'info, Governance>,
    // Other accounts is signers, described in ctx.remaining_accounts
}

#[derive(Accounts)]
pub struct RemoveSponsor<'info> {
    #[account(mut)]
    governance: ProgramAccount<'info, Governance>,
    // Other accounts is signers, described in ctx.remaining_accounts
}

#[derive(Accounts)]
pub struct FundTreasury<'info> {
    governance: ProgramAccount<'info, Governance>,
    #[account(mut,
        constraint = user_token_wallet.mint == treasury_mint.key(),
        constraint = user_token_wallet.owner == user_token_wallet_owner.key(),
    )]
    user_token_wallet: CpiAccount<'info, TokenAccount>,
    #[account(signer)]
    user_token_wallet_owner: AccountInfo<'info>,
    #[account(mut,
        constraint = treasury.owner == treasury_owner.key(),
        constraint = treasury.mint == treasury_mint.key(),
    )]
    treasury: CpiAccount<'info, TokenAccount>,
    treasury_mint: CpiAccount<'info, Mint>,
    #[account(mut,
        constraint = treasury_stats.treasury == treasury.key()
    )]
    treasury_stats: ProgramAccount<'info, TreasuryStats>,
    #[account(seeds = [
            TREASURY_PREFIX.as_bytes(),
            program_id.as_ref(),
            governance.key().as_ref()
        ],
        bump = governance.treasury_owner_bump
    )]
    treasury_owner: AccountInfo<'info>,
    #[account(constraint = token_program.key == &anchor_spl::token::ID)]
    token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(payment_amount: u64, _proposal_bump: u8, ipfs_hash: String)]
pub struct MakeProposal<'info> {
    #[account(mut)]
    governance: ProgramAccount<'info, Governance>,
    treasury: CpiAccount<'info, TokenAccount>,
    #[account(mut,
        constraint = treasury_stats.treasury == treasury.key()
    )]
    treasury_stats: ProgramAccount<'info, TreasuryStats>,
    #[account(
        constraint = staking_user_data.staking_data == governance.staking_data,
        constraint = staking_user_data.user_token_wallet == user_token_wallet.key()
    )]
    staking_user_data: CpiAccount<'info, StakingUserData>,
    #[account(
        constraint = user_token_wallet.owner == *user_token_wallet_owner.key,
    )]
    user_token_wallet: CpiAccount<'info, TokenAccount>,
    #[account(signer)]
    user_token_wallet_owner: AccountInfo<'info>,
    // pda of ['proposal', governance_program_id, governance, ipfs_hash[0..32]]
    // where ipfs hash is limited by MAX_SEED_LEN (first 32 bytes)
    #[account(init, payer = payer, space = Proposal::LEN,
        seeds = [
            PROPOSAL_PREFIX.as_bytes(),
            program_id.as_ref(),
            governance.key().as_ref(),
            ipfs_hash[..MAX_SEED_LEN].as_bytes()
        ],
        bump = _proposal_bump,
    )]
    proposal: ProgramAccount<'info, Proposal>,
    #[account(constraint = recipient.mint == treasury.mint)]
    recipient: CpiAccount<'info, TokenAccount>,
    payer: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    rent: Sysvar<'info, Rent>,
    clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
#[instruction(vote: bool, marker_bump: u8)]
pub struct ApproveProposal<'info> {
    governance: ProgramAccount<'info, Governance>,
    #[account(mut,
        constraint = staking_user_data.staking_data == governance.staking_data,
        constraint = staking_user_data.user_token_wallet == user_token_wallet.key()
    )]
    staking_user_data: CpiAccount<'info, StakingUserData>,
    #[account(
        constraint = user_token_wallet.owner == *user_token_wallet_owner.key,
    )]
    user_token_wallet: CpiAccount<'info, TokenAccount>,
    #[account(signer)]
    user_token_wallet_owner: AccountInfo<'info>,
    #[account(
        constraint = staking_data.key() == governance.staking_data
    )]
    staking_data: CpiAccount<'info, StakingData>,
    #[account(mut)]
    proposal: ProgramAccount<'info, Proposal>,
    // Vote marker: account existed and initialized if user already vote for exact proposal
    // pda of ['vote', governance, proposal, staking_user_data]
    #[account(init, payer = payer, space = VoteMarker::LEN,
        seeds = [
            VOTE_MARKER_PREFIX.as_bytes(),
            governance.key().as_ref(),
            proposal.key().as_ref(),
            staking_user_data.key().as_ref()
        ],
        bump = marker_bump,
    )]
    vote_marker: ProgramAccount<'info, VoteMarker>,
    payer: AccountInfo<'info>,
    staking_program: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct FinalizeProposal<'info> {
    governance: ProgramAccount<'info, Governance>,
    #[account(
        constraint = governance.staking_data == staking_data.key()
    )]
    staking_data: CpiAccount<'info, StakingData>,
    #[account(mut)]
    proposal: ProgramAccount<'info, Proposal>,
    #[account(mut,
        constraint = treasury.owner == treasury_owner.key(),
        constraint = treasury.mint == treasury_mint.key(),
    )]
    treasury: CpiAccount<'info, TokenAccount>,
    // pda of ["treasury", governance_program_id, governance_data]
    #[account(seeds = [
            TREASURY_PREFIX.as_bytes(),
            program_id.as_ref(),
            governance.key().as_ref()
        ],
        bump = governance.treasury_owner_bump
    )]
    treasury_owner: AccountInfo<'info>,
    treasury_mint: CpiAccount<'info, Mint>,
    #[account(mut,
        constraint = recipient.mint == treasury_mint.key(),
        constraint = recipient.key() == proposal.recipient
    )]
    recipient: CpiAccount<'info, TokenAccount>,
    #[account(constraint = token_program.key == &anchor_spl::token::ID)]
    token_program: AccountInfo<'info>,
    clock: Sysvar<'info, Clock>,
}

// Program accounts

pub const DISCRIMINATOR_LEN: usize = 8;
pub const TREASURY_PREFIX: &str = "treasury";
pub const TREASURY_STATS_PREFIX: &str = "treasury_stats";
pub const PROPOSAL_PREFIX: &str = "proposal";
pub const VOTE_MARKER_PREFIX: &str = "vote";
pub const MAX_IPFS_HASH_LEN: usize = 64;
pub const MIN_SPONSORS: usize = 3;
pub const MAX_SPONSORS: usize = 16;
pub const MAX_SPONSORS_VEC_SIZE: usize = 4 + 32 * MAX_SPONSORS;
pub const SPONSORS_LIST_APPROVAL_PERCENT: u8 = 60;

/// Account for storing common information about Governance.
#[account]
pub struct Governance {
    pub staking_data: Pubkey,
    pub approval_fixed_period_in_seconds: i64,
    pub min_stake_to_propose: u64,
    pub min_vote_participation_percent: u8,
    pub payment_period_start: i64,
    pub payment_period_sec: i64,
    pub min_approval_percent: u8,
    pub treasury_owner_bump: u8,
    /// Pubkeys list of staking user data accounts owners
    pub sponsors: Vec<Pubkey>,
}

impl Governance {
    pub const LEN: usize =
        DISCRIMINATOR_LEN + 32 + 8 + 8 + 1 + 8 + 8 + 1 + 1 + MAX_SPONSORS_VEC_SIZE;
}

/// Account for storing information about treasury for current SPL Token
#[account]
pub struct TreasuryStats {
    pub treasury: Pubkey,
    pub max_proposal_payment_percent: u8,
    pub payment_amount_in_period_limit_percent: u8,
    pub payment_amount_in_period: u64,
    pub highest_balance: u64,
}

impl TreasuryStats {
    pub const LEN: usize = DISCRIMINATOR_LEN + 32 + 1 + 1 + 8 + 8;
}

/// Account for storing common information about Proposal.
#[account]
pub struct Proposal {
    pub governance: Pubkey,
    pub starting_timestamp: i64,
    pub is_closed: bool,
    pub recipient: Pubkey,
    pub payment_amount: u64,
    pub ipfs_hash: String,
    pub pros_weight: u64,
    pub cons_weight: u64,
    pub is_sponsored: bool,
}

impl Proposal {
    pub const LEN: usize = DISCRIMINATOR_LEN + 32 + 8 + 1 + 32 + 8 + MAX_IPFS_HASH_LEN + 4 + 4 + 1;
}

#[account]
pub struct VoteMarker {
    pub bump: u8,
}

impl VoteMarker {
    pub const LEN: usize = DISCRIMINATOR_LEN + 1;
}

#[error]
pub enum GovernanceError {
    #[msg("IPFS Hash string is too long")]
    InvalidIPFSHashSize,
    #[msg("User have not staked tokens")]
    InvalidStakingHolder,
    #[msg("Governance treasury insufficient funds")]
    InsufficientFunds,
    #[msg("Proposal is already closed")]
    ClosedProposal,
    #[msg("The vote is in progress")]
    VoteInProgress,
    #[msg("There is not enough staked tokens to make proposal")]
    InsufficientStakedTokens,
    #[msg("Max proposal payment amount limit exceeded")]
    MaxProposalAmountLimit,
    #[msg("Invalid minimum vote participation percent")]
    InvalidMinVoteParticipationPercent,
    #[msg("Not enough sponsors")]
    NotEnoughSponsors,
    #[msg("Sponsors limit exceeded")]
    SponsorsLimitExceeded,
    #[msg("This proposal exceeds the maximum amount that can be paid this period")]
    PaymentAmountLimitExceeded,
    #[msg("Not enough signers to change sponsors list")]
    MissingSponsorsSignatures,
    #[msg("Sponsor is already in list")]
    SponsorAlreadyInList,
    #[msg("Sponsor is already not in list")]
    SponsorAlreadyNotInList,
    #[msg("Invalid max proposal payment percent")]
    InvalidMaxProposalPaymentPercent,
    #[msg("Invalid payment amount in period percent")]
    InvalidPaymentAmountInPeriodPercent,
}
