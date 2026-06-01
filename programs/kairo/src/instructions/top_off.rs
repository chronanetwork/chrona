use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

use crate::constants::{GLOBAL_SEED, MINER_SEED};
use crate::errors::KairoError;
use crate::state::{GlobalState, Miner};

/// Restore a miner's effective hash rate to full (resets the 36h halving clock)
/// for the top-off fee. Settles accrued rewards first so nothing is lost.
#[derive(Accounts)]
pub struct TopOff<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, seeds = [GLOBAL_SEED], bump = global.bump, has_one = treasury)]
    pub global: Account<'info, GlobalState>,

    #[account(
        mut,
        seeds = [MINER_SEED, owner.key().as_ref()],
        bump = miner.bump,
        has_one = owner
    )]
    pub miner: Account<'info, Miner>,

    #[account(mut)]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<TopOff>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(!ctx.accounts.global.paused, KairoError::Paused);
    require!(ctx.accounts.global.active, KairoError::NotActive);

    // Charge the top-off fee to the treasury.
    let fee = ctx.accounts.global.topoff_fee_lamports;
    let cpi = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        Transfer {
            from: ctx.accounts.owner.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
        },
    );
    system_program::transfer(cpi, fee)?;

    // Settle at the current (decayed) rate, then reset to full.
    let global = &mut ctx.accounts.global;
    global.update_pool(now)?;
    let miner = &mut ctx.accounts.miner;
    miner.settle(global.acc_reward_per_hash);

    let old_eff = miner.effective_hash_rate;
    miner.last_topup_ts = now;
    let new_eff = miner.hash_rate; // full again (k = 0)
    global.total_hash_rate = global
        .total_hash_rate
        .checked_sub(old_eff)
        .and_then(|t| t.checked_add(new_eff))
        .ok_or(KairoError::MathOverflow)?;
    miner.effective_hash_rate = new_eff;

    msg!("kairo: miner {} topped off -> {}", miner.owner, new_eff);
    Ok(())
}
