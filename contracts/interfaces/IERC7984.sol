// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";

/**
 * @title IERC7984
 * @notice Interface for ERC-7984: Confidential Fungible Token Standard
 * @dev All amounts are represented as FHE encrypted euint64 ciphertexts.
 *      The `bytes32` return type is used for public-facing functions to
 *      return the ciphertext handle, while internal logic uses `euint64`.
 *
 * Standard: https://eips.ethereum.org/EIPS/eip-7984
 * Authors: Aryeh Greenberg, Ernesto García, Hadrien Croubois, Ghazi Ben Amor,
 *          Clement Danjou, Joseph Andre Turk, Silas Davis, Nicolas Pasquier
 */
interface IERC7984 {

    // =========================================================================
    // Events
    // =========================================================================

    /**
     * @notice Emitted when tokens are transferred.
     * @dev The amounts are NOT included to preserve confidentiality.
     *      Indexers should use `confidentialBalanceOf` to get updated balances.
     */
    event ConfidentialTransfer(
        address indexed from,
        address indexed to
    );

    /**
     * @notice Emitted when an operator is approved or revoked.
     */
    event OperatorSet(
        address indexed owner,
        address indexed operator,
        uint256 expiration
    );

    // =========================================================================
    // Metadata
    // =========================================================================

    /// @notice Returns the token name.
    function name() external view returns (string memory);

    /// @notice Returns the token symbol.
    function symbol() external view returns (string memory);

    /// @notice Returns the number of decimals (plaintext uint8).
    function decimals() external view returns (uint8);

    /// @notice Returns the metadata URI (ERC-7572 schema).
    function contractURI() external view returns (string memory);

    // =========================================================================
    // ERC-165 Support
    // =========================================================================

    /**
     * @notice Returns true if this contract implements `interfaceId`.
     * @dev MUST return true for 0x4958f2a4 (ERC-7984 interface ID).
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);

    // =========================================================================
    // Supply & Balances
    // =========================================================================

    /**
     * @notice Returns the total token supply as an encrypted handle (bytes32).
     * @dev The handle can be decrypted by authorized parties via Gateway.
     */
    function confidentialTotalSupply() external view returns (bytes32);

    /**
     * @notice Returns the encrypted balance handle of `account`.
     * @dev Only `account` (and approved operators) can decrypt this via Gateway.
     */
    function confidentialBalanceOf(address account) external view returns (bytes32);

    // =========================================================================
    // Operators
    // =========================================================================

    /**
     * @notice Returns true if `operator` is currently authorized for `holder`.
     * @param holder   The token holder.
     * @param operator The potential operator.
     */
    function isOperator(address holder, address operator) external view returns (bool);

    /**
     * @notice Approves `operator` to transfer tokens on behalf of msg.sender until `expiration`.
     * @param operator   The address to grant operator rights.
     * @param expiration Unix timestamp after which the operator authorization expires.
     */
    function setOperator(address operator, uint256 expiration) external;

    // =========================================================================
    // Transfers (with inputProof - for new ciphertext values)
    // =========================================================================

    /**
     * @notice Transfers `encryptedAmount` to `to` with proof that the caller knows the plaintext.
     * @param to              The recipient.
     * @param encryptedAmount The FHE input ciphertext (from fhevm-js).
     * @param inputProof      Zero-knowledge proof binding the ciphertext to msg.sender.
     * @return transferred    The encrypted amount actually transferred.
     */
    function confidentialTransfer(
        address to,
        einput encryptedAmount,
        bytes calldata inputProof
    ) external returns (euint64 transferred);

    /**
     * @notice Transfers `encryptedAmount` from `from` to `to` (operator call).
     * @param from            The token holder.
     * @param to              The recipient.
     * @param encryptedAmount The FHE input ciphertext.
     * @param inputProof      Zero-knowledge proof.
     * @return transferred    The encrypted amount actually transferred.
     */
    function confidentialTransferFrom(
        address from,
        address to,
        einput encryptedAmount,
        bytes calldata inputProof
    ) external returns (euint64 transferred);

    // =========================================================================
    // Transfers (without inputProof - reuse existing allowed ciphertext)
    // =========================================================================

    /**
     * @notice Transfers `amount` (already allowed ciphertext) to `to`.
     * @dev Caller must already have ACL permission on `amount`.
     * @param to     The recipient.
     * @param amount An existing euint64 that the caller is allowed to use.
     * @return transferred The encrypted amount actually transferred.
     */
    function confidentialTransfer(
        address to,
        euint64 amount
    ) external returns (euint64 transferred);

    /**
     * @notice Transfers `amount` (already allowed ciphertext) from `from` to `to`.
     * @param from   The token holder.
     * @param to     The recipient.
     * @param amount An existing euint64 that the caller is allowed to use.
     * @return transferred The encrypted amount actually transferred.
     */
    function confidentialTransferFrom(
        address from,
        address to,
        euint64 amount
    ) external returns (euint64 transferred);
}
