use anchor_lang::prelude::*;

pub mod constants;
pub mod math;

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

    pub fn ping(_ctx: Context<Ping>) -> Result<()> {
        msg!("kairo");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Ping {}
