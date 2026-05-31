//! Verification of oracle score attestations.
//!
//! Solana verifies Ed25519 signatures in the native `Ed25519SigVerify111…`
//! program, not inside our instruction. The client therefore submits a
//! transaction whose instruction *immediately before* ours is an Ed25519
//! verify instruction. Here we introspect that instruction via the Instructions
//! sysvar and bind it to *our* oracle key and *our* reconstructed message — the
//! native program has already proven the signature itself.
//!
//! ## Ed25519 instruction data layout (single, self-contained signature)
//! ```text
//! offset 0 : u8  num_signatures (= 1)
//! offset 1 : u8  padding
//! offset 2 : Ed25519SignatureOffsets {
//!     u16 signature_offset
//!     u16 signature_instruction_index
//!     u16 public_key_offset
//!     u16 public_key_instruction_index
//!     u16 message_data_offset
//!     u16 message_data_size
//!     u16 message_instruction_index
//! }
//! … then the public key (32), signature (64), and message bytes …
//! ```
//! `instruction_index == u16::MAX` (or the Ed25519 instruction's own index)
//! means the referenced bytes live in the Ed25519 instruction itself — which is
//! exactly what we require, so the bytes we read are the bytes that were signed.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked,
};

use crate::errors::KairoError;

/// Canonical attestation message: `wallet(32) ‖ score(u64 LE) ‖ expiry(i64 LE) ‖ nonce(32)`.
pub const ATTESTATION_MSG_LEN: usize = 32 + 8 + 8 + 32;

/// Build the canonical attestation message the oracle signs and the program verifies.
pub fn attestation_message(
    wallet: &Pubkey,
    score: u64,
    expiry: i64,
    nonce: &[u8; 32],
) -> [u8; ATTESTATION_MSG_LEN] {
    let mut m = [0u8; ATTESTATION_MSG_LEN];
    m[0..32].copy_from_slice(wallet.as_ref());
    m[32..40].copy_from_slice(&score.to_le_bytes());
    m[40..48].copy_from_slice(&expiry.to_le_bytes());
    m[48..80].copy_from_slice(nonce);
    m
}

const OFFSETS_START: usize = 2;
const OFFSETS_LEN: usize = 14;

/// Assert the transaction contains an Ed25519 verify instruction, immediately
/// preceding the current one, proving `oracle_pubkey` signed exactly
/// `expected_message`.
pub fn verify_oracle_attestation(
    instructions_sysvar: &AccountInfo,
    oracle_pubkey: &Pubkey,
    expected_message: &[u8],
) -> Result<()> {
    let current_index = load_current_index_checked(instructions_sysvar)? as usize;
    require!(current_index > 0, KairoError::MissingEd25519Ix);
    let ed_index = current_index - 1;

    let ed_ix = load_instruction_at_checked(ed_index, instructions_sysvar)
        .map_err(|_| error!(KairoError::MissingEd25519Ix))?;
    require_keys_eq!(ed_ix.program_id, ed25519_program::ID, KairoError::MissingEd25519Ix);

    let data = &ed_ix.data;
    require!(
        data.len() >= OFFSETS_START + OFFSETS_LEN,
        KairoError::AttestationMismatch
    );
    // Exactly one signature.
    require!(data[0] == 1, KairoError::AttestationMismatch);

    let rd = |off: usize| -> u16 { u16::from_le_bytes([data[off], data[off + 1]]) };
    let sig_off = rd(OFFSETS_START) as usize;
    let sig_ix = rd(OFFSETS_START + 2);
    let pk_off = rd(OFFSETS_START + 4) as usize;
    let pk_ix = rd(OFFSETS_START + 6);
    let msg_off = rd(OFFSETS_START + 8) as usize;
    let msg_size = rd(OFFSETS_START + 10) as usize;
    let msg_ix = rd(OFFSETS_START + 12);

    // Every referenced field must live in this same Ed25519 instruction, so the
    // bytes we inspect are the bytes the native program actually verified.
    let here = ed_index as u16;
    let refers_here = |idx: u16| idx == u16::MAX || idx == here;
    require!(
        refers_here(sig_ix) && refers_here(pk_ix) && refers_here(msg_ix),
        KairoError::AttestationMismatch
    );

    // Bounds.
    require!(
        pk_off.saturating_add(32) <= data.len()
            && sig_off.saturating_add(64) <= data.len()
            && msg_off.saturating_add(msg_size) <= data.len(),
        KairoError::AttestationMismatch
    );

    // Signed by our oracle, over exactly our message.
    require!(
        &data[pk_off..pk_off + 32] == oracle_pubkey.as_ref(),
        KairoError::AttestationMismatch
    );
    require!(
        &data[msg_off..msg_off + msg_size] == expected_message,
        KairoError::AttestationMismatch
    );

    Ok(())
}
