use anchor_lang::prelude::*;

use crate::constants::GLOBAL_SEED;
use crate::errors::KairoError;
use crate::state::GlobalState;

/// Authority-gated administrative actions.
#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        bump = global.bump,
        has_one = authority @ KairoError::Unauthorized
    )]
    pub global: Account<'info, GlobalState>,
}

pub fn set_oracle(ctx: Context<AdminOnly>, new_oracle: Pubkey) -> Result<()> {
    ctx.accounts.global.oracle_pubkey = new_oracle;
    msg!("kairo: oracle pubkey set to {}", new_oracle);
    Ok(())
}

pub fn set_treasury(ctx: Context<AdminOnly>, new_treasury: Pubkey) -> Result<()> {
    ctx.accounts.global.treasury = new_treasury;
    msg!("kairo: treasury set to {}", new_treasury);
    Ok(())
}

pub fn set_params(
    ctx: Context<AdminOnly>,
    init_fee_lamports: u64,
    min_score: u64,
    max_score: u64,
    attestation_validity_secs: i64,
) -> Result<()> {
    require!(min_score > 0 && min_score <= max_score, KairoError::ScoreTooLow);
    require!(attestation_validity_secs > 0, KairoError::AttestationExpired);
    let g = &mut ctx.accounts.global;
    g.init_fee_lamports = init_fee_lamports;
    g.min_score = min_score;
    g.max_score = max_score;
    g.attestation_validity_secs = attestation_validity_secs;
    msg!("kairo: params updated");
    Ok(())
}

pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
    ctx.accounts.global.paused = paused;
    msg!("kairo: paused = {}", paused);
    Ok(())
}

pub fn transfer_authority(ctx: Context<AdminOnly>, new_authority: Pubkey) -> Result<()> {
    ctx.accounts.global.authority = new_authority;
    msg!("kairo: authority transferred to {}", new_authority);
    Ok(())
}
