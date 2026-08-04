const path = require('path');
const packageJsonPath = path.join(__dirname, 'package.json');
const { version, last_update } = require(packageJsonPath);
const origin = "https://wf8xw3-3000.csb.app"
const assets = "https://y3sjh2.csb.app"

function render(req, res, view, data = {},  tag = "", locate = "") {
  const qE = req.query.e || "";
  if (view == "error" && qE) {
    console.log(`redirect by 404 to /error?e=${qE}`);
  }
  const name = locate ? `${locate}/${view}` : view;
  res.render(name, { ...data, em: "false", version, last_update, origin, tag, assets }, (err, html) => {
    if (err) {
      console.log(`404 at /${name} in render function.`);
      console.log(`ejs error message: ${err}`)
      res.status(404).render("error", {
        title: "404 Not Found",
        page: "error",
        ec: name,
        em: "false",
        version,
        last_update,
        origin,
        tag: "error",
        assets
      });
    } else {
      console.log(`access to /${name} ... OK`);
      res.send(html);
    }
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);

  let binary = "";

  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }

  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);

  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

async function generateCryptoData(password) {
  const enc = new TextEncoder();

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const passwordKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const wrappingKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 250000,
      hash: "SHA-256"
    },
    passwordKey,
    {
      name: "AES-GCM",
      length: 256
    },
    true,
    ["encrypt", "decrypt"]
  );

  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["encrypt", "decrypt"]
  );

  const publicKey = await crypto.subtle.exportKey(
    "spki",
    keyPair.publicKey
  );

  const privateKey = await crypto.subtle.exportKey(
    "pkcs8",
    keyPair.privateKey
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptedPrivateKey = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv
    },
    wrappingKey,
    privateKey
  );

  return {
    publicKey: arrayBufferToBase64(publicKey),
    privateKey: arrayBufferToBase64(encryptedPrivateKey),
    salt: arrayBufferToBase64(salt),
    iv: arrayBufferToBase64(iv)
  };
}

async function unlockPrivateKey(
  password,
  encryptedPrivateKeyBase64,
  saltBase64,
  ivBase64
) {
  const enc = new TextEncoder();

  const salt = base64ToArrayBuffer(saltBase64);

  const iv = base64ToArrayBuffer(ivBase64);

  const encryptedPrivateKey =
    base64ToArrayBuffer(
      encryptedPrivateKeyBase64
    );

  const passwordKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const wrappingKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 250000,
      hash: "SHA-256"
    },
    passwordKey,
    {
      name: "AES-GCM",
      length: 256
    },
    true,
    ["decrypt"]
  );

  const privateKeyBuffer =
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv
      },
      wrappingKey,
      encryptedPrivateKey
    );

  return crypto.subtle.importKey(
    "pkcs8",
    privateKeyBuffer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256"
    },
    true,
    ["decrypt"]
  );
}

async function reEncryptPrivateKey(
  oldPassword,
  newPassword,
  encryptedPrivateKey,
  salt,
  iv
) {
  const privateKey = await unlockPrivateKey(
    oldPassword,
    encryptedPrivateKey,
    salt,
    iv
  );

  const privateKeyBuffer =
    await crypto.subtle.exportKey(
      "pkcs8",
      privateKey
    );

  const enc = new TextEncoder();

  const newSalt =
    crypto.getRandomValues(
      new Uint8Array(16)
    );

  const newIV =
    crypto.getRandomValues(
      new Uint8Array(12)
    );

  const passwordKey =
    await crypto.subtle.importKey(
      "raw",
      enc.encode(newPassword),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

  const wrappingKey =
    await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: newSalt,
        iterations: 250000,
        hash: "SHA-256"
      },
      passwordKey,
      {
        name: "AES-GCM",
        length: 256
      },
      true,
      ["encrypt"]
    );

  const newEncryptedPrivateKey =
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: newIV
      },
      wrappingKey,
      privateKeyBuffer
    );

  return {
    encryptedPrivateKey:
      arrayBufferToBase64(
        newEncryptedPrivateKey
      ),

    keySalt:
      arrayBufferToBase64(newSalt),

    privateKeyIV:
      arrayBufferToBase64(newIV)
  };
}

module.exports = render;