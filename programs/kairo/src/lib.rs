use anchor_lang::prelude::*;

pub mod constants;
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

    /// Mint accrued rewards to the calling miner.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handler(ctx)
    }
}
