use anchor_lang::prelude::*;

use crate::constants::{GLOBAL_SEED, MINER_SEED};
use crate::state::{settle_and_decay, GlobalState, Miner};

/// Permissionless: settle a miner and apply its hashrate decay, shrinking its
/// share of the pool if it hasn't topped off. Anyone can poke any miner — this
/// is how abandoned wallets get pruned so they stop diluting active miners.
#[derive(Accounts)]
pub struct Poke<'info> {
    pub poker: Signer<'info>,

    #[account(mut, seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, GlobalState>,

    #[account(
        mut,
        seeds = [MINER_SEED, miner.owner.as_ref()],
        bump = miner.bump
    )]
    pub miner: Account<'info, Miner>,
}

pub fn handler(ctx: Context<Poke>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    settle_and_decay(&mut ctx.accounts.global, &mut ctx.accounts.miner, now)?;
    Ok(())
}
