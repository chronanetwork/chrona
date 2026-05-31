use anchor_lang::prelude::*;

#[error_code]
pub enum KairoError {
    #[msg("Program is paused")]
    Paused,
    #[msg("Mining is not active yet (mint authority not handed over)")]
    NotActive,
    #[msg("Mining is already active")]
    AlreadyActive,
    #[msg("Score is below the configured minimum")]
    ScoreTooLow,
    #[msg("Score is above the configured maximum")]
    ScoreTooHigh,
    #[msg("Attestation has expired")]
    AttestationExpired,
    #[msg("Missing or misplaced ed25519 verification instruction")]
    MissingEd25519Ix,
    #[msg("Attestation signature does not match the configured oracle or expected message")]
    AttestationMismatch,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Provided mint does not match the configured mint")]
    InvalidMint,
    #[msg("Mint authority is not (yet) the program PDA")]
    MintAuthorityNotProgram,
    #[msg("Mineable supply cap reached")]
    CapReached,
    #[msg("Nothing to claim")]
    NothingToClaim,
}
