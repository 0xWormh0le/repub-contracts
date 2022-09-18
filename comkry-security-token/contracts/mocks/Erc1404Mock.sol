// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../RestrictedToken.sol";

contract Erc1404Mock is RestrictedToken {
  constructor(
    address transferRules_,
    address contractAdmin_,
    address tokenReserveAdmin_,
    string memory symbol_,
    string memory name_,
    uint8 decimals_,
    uint256 totalSupply_,
    uint256 maxTotalSupply_
  )
    RestrictedToken(
      transferRules_,
      contractAdmin_,
      tokenReserveAdmin_,
      symbol_,
      name_,
      decimals_,
      totalSupply_,
      maxTotalSupply_
    )
  {}

  function mintToken(uint256 amount) external {
    _mint(msg.sender, amount);
  }
}
