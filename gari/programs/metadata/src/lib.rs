//! Program for creating Metaplex Token Metadata account with additional information about SPL Tokens

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::token::Mint;
use spl_token_metadata::{
    instruction::create_metadata_accounts,
    state::{MAX_NAME_LENGTH, MAX_SYMBOL_LENGTH},
};

#[program]
pub mod metadata {
    use super::*;

    /// Creates new Metaplex Token Metadata account with provided SPL Token Mint
    /// and additional data (name, symbol)
    ///
    /// Accounts expected by this instruction:
    /// 0. `[writable]` Metaplex Token Metadata account key (pda of ['metadata', metadata_program_id, mint_id])
    /// 1. `[writable, signer]` Payer system account
    /// 2. `[]` SPL Token Mint
    /// 3. `[signer]` Mint Authority
    /// 4. `[]` Metaplex Token Metadata program
    /// 5. `[]` SPL Token program
    /// 6. `[]` System program
    /// 7. `[]` Rent sysvar
    pub fn create_metadata(
        ctx: Context<CreateMetadata>,
        name: String,
        symbol: String,
    ) -> ProgramResult {
        msg!("Instruction: Create metadata");
        if name.len() > MAX_NAME_LENGTH {
            msg!("Name is too long");
            return Err(MetadataError::NameTooLong.into());
        }
        if symbol.len() > MAX_SYMBOL_LENGTH {
            msg!("Symbol is too long");
            return Err(MetadataError::SymbolTooLong.into());
        }

        let metadata_infos = vec![
            ctx.accounts.metadata.clone(),
            ctx.accounts.mint.to_account_info().clone(),
            ctx.accounts.mint_authority.clone(),
            ctx.accounts.payer.clone(),
            ctx.accounts.mint_authority.clone(),
            ctx.accounts.token_metadata_program.clone(),
            ctx.accounts.token_program.clone(),
            ctx.accounts.system_program.clone(),
            ctx.accounts.rent.to_account_info().clone(),
        ];

        invoke(
            &create_metadata_accounts(
                *ctx.accounts.token_metadata_program.key,
                *ctx.accounts.metadata.key,
                ctx.accounts.mint.key(),
                *ctx.accounts.mint_authority.key,
                *ctx.accounts.payer.key,
                *ctx.accounts.mint_authority.key,
                name,
                symbol,
                "".to_string(),
                None,
                0,
                false,
                true,
            ),
            metadata_infos.as_slice(),
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateMetadata<'info> {
    /// pda of ['metadata', metadata_program_id, mint_id]
    #[account(mut)]
    metadata: AccountInfo<'info>,
    #[account(mut, signer)]
    payer: AccountInfo<'info>,
    #[account(
        constraint = mint.mint_authority == COption::Some(*mint_authority.key),
    )]
    mint: CpiAccount<'info, Mint>,
    #[account(signer)]
    mint_authority: AccountInfo<'info>,
    #[account(address = spl_token_metadata::id())]
    token_metadata_program: AccountInfo<'info>,
    #[account(address = anchor_spl::token::ID)]
    token_program: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    rent: Sysvar<'info, Rent>,
}

#[error]
pub enum MetadataError {
    #[msg("The Token name is too long")]
    NameTooLong,
    #[msg("The Token symbol is too long")]
    SymbolTooLong,
}
