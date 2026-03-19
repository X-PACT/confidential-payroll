# Zama Submission: Confidential Payroll

## Project Snapshot

- Project: `ConfidentialPayroll`
- Track: Zama confidential-payroll challenge
- Network: Ethereum Sepolia (`11155111`)
- Repository: `https://github.com/X-PACT/confidential-payroll`
- Hosted frontend: `https://confidential-payroll-henna.vercel.app/frontend`

## Deployed Sepolia Contracts

These are the references used throughout the repository and frontend:

| Contract | Address |
| --- | --- |
| ConfidentialPayroll | `0xA1b22e02484E573cb1b4970cA52B7b24c13D20dF` |
| ConfidentialPayToken | `0x861d347672E3B58Eea899305BDD630EA2A6442a0` |
| ConfidentialEquityOracle | `0xe9F6209156dE521334Bd56eAf9063Af2882216B3` |
| ConfidentialPayslip | `0xbF160BC0A4C610E8134eAbd3cd1a1a9608d534aC` |

Explorer: `https://sepolia.etherscan.io/address/0xA1b22e02484E573cb1b4970cA52B7b24c13D20dF`

## What The Repository Delivers

This submission is a complete confidential payroll workflow, not just an encrypted balance demo.

It includes:

- encrypted employee onboarding
- branchless encrypted tax calculation
- shared payroll processing for single-run and chunked execution
- ERC-7984 salary-token issuance
- reserve-backed CPT treasury hooks
- confidential payslip requests and verifier checks
- encrypted equity and compliance certificate flows
- a live frontend console wired to the Sepolia deployment

## Why FHE Matters Here

Payroll is a bad fit for transparent ledgers if salary amounts, deductions, and policy checks are exposed. The core value of this project is that it keeps the compensation logic encrypted while still allowing payroll operations, compliance checks, and verifier workflows to happen on-chain.

The interesting part is not simply storing encrypted salaries. The useful part is that payroll still works:

- managers can run payroll
- employees can prove income without revealing exact salary
- regulators can verify policy outcomes without reviewing raw pay data

## Main Contracts

### `ConfidentialPayroll.sol`

This is the operational core:

- employee registry
- encrypted salary, bonus, deduction, and net-pay state
- branchless progressive-tax path
- payroll-run accounting
- role management
- reserve-backed CPT minting and redemption requests

The payroll-processing path is intentionally centralized in `_processEmployeePayroll()`. Both `runPayroll()` and `batchRunPayroll()` use that same internal routine so the business logic stays consistent.

### `ConfidentialPayToken.sol`

This contract handles confidential salary balances with the ERC-7984 interface shape used by the project.

### `ConfidentialEquityOracle.sol`

The oracle handles encrypted compliance proofs, including:

- minimum-wage checks
- salary-band checks
- department-median checks
- department-average checks
- gender-pay-gap checks

The output exposed through the gateway is still just the policy result, not the underlying salary.

### `ConfidentialPayslip.sol`

The payslip contract lets an employee request a verifier-scoped proof about their compensation. The verifier gets the approved statement and metadata, not the exact salary.

## Frontend Scope

The frontend is a Vue-based console at `frontend/index.html`. It is wired for:

- address configuration
- wallet connection
- employee registration
- payroll execution
- equity-certificate requests
- payslip requests
- payslip verification
- salary decryption requests

It defaults to the published Sepolia contract addresses so judges can use the live deployment without editing configuration first.

## Practical Flow For Judges

1. Open the frontend.
2. Connect a wallet on Sepolia.
3. Review the prefilled deployed addresses.
4. Inspect the add-employee form to see the encrypted-input model.
5. Trigger payroll or a payslip/equity request from an authorized account.
6. Observe the gateway-progress handling in the UI and the contract events in Sepolia.

## Included Review Assets

- `docs/JUDGE_PATH.md` for the shortest high-signal review flow
- `docs/COVER_NOTE.md` for a concise judge-facing project summary
- `docs/DEMO_VIDEO.md` for a 60-90 second walkthrough script
- `docs/assets/frontend-console-preview.svg` for a clean frontend preview used in the README

## Notable Engineering Choices

### Branchless tax logic

The tax path avoids decrypting salary data to make bracket decisions. Instead it uses supported fhEVM operations such as:

- `TFHE.min()`
- `TFHE.select()`
- `TFHE.shr()`

That keeps the payroll flow compatible with the actual library version used here while preserving confidentiality.

### Shared payroll execution logic

Single-run payroll and chunked payroll both call the same internal processing function. That matters because payroll systems are risky places to let duplicated logic drift.

### Truthful frontend

The UI does not invent background automation or hidden relayers. Where a flow depends on encrypted input handles or asynchronous gateway callbacks, the interface says so directly.

## Validation Performed

- `npx hardhat compile`
- `npx hardhat test`
- repository-wide wording scan for misleading markers
- `npm audit --json`
- Slither installation plus an attempted repo analysis run in this environment

## Current Review Notes

- The contracts compile cleanly.
- The Hardhat tests pass.
- The frontend is a static HTML/Vue console, so structural validation here is done by source inspection rather than a separate bundler build.
- `npm audit` still reports transitive issues in the pinned toolchain around older Hardhat and fhEVM dependencies.
- Slither was installed successfully, but the full Hardhat-backed analysis run timed out in this environment before detector output completed.

## Summary

ConfidentialPayroll is strongest when evaluated as a coherent system rather than as separate tricks:

- confidential payroll execution
- confidential salary-token settlement
- confidential policy verification
- verifier-safe payslip proofs

That combination is what makes the project feel like a real product direction instead of a narrow cryptography demo.
