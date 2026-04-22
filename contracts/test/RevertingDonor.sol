// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICrowdfund {
    function donate(uint256 id, uint256 amount) external payable;
    function refund(uint256 id) external;
}

/// @notice Test-only contract that donates but rejects ETH on refund.
///         Used to prove processRefunds doesn't DoS the batch.
contract RevertingDonor {
    ICrowdfund public immutable cf;
    bool public acceptPayments;

    constructor(address crowdfund) {
        cf = ICrowdfund(crowdfund);
    }

    function donateTo(uint256 id) external payable {
        cf.donate{value: msg.value}(id, 0);
    }

    function refundSelf(uint256 id) external {
        cf.refund(id);
    }

    function enablePayments() external {
        acceptPayments = true;
    }

    receive() external payable {
        require(acceptPayments, "reject");
    }
}
