// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WeirdTransferToken is ERC20 {

  constructor(
    string memory name,
    string memory symbol
  )
  ERC20(name, symbol)
  {
  }

  function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
    _transfer(_msgSender(), recipient, amount / 2);
    return true;
  }

  function mint(address account, uint256 amount) public {
    _mint(account, amount);
  }
}

contract WeirdTransferFromToken is ERC20 {

  constructor(
    string memory name,
    string memory symbol
  )
  ERC20(name, symbol)
  {
  }

  function transferFrom(address sender, address recipient, uint256 amount) public virtual override returns (bool) {
    _transfer(sender, recipient, amount / 2);
    return true;
  }

  function mint(address account, uint256 amount) public {
    _mint(account, amount);
  }
}
