// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Erc20TxFeeMock is ERC20 {
  constructor(string memory name_, string memory symbol_)
    ERC20(name_, symbol_)
  {}

  function mint(uint256 amount) external {
    _mint(msg.sender, amount);
  }

  function _transfer(
    address sender,
    address recipient,
    uint256 amount
  ) internal override {
    super._transfer(sender, recipient, amount);
    _burn(recipient, amount / 10);
  }
}
