// ConfidentialPayroll Frontend Integration
// Using fhevmjs for FHE encryption on client-side

import { createInstance, FhevmInstance } from 'fhevmjs';
import { Contract, BrowserProvider } from 'ethers';
import ConfidentialPayrollABI from '../contracts/ConfidentialPayroll.json';

const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS;

class ConfidentialPayrollClient {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.fhevmInstance = null;
    }

    /**
     * Initialize connection to wallet and fhEVM
     */
    async initialize() {
        if (!window.ethereum) {
            throw new Error('Please install MetaMask');
        }

        // Connect to wallet
        this.provider = new BrowserProvider(window.ethereum);
        this.signer = await this.provider.getSigner();

        // Initialize contract
        this.contract = new Contract(
            CONTRACT_ADDRESS,
            ConfidentialPayrollABI,
            this.signer
        );

        // Initialize fhevmjs instance
        // BUG FIX: chain ID was 8009 (wrong) — Zama Sepolia is actually 9000.
        // Spent way too long debugging why fhevmjs was rejecting the network before
        // checking the Zama docs again. Classic "read the docs" moment.
        this.fhevmInstance = await createInstance({
            chainId: 9000, // Zama Sepolia (was incorrectly 8009 — fixed Feb 2026)
            network: window.ethereum,
            gatewayUrl: 'https://gateway.zama.ai'
        });

        console.log('ConfidentialPayroll initialized');
        
        return true;
    }

    /**
     * Add employee with encrypted salary
     */
    async addEmployee(employeeAddress, salaryUSD, personalDataIPFS, department, level) {
        try {
            // Convert salary to micro-units (6 decimals)
            const salaryMicro = Math.floor(salaryUSD * 1e6);

            // Encrypt salary with FHE
            const encryptedSalary = await this.fhevmInstance.encrypt64(salaryMicro);

            console.log('Adding employee with encrypted salary...');
            console.log('Employee:', employeeAddress);
            console.log('Encrypted salary:', encryptedSalary.handles[0]);

            // Call contract
            const tx = await this.contract.addEmployee(
                employeeAddress,
                encryptedSalary.handles[0],
                encryptedSalary.inputProof,
                personalDataIPFS,
                department,
                level
            );

            console.log('Transaction sent:', tx.hash);
            
            const receipt = await tx.wait();
            
            console.log('Employee added successfully!');
            console.log('Gas used:', receipt.gasUsed.toString());

            return {
                success: true,
                txHash: receipt.hash,
                gasUsed: receipt.gasUsed.toString()
            };

        } catch (error) {
            console.error('Error adding employee:', error);
            throw error;
        }
    }

    /**
     * Update employee salary (encrypted)
     */
    async updateSalary(employeeAddress, newSalaryUSD) {
        try {
            const salaryMicro = Math.floor(newSalaryUSD * 1e6);
            const encryptedSalary = await this.fhevmInstance.encrypt64(salaryMicro);

            const tx = await this.contract.updateSalary(
                employeeAddress,
                encryptedSalary.handles[0],
                encryptedSalary.inputProof
            );

            const receipt = await tx.wait();

            return {
                success: true,
                txHash: receipt.hash
            };

        } catch (error) {
            console.error('Error updating salary:', error);
            throw error;
        }
    }

    /**
     * Add bonus to employee (encrypted)
     */
    async addBonus(employeeAddress, bonusUSD) {
        try {
            const bonusMicro = Math.floor(bonusUSD * 1e6);
            const encryptedBonus = await this.fhevmInstance.encrypt64(bonusMicro);

            const tx = await this.contract.addBonus(
                employeeAddress,
                encryptedBonus.handles[0],
                encryptedBonus.inputProof
            );

            const receipt = await tx.wait();

            console.log('Bonus added successfully!');

            return {
                success: true,
                txHash: receipt.hash
            };

        } catch (error) {
            console.error('Error adding bonus:', error);
            throw error;
        }
    }

    /**
     * Add deduction to employee (encrypted)
     */
    async addDeduction(employeeAddress, deductionUSD) {
        try {
            const deductionMicro = Math.floor(deductionUSD * 1e6);
            const encryptedDeduction = await this.fhevmInstance.encrypt64(deductionMicro);

            const tx = await this.contract.addDeduction(
                employeeAddress,
                encryptedDeduction.handles[0],
                encryptedDeduction.inputProof
            );

            const receipt = await tx.wait();

            return {
                success: true,
                txHash: receipt.hash
            };

        } catch (error) {
            console.error('Error adding deduction:', error);
            throw error;
        }
    }

    /**
     * Run monthly payroll
     */
    async runPayroll() {
        try {
            console.log('Running payroll...');
            console.log('All calculations will happen on encrypted data!');

            const tx = await this.contract.runPayroll();
            const receipt = await tx.wait();

            // Parse events
            const event = receipt.logs
                .map(log => {
                    try {
                        return this.contract.interface.parseLog(log);
                    } catch {
                        return null;
                    }
                })
                .find(e => e && e.name === 'PayrollRunStarted');

            if (event) {
                console.log('Payroll run completed!');
                console.log('Run ID:', event.args.runId.toString());
                console.log('Employees processed:', event.args.employeeCount.toString());
            }

            return {
                success: true,
                runId: event?.args.runId.toString(),
                employeeCount: event?.args.employeeCount.toString(),
                txHash: receipt.hash,
                gasUsed: receipt.gasUsed.toString()
            };

        } catch (error) {
            console.error('Error running payroll:', error);
            throw error;
        }
    }

    /**
     * Request salary decryption via Gateway
     * Employee can decrypt their own salary
     */
    async requestSalaryDecryption() {
        try {
            console.log('Requesting salary decryption via Zama Gateway...');

            const tx = await this.contract.requestSalaryDecryption();
            const receipt = await tx.wait();

            const event = receipt.logs
                .map(log => {
                    try {
                        return this.contract.interface.parseLog(log);
                    } catch {
                        return null;
                    }
                })
                .find(e => e && e.name === 'DecryptionRequested');

            if (event) {
                const requestId = event.args.requestId.toString();
                console.log('Decryption request submitted:', requestId);

                // Wait for Gateway callback (in production, use event listener)
                console.log('Waiting for Gateway to process...');

                return {
                    success: true,
                    requestId,
                    txHash: receipt.hash
                };
            }

        } catch (error) {
            console.error('Error requesting decryption:', error);
            throw error;
        }
    }

    /**
     * Get employee's encrypted payment for a payroll run
     */
    async getMyPayment(runId) {
        try {
            const encryptedPayment = await this.contract.getMyPayment(runId);

            console.log('Encrypted payment handle:', encryptedPayment);

            // Decrypt locally (requires employee's private key)
            // In production, this would use Gateway threshold decryption
            const decryptedPayment = await this.fhevmInstance.decrypt(
                CONTRACT_ADDRESS,
                encryptedPayment
            );

            const paymentUSD = Number(decryptedPayment) / 1e6;

            return {
                success: true,
                encryptedHandle: encryptedPayment,
                decryptedAmount: paymentUSD
            };

        } catch (error) {
            console.error('Error getting payment:', error);
            throw error;
        }
    }

    /**
     * Audit payroll run (auditor role)
     */
    async auditPayrollRun(runId) {
        try {
            const auditData = await this.contract.auditPayrollRun(runId);

            return {
                timestamp: new Date(Number(auditData.timestamp) * 1000),
                employeeCount: Number(auditData.employeeCount),
                auditHash: auditData.auditHash,
                isFinalized: auditData.isFinalized
            };

        } catch (error) {
            console.error('Error auditing payroll:', error);
            throw error;
        }
    }

    /**
     * Get employee info
     */
    async getEmployeeInfo(employeeAddress) {
        try {
            const info = await this.contract.getEmployeeInfo(employeeAddress);

            return {
                isActive: info.isActive,
                employmentStartDate: new Date(Number(info.employmentStartDate) * 1000),
                lastPaymentTimestamp: Number(info.lastPaymentTimestamp) ? 
                    new Date(Number(info.lastPaymentTimestamp) * 1000) : null,
                encryptedPersonalData: info.encryptedPersonalData,
                department: Number(info.department),
                level: Number(info.level)
            };

        } catch (error) {
            console.error('Error getting employee info:', error);
            throw error;
        }
    }

    /**
     * Get active employee count
     */
    async getActiveEmployeeCount() {
        try {
            const count = await this.contract.getActiveEmployeeCount();
            return Number(count);
        } catch (error) {
            console.error('Error getting employee count:', error);
            throw error;
        }
    }

    /**
     * Fund company treasury
     */
    async fundTreasury(amountETH) {
        try {
            const tx = await this.contract.fundTreasury({
                value: ethers.parseEther(amountETH.toString())
            });

            const receipt = await tx.wait();

            return {
                success: true,
                txHash: receipt.hash
            };

        } catch (error) {
            console.error('Error funding treasury:', error);
            throw error;
        }
    }

    /**
     * Get connected wallet address
     */
    async getAddress() {
        return await this.signer.getAddress();
    }

    /**
     * Check if user has role
     */
    async hasRole(role, address) {
        try {
            const roleHash = ethers.id(role); // keccak256 hash
            return await this.contract.hasRole(roleHash, address);
        } catch (error) {
            return false;
        }
    }
}

// Export singleton instance
const payrollClient = new ConfidentialPayrollClient();

export default payrollClient;

// React Hook for easy integration
export function useConfidentialPayroll() {
    const [client, setClient] = React.useState(null);
    const [isInitialized, setIsInitialized] = React.useState(false);
    const [error, setError] = React.useState(null);

    React.useEffect(() => {
        async function init() {
            try {
                await payrollClient.initialize();
                setClient(payrollClient);
                setIsInitialized(true);
            } catch (err) {
                setError(err.message);
                console.error('Initialization error:', err);
            }
        }

        init();
    }, []);

    return {
        client,
        isInitialized,
        error
    };
}
