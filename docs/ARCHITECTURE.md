# Architecture

This project is easiest to understand as three privacy-aware products sharing one payroll core:

1. confidential salary disbursement
2. confidential equity compliance proofs
3. verifier-specific payslips

## System Layout

```text
ConfidentialPayroll
├── encrypted employee state
├── branchless tax engine
├── ERC-7984 salary token integration
├── reserve-backed CPT treasury hooks
└── role and payroll-run administration

ConfidentialEquityOracle
├── minimum wage and salary-band checks
├── department-median checks
├── department-average checks
└── gender-pay-gap checks

ConfidentialPayslip
├── verifier-bound payslip proofs
├── soulbound record model
└── gateway-backed proof disclosure
```

## Payroll Flow

The payroll contract keeps the sensitive part of the process encrypted from end to end:

1. HR registers an employee with an encrypted salary handle.
2. Managers add encrypted bonuses or deductions.
3. `runPayroll()` or `batchRunPayroll()` calls `_processEmployeePayroll()`.
4. The helper computes gross pay, tax, deductions, and net pay using FHE-safe operations.
5. Net pay is minted as encrypted CPT.
6. Audit metadata is emitted without revealing salary values.

That shared helper matters. Before the refactor, the single-run and batch-run paths duplicated the same calculation logic. That is exactly the sort of drift that makes compliance-heavy code brittle over time.

## Tax Brackets

Tax thresholds are public law, so they stay plaintext. Salary amounts remain encrypted.

The admin can now update brackets through `setTaxBrackets(uint64[] thresholds, uint16[] rates)`.

The implementation validates:

- matching array lengths
- strictly ascending thresholds
- an open-ended top bracket
- only the supported public rate set used by the shift-based approximation path

This is a deliberate tradeoff. The repo stays compatible with fhEVM v0.6 instead of pretending encrypted division is available everywhere.

## CPT Treasury Layer

The reserve-backed CPT flow is handled in `ConfidentialPayroll` rather than by exposing treasury logic directly inside the token:

- `setBaseCurrency(bytes32 currencyCode, uint256 exchangeRateBps)`
- `setReserveAsset(address reserveAsset, bool enabled)`
- `depositSalaryTokenReserve(address reserveAsset, address beneficiary, uint256 reserveAmount)`
- `requestSalaryTokenRedemption(address reserveAsset, uint256 requestedReserveAmount, address payoutRecipient)`
- `claimSalaryTokenRedemption(uint256 requestId)`

The design goal is simple: balances stay confidential, while treasury collateral stays inspectable enough for demos and audits.

## Oracle Aggregates

The equity oracle supports two new aggregate-oriented claim families:

- department-average checks
- gender-pay-gap checks

HR supplies encrypted aggregate totals and plaintext normalization metadata. The oracle then computes:

- encrypted department averages with shift-based normalization
- encrypted male and female department averages
- an encrypted lower-bound comparison for the configured pay-gap tolerance

The result that leaves the gateway is still just a boolean.

## Payslip Verification

Payslips are meant to be practical, not decorative. The verifier sees the proof result and the employee-approved context, but not the raw salary amount.

That gives the demo a stronger real-world story: a bank, landlord, or immigration reviewer can confirm a statement about income without learning the exact number.
