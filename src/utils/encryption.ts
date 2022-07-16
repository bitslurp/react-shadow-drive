import { WalletContextState } from "@solana/wallet-adapter-react";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function hash(s: string) {
  return s.split("").reduce(function (a, b) {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);
}

// String could be anything but I'm a child.
const FLAG_STRING = hash("_@BiTSlURp-EnCrypt@_").toString(16);
const ENCRYPTION_FLAG = encoder.encode(FLAG_STRING);
const FLAG_BYTE_LENGTH = ENCRYPTION_FLAG.byteLength;
const SALT_BYTES = 16;
const IV_BYTES = 16;

export const isBufferEncryped = (buffer: ArrayBuffer) => {
  const slice = buffer.slice(0, FLAG_BYTE_LENGTH);

  return FLAG_STRING === decoder.decode(slice);
};

export const isFileEncrypted = async (file: File) => {
  const buffer = await file.arrayBuffer();

  return isBufferEncryped(buffer);
};

export const getKeySalt = () =>
  crypto.getRandomValues(new Uint8Array(SALT_BYTES));

export async function encryptFile(
  key: CryptoKey,
  file: File,
  salt: Uint8Array
) {
  const buffer = await file.arrayBuffer();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  const data = (await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    buffer
  )) as ArrayBuffer;

  return new File([ENCRYPTION_FLAG, salt, iv, data], file.name, {
    type: file.type,
  });
}
export async function decryptFile(
  wallet: WalletContextState,
  account: string,
  file: File
) {
  const buffer = await file.arrayBuffer();

  const decrypted = await decryptBuffer(wallet, account, buffer);

  return new File([decrypted], file.name, { type: file.type });
}

export async function decryptBuffer(
  wallet: WalletContextState,
  account: string,
  buffer: ArrayBuffer
) {
  try {
    const salt = buffer.slice(FLAG_BYTE_LENGTH, FLAG_BYTE_LENGTH + SALT_BYTES);
    const key = await getCryptoKey(wallet, account, new Uint8Array(salt));
    const iv = buffer.slice(
      FLAG_BYTE_LENGTH + SALT_BYTES,
      FLAG_BYTE_LENGTH + SALT_BYTES + IV_BYTES
    );

    const data = (await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      buffer.slice(FLAG_BYTE_LENGTH + SALT_BYTES + IV_BYTES, buffer.byteLength)
    )) as ArrayBuffer;

    return data;
  } catch {
    return buffer;
  }
}

export const getCryptoKey = async (
  wallet: WalletContextState,
  account: string,
  salt: Uint8Array
) => {
  const message = `Encrypt/decrypt files for storage account: ${account}`;
  const keyMaterial = await getKeyMaterial(message, wallet);
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      iterations: 100000,
      salt,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
};

async function getKeyMaterial(message: string, wallet: WalletContextState) {
  const enc = new TextEncoder();
  const signedMessage = await wallet.signMessage(enc.encode(message));

  return window.crypto.subtle.importKey("raw", signedMessage, "PBKDF2", false, [
    "deriveBits",
    "deriveKey",
  ]);
}
