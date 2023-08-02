// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface ILotteryTicket {
    function batchMint(
        address to,
        uint256 amount,
        // string memory uri
        string[] memory uri
    ) external;
}
