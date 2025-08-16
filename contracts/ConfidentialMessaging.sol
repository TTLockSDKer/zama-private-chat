// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {FHE, euint32, externalEuint32, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import "./ConfidentialTypes.sol";

/**
 * @title ConfidentialMessaging
 * @dev 加密消息系统（Zama FHE）
 */
contract ConfidentialMessaging is SepoliaConfig, Ownable, ReentrancyGuard, Pausable {
    using ConfidentialTypes for *;

    ConfidentialTypes.Message[] private messages;

    uint32 public constant MESSAGES_PER_PAGE = 50;
    mapping(address => mapping(uint32 => uint32[])) private userMessagePages;
    mapping(address => uint32) private userPageCount;
    mapping(address => uint32) private userCurrentPageSize;

    mapping(uint32 => mapping(address => bool)) private messageAccess;
    mapping(address => ConfidentialTypes.UserStats) private userStats;

    event MessageSent(uint32 indexed messageId, address indexed sender, address indexed recipient, uint32 chunkCount);
    event MessageRead(uint32 indexed messageId, address indexed reader);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @notice 发送加密消息（多块）
     */
    function sendMessage(
        address recipient,
        externalEuint64[] memory encryptedChunks,
        bytes[] memory inputProofs
    ) external nonReentrant whenNotPaused returns (uint32 messageId) {
        require(recipient != address(0) && recipient != msg.sender, "Invalid recipient");
        require(encryptedChunks.length > 0 && encryptedChunks.length <= 64, "Invalid chunk count (1-64)");
        require(encryptedChunks.length == inputProofs.length, "Chunk/proof count mismatch");

        euint64[] memory processedChunks = new euint64[](encryptedChunks.length);
        for (uint256 i = 0; i < encryptedChunks.length; i++) {
            euint64 chunk = FHE.fromExternal(encryptedChunks[i], inputProofs[i]);
            require(FHE.isInitialized(chunk), "Encrypted chunk not properly initialized");
            require(FHE.isSenderAllowed(chunk), "Unauthorized access to encrypted chunk");
            FHE.allowThis(chunk);
            FHE.allow(chunk, msg.sender);
            FHE.allow(chunk, recipient);
            processedChunks[i] = chunk;
        }

        messageId = uint32(messages.length);
        messages.push(ConfidentialTypes.Message({
            id: messageId,
            sender: msg.sender,
            recipient: recipient,
            content: processedChunks,
            chunkCount: uint32(encryptedChunks.length),
            timestamp: uint32(block.timestamp),
            isRead: false
        }));

        _addMessageToUserPages(msg.sender, messageId);
        _addMessageToUserPages(recipient, messageId);
        messageAccess[messageId][msg.sender] = true;
        messageAccess[messageId][recipient] = true;

        uint64 currentTime = uint64(block.timestamp);
        userStats[msg.sender].sentMessages++;
        userStats[msg.sender].lastActivity = currentTime;
        userStats[recipient].receivedMessages++;
        userStats[recipient].lastActivity = currentTime;

        emit MessageSent(messageId, msg.sender, recipient, uint32(encryptedChunks.length));
        return messageId;
    }

    /**
     * @notice 获取消息内容句柄（多块）
     */
    function getMessageHandles(uint32 messageId) external view returns (euint64[] memory contentChunks) {
        require(messageId < messages.length, "Message not found");
        require(messageAccess[messageId][msg.sender], "Access denied");
        euint64[] memory content = messages[messageId].content;
        require(content.length > 0, "Invalid content structure");
        for (uint256 i = 0; i < content.length; i++) {
            require(FHE.isInitialized(content[i]), "Encrypted content not properly initialized");
            require(FHE.isAllowed(content[i], msg.sender), "No FHE access permission for content");
        }
        return content;
    }

    /**
     * @notice 获取单块消息内容句柄
     */
    function getMessageChunk(uint32 messageId, uint32 chunkIndex) external view returns (euint64 contentChunk) {
        require(messageId < messages.length, "Message not found");
        require(messageAccess[messageId][msg.sender], "Access denied");
        require(chunkIndex < messages[messageId].chunkCount, "Invalid chunk index");
        euint64 chunk = messages[messageId].content[chunkIndex];
        require(FHE.isInitialized(chunk), "Encrypted content not properly initialized");
        require(FHE.isAllowed(chunk, msg.sender), "No FHE access permission for content");
        return chunk;
    }

    /**
     * @notice 标记消息为已读
     */
    function markAsRead(uint32 messageId) external {
        require(messageId < messages.length, "Message not found");
        require(messages[messageId].recipient == msg.sender, "Only recipient can mark as read");
        messages[messageId].isRead = true;
        emit MessageRead(messageId, msg.sender);
    }

    /**
     * @notice 获取消息信息
     */
    function getMessageInfo(uint32 messageId) external view returns (
        address sender,
        address recipient,
        uint32 chunkCount,
        uint32 timestamp,
        bool isRead
    ) {
        require(messageId < messages.length, "Message not found");
        require(messageAccess[messageId][msg.sender], "Access denied");
        ConfidentialTypes.Message memory message = messages[messageId];
        return (message.sender, message.recipient, message.chunkCount, message.timestamp, message.isRead);
    }

    /**
     * @notice 获取当前用户统计
     */
    function getUserStats(address user) external view returns (ConfidentialTypes.UserStats memory) {
        require(user == msg.sender, "Can only query own stats");
        return userStats[user];
    }

    /**
     * @notice 查询：用户全部消息
     */
    function getAllUserMessages(address user) external view returns (MessageQueryResult memory result) {
        require(user == msg.sender, "Can only query own messages");
        uint32 userMessageCount = userStats[user].sentMessages + userStats[user].receivedMessages;
        uint32[] memory allMessageIds = _getAllUserMessageIds(user);
        MessageInfo[] memory messageInfos = new MessageInfo[](allMessageIds.length);
        for (uint256 i = 0; i < allMessageIds.length; i++) {
            uint32 messageId = allMessageIds[i];
            messageInfos[i] = _buildMessageInfo(messageId);
        }
        return MessageQueryResult({
            messages: messageInfos,
            totalMessages: messages.length,
            totalUserMessages: userMessageCount
        });
    }

    /**
     * @notice 查询：用户最新N条消息
     */
    function getLatestUserMessages(address user, uint32 limit) external view returns (MessageQueryResult memory result) {
        require(user == msg.sender, "Can only query own messages");
        require(limit > 0 && limit <= 100, "Invalid limit range (1-100)");
        uint32 userMessageCount = userStats[user].sentMessages + userStats[user].receivedMessages;
        uint32[] memory latestMessageIds = _getLatestUserMessageIds(user, limit);
        MessageInfo[] memory messageInfos = new MessageInfo[](latestMessageIds.length);
        for (uint256 i = 0; i < latestMessageIds.length; i++) {
            uint32 messageId = latestMessageIds[i];
            messageInfos[i] = _buildMessageInfo(messageId);
        }
        return MessageQueryResult({
            messages: messageInfos,
            totalMessages: messages.length,
            totalUserMessages: userMessageCount
        });
    }

    /**
     * @notice 查询：按ID范围
     */
    function getUserMessagesByIdRange(
        address user,
        uint32 startId,
        uint32 endId
    ) external view returns (MessageQueryResult memory result) {
        require(user == msg.sender, "Can only query own messages");
        require(startId <= endId, "Invalid ID range");
        require(endId < messages.length, "End ID exceeds total messages");
        uint32 userMessageCount = userStats[user].sentMessages + userStats[user].receivedMessages;
        uint32[] memory rangeMessageIds = _getUserMessageIdsInRange(user, startId, endId);
        MessageInfo[] memory messageInfos = new MessageInfo[](rangeMessageIds.length);
        for (uint256 i = 0; i < rangeMessageIds.length; i++) {
            uint32 messageId = rangeMessageIds[i];
            messageInfos[i] = _buildMessageInfo(messageId);
        }
        return MessageQueryResult({
            messages: messageInfos,
            totalMessages: messages.length,
            totalUserMessages: userMessageCount
        });
    }

    /**
     * @notice 统一消息查询接口
     * @param queryType 0=全部, 1=最新10条, 2=自定义数量最新
     * @param param1 queryType=2时为limit
     */
    function queryMessages(
        uint8 queryType,
        uint32 param1,
        uint32 /* param2 */
    ) external view returns (MessageQueryResult memory result) {
        address user = msg.sender;
        uint32 userMessageCount = userStats[user].sentMessages + userStats[user].receivedMessages;

        if (queryType == 0) {
            uint32[] memory allMessageIds = _getAllUserMessageIds(user);
            MessageInfo[] memory messageInfos = new MessageInfo[](allMessageIds.length);
            for (uint256 i = 0; i < allMessageIds.length; i++) {
                messageInfos[i] = _buildMessageInfo(allMessageIds[i]);
            }
            return MessageQueryResult({
                messages: messageInfos,
                totalMessages: messages.length,
                totalUserMessages: userMessageCount
            });
        } else if (queryType == 1) {
            uint32[] memory latestMessageIds = _getLatestUserMessageIds(user, 10);
            MessageInfo[] memory messageInfos = new MessageInfo[](latestMessageIds.length);
            for (uint256 i = 0; i < latestMessageIds.length; i++) {
                messageInfos[i] = _buildMessageInfo(latestMessageIds[i]);
            }
            return MessageQueryResult({
                messages: messageInfos,
                totalMessages: messages.length,
                totalUserMessages: userMessageCount
            });
        } else if (queryType == 2) {
            uint32 limit = param1 > 0 ? param1 : 10;
            require(limit <= 100, "Invalid limit range (1-100)");
            uint32[] memory latestMessageIds = _getLatestUserMessageIds(user, limit);
            MessageInfo[] memory messageInfos = new MessageInfo[](latestMessageIds.length);
            for (uint256 i = 0; i < latestMessageIds.length; i++) {
                messageInfos[i] = _buildMessageInfo(latestMessageIds[i]);
            }
            return MessageQueryResult({
                messages: messageInfos,
                totalMessages: messages.length,
                totalUserMessages: userMessageCount
            });
        } else {
            revert("Invalid query type");
        }
    }

    struct MessageQueryResult {
        MessageInfo[] messages;
        uint256 totalMessages;
        uint32 totalUserMessages;
    }

    struct MessageInfo {
        uint32 id;
        address sender;
        address recipient;
        uint32 chunkCount;
        uint32 timestamp;
        bool isRead;
    }

    function _getAllUserMessageIds(address user) internal view returns (uint32[] memory messageIds) {
        uint32 totalUserMessages = userStats[user].sentMessages + userStats[user].receivedMessages;
        if (totalUserMessages == 0) {
            return new uint32[](0);
        }
        messageIds = new uint32[](totalUserMessages);
        uint256 currentIndex = 0;
        for (uint32 pageIndex = 0; pageIndex < userPageCount[user]; pageIndex++) {
            uint32[] memory pageMessages = userMessagePages[user][pageIndex];
            for (uint256 i = 0; i < pageMessages.length; i++) {
                if (currentIndex < totalUserMessages) {
                    messageIds[currentIndex] = pageMessages[i];
                    currentIndex++;
                }
            }
        }
        _sortMessageIdsDesc(messageIds);
        return messageIds;
    }

    function _getLatestUserMessageIds(address user, uint32 limit) internal view returns (uint32[] memory messageIds) {
        uint32 totalUserMessages = userStats[user].sentMessages + userStats[user].receivedMessages;
        if (totalUserMessages == 0) {
            return new uint32[](0);
        }
        uint32 actualLimit = limit > totalUserMessages ? totalUserMessages : limit;
        messageIds = new uint32[](actualLimit);
        uint256 foundCount = 0;
        if (userPageCount[user] > 0) {
            for (uint32 pageIndex = userPageCount[user]; pageIndex > 0 && foundCount < actualLimit; pageIndex--) {
                uint32[] memory pageMessages = userMessagePages[user][pageIndex - 1];
                for (uint256 i = pageMessages.length; i > 0 && foundCount < actualLimit; i--) {
                    messageIds[foundCount] = pageMessages[i - 1];
                    foundCount++;
                }
            }
        }
        _sortMessageIdsDesc(messageIds);
        return messageIds;
    }

    function _getUserMessageIdsInRange(
        address user,
        uint32 startId,
        uint32 endId
    ) internal view returns (uint32[] memory messageIds) {
        uint32[] memory tempIds = new uint32[](endId - startId + 1);
        uint256 foundCount = 0;
        for (uint32 id = startId; id <= endId; id++) {
            if (messageAccess[id][user]) {
                tempIds[foundCount] = id;
                foundCount++;
            }
        }
        messageIds = new uint32[](foundCount);
        for (uint256 i = 0; i < foundCount; i++) {
            messageIds[i] = tempIds[i];
        }
        return messageIds;
    }

    function _buildMessageInfo(uint32 messageId) internal view returns (MessageInfo memory info) {
        require(messageId < messages.length, "Message not found");
        ConfidentialTypes.Message storage message = messages[messageId];
        return MessageInfo({
            id: message.id,
            sender: message.sender,
            recipient: message.recipient,
            chunkCount: message.chunkCount,
            timestamp: message.timestamp,
            isRead: message.isRead
        });
    }

    function _sortMessageIdsDesc(uint32[] memory messageIds) internal pure {
        uint256 length = messageIds.length;
        if (length <= 1) return;
        for (uint256 i = 0; i < length - 1; i++) {
            for (uint256 j = 0; j < length - 1 - i; j++) {
                if (messageIds[j] < messageIds[j + 1]) {
                    uint32 temp = messageIds[j];
                    messageIds[j] = messageIds[j + 1];
                    messageIds[j + 1] = temp;
                }
            }
        }
    }

    /**
     * @notice 分页存储辅助
     */
    function _addMessageToUserPages(address user, uint32 messageId) internal {
        uint32 currentPageIndex;
        if (userPageCount[user] == 0) {
            userPageCount[user] = 1;
            currentPageIndex = 0;
            userCurrentPageSize[user] = 0;
        } else {
            currentPageIndex = userPageCount[user] - 1;
            if (userCurrentPageSize[user] >= MESSAGES_PER_PAGE) {
                userPageCount[user]++;
                currentPageIndex = userPageCount[user] - 1;
                userCurrentPageSize[user] = 0;
            }
        }
        userMessagePages[user][currentPageIndex].push(messageId);
        userCurrentPageSize[user]++;
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