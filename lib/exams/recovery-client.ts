type RecoverableAnswer = { ocrText: string; editedText: string };

function keyName(attemptId: string) {
  return `attempt-recovery-key:${attemptId}`;
}

function dataName(attemptId: string) {
  return `attempt-recovery-data:${attemptId}`;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function getKey(attemptId: string, create: boolean) {
  let encoded = sessionStorage.getItem(keyName(attemptId));
  if (!encoded && create) {
    encoded = toBase64(crypto.getRandomValues(new Uint8Array(32)));
    sessionStorage.setItem(keyName(attemptId), encoded);
  }
  if (!encoded) return null;
  return crypto.subtle.importKey("raw", fromBase64(encoded), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function saveEncryptedRecovery(
  attemptId: string,
  answers: Record<string, RecoverableAnswer>,
) {
  const ids = Object.keys(answers);
  if (!ids.length) {
    localStorage.removeItem(dataName(attemptId));
    return;
  }
  const key = await getKey(attemptId, true);
  if (!key) return;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(answers));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  localStorage.setItem(
    dataName(attemptId),
    JSON.stringify({ iv: toBase64(iv), data: toBase64(new Uint8Array(encrypted)) }),
  );
}

export async function loadEncryptedRecovery(attemptId: string) {
  const stored = localStorage.getItem(dataName(attemptId));
  const key = await getKey(attemptId, false);
  if (!stored || !key) return {} as Record<string, RecoverableAnswer>;
  try {
    const payload = JSON.parse(stored) as { iv: string; data: string };
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(payload.iv) },
      key,
      fromBase64(payload.data),
    );
    return JSON.parse(new TextDecoder().decode(decrypted)) as Record<string, RecoverableAnswer>;
  } catch {
    return {} as Record<string, RecoverableAnswer>;
  }
}

export function clearEncryptedRecovery(attemptId: string) {
  localStorage.removeItem(dataName(attemptId));
  sessionStorage.removeItem(keyName(attemptId));
}

