use anchor_lang::prelude::*;
use anchor_spl::token::{self, spl_token::instruction::AuthorityType, Mint, SetAuthority, Token};

use crate::constants::{GLOBAL_SEED, MINT_AUTH_SEED};
use crate::errors::KairoError;
use crate::state::GlobalState;

/// Hand the $KAIRO mint authority to the program's mint-authority PDA, and
/// activate mining. Signed by the current mint authority (the deployer).
///
/// This is the moment mining genesis starts. From here, the only new $KAIRO
/// that can be created is mined via [`crate::claim`].
#[derive(Accounts)]
pub struct SetMintAuthority<'info> {
    #[account(mut, address = global.authority @ KairoError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(mut, seeds = [GLOBAL_SEED], bump = global.bump, has_one = mint)]
    pub global: Account<'info, GlobalState>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    /// CHECK: program PDA that will become the mint authority; verified by seeds.
    #[account(seeds = [MINT_AUTH_SEED], bump = global.mint_auth_bump)]
    pub mint_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<SetMintAuthority>) -> Result<()> {
    let global = &ctx.accounts.global;
    use anchor_lang::solana_program::program_option::COption;
    require!(!global.active, KairoError::AlreadyActive);

    let pda = ctx.accounts.mint_authority.key();
    let already_pda = ctx.accounts.mint.mint_authority == COption::Some(pda);

    if !already_pda {
        // Deployer must currently hold mint authority to hand it over.
        require!(
            ctx.accounts.mint.mint_authority == COption::Some(ctx.accounts.authority.key()),
            KairoError::MintAuthorityNotProgram
        );
        // CPI: SetAuthority(MintTokens) -> program PDA, signed by current authority.
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            SetAuthority {
                account_or_mint: ctx.accounts.mint.to_account_info(),
                current_authority: ctx.accounts.authority.to_account_info(),
            },
        );
        token::set_authority(cpi_ctx, AuthorityType::MintTokens, Some(pda))?;
    }
    // If the PDA already holds authority (e.g. re-bootstrapping a fresh global),
    // skip the CPI and just activate.

    let now = Clock::get()?.unix_timestamp;
    let global = &mut ctx.accounts.global;
    global.premine_observed = ctx.accounts.mint.supply;
    global.active = true;
    global.genesis_ts = now;
    global.last_update_ts = now;

    msg!(
        "kairo: mint authority -> program PDA; mining active at ts {}, premine {} base units",
        now,
        global.premine_observed
    );
    Ok(())
}
