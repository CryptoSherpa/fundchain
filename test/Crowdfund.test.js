const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Currency enum mirrors the Solidity definition.
const ETH = 0;
const USDC = 1;

describe("Crowdfund", function () {
  let crowdfund, usdc, owner, creator, donor1, donor2, donor3;
  const GOAL_ETH = ethers.parseEther("1");
  const GOAL_USDC = 1_000n * 10n ** 6n; // 1,000 USDC (6dp)
  const ONE_WEEK = 7 * 24 * 60 * 60;

  beforeEach(async () => {
    [owner, creator, donor1, donor2, donor3] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const CF = await ethers.getContractFactory("Crowdfund");
    crowdfund = await CF.deploy(await usdc.getAddress());

    // Seed donors with USDC for USDC-path tests.
    for (const s of [donor1, donor2, donor3]) {
      await usdc.mint(s.address, 10_000n * 10n ** 6n);
    }
  });

  async function createETHCampaign(goal = GOAL_ETH, duration = ONE_WEEK) {
    const now = await time.latest();
    const tx = await crowdfund
      .connect(creator)
      .createCampaign("ETH Campaign", "desc", "Technology & Innovation", "", goal, now + duration, ETH);
    const r = await tx.wait();
    return r.logs.find((l) => l.fragment?.name === "CampaignCreated").args[0];
  }

  async function createUSDCCampaign(goal = GOAL_USDC, duration = ONE_WEEK) {
    const now = await time.latest();
    const tx = await crowdfund
      .connect(creator)
      .createCampaign("USDC Campaign", "desc", "Technology & Innovation", "", goal, now + duration, USDC);
    const r = await tx.wait();
    return r.logs.find((l) => l.fragment?.name === "CampaignCreated").args[0];
  }

  async function donateUSDC(signer, id, amount) {
    await usdc.connect(signer).approve(await crowdfund.getAddress(), amount);
    return crowdfund.connect(signer).donate(id, amount);
  }

  // ─── Threshold + limit surface ────────────────────────────────────────────

  it("exposes getClaimThreshold() returning 80", async () => {
    expect(await crowdfund.getClaimThreshold()).to.equal(80n);
  });

  it("exposes currency-aware MIN/MAX_GOAL constants and MAX_DURATION", async () => {
    expect(await crowdfund.MIN_GOAL_ETH()).to.equal(ethers.parseEther("0.001"));
    expect(await crowdfund.MAX_GOAL_ETH()).to.equal(ethers.parseEther("10000"));
    expect(await crowdfund.MIN_GOAL_USDC()).to.equal(10n ** 6n);
    expect(await crowdfund.MAX_GOAL_USDC()).to.equal(10_000_000n * 10n ** 6n);
    expect(await crowdfund.MAX_DURATION()).to.equal(365n * 24n * 60n * 60n);
  });

  it("exposes CLAIM_WINDOW constant (7 days)", async () => {
    expect(await crowdfund.CLAIM_WINDOW()).to.equal(BigInt(ONE_WEEK));
  });

  it("exposes USDC_TOKEN address from constructor", async () => {
    expect(await crowdfund.USDC_TOKEN()).to.equal(await usdc.getAddress());
  });

  // ─── Create validation (ETH + USDC) ───────────────────────────────────────

  it("creates an ETH campaign", async () => {
    const id = await createETHCampaign();
    const c = await crowdfund.getCampaign(id);
    expect(c.currency).to.equal(BigInt(ETH));
    expect(c.goal).to.equal(GOAL_ETH);
  });

  it("creates a USDC campaign", async () => {
    const id = await createUSDCCampaign();
    const c = await crowdfund.getCampaign(id);
    expect(c.currency).to.equal(BigInt(USDC));
    expect(c.goal).to.equal(GOAL_USDC);
  });

  it("getCampaignCurrency returns correct enum for each campaign", async () => {
    const eid = await createETHCampaign();
    const uid = await createUSDCCampaign();
    expect(await crowdfund.getCampaignCurrency(eid)).to.equal(BigInt(ETH));
    expect(await crowdfund.getCampaignCurrency(uid)).to.equal(BigInt(USDC));
  });

  it("reverts ETH create when goal is below MIN_GOAL_ETH", async () => {
    const now = await time.latest();
    await expect(
      crowdfund.connect(creator).createCampaign("t", "d", "c", "", 1n, now + ONE_WEEK, ETH)
    ).to.be.revertedWithCustomError(crowdfund, "GoalBelowMin");
  });

  it("reverts USDC create when goal is below MIN_GOAL_USDC", async () => {
    const now = await time.latest();
    await expect(
      crowdfund.connect(creator).createCampaign("t", "d", "c", "", 999n, now + ONE_WEEK, USDC)
    ).to.be.revertedWithCustomError(crowdfund, "GoalBelowMin");
  });

  it("reverts ETH create when goal is above MAX_GOAL_ETH", async () => {
    const now = await time.latest();
    await expect(
      crowdfund.connect(creator).createCampaign("t", "d", "c", "", ethers.parseEther("10001"), now + ONE_WEEK, ETH)
    ).to.be.revertedWithCustomError(crowdfund, "GoalAboveMax");
  });

  it("reverts USDC create when goal is above MAX_GOAL_USDC", async () => {
    const now = await time.latest();
    await expect(
      crowdfund.connect(creator).createCampaign("t", "d", "c", "", (10_000_001n) * 10n ** 6n, now + ONE_WEEK, USDC)
    ).to.be.revertedWithCustomError(crowdfund, "GoalAboveMax");
  });

  it("reverts create when deadline is beyond MAX_DURATION", async () => {
    const now = await time.latest();
    await expect(
      crowdfund.connect(creator).createCampaign("t", "d", "c", "", GOAL_ETH, now + 366 * 24 * 60 * 60, ETH)
    ).to.be.revertedWithCustomError(crowdfund, "DeadlineTooFar");
  });

  it("reverts create when deadline is not in the future", async () => {
    const now = await time.latest();
    await expect(
      crowdfund.connect(creator).createCampaign("t", "d", "c", "", GOAL_ETH, now, ETH)
    ).to.be.revertedWithCustomError(crowdfund, "DeadlineMustBeFuture");
  });

  // ─── ETH donate path ──────────────────────────────────────────────────────

  it("accepts ETH donations and tracks donor count", async () => {
    const id = await createETHCampaign();
    await crowdfund.connect(donor1).donate(id, 0, { value: ethers.parseEther("0.3") });
    await crowdfund.connect(donor2).donate(id, 0, { value: ethers.parseEther("0.2") });
    const c = await crowdfund.getCampaign(id);
    expect(c.amountRaised).to.equal(ethers.parseEther("0.5"));
    expect(c.donorCount).to.equal(2);
  });

  it("ETH donate: reverts when amount != 0 is passed", async () => {
    const id = await createETHCampaign();
    await expect(
      crowdfund.connect(donor1).donate(id, 123n, { value: ethers.parseEther("0.1") })
    ).to.be.revertedWithCustomError(crowdfund, "AmountMustBeZeroForETH");
  });

  it("ETH donate: reverts when msg.value == 0", async () => {
    const id = await createETHCampaign();
    await expect(
      crowdfund.connect(donor1).donate(id, 0, { value: 0 })
    ).to.be.revertedWithCustomError(crowdfund, "ZeroDonation");
  });

  it("does not double-count a donor who donates twice", async () => {
    const id = await createETHCampaign();
    await crowdfund.connect(donor1).donate(id, 0, { value: ethers.parseEther("0.3") });
    await crowdfund.connect(donor1).donate(id, 0, { value: ethers.parseEther("0.2") });
    const c = await crowdfund.getCampaign(id);
    expect(c.donorCount).to.equal(1);
  });

  // ─── USDC donate path ─────────────────────────────────────────────────────

  it("accepts USDC donations after approve", async () => {
    const id = await createUSDCCampaign();
    const amt = 300n * 10n ** 6n;
    await donateUSDC(donor1, id, amt);
    const c = await crowdfund.getCampaign(id);
    expect(c.amountRaised).to.equal(amt);
    expect(await usdc.balanceOf(await crowdfund.getAddress())).to.equal(amt);
  });

  it("USDC donate: reverts when msg.value != 0", async () => {
    const id = await createUSDCCampaign();
    await usdc.connect(donor1).approve(await crowdfund.getAddress(), 100n * 10n ** 6n);
    await expect(
      crowdfund.connect(donor1).donate(id, 100n * 10n ** 6n, { value: 1n })
    ).to.be.revertedWithCustomError(crowdfund, "MsgValueMustBeZeroForUSDC");
  });

  it("USDC donate: reverts when amount == 0", async () => {
    const id = await createUSDCCampaign();
    await expect(
      crowdfund.connect(donor1).donate(id, 0)
    ).to.be.revertedWithCustomError(crowdfund, "ZeroDonation");
  });

  it("USDC donate: reverts when allowance is insufficient", async () => {
    const id = await createUSDCCampaign();
    // No approve — transferFrom should fail.
    await expect(crowdfund.connect(donor1).donate(id, 100n * 10n ** 6n)).to.be.reverted;
  });

  // ─── Claim (ETH) ──────────────────────────────────────────────────────────

  it("rejects claimFunds from non-creator (grief protection)", async () => {
    const id = await createETHCampaign();
    await crowdfund.connect(donor1).donate(id, 0, { value: GOAL_ETH });
    await expect(crowdfund.connect(donor1).claimFunds(id))
      .to.be.revertedWithCustomError(crowdfund, "NotCreator");
  });

  it("ETH: creator can claim at exactly 80%", async () => {
    const id = await createETHCampaign();
    const raised = (GOAL_ETH * 80n) / 100n;
    await crowdfund.connect(donor1).donate(id, 0, { value: raised });

    const creatorBefore = await ethers.provider.getBalance(creator.address);
    const ownerBefore = await ethers.provider.getBalance(owner.address);
    const tx = await crowdfund.connect(creator).claimFunds(id);
    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed * tx.gasPrice;
    const creatorAfter = await ethers.provider.getBalance(creator.address);
    const ownerAfter = await ethers.provider.getBalance(owner.address);

    const fee = (raised * 500n) / 10000n;
    expect(ownerAfter - ownerBefore).to.equal(fee);
    expect(creatorAfter - creatorBefore + gasUsed).to.equal(raised - fee);
  });

  it("ETH: creator can claim at 100%", async () => {
    const id = await createETHCampaign();
    await crowdfund.connect(donor1).donate(id, 0, { value: GOAL_ETH });
    await crowdfund.connect(creator).claimFunds(id);
    expect((await crowdfund.getCampaign(id)).claimed).to.be.true;
  });

  it("ETH: claim on overfunded campaign; fee against full raised", async () => {
    const id = await createETHCampaign();
    const overfund = GOAL_ETH + ethers.parseEther("0.5");
    await crowdfund.connect(donor1).donate(id, 0, { value: overfund });
    const tx = await crowdfund.connect(creator).claimFunds(id);
    const receipt = await tx.wait();
    const evt = receipt.logs.find((l) => l.fragment?.name === "FundsClaimed");
    const expectedFee = (overfund * 500n) / 10000n;
    expect(evt.args.creatorAmount).to.equal(overfund - expectedFee);
    expect(evt.args.feeAmount).to.equal(expectedFee);
  });

  it("ETH: reverts claimFunds just below 80%", async () => {
    const id = await createETHCampaign();
    const justBelow = (GOAL_ETH * 8000n) / 10000n - 1n;
    await crowdfund.connect(donor1).donate(id, 0, { value: justBelow });
    await expect(crowdfund.connect(creator).claimFunds(id))
      .to.be.revertedWithCustomError(crowdfund, "ClaimThresholdNotMet");
  });

  // ─── Claim window (7-day) ────────────────────────────────────────────────

  it("ETH: reverts claimFunds before the 7-day claim window opens", async () => {
    // 30-day campaign: claim window opens at day 23. Donate to 80%, try at day 0.
    const THIRTY_DAYS = 30 * 24 * 60 * 60;
    const id = await createETHCampaign(GOAL_ETH, THIRTY_DAYS);
    await crowdfund.connect(donor1).donate(id, 0, { value: GOAL_ETH });
    await expect(crowdfund.connect(creator).claimFunds(id))
      .to.be.revertedWithCustomError(crowdfund, "ClaimWindowNotOpen");
  });

  it("ETH: creator can claim once inside the 7-day claim window", async () => {
    const THIRTY_DAYS = 30 * 24 * 60 * 60;
    const id = await createETHCampaign(GOAL_ETH, THIRTY_DAYS);
    await crowdfund.connect(donor1).donate(id, 0, { value: GOAL_ETH });
    // Fast-forward past the window open (start of last 7 days).
    await time.increase(THIRTY_DAYS - ONE_WEEK + 1);
    await crowdfund.connect(creator).claimFunds(id);
    expect((await crowdfund.getCampaign(id)).claimed).to.be.true;
  });

  it("USDC: reverts claimFunds before the 7-day claim window opens", async () => {
    const THIRTY_DAYS = 30 * 24 * 60 * 60;
    const id = await createUSDCCampaign(GOAL_USDC, THIRTY_DAYS);
    await donateUSDC(donor1, id, GOAL_USDC);
    await expect(crowdfund.connect(creator).claimFunds(id))
      .to.be.revertedWithCustomError(crowdfund, "ClaimWindowNotOpen");
  });

  it("window check runs after threshold check (threshold failure wins)", async () => {
    // 30-day campaign, still at 0% — both conditions fail but ClaimThresholdNotMet is raised first.
    const THIRTY_DAYS = 30 * 24 * 60 * 60;
    const id = await createETHCampaign(GOAL_ETH, THIRTY_DAYS);
    await expect(crowdfund.connect(creator).claimFunds(id))
      .to.be.revertedWithCustomError(crowdfund, "ClaimThresholdNotMet");
  });

  // ─── Claim (USDC) ─────────────────────────────────────────────────────────

  it("USDC: creator can claim at 100%; USDC balances move correctly", async () => {
    const id = await createUSDCCampaign();
    await donateUSDC(donor1, id, GOAL_USDC);

    const creatorBefore = await usdc.balanceOf(creator.address);
    const ownerBefore   = await usdc.balanceOf(owner.address);

    await crowdfund.connect(creator).claimFunds(id);

    const fee = (GOAL_USDC * 500n) / 10000n;
    expect((await usdc.balanceOf(owner.address)) - ownerBefore).to.equal(fee);
    expect((await usdc.balanceOf(creator.address)) - creatorBefore).to.equal(GOAL_USDC - fee);
  });

  it("USDC: reverts claimFunds just below 80%", async () => {
    const id = await createUSDCCampaign();
    const justBelow = (GOAL_USDC * 8000n) / 10000n - 1n;
    await donateUSDC(donor1, id, justBelow);
    await expect(crowdfund.connect(creator).claimFunds(id))
      .to.be.revertedWithCustomError(crowdfund, "ClaimThresholdNotMet");
  });

  it("USDC: reverts claim from non-creator", async () => {
    const id = await createUSDCCampaign();
    await donateUSDC(donor1, id, GOAL_USDC);
    await expect(crowdfund.connect(donor1).claimFunds(id))
      .to.be.revertedWithCustomError(crowdfund, "NotCreator");
  });

  // ─── Donations after claim ────────────────────────────────────────────────

  it("blocks new ETH donations once claimed", async () => {
    const id = await createETHCampaign();
    await crowdfund.connect(donor1).donate(id, 0, { value: GOAL_ETH });
    await crowdfund.connect(creator).claimFunds(id);
    await expect(
      crowdfund.connect(donor2).donate(id, 0, { value: ethers.parseEther("0.1") })
    ).to.be.revertedWithCustomError(crowdfund, "CampaignAlreadyClaimed");
  });

  it("allows ETH donations past 100% (no overfunding cap)", async () => {
    const id = await createETHCampaign();
    await crowdfund.connect(donor1).donate(id, 0, { value: GOAL_ETH });
    await expect(
      crowdfund.connect(donor2).donate(id, 0, { value: ethers.parseEther("0.2") })
    ).to.emit(crowdfund, "DonationReceived");
  });

  // ─── Refunds (ETH) ────────────────────────────────────────────────────────

  it("ETH: processRefunds sends ETH back to all donors when raised < 80%", async () => {
    const id = await createETHCampaign();
    const d1 = ethers.parseEther("0.3");
    const d2 = ethers.parseEther("0.2");
    await crowdfund.connect(donor1).donate(id, 0, { value: d1 });
    await crowdfund.connect(donor2).donate(id, 0, { value: d2 });
    await time.increase(ONE_WEEK + 1);

    const b1 = await ethers.provider.getBalance(donor1.address);
    const b2 = await ethers.provider.getBalance(donor2.address);
    await crowdfund.connect(donor3).processRefunds(id);
    expect((await ethers.provider.getBalance(donor1.address)) - b1).to.equal(d1);
    expect((await ethers.provider.getBalance(donor2.address)) - b2).to.equal(d2);
  });

  it("ETH: individual refund still works", async () => {
    const id = await createETHCampaign();
    const donation = ethers.parseEther("0.3");
    await crowdfund.connect(donor1).donate(id, 0, { value: donation });
    await time.increase(ONE_WEEK + 1);
    const before = await ethers.provider.getBalance(donor1.address);
    const tx = await crowdfund.connect(donor1).refund(id);
    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed * tx.gasPrice;
    expect((await ethers.provider.getBalance(donor1.address)) - before + gasUsed).to.equal(donation);
  });

  // ─── Refunds (USDC) ───────────────────────────────────────────────────────

  it("USDC: processRefunds returns USDC to all donors when raised < 80%", async () => {
    const id = await createUSDCCampaign();
    const d1 = 100n * 10n ** 6n;
    const d2 = 200n * 10n ** 6n;
    await donateUSDC(donor1, id, d1);
    await donateUSDC(donor2, id, d2);
    await time.increase(ONE_WEEK + 1);

    const b1 = await usdc.balanceOf(donor1.address);
    const b2 = await usdc.balanceOf(donor2.address);
    await crowdfund.connect(donor3).processRefunds(id);
    expect((await usdc.balanceOf(donor1.address)) - b1).to.equal(d1);
    expect((await usdc.balanceOf(donor2.address)) - b2).to.equal(d2);
  });

  it("USDC: individual refund pulls USDC back", async () => {
    const id = await createUSDCCampaign();
    const donation = 300n * 10n ** 6n;
    await donateUSDC(donor1, id, donation);
    await time.increase(ONE_WEEK + 1);
    const before = await usdc.balanceOf(donor1.address);
    await crowdfund.connect(donor1).refund(id);
    expect((await usdc.balanceOf(donor1.address)) - before).to.equal(donation);
  });

  // ─── Refund guards ────────────────────────────────────────────────────────

  it("reverts processRefunds before deadline", async () => {
    const id = await createETHCampaign();
    await crowdfund.connect(donor1).donate(id, 0, { value: ethers.parseEther("0.1") });
    await expect(crowdfund.connect(donor3).processRefunds(id))
      .to.be.revertedWithCustomError(crowdfund, "CampaignNotEnded");
  });

  it("reverts processRefunds at or above 80%", async () => {
    const id = await createETHCampaign();
    await crowdfund.connect(donor1).donate(id, 0, { value: (GOAL_ETH * 80n) / 100n });
    await time.increase(ONE_WEEK + 1);
    await expect(crowdfund.connect(donor3).processRefunds(id))
      .to.be.revertedWithCustomError(crowdfund, "ClaimThresholdMet");
  });

  it("reverts processRefunds when already processed", async () => {
    const id = await createETHCampaign();
    await crowdfund.connect(donor1).donate(id, 0, { value: ethers.parseEther("0.1") });
    await time.increase(ONE_WEEK + 1);
    await crowdfund.connect(donor3).processRefunds(id);
    await expect(crowdfund.connect(donor3).processRefunds(id))
      .to.be.revertedWithCustomError(crowdfund, "AlreadyProcessed");
  });

  it("processRefunds works on a campaign with zero donors", async () => {
    const id = await createETHCampaign();
    await time.increase(ONE_WEEK + 1);
    await expect(crowdfund.connect(donor3).processRefunds(id))
      .to.emit(crowdfund, "RefundsProcessed")
      .withArgs(id, 0, 0);
  });

  // ─── DoS resilience (ETH path) ────────────────────────────────────────────

  it("ETH: processRefunds skips donors whose receive() reverts and preserves their balance", async () => {
    const id = await createETHCampaign();
    const Reverting = await ethers.getContractFactory("RevertingDonor");
    const reverting = await Reverting.deploy(await crowdfund.getAddress());
    await reverting.waitForDeployment();

    const honestAmount = ethers.parseEther("0.2");
    const revertingAmount = ethers.parseEther("0.1");
    await crowdfund.connect(donor1).donate(id, 0, { value: honestAmount });
    await reverting.connect(donor2).donateTo(id, { value: revertingAmount });

    await time.increase(ONE_WEEK + 1);

    const d1Before = await ethers.provider.getBalance(donor1.address);
    await expect(crowdfund.connect(donor3).processRefunds(id))
      .to.emit(crowdfund, "RefundsProcessed").withArgs(id, 1, 1)
      .and.to.emit(crowdfund, "RefundSkipped").withArgs(id, await reverting.getAddress(), revertingAmount);
    expect((await ethers.provider.getBalance(donor1.address)) - d1Before).to.equal(honestAmount);
    expect(await crowdfund.getContribution(id, await reverting.getAddress())).to.equal(revertingAmount);

    await reverting.enablePayments();
    await reverting.connect(donor2).refundSelf(id);
    expect(await crowdfund.getContribution(id, await reverting.getAddress())).to.equal(0n);
  });
});
