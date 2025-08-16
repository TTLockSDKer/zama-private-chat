// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {euint32, euint64} from "@fhevm/solidity/lib/FHE.sol";

/**
 * @title ConfidentialTypes
 * @dev FHE 数据类型定义
 */
library ConfidentialTypes {
    struct Message {
        uint32 id;
        address sender;
        address recipient;
        euint64[] content;
        uint32 chunkCount;
        uint32 timestamp;
        bool isRead;
    }

    struct UserStats {
        uint32 sentMessages;
        uint32 receivedMessages;
        uint64 lastActivity;
    }

    struct WithdrawRequest {
        uint256 id;
        address user;
        euint64 amount;
        uint64 timestamp;
        bool processed;
    }

    struct RedPacket {
        uint32 id;
        address sender;
        address recipient;
        euint64 amount;
        uint64 expireTime;
        bool claimed;
    }
}