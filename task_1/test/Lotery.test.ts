const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { utils } = require("ethers");
const hre = require("hardhat");
const { constants } = ethers;
const { setBalance, time } = require("@nomicfoundation/hardhat-network-helpers");
const { signMarketplaceDataByUser } = require("./utils/sign");

describe("NFT Sale", function () {
  let owner: any,
    user: any,
    usdt: any,
    bnb: any,
    usdtKeeper: any,
    bnbKeeper: any,
    vrfCoordinator: any,
    lottery: any,
    lotteryTicket: any,
    domainMarketplace: any;

  let MINTER_ROLE: string, OPERATOR_ROLE: string;
  const day = 86400n;

  const keyHash = "0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef";

  const contractUSDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
  const oracleUSDT = "0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46";
  const contractBNB = "0xB8c77482e45F1F44dE1745F52C74426C631bDD52";
  const oracleBNB = "0xc546d2d06144F9DD42815b8bA46Ee7B8FcAFa4a2";
  const bnbAcc = "0xB8c77482e45F1F44dE1745F52C74426C631bDD52";
  const usdtAcc = "0xC6CDE7C39eB2f0F0095F41570af89eFC2C1Ea828";

  before(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    user = signers[1];

    // get instance TetherToken & BNBToken
    usdt = await ethers.getContractAt("IERC20", contractUSDT);

    bnb = await ethers.getContractAt("IERC20", contractBNB);

    // get control under usdtAccount & bnbAccount
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [usdtAcc],
    });

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [bnbAcc],
    });

    usdtKeeper = await ethers.getSigner(usdtAcc);
    console.log("balance USDT", await usdt.connect(user).balanceOf(usdtKeeper.address));

    bnbKeeper = await ethers.getSigner(bnbAcc);
    console.log("balance BNB", await bnb.connect(user).balanceOf(bnbKeeper.address));

    // set Ether to usdtKeeper & bnbKeeper
    const newBalance = ethers.utils.parseEther("1000000");
    await setBalance(bnbKeeper.address, newBalance);
    await setBalance(usdtKeeper.address, newBalance);

    //VRF
    const VRFCoordinatorArtifact = await ethers.getContractFactory("VRFCoordinatorV2Mock");
    vrfCoordinator = await VRFCoordinatorArtifact.connect(owner).deploy("100000000000000000", 1000000000);
    await vrfCoordinator.deployed();
    expect(vrfCoordinator.address).to.be.properAddress;

    const txSubscription = await vrfCoordinator.connect(owner).createSubscription();
    txSubscription.wait();

    const txFundSub = await vrfCoordinator.connect(owner).fundSubscription(1, BigInt(1000000000000000000));
    txFundSub.wait();

    // deploy contracts & set minter role
    const TicketContract = await ethers.getContractFactory("LotteryTicket", owner);
    lotteryTicket = await TicketContract.deploy();
    await lotteryTicket.deployed();

    const Lottery = await ethers.getContractFactory("TicketSale", owner);
    lottery = await Lottery.deploy(
      lotteryTicket.address,
      "Marketplace",
      "1",
      1,
      vrfCoordinator.address,
      keyHash
    );
    await lottery.deployed();

    const txAddConsumer = await vrfCoordinator.connect(owner).addConsumer(1, lottery.address);
    txAddConsumer.wait();

    MINTER_ROLE = await lotteryTicket.MINTER_ROLE();
    OPERATOR_ROLE = await lottery.OPERATOR_ROLE();
    await lotteryTicket.grantRole(MINTER_ROLE, lottery.address);

    domainMarketplace = {
      name: "Marketplace",
      version: "1",
      chainId: network.config.chainId,
      verifyingContract: lottery.address,
    };
  });

  describe("Main Logic", function () {
    it("should be deployed!", async function () {
      expect(lotteryTicket.address).to.be.properAddress;
      expect(lottery.address).to.be.properAddress;
    });

    it("grant role minter", async function () {
      const tx = await lotteryTicket.grantRole(MINTER_ROLE, lottery.address);
      tx.wait();

      expect(await lotteryTicket.hasRole(MINTER_ROLE, lottery.address)).to.eq(true);
    });

    it("success: set list of token by owner", async function () {
      const txSetUSDT = await lottery.connect(owner).setTokenData(oracleUSDT, contractUSDT);
      txSetUSDT.wait();
      const txSetBNB = await lottery.connect(owner).setTokenData(oracleBNB, contractBNB);
      txSetBNB.wait();

      expect(await lottery.supportOfToken(contractUSDT)).to.eq(true);
      await expect(txSetUSDT)
        .to.emit(lottery, "SetNewToken")
        .withArgs(oracleUSDT, contractUSDT, owner.address);

      expect(await lottery.supportOfToken(contractBNB)).to.eq(true);
      await expect(txSetBNB).to.emit(lottery, "SetNewToken").withArgs(oracleBNB, contractBNB, owner.address);
    });

    it("reverted: set list of token by user", async function () {
      const oracleDAI = "0x773616e4d11a78f511299002da57a0a94577f1f4";
      const contractDAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";

      await expect(lottery.connect(user).setTokenData(oracleDAI, contractDAI)).to.be.revertedWith(
        `AccessControl: account ${user.address.toLowerCase()} is missing role ${OPERATOR_ROLE}`
      );
    });

    describe("Buying NFT with Ether", function () {
      it("success: buy 15 NFT", async function () {
        const price = utils.parseEther("0.02");
        const amount = 2;
        const totalPrice = BigInt(price * amount);
        // const uri = new Array(amount).fill("someURI.json");
        const uri = ["someURI.json", "someURI.json"];

        const signature = await signMarketplaceDataByUser(
          domainMarketplace,
          amount,
          user.address,
          uri,
          owner
        );

        const txBuy = await lottery
          .connect(user)
          .purchaseTicket(
            ethers.constants.AddressZero,
            0,
            amount,
            uri,
            signature.v,
            signature.r,
            signature.s,
            { value: totalPrice });
        txBuy.wait();

        const txBalanceNFT = await lotteryTicket.connect(user).balanceOf(user.address);
        await expect(txBalanceNFT).to.eq(amount);

        await expect(() => txBuy).to.changeEtherBalances([user, lottery], [-totalPrice, totalPrice]);
        await expect(txBuy).to.emit(lottery, "PurchaseTicket").withArgs(user.address, amount, 0, totalPrice);
      });
      // it("reverted: entered incorrectly price", async function () {
      //   const price = utils.parseEther("0.01");
      //   const amount = 150;
      //   const totalprice = BigInt(price * amount);
      //   const uri = "someURI.json";

      //   await expect(
      //     lottery
      //       .connect(user)
      //       .purchaseTicket(ethers.constants.AddressZero, 0, amount, uri, { value: totalprice })
      //   ).to.be.revertedWith("Price entered incorrectly");
      // });
    });
    // describe("Buying NFT with USDT", function () {
    //   it("success: buy 10 NFT", async function () {
    //     const priceForOne = ethers.utils.parseUnits("2", 16);
    //     const exchangeRateUSDT = await lottery.connect(usdtKeeper).getLatestPrice(1);
    //     const uri = "someURI.json";
    //     const amount = 100;
    //     const totalPrice = Math.floor((priceForOne * amount * 1e6) / exchangeRateUSDT);

    //     await usdt.connect(usdtKeeper).approve(lottery.address, totalPrice);

    //     const txBuy = await lottery.connect(usdtKeeper).purchaseTicket(contractUSDT, 1, amount, uri);
    //     txBuy.wait();

    //     const txBalanceNFT = await lotteryTicket.balanceOf(usdtKeeper.address);
    //     await expect(txBalanceNFT).to.eq(amount);

    //     await expect(() => txBuy).to.changeTokenBalances(
    //       usdt,
    //       [lottery.address, usdtKeeper.address],
    //       [totalPrice, -totalPrice]
    //     );
    //     await expect(txBuy)
    //       .to.emit(lottery, "PurchaseTicket")
    //       .withArgs(usdtKeeper.address, amount, 1, totalPrice);
    //   });

    //   it("reverted: try to buy 11 NFT with unsupported token", async function () {
    //     const uri = "someURI.json";
    //     const amount = 11;

    //     await expect(
    //       lottery.connect(usdtKeeper).purchaseTicket(oracleUSDT, 3, amount, uri)
    //     ).to.be.revertedWith("Unsupported token");
    //   });
    // });
    // describe("Buying NFT with BNB", function () {
    //   it("success", async function () {
    //     const priceForOne = ethers.utils.parseUnits("2", 16);
    //     const exchangeRateUSDT = await lottery.connect(usdtKeeper).getLatestPrice(2);
    //     const uri = "someURI.json";
    //     const amount = 50;

    //     const totalPrice = await lottery.getTotalPrice(2, amount);
    //     await bnb.connect(bnbKeeper).approve(lottery.address, totalPrice);

    //     const txBuy = await lottery.connect(bnbKeeper).purchaseTicket(contractBNB, 2, amount, uri);
    //     txBuy.wait();

    //     const txBalanceNFT = await lotteryTicket.connect(bnbKeeper).balanceOf(bnbKeeper.address);
    //     await expect(txBalanceNFT).to.eq(amount);

    //     await expect(() => txBuy).to.changeTokenBalances(
    //       bnb,
    //       [lottery.address, bnbKeeper.address],
    //       [BigInt(totalPrice), -BigInt(totalPrice)]
    //     );
    //     await expect(txBuy)
    //       .to.emit(lottery, "PurchaseTicket")
    //       .withArgs(bnbKeeper.address, amount, 2, totalPrice);
    //   });
    // });
    // describe("winners", function () {
    //   it("reverted: lottery not over", async function () {
    //     await expect(lottery.connect(owner).setWinners()).to.be.revertedWith("Lottery is not over");
    //   });
    //   it("success: payout", async function () {
    //     await time.increase(day * 8n);

    //     const txWin = await lottery.connect(owner).setWinners();
    //     txWin.wait();
    //     const txVRFreq = await vrfCoordinator.connect(owner).fulfillRandomWords(1, lottery.address);
    //     txVRFreq.wait();
    //     const txGetWin = await lottery.connect(owner).getWinner();

    //     const balanceETH = await ethers.provider.getBalance(lottery.address);
    //     const ownerFeeETH = (balanceETH * 10) / 100;
    //     const winningAmount = BigInt(balanceETH - ownerFeeETH);

    //     const balanceUSDT = await usdt.balanceOf(lottery.address);
    //     const ownerFeeUSDT = Math.floor((balanceUSDT * 10) / 100);
    //     const winningAmountUSDT = Math.floor(balanceUSDT - ownerFeeUSDT);

    //     const balanceBNB = await bnb.balanceOf(lottery.address);
    //     const ownerFeeBNB = Math.floor((balanceBNB * 10) / 100);
    //     const winningAmountBNB = Math.floor(balanceBNB - ownerFeeBNB);

    //     const winner = await lotteryTicket.ownerOf(txGetWin);
    //     const balance = await ethers.provider.getBalance(winner);

    //     const payout = await lottery.connect(owner).payout();
    //     await expect(() => payout).to.changeEtherBalances(
    //       [lottery.address, winner, owner.address],
    //       [-BigInt(balanceETH), BigInt(winningAmount), BigInt(ownerFeeETH)]
    //     );
    //     await expect(payout)
    //       .to.emit(lottery, "Payout")
    //       .withArgs(constants.AddressZero, owner.address, BigInt(ownerFeeETH));
    //     await expect(payout)
    //       .to.emit(lottery, "Payout")
    //       .withArgs(constants.AddressZero, winner, winningAmount);

    //     await expect(() => payout).to.changeTokenBalances(
    //       usdt,
    //       [lottery.address, winner, owner.address],
    //       [-balanceUSDT, winningAmountUSDT, ownerFeeUSDT]
    //     );
    //     await expect(payout).to.emit(lottery, "Payout").withArgs(usdt.address, owner.address, ownerFeeUSDT);
    //     await expect(payout).to.emit(lottery, "Payout").withArgs(usdt.address, winner, winningAmountUSDT);
    //   });
    // });
  });
});
