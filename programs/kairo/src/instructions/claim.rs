use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

use crate::constants::{GLOBAL_SEED, MINER_SEED, MINT_AUTH_SEED};
use crate::errors::KairoError;
use crate::state::{GlobalState, Miner};

/// Mint a miner's accrued $KAIRO rewards to their associated token account.
#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, seeds = [GLOBAL_SEED], bump = global.bump, has_one = mint)]
    pub global: Account<'info, GlobalState>,

    #[account(
        mut,
        seeds = [MINER_SEED, owner.key().as_ref()],
        bump = miner.bump,
        has_one = owner
    )]
    pub miner: Account<'info, Miner>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    /// CHECK: program PDA mint authority; verified by seeds.
    #[account(seeds = [MINT_AUTH_SEED], bump = global.mint_auth_bump)]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = owner,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Claim>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    {
        let global = &ctx.accounts.global;
        require!(!global.paused, KairoError::Paused);
        require!(global.active, KairoError::NotActive);
    }
    // Settle rewards and apply hashrate decay in one step.
    crate::state::settle_and_decay(&mut ctx.accounts.global, &mut ctx.accounts.miner, now)?;
    let mint_auth_bump = ctx.accounts.global.mint_auth_bump;

    let miner = &mut ctx.accounts.miner;
    let amount = miner.accrued_base;
    require!(amount > 0, KairoError::NothingToClaim);
    miner.accrued_base = 0;

    // Mint to the owner, signed by the mint-authority PDA.
    let signer_seeds: &[&[&[u8]]] = &[&[MINT_AUTH_SEED, &[mint_auth_bump]]];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.owner_token_account.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info(),
        },
        signer_seeds,
    );
    token::mint_to(cpi_ctx, amount)?;

    msg!("kairo: {} claimed {} base units", ctx.accounts.owner.key(), amount);
    Ok(())
}
