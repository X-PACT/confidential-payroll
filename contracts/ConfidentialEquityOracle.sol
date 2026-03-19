// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";
import "fhevm/gateway/GatewayCaller.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ConfidentialEquityOracle
 * @notice Pay equity and compensation-compliance proofs over encrypted salary data.
 *
 * @dev fhEVM v0.6 removed generic encrypted multiplication and division. The
 *      aggregate claim paths therefore normalize department and gender totals
 *      using scalar shifts that correspond to HR-supplied power-of-two sample
 *      buckets. That keeps the computation fully encrypted and audit-friendly
 *      without leaking individual salaries.
 */
contract ConfidentialEquityOracle is AccessControl, ReentrancyGuard, GatewayCaller {
    bytes32 public constant HR_ROLE = keccak256("HR_ROLE");
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");

    enum ClaimType {
        ABOVE_MINIMUM_WAGE,
        WITHIN_SALARY_BAND,
        ABOVE_DEPARTMENT_MEDIAN,
        GENDER_PAY_EQUITY,
        ABOVE_CUSTOM_THRESHOLD,
        AVERAGE_DEPARTMENT_SALARY,
        GENDER_PAY_GAP
    }

    struct EquityCertificate {
        uint256 certId;
        address employee;
        ClaimType claimType;
        uint8 department;
        bool result;
        uint256 issuedAt;
        bytes32 auditReference;
        bool isValid;
    }

    struct SalaryBand {
        euint64 minimum;
        euint64 maximum;
        uint8 level;
    }

    struct DepartmentAggregate {
        euint64 totalSalary;
        uint32 employeeCount;
        uint8 divisorShift;
        bool isConfigured;
    }

    struct GenderAggregate {
        euint64 totalSalary;
        uint32 employeeCount;
        uint8 divisorShift;
        bool isConfigured;
    }

    struct PendingClaim {
        address employee;
        ClaimType claimType;
        uint8 department;
        bytes32 auditReference;
        bool exists;
    }

    euint64 public encryptedMinimumWage;

    mapping(uint8 => euint64) public deptMedian;
    mapping(uint8 => SalaryBand) public salaryBands;
    mapping(uint8 => DepartmentAggregate) private _departmentAggregates;
    mapping(uint8 => GenderAggregate) private _maleDepartmentAggregates;
    mapping(uint8 => GenderAggregate) private _femaleDepartmentAggregates;
    mapping(uint8 => uint16) public genderGapThresholdBps;
    mapping(uint256 => EquityCertificate) public certificates;
    mapping(address => uint256[]) public employeeCerts;
    mapping(address => uint8) public employees_department;
    mapping(address => uint8) public employees_level;
    mapping(address => uint8) public employees_gender;
    mapping(uint256 => PendingClaim) private _pendingClaims;

    uint256 public nextCertId = 1;
    uint256 private _nextRequestId = 1;
    address public payrollContract;

    event CertificateRequested(uint256 indexed requestId, address indexed employee, ClaimType claimType);
    event CertificateIssued(uint256 indexed certId, address indexed employee, ClaimType claimType, bool result);
    event ReferenceUpdated(string referenceType, uint256 timestamp);
    event MinimumWageSet(uint256 timestamp);
    event DeptMedianSet(uint8 indexed department, uint256 timestamp);
    event SalaryBandSet(uint8 indexed level, uint256 timestamp);
    event DepartmentAggregateSet(uint8 indexed department, uint32 employeeCount, uint8 divisorShift, uint256 timestamp);
    event GenderAggregateSet(
        uint8 indexed department,
        uint8 indexed gender,
        uint32 employeeCount,
        uint8 divisorShift,
        uint16 gapThresholdBps,
        uint256 timestamp
    );

    constructor(address _payrollContract, address _admin) {
        require(_payrollContract != address(0), "Equity: zero address");
        require(_admin != address(0), "Equity: zero admin");

        payrollContract = _payrollContract;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(HR_ROLE, _admin);
        _grantRole(REGULATOR_ROLE, _admin);
    }

    function setMinimumWage(
        einput _encryptedWage,
        bytes calldata inputProof
    ) external onlyRole(HR_ROLE) {
        encryptedMinimumWage = TFHE.asEuint64(_encryptedWage, inputProof);
        TFHE.allow(encryptedMinimumWage, address(this));
        emit MinimumWageSet(block.timestamp);
        emit ReferenceUpdated("MINIMUM_WAGE", block.timestamp);
    }

    function setDepartmentMedian(
        uint8 dept,
        einput _encMedian,
        bytes calldata inputProof
    ) external onlyRole(HR_ROLE) {
        deptMedian[dept] = TFHE.asEuint64(_encMedian, inputProof);
        TFHE.allow(deptMedian[dept], address(this));
        emit DeptMedianSet(dept, block.timestamp);
        emit ReferenceUpdated("DEPT_MEDIAN", block.timestamp);
    }

    function setSalaryBand(
        uint8 level,
        einput _encMin,
        bytes calldata proofMin,
        einput _encMax,
        bytes calldata proofMax
    ) external onlyRole(HR_ROLE) {
        salaryBands[level] = SalaryBand({
            minimum: TFHE.asEuint64(_encMin, proofMin),
            maximum: TFHE.asEuint64(_encMax, proofMax),
            level: level
        });

        TFHE.allow(salaryBands[level].minimum, address(this));
        TFHE.allow(salaryBands[level].maximum, address(this));

        emit SalaryBandSet(level, block.timestamp);
        emit ReferenceUpdated("SALARY_BAND", block.timestamp);
    }

    function setDepartmentAggregate(
        uint8 dept,
        einput _encTotalSalary,
        bytes calldata inputProof,
        uint32 employeeCount,
        uint8 divisorShift
    ) external onlyRole(HR_ROLE) {
        require(employeeCount > 0, "Equity: empty aggregate");
        require((1 << divisorShift) <= employeeCount, "Equity: invalid divisor shift");

        _departmentAggregates[dept] = DepartmentAggregate({
            totalSalary: TFHE.asEuint64(_encTotalSalary, inputProof),
            employeeCount: employeeCount,
            divisorShift: divisorShift,
            isConfigured: true
        });

        TFHE.allow(_departmentAggregates[dept].totalSalary, address(this));

        emit DepartmentAggregateSet(dept, employeeCount, divisorShift, block.timestamp);
        emit ReferenceUpdated("DEPARTMENT_AGGREGATE", block.timestamp);
    }

    function setGenderAggregate(
        uint8 dept,
        uint8 gender,
        einput _encTotalSalary,
        bytes calldata inputProof,
        uint32 employeeCount,
        uint8 divisorShift,
        uint16 gapThreshold
    ) external onlyRole(HR_ROLE) {
        require(gender == 1 || gender == 2, "Equity: invalid gender");
        require(employeeCount > 0, "Equity: empty aggregate");
        require((1 << divisorShift) <= employeeCount, "Equity: invalid divisor shift");

        GenderAggregate memory aggregate = GenderAggregate({
            totalSalary: TFHE.asEuint64(_encTotalSalary, inputProof),
            employeeCount: employeeCount,
            divisorShift: divisorShift,
            isConfigured: true
        });

        if (gender == 1) {
            _maleDepartmentAggregates[dept] = aggregate;
            TFHE.allow(_maleDepartmentAggregates[dept].totalSalary, address(this));
        } else {
            _femaleDepartmentAggregates[dept] = aggregate;
            TFHE.allow(_femaleDepartmentAggregates[dept].totalSalary, address(this));
        }

        if (gapThreshold > 0) {
            genderGapThresholdBps[dept] = gapThreshold;
        }

        emit GenderAggregateSet(
            dept,
            gender,
            employeeCount,
            divisorShift,
            genderGapThresholdBps[dept],
            block.timestamp
        );
        emit ReferenceUpdated("GENDER_AGGREGATE", block.timestamp);
    }

    function requestEquityCertificate(
        address employee,
        ClaimType claimType,
        euint64 encryptedSalary,
        bytes32 auditReference
    ) external nonReentrant returns (uint256 requestId) {
        ebool claimResult = _evaluateClaim(
            claimType,
            encryptedSalary,
            employees_department[employee],
            employees_level[employee]
        );

        uint256[] memory cts = new uint256[](1);
        cts[0] = Gateway.toUint256(claimResult);

        requestId = _nextRequestId++;
        _pendingClaims[requestId] = PendingClaim({
            employee: employee,
            claimType: claimType,
            department: employees_department[employee],
            auditReference: auditReference,
            exists: true
        });

        Gateway.requestDecryption(
            cts,
            this.equityDecryptionCallback.selector,
            requestId,
            block.timestamp + 300,
            false
        );

        emit CertificateRequested(requestId, employee, claimType);
    }

    function registerEmployee(
        address employee,
        uint8 dept,
        uint8 level,
        uint8 gender
    ) external {
        require(msg.sender == payrollContract, "Equity: only payroll");
        employees_department[employee] = dept;
        employees_level[employee] = level;
        employees_gender[employee] = gender;
    }

    function equityDecryptionCallback(
        uint256 requestId,
        bool decryptedResult
    ) external onlyGateway returns (bool) {
        PendingClaim storage pending = _pendingClaims[requestId];
        require(pending.exists, "Equity: unknown request");

        uint256 certId = nextCertId++;

        certificates[certId] = EquityCertificate({
            certId: certId,
            employee: pending.employee,
            claimType: pending.claimType,
            department: pending.department,
            result: decryptedResult,
            issuedAt: block.timestamp,
            auditReference: pending.auditReference,
            isValid: true
        });

        employeeCerts[pending.employee].push(certId);
        delete _pendingClaims[requestId];

        emit CertificateIssued(certId, pending.employee, pending.claimType, decryptedResult);
        return decryptedResult;
    }

    function getDepartmentAggregate(uint8 dept)
        external
        view
        returns (uint32 employeeCount, uint8 divisorShift, bool isConfigured)
    {
        DepartmentAggregate storage aggregate = _departmentAggregates[dept];
        return (aggregate.employeeCount, aggregate.divisorShift, aggregate.isConfigured);
    }

    function getGenderAggregate(uint8 dept, uint8 gender)
        external
        view
        returns (uint32 employeeCount, uint8 divisorShift, bool isConfigured, uint16 gapThreshold)
    {
        GenderAggregate storage aggregate = gender == 1
            ? _maleDepartmentAggregates[dept]
            : _femaleDepartmentAggregates[dept];
        return (
            aggregate.employeeCount,
            aggregate.divisorShift,
            aggregate.isConfigured,
            genderGapThresholdBps[dept]
        );
    }

    function getEmployeeCertificates(address employee) external view returns (uint256[] memory) {
        return employeeCerts[employee];
    }

    function getCertificate(uint256 certId) external view returns (EquityCertificate memory) {
        return certificates[certId];
    }

    function verifyCertificate(uint256 certId)
        external
        view
        onlyRole(REGULATOR_ROLE)
        returns (
            address employee,
            ClaimType claimType,
            bool result,
            uint256 issuedAt,
            bool isValid
        )
    {
        EquityCertificate storage cert = certificates[certId];
        return (cert.employee, cert.claimType, cert.result, cert.issuedAt, cert.isValid);
    }

    function getComplianceSummary()
        external
        view
        onlyRole(REGULATOR_ROLE)
        returns (uint256 totalCertificatesIssued, uint256 latestCertId)
    {
        return (nextCertId - 1, nextCertId - 1);
    }

    function _evaluateClaim(
        ClaimType claimType,
        euint64 salary,
        uint8 dept,
        uint8 level
    ) internal returns (ebool) {
        if (claimType == ClaimType.ABOVE_MINIMUM_WAGE) {
            return TFHE.gt(salary, encryptedMinimumWage);
        }

        if (claimType == ClaimType.WITHIN_SALARY_BAND) {
            SalaryBand storage band = salaryBands[level];
            ebool aboveMin = TFHE.ge(salary, band.minimum);
            ebool belowMax = TFHE.le(salary, band.maximum);
            return TFHE.and(aboveMin, belowMax);
        }

        if (claimType == ClaimType.ABOVE_DEPARTMENT_MEDIAN) {
            return TFHE.gt(salary, deptMedian[dept]);
        }

        if (claimType == ClaimType.ABOVE_CUSTOM_THRESHOLD) {
            return TFHE.gt(salary, deptMedian[dept]);
        }

        if (claimType == ClaimType.AVERAGE_DEPARTMENT_SALARY) {
            DepartmentAggregate storage aggregate = _departmentAggregates[dept];
            require(aggregate.isConfigured, "Equity: dept aggregate missing");
            return TFHE.ge(salary, _averageFromTotal(aggregate.totalSalary, aggregate.divisorShift));
        }

        if (claimType == ClaimType.GENDER_PAY_EQUITY || claimType == ClaimType.GENDER_PAY_GAP) {
            GenderAggregate storage maleAggregate = _maleDepartmentAggregates[dept];
            GenderAggregate storage femaleAggregate = _femaleDepartmentAggregates[dept];
            require(maleAggregate.isConfigured && femaleAggregate.isConfigured, "Equity: gender aggregate missing");

            euint64 maleAverage = _averageFromTotal(maleAggregate.totalSalary, maleAggregate.divisorShift);
            euint64 femaleAverage = _averageFromTotal(femaleAggregate.totalSalary, femaleAggregate.divisorShift);
            euint64 gapThreshold = _gapThresholdAmount(maleAverage, genderGapThresholdBps[dept]);
            euint64 lowerBound = TFHE.sub(maleAverage, TFHE.min(gapThreshold, maleAverage));

            return TFHE.ge(femaleAverage, lowerBound);
        }

        revert("Equity: unsupported claim");
    }

    function _averageFromTotal(euint64 totalSalary, uint8 divisorShift) internal returns (euint64) {
        return divisorShift == 0 ? totalSalary : TFHE.shr(totalSalary, divisorShift);
    }

    function _gapThresholdAmount(euint64 amount, uint16 thresholdBps) internal returns (euint64) {
        if (thresholdBps == 0) {
            thresholdBps = 500;
        }

        if (thresholdBps <= 625) {
            return TFHE.shr(amount, 4);
        }
        if (thresholdBps <= 1250) {
            return TFHE.shr(amount, 3);
        }
        return TFHE.shr(amount, 2);
    }
}
