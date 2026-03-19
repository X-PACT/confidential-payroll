# Security Policy

If you find a security issue, please do not open a public GitHub issue first.

Email the maintainers or the competition submission contact with:

- a short title
- the affected contract, script, or frontend flow
- reproduction steps
- impact assessment
- any suggested fix or mitigation

If the issue is time-sensitive, say so clearly in the subject line.

For direct coordination during judging or security review, the project contact on Discord is `xpactprotocol`.

## Scope

This repo contains three security-sensitive layers:

- encrypted payroll and treasury contracts
- verifier-facing compliance and payslip contracts
- demo and deployment tooling

When reporting, note which layer is affected.

## What We Expect In A Good Report

- exact function names and parameters
- whether the issue affects the local Hardhat environment, Sepolia, or both
- whether the problem leaks salary metadata, blocks payroll, drains reserves, or weakens role controls
- whether the issue depends on a misconfigured gateway, stale exchange rate, or outdated dependency

## Current Review Status

The current refresh included:

- `npx hardhat compile`
- `npx hardhat test`
- `npm audit --json`
- a Slither install plus a repository analysis attempt through Hardhat

### Findings Worth Tracking

1. `npm audit` reports 48 transitive dependency issues in the pinned toolchain, with the most important clusters coming from `hardhat`, `fhevm`, `fhevmjs`, and older supporting packages like `tar`, `sqlite3`, and `undici`.
2. The reserve-backed deposit path relies on fhEVM plaintext-to-encrypted conversion support that compiles cleanly but does not execute in this local Hardhat setup the same way it would in the target gateway-backed environment. Validation paths are tested; the live happy path should still be exercised on Sepolia before a production rollout.
3. Aggregate oracle calculations intentionally use shift-based normalization because generic encrypted division is not consistently available in fhEVM v0.6. That is a compatibility decision, but it also means HR must publish the matching normalization metadata carefully.
4. The token redemption flow is asynchronous by design. The gateway callback determines the final redeemable reserve amount, so off-chain operators should avoid promising instant settlement before that callback lands.

### Slither Note

Slither was installed in a local virtual environment and invoked, but the full Hardhat-backed run timed out in this execution environment before it returned detector output. The repo now includes a `npm run slither` script so the same analysis can be rerun in CI or on a development machine with more time.

## Responsible Disclosure

Please give the maintainers a reasonable window to confirm and patch the issue before public disclosure. Confidentiality bugs are especially sensitive here because even a "small" leak can undermine the main promise of the system.
