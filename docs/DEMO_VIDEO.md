# 60-90 Second Demo Script

## Goal

Give judges a fast, credible walkthrough that shows a real confidential workflow instead of a generic dashboard tour.

## Runtime

Target: 75 seconds

## Shot List

1. Opening frame, 0-8s
   - Show the hosted frontend at `https://confidential-payroll-henna.vercel.app/frontend`.
   - Narration: "Confidential Payroll is a fully on-chain payroll system built with Zama fhEVM. Salaries stay encrypted, while payroll, equity checks, and payslip proofs remain operational."

2. Deployment trust signal, 8-18s
   - Focus on the prefilled Sepolia addresses in the UI.
   - Narration: "The frontend opens on the published Sepolia deployment, so the same contracts shown in the repository are the ones used in the demo."

3. Employee onboarding, 18-32s
   - Highlight the add-employee panel.
   - Narration: "New employees are registered with encrypted salary handles and proofs. The UI does not downgrade privacy by asking for plaintext compensation."

4. Payroll execution, 32-48s
   - Trigger payroll and show the gateway-progress panel.
   - Narration: "Payroll runs through branchless encrypted tax logic, then moves through the gateway callback flow without revealing salary balances."

5. Payslip and compliance flows, 48-64s
   - Show the payslip and equity certificate panels.
   - Narration: "Employees can request verifier-safe payslips, and compliance teams can evaluate encrypted policy claims such as pay equity without exposing individual salaries."

6. Closing frame, 64-75s
   - Return to the hero area and the address pills.
   - Narration: "This is the practical value of FHE here: real payroll operations, real compliance workflows, and no public salary leakage."

## On-Screen Captions

- Private payroll on Sepolia
- Encrypted salary inputs only
- Branchless FHE tax path
- Gateway-tracked async proofs
- Payslips and equity checks without salary disclosure

## Recording Notes

- Record at 1440p or 1080p in a desktop browser.
- Keep wallet popups in-frame for one action only; the contract view should remain the focus.
- Use one live transaction path instead of cutting between unrelated states.
