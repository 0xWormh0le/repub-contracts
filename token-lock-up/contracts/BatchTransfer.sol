// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./TokenLockup.sol";

contract BatchTransfer {
    using SafeERC20 for IERC20;

    function batchTransfer(IERC20 token,
        address[] calldata recipients,
        uint[] calldata amounts) external returns (bool) {

        require(recipients.length == amounts.length, "recipient & amount arrays must be the same length");

        for (uint i; i < recipients.length; i++) {
            token.safeTransferFrom(msg.sender, recipients[i], amounts[i]);
        }

        return true;
    }
}