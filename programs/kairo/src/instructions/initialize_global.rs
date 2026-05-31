use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::constants::{GLOBAL_SEED, INIT_FEE_LAMPORTS, MAX_SCORE, MINT_AUTH_SEED, MIN_SCORE};
use crate::state::GlobalState;

/// Parameters for [`initialize_global`]. Defaults (see the SDK) use the
/// scoring-spec bounds and the 0.1 SOL fee; all are admin-adjustable later.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeGlobalParams {
    pub oracle_pubkey: Pubkey,
    pub treasury: Pubkey,
    pub init_fee_lamports: u64,
    pub min_score: u64,
    pub max_score: u64,
    pub attestation_validity_secs: i64,
}

impl Default for InitializeGlobalParams {
    fn default() -> Self {
        Self {
            oracle_pubkey: Pubkey::default(),
            treasury: Pubkey::default(),
            init_fee_lamports: INIT_FEE_LAMPORTS,
            min_score: MIN_SCORE,
            max_score: MAX_SCORE,
            attestation_validity_secs: 15 * 60,
        }
    }
}

#[derive(Accounts)]
pub struct InitializeGlobal<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + GlobalState::INIT_SPACE,
        seeds = [GLOBAL_SEED],
        bump
    )]
    pub global: Account<'info, GlobalState>,

    /// The $KAIRO mint (created externally — by the DBC on mainnet, or a setup
    /// script on devnet). We only record its address here.
    pub mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeGlobal>, params: InitializeGlobalParams) -> Result<()> {
    let (_mint_auth, mint_auth_bump) =
        Pubkey::find_program_address(&[MINT_AUTH_SEED], ctx.program_id);

    let g = &mut ctx.accounts.global;
    g.authority = ctx.accounts.authority.key();
    g.oracle_pubkey = params.oracle_pubkey;
    g.mint = ctx.accounts.mint.key();
    g.treasury = params.treasury;

    g.genesis_ts = 0;
    g.last_update_ts = 0;
    g.acc_reward_per_hash = 0;
    g.total_hash_rate = 0;
    g.total_minted_base = 0;
    g.premine_observed = 0;

    g.init_fee_lamports = params.init_fee_lamports;
    g.min_score = params.min_score;
    g.max_score = params.max_score;
    g.attestation_validity_secs = params.attestation_validity_secs;

    g.active = false;
    g.paused = false;
    g.bump = ctx.bumps.global;
    g.mint_auth_bump = mint_auth_bump;

    msg!("kairo: global initialized, mint {}", g.mint);
    Ok(())
}
