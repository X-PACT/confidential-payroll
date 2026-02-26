# Launch Kit

This file is the ready-to-publish launch and listing package for `ConfidentialPayroll v2`.

## Live Demo Distribution

### Vercel

Recommended production setup:

- Framework preset: `Other`
- Root directory: `.`
- Build command: leave empty
- Output directory: `.`
- Production entry: `index.html`

CLI deployment:

```bash
cd /home/x-pact/confidential-payroll
npx vercel --prod
```

Recommended aliases after the first deployment:

- `/` -> live homepage
- `/demo` -> same live demo via `vercel.json`
- `/live` -> same live demo via `vercel.json`

### GitHub Pages

Use either of these and keep only one active in repository settings:

- `master` + `/ (root)`
- `master` + `/docs`

## DoraHacks Submission Copy

### Project Name

ConfidentialPayroll v2

### One-Line Pitch

Run payroll, pay equity checks, and verifiable payslips fully on-chain without leaking employee salary data.

### Short Description

ConfidentialPayroll v2 is a privacy-preserving payroll system built on Zama fhEVM. Salaries, bonuses, deductions, tax logic, equity checks, and payslip proofs remain encrypted throughout the workflow while employees still receive on-chain salary payments and verifiable attestations.

### Full Description

ConfidentialPayroll v2 solves one of the clearest blockers to enterprise blockchain adoption: payroll data is too sensitive to place on public infrastructure. Traditional smart contracts expose balances, compensation structures, and internal HR policies. This project removes that tradeoff by using Zama's Fully Homomorphic Encryption to keep salary data encrypted at every step of payroll execution.

The system supports encrypted salary onboarding, branchless encrypted tax calculation, confidential ERC-7984 salary payments, pay-equity attestations through a dedicated oracle, and ERC-5192 soulbound payslips for verifiable income proofs. Employers can run payroll, employees can prove income ranges, and auditors can verify policy outcomes without anyone revealing exact salary values on-chain.

This is not a concept mockup. The repository includes contracts, scripts, local tests, deployment flow, and a live frontend demo designed to show how confidential payroll can work in a real enterprise workflow.

### Why Zama

- fhEVM makes encrypted on-chain business logic practical.
- Payroll is a high-value, privacy-critical enterprise use case.
- The project demonstrates business operations beyond private transfers.
- It highlights how encrypted compute can unlock HR, compliance, and finance automation.

### Core Features

- Encrypted employee salary records
- Branchless FHE tax calculation with `TFHE.min`, `TFHE.select`, and `TFHE.shr`
- ERC-7984 confidential salary token payouts
- Confidential pay-equity certification
- ERC-5192 verifiable payslips
- Live demo frontend for judges and ecosystem reviewers

### Links

- Repository: `https://github.com/X-PACT/confidential-payroll`
- GitHub Pages demo: `https://x-pact.github.io/confidential-payroll/`
- Add Vercel production URL after deployment

### Suggested Track Tags

- Privacy
- FHE
- Payroll
- On-chain HR
- Compliance
- Enterprise infrastructure

## Product Hunt Launch Copy

### Product Name

ConfidentialPayroll v2

### Tagline

Privacy-preserving payroll on Zama fhEVM

### Short Description

Encrypted salaries, encrypted tax logic, confidential payroll payouts, and verifiable payslips on-chain.

### Launch Post

ConfidentialPayroll v2 shows what enterprise-grade privacy can look like on public infrastructure. Instead of exposing salaries, bonuses, and HR policies on-chain, it keeps payroll state encrypted with Zama fhEVM while still enabling payment execution, pay-equity checks, and verifiable payslips. The result is a practical demo of privacy-preserving finance and HR operations built for real-world trust requirements.

### First Comment

We built ConfidentialPayroll v2 to demonstrate that blockchain payroll does not have to leak salary information. The stack combines Zama fhEVM, ERC-7984 confidential balances, and ERC-5192 soulbound payslips to let employers process payroll while employees keep exact compensation private. The repo includes contracts, scripts, tests, and a live demo so technical reviewers can evaluate the design end to end.

## Acquisition Listing Copy

Use these only if you are ready to discuss source code transfer, branding, domain ownership, and post-sale support.

### Acquire.com

#### Listing Title

ConfidentialPayroll v2 - privacy-preserving payroll infrastructure built on Zama fhEVM

#### Short Summary

ConfidentialPayroll v2 is a working privacy-first payroll product concept for Web3 and enterprise infrastructure buyers. It demonstrates encrypted salary management, encrypted payroll execution, confidential token payouts, pay-equity proofs, and verifiable payslips in one coherent stack.

#### Why It Matters

- Solves a real enterprise pain point: payroll confidentiality
- Clear market angle: HR tech, payroll SaaS, compliance infrastructure, and private finance tooling
- Strong strategic value for teams building in FHE, privacy tech, enterprise blockchain, or regulated fintech
- Includes live demo, contracts, tests, and submission-grade technical documentation

#### Included In Sale

- Smart contracts
- Frontend demo
- README and technical documentation
- GitHub repository
- Deployment scripts
- Branding and product narrative used for hackathon and ecosystem exposure

#### Buyer Fit

- Privacy infrastructure teams
- FHE startups
- HR or payroll SaaS buyers
- Crypto compliance and enterprise tooling teams

### Microns

#### Listing Title

ConfidentialPayroll v2 - privacy-first payroll product for FHE and enterprise infrastructure buyers

#### Summary

ConfidentialPayroll v2 is best positioned as a strategic product acquisition for a buyer expanding into privacy-preserving finance, HR, or enterprise blockchain tooling. The strongest angle is differentiated IP, technical execution, and demo readiness rather than current revenue.

## Marketplace Positioning Notes

### Flippa

Best if you package the sale as a codebase, demo property, and strategic domain or social bundle. If you do not have revenue, frame it as a high-quality technical asset, not as an operating business.

### Empire Flippers

Use only if you later convert this into a revenue-generating SaaS or service. It is not the right first listing for a pre-revenue project.

## Outreach Targets

Prioritize these channels before listing the project for sale:

- Zama community channels
- DoraHacks project page
- Product Hunt launch
- Direct outreach to privacy infrastructure founders
- Direct outreach to HR-tech or payroll SaaS operators

## Platform References

- Vercel project configuration: https://vercel.com/docs/project-configuration
- Vercel CLI deploy: https://vercel.com/docs/cli/deploy
- Vercel static site example: https://vercel.com/new/templates/other/html-starter
- DoraHacks platform: https://dorahacks.io
- Product Hunt posting help: https://help.producthunt.com/en/articles/479557-how-to-post-a-product
- Acquire seller FAQ: https://help.acquire.com/seller-faqs-1
- Microns seller page: https://www.microns.io/sell-your-startup
- Flippa app sales: https://support.flippa.com/hc/en-us/articles/360000682816-What-apps-can-be-sold-on-Flippa
- Empire Flippers SaaS sales: https://empireflippers.com/sell-your-saas/
