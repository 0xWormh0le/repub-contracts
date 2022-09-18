//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IRandomGenerator {

    function askRandomness(address recipient) external;
}
