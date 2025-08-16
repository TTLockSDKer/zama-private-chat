// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {FHE, ebool, euint32, euint64, externalEuint32, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import "./ConfidentialTypes.sol";

/**
 * @title ConfidentialBanking
 * @dev 加密银行系统（Zama FHE）
 */
contract ConfidentialBanking is SepoliaConfig, Ownable, ReentrancyGuard, Pausable {
    using ConfidentialTypes for *;

    mapping(address => euint64) private balances;
    ConfidentialTypes.WithdrawRequest[] private withdrawRequests;
    mapping(address => uint256[]) private userWithdrawIds;
    mapping(uint256 => uint256) private decryptionToWithdrawRequest;

    ConfidentialTypes.RedPacket[] private redPackets;
    mapping(address => uint32[]) private userRedPacketIds;
    uint32 private redPacketCounter;

    uint256 public constant MIN_DEPOSIT = 0.001 ether;
    uint256 public constant MAX_DEPOSIT = 100 ether;
    uint256 public constant MIN_WITHDRAW = 0.001 ether;
    uint256 public constant MAX_WITHDRAW = 10 ether;

    uint64 public constant RED_PACKET_EXPIRE_TIME = 7 days;

    euint64 private ENCRYPTED_ZERO;
    bool private encryptedZeroInitialized;

    event Deposited(address indexed user, uint256 amount);
    event WithdrawRequested(uint256 indexed requestId, address indexed user);
    event WithdrawCompleted(uint256 indexed requestId, address indexed user, uint256 amount);
    event Transferred(address indexed from, address indexed to);
    event RedPacketCreated(uint32 indexed packetId, address indexed sender, address indexed recipient, string message);
    event RedPacketClaimed(uint32 indexed packetId, address indexed sender, address indexed recipient);
    event RedPacketExpired(uint32 indexed packetId, address indexed sender, address indexed recipient);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function _initializeEncryptedZero() private {
        if (!encryptedZeroInitialized) {
            ENCRYPTED_ZERO = FHE.asEuint64(0);
            FHE.allowThis(ENCRYPTED_ZERO);
            encryptedZeroInitialized = true;
        }
    }

    /**
     * @notice 存款
     */
    function deposit() external payable nonReentrant whenNotPaused {
        require(msg.value >= MIN_DEPOSIT && msg.value <= MAX_DEPOSIT, "Invalid deposit amount");

        euint64 currentBalance = balances[msg.sender];
        euint64 depositAmount = FHE.asEuint64(uint64(msg.value));

        euint64 newBalance;
        if (FHE.isInitialized(currentBalance)) {
            newBalance = FHE.add(currentBalance, depositAmount);
        } else {
            newBalance = depositAmount;
        }

        FHE.allow(newBalance, msg.sender);
        FHE.allowThis(newBalance);
        balances[msg.sender] = newBalance;

        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice 加密转账
     * @param to 接收者
     * @param encryptedAmount 加密金额
     * @param inputProof 证明
     */
    function transfer(
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external nonReentrant whenNotPaused {
        require(to != address(0) && to != msg.sender, "Invalid recipient");

        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        require(FHE.isSenderAllowed(amount), "Unauthorized access to encrypted amount");

        euint64 senderBalance = balances[msg.sender];
        euint64 recipientBalance = balances[to];
        ebool hasEnoughBalance = FHE.ge(senderBalance, amount);

        FHE.allowThis(hasEnoughBalance);
        _initializeEncryptedZero();

        euint64 actualTransferAmount = FHE.select(hasEnoughBalance, amount, ENCRYPTED_ZERO);
        FHE.allow(actualTransferAmount, msg.sender);
        FHE.allow(actualTransferAmount, to);
        FHE.allowThis(actualTransferAmount);

        euint64 newSenderBalance = FHE.sub(senderBalance, actualTransferAmount);
        euint64 newRecipientBalance = FHE.select(
            FHE.asEbool(FHE.isInitialized(recipientBalance)),
            FHE.add(recipientBalance, actualTransferAmount),
            actualTransferAmount
        );

        balances[msg.sender] = newSenderBalance;
        balances[to] = newRecipientBalance;
        FHE.allow(newSenderBalance, msg.sender);
        FHE.allow(newRecipientBalance, to);
        FHE.allowThis(newSenderBalance);
        FHE.allowThis(newRecipientBalance);

        emit Transferred(msg.sender, to);
    }

    /**
     * @notice 发起提现请求
     * @param encryptedAmount 加密金额
     * @param inputProof 证明
     * @return requestId 提现请求ID
     */
    function withdraw(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external nonReentrant whenNotPaused returns (uint256 requestId) {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        require(FHE.isSenderAllowed(amount), "Unauthorized access to encrypted amount");

        euint64 currentBalance = balances[msg.sender];
        ebool hasEnoughBalance = FHE.ge(currentBalance, amount);
        _initializeEncryptedZero();

        euint64 actualWithdrawAmount = FHE.select(hasEnoughBalance, amount, ENCRYPTED_ZERO);
        euint64 newBalance = FHE.sub(currentBalance, actualWithdrawAmount);
        balances[msg.sender] = newBalance;
        FHE.allow(newBalance, msg.sender);
        FHE.allowThis(newBalance);

        requestId = withdrawRequests.length;
        withdrawRequests.push(ConfidentialTypes.WithdrawRequest({
            id: requestId,
            user: msg.sender,
            amount: actualWithdrawAmount,
            timestamp: uint64(block.timestamp),
            processed: false
        }));
        userWithdrawIds[msg.sender].push(requestId);

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(actualWithdrawAmount);
        uint256 decryptionRequestId = FHE.requestDecryption(cts, this.withdrawCallback.selector);
        decryptionToWithdrawRequest[decryptionRequestId] = requestId;

        emit WithdrawRequested(requestId, msg.sender);
        return requestId;
    }

    /**
     * @notice 提现回调
     * @param decryptionRequestId 解密请求ID
     * @param decryptedAmount 解密后的金额
     * @param signatures 签名
     */
    function withdrawCallback(
        uint256 decryptionRequestId,
        uint64 decryptedAmount,
        bytes[] memory signatures
    ) external {
        FHE.checkSignatures(decryptionRequestId, signatures);

        uint256 withdrawRequestId = decryptionToWithdrawRequest[decryptionRequestId];
        require(withdrawRequestId < withdrawRequests.length, "Invalid withdraw request");

        ConfidentialTypes.WithdrawRequest storage request = withdrawRequests[withdrawRequestId];
        require(!request.processed, "Already processed");
        require(decryptedAmount >= MIN_WITHDRAW && decryptedAmount <= MAX_WITHDRAW, "Invalid amount");
        require(address(this).balance >= decryptedAmount, "Insufficient contract balance");

        request.processed = true;
        delete decryptionToWithdrawRequest[decryptionRequestId];

        (bool success, ) = payable(request.user).call{value: decryptedAmount}("");
        require(success, "Transfer failed");

        emit WithdrawCompleted(withdrawRequestId, request.user, decryptedAmount);
    }

    /**
     * @notice 获取余额句柄
     */
    function getBalanceHandle(address user) external view returns (euint64) {
        return balances[user];
    }

    /**
     * @notice 获取用户提现请求ID列表
     */
    function getUserWithdrawRequests(address user) external view returns (uint256[] memory) {
        return userWithdrawIds[user];
    }

    /**
     * @notice 获取提现请求信息
     */
    function getWithdrawRequest(uint256 requestId) external view returns (
        address user,
        uint64 timestamp,
        bool processed
    ) {
        require(requestId < withdrawRequests.length, "Invalid request");
        ConfidentialTypes.WithdrawRequest memory request = withdrawRequests[requestId];
        return (request.user, request.timestamp, request.processed);
    }

    /**
     * @notice 获取提现金额句柄（仅申请者）
     */
    function getWithdrawAmountHandle(uint256 requestId) external view returns (euint64) {
        require(requestId < withdrawRequests.length, "Invalid request");
        ConfidentialTypes.WithdrawRequest memory request = withdrawRequests[requestId];
        require(request.user == msg.sender, "Not your withdraw request");
        return request.amount;
    }

    /**
     * @notice 提取合约余额（仅所有者）
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Emergency withdraw failed");
    }

    receive() external payable {}

    /**
     * @notice 创建红包
     */
    function createRedPacket(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof,
        address recipient,
        string calldata message
    ) external nonReentrant whenNotPaused returns (uint32 packetId) {
        require(recipient != address(0) && recipient != msg.sender, "Invalid recipient");
        require(bytes(message).length <= 100, "Message too long");

        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        require(FHE.isSenderAllowed(amount), "Unauthorized access to encrypted amount");

        euint64 senderBalance = balances[msg.sender];
        ebool hasEnoughBalance = FHE.ge(senderBalance, amount);
        _initializeEncryptedZero();

        euint64 actualAmount = FHE.select(hasEnoughBalance, amount, ENCRYPTED_ZERO);
        euint64 newSenderBalance = FHE.sub(senderBalance, actualAmount);

        packetId = redPacketCounter++;
        redPackets.push(ConfidentialTypes.RedPacket({
            id: packetId,
            sender: msg.sender,
            recipient: recipient,
            amount: actualAmount,
            expireTime: uint64(block.timestamp) + RED_PACKET_EXPIRE_TIME,
            claimed: false
        }));

        balances[msg.sender] = newSenderBalance;
        FHE.allow(newSenderBalance, msg.sender);
        FHE.allowThis(newSenderBalance);
        FHE.allow(actualAmount, msg.sender);
        FHE.allow(actualAmount, recipient);
        FHE.allowThis(actualAmount);

        userRedPacketIds[msg.sender].push(packetId);
        userRedPacketIds[recipient].push(packetId);

        emit RedPacketCreated(packetId, msg.sender, recipient, message);
        return packetId;
    }

    /**
     * @notice 领取红包
     */
    function claimRedPacket(uint32 packetId) external nonReentrant whenNotPaused {
        require(packetId < redPackets.length, "Red packet does not exist");
        ConfidentialTypes.RedPacket storage redPacket = redPackets[packetId];
        require(redPacket.recipient == msg.sender, "Not your red packet");
        require(!redPacket.claimed, "Already claimed");
        require(block.timestamp <= redPacket.expireTime, "Red packet expired");

        redPacket.claimed = true;

        euint64 currentBalance = balances[msg.sender];
        euint64 newBalance;
        if (FHE.isInitialized(currentBalance)) {
            newBalance = FHE.add(currentBalance, redPacket.amount);
        } else {
            newBalance = redPacket.amount;
        }

        balances[msg.sender] = newBalance;
        FHE.allow(newBalance, msg.sender);
        FHE.allowThis(newBalance);

        emit RedPacketClaimed(packetId, redPacket.sender, msg.sender);
    }

    /**
     * @notice 回收过期红包
     */
    function reclaimExpiredRedPacket(uint32 packetId) external nonReentrant whenNotPaused {
        require(packetId < redPackets.length, "Red packet does not exist");
        ConfidentialTypes.RedPacket storage redPacket = redPackets[packetId];
        require(redPacket.sender == msg.sender, "Not your red packet");
        require(!redPacket.claimed, "Already claimed");
        require(block.timestamp > redPacket.expireTime, "Not expired yet");

        redPacket.claimed = true;
        euint64 currentBalance = balances[msg.sender];
        euint64 newBalance = FHE.add(currentBalance, redPacket.amount);
        balances[msg.sender] = newBalance;
        FHE.allow(newBalance, msg.sender);
        FHE.allowThis(newBalance);

        emit RedPacketExpired(packetId, msg.sender, redPacket.recipient);
    }

    /**
     * @notice 获取红包信息
     */
    function getRedPacket(uint32 packetId) external view returns (
        address sender,
        address recipient,
        uint64 expireTime,
        bool claimed
    ) {
        require(packetId < redPackets.length, "Red packet does not exist");
        ConfidentialTypes.RedPacket memory redPacket = redPackets[packetId];
        return (redPacket.sender, redPacket.recipient, redPacket.expireTime, redPacket.claimed);
    }

    /**
     * @notice 获取红包金额句柄（发送者或接收者）
     */
    function getRedPacketAmountHandle(uint32 packetId) external view returns (euint64) {
        require(packetId < redPackets.length, "Red packet does not exist");
        ConfidentialTypes.RedPacket memory redPacket = redPackets[packetId];
        require(
            redPacket.sender == msg.sender || redPacket.recipient == msg.sender,
            "No permission"
        );
        return redPacket.amount;
    }

    /**
     * @notice 获取用户红包ID列表
     */
    function getUserRedPackets(address user) external view returns (uint32[] memory) {
        return userRedPacketIds[user];
    }

    /**
     * @notice 暂停
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice 解除暂停
     */
    function unpause() external onlyOwner {
        _unpause();
    }
}