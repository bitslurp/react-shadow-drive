import { WalletContextState } from "@solana/wallet-adapter-react";
import { Connection, Transaction } from "@solana/web3.js";

const mints = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  SOL: "So11111111111111111111111111111111111111112",
};

export const swapToShdw = async (
  wallet: WalletContextState,
  connection: Connection,
  /**
   * amount of shdw in base unit
   */
  amount: number,

  paymentToken: "SOL" | "USDC"
) => {
  const { data } = await (
    await fetch(
      `https://quote-api.jup.ag/v1/quote?inputMint=${mints[paymentToken]}&outputMint=SHDWyBxihqiCj6YekG2GUr7wqKLeLAMK1gHZck9pL6y&amount=${amount}&swapMode=ExactOut&slippage=1`
    )
  ).json();
  const routes = data;

  if (!routes.length) throw new Error("No routes found");

  // get serialized transactions for the swap
  const transactions = await (
    await fetch("https://quote-api.jup.ag/v1/swap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // route from /quote api
        route: routes[0],
        userPublicKey: wallet.publicKey.toString(),
      }),
    })
  ).json();

  const { setupTransaction, swapTransaction, cleanupTransaction } =
    transactions;

  if (setupTransaction || cleanupTransaction)
    throw new Error("should only be 1tx");

  const transaction = Transaction.from(Buffer.from(swapTransaction, "base64"));

  return await wallet.sendTransaction(transaction, connection);
};
