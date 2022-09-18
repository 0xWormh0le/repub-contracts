//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";

contract MockERC1155 is ERC1155Burnable {
  constructor() ERC1155("") { }

  function mint(address account, uint256 id, uint256 amount) external {
    _mint(account, id, amount, "");
  }
}
