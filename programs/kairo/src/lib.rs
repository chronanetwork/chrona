use anchor_lang::prelude::*;

pub mod constants;
pub mod ed25519;
pub mod errors;
pub mod instructions;
pub mod math;
pub mod state;

use instructions::*;

declare_id!("6MS8n87aRsXE5RjyVXuf9wcfARn5ut4m2YhBFE3kairo");

/// Kairo — a Proof-of-Activity mined SPL token.
///
/// Wallets are scored off-chain on their on-chain history (age, trades, volume,
/// hold time). That score is their "hash rate". Miners share each moment of
/// emission proportional to their hash rate via an O(1) accumulator, and mint
/// their accrued rewards on claim.
#[program]
pub mod kairo {
    use super::*;

    /// One-time program setup: record the mint, oracle key, treasury, and
    /// parameters. Mining starts inactive until mint authority is handed over.
    pub fn initialize_global(
        ctx: Context<InitializeGlobal>,
        params: InitializeGlobalParams,
    ) -> Result<()> {
        instructions::initialize_global::handler(ctx, params)
    }

    /// Hand $KAIRO mint authority to the program PDA and activate mining.
    /// Signed by the current mint authority (the deployer).
    pub fn set_mint_authority(ctx: Context<SetMintAuthority>) -> Result<()> {
        instructions::set_mint_authority::handler(ctx)
    }

    /// Register the caller as a miner: verify the oracle attestation, charge
    /// the initialization fee, and join the pool at the attested hash rate.
    pub fn initialize_miner(
        ctx: Context<InitializeMiner>,
        score: u64,
        expiry: i64,
        nonce: [u8; 32],
    ) -> Result<()> {
        instructions::initialize_miner::handler(ctx, score, expiry, nonce)
    }

    /// Refresh the caller's score with a new attestation.
    pub fn re_attest(
        ctx: Context<ReAttest>,
        score: u64,
        expiry: i64,
        nonce: [u8; 32],
    ) -> Result<()> {
        instructions::re_attest::handler(ctx, score, expiry, nonce)
    }

    /// Restore the caller's hash rate to full for the top-off fee.
    pub fn top_off(ctx: Context<TopOff>) -> Result<()> {
        instructions::top_off::handler(ctx)
    }

    /// Permissionlessly settle + decay any miner (prunes abandoned wallets).
    pub fn poke(ctx: Context<Poke>) -> Result<()> {
        instructions::poke::handler(ctx)
    }

    /// Mint accrued rewards to the calling miner.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handler(ctx)
    }

    // ---- admin ----

    pub fn set_oracle(ctx: Context<AdminOnly>, new_oracle: Pubkey) -> Result<()> {
        instructions::admin::set_oracle(ctx, new_oracle)
    }

    pub fn set_treasury(ctx: Context<AdminOnly>, new_treasury: Pubkey) -> Result<()> {
        instructions::admin::set_treasury(ctx, new_treasury)
    }

    pub fn set_params(
        ctx: Context<AdminOnly>,
        init_fee_lamports: u64,
        min_score: u64,
        max_score: u64,
        attestation_validity_secs: i64,
    ) -> Result<()> {
        instructions::admin::set_params(
            ctx,
            init_fee_lamports,
            min_score,
            max_score,
            attestation_validity_secs,
        )
    }

    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        instructions::admin::set_paused(ctx, paused)
    }

    pub fn transfer_authority(ctx: Context<AdminOnly>, new_authority: Pubkey) -> Result<()> {
        instructions::admin::transfer_authority(ctx, new_authority)
    }
}
