# Plan: Phase G — Safe References (SUPERSEDED)

Status: **merged into Phase F**.

Safe references (`&T` / `edit &T`) are no longer a separate phase. As of 2026-06-21 the entire reference surface — borrow types, contextual auto-borrowing and explicit `&x` / `edit &x`, binding-capability rules, root-based exclusivity, capability dispatch through borrows, and structural non-escape — lives in [Phase F — Ownership, Move Semantics, and Safe References](phase-f-ownership-and-move.md).

The MVP scope is unchanged from this plan: borrows are parameter-only and call-scoped, cannot escape, and the `viewing <source>` lifetime story remains a documented forward contract. The original class-era wording here has been modernized to records plus receiver methods in Phase F.

This file is kept only as a redirect; do not implement from it.
