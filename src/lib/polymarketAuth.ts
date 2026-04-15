// Polymarket CLOB L1 / L2 authentication

export const CLOB_URL = 'https://clob.polymarket.com'

export interface ApiCredentials {
  apiKey: string
  secret: string
  passphrase: string
  address: string
}

const KEY = 'pm_api_v1'

export function loadCreds(address: string): ApiCredentials | null {
  try {
    const raw = localStorage.getItem(`${KEY}_${address.toLowerCase()}`)
    return raw ? (JSON.parse(raw) as ApiCredentials) : null
  } catch { return null }
}

export function clearCreds(address: string) {
  try { localStorage.removeItem(`${KEY}_${address.toLowerCase()}`) } catch {}
}

function saveCreds(c: ApiCredentials) {
  localStorage.setItem(`${KEY}_${c.address.toLowerCase()}`, JSON.stringify(c))
}

// L1: sign EIP-712 ClobAuth message to create API key
export async function createApiKey(
  walletClient: any,
  address: string,
): Promise<ApiCredentials | null> {
  try {
    const nonceRes = await fetch(`${CLOB_URL}/auth/nonce`)
    if (!nonceRes.ok) return null
    const { nonce } = await nonceRes.json()
    const timestamp = Math.floor(Date.now() / 1000).toString()

    const signature = await walletClient.signTypedData({
      account: address as `0x${string}`,
      domain: { name: 'ClobAuthDomain', version: '1', chainId: 137 },
      types: {
        ClobAuth: [
          { name: 'address', type: 'address' },
          { name: 'timestamp', type: 'string' },
          { name: 'nonce', type: 'uint256' },
          { name: 'message', type: 'string' },
        ],
      },
      primaryType: 'ClobAuth',
      message: {
        address: address as `0x${string}`,
        timestamp,
        nonce: BigInt(nonce),
        message: 'This message attests that I control the given wallet',
      },
    })

    const res = await fetch(`${CLOB_URL}/auth/api-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'POLY_ADDRESS': address,
        'POLY_SIGNATURE': signature,
        'POLY_TIMESTAMP': timestamp,
        'POLY_NONCE': nonce.toString(),
      },
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('createApiKey failed', res.status, err)
      return null
    }
    const data = await res.json()
    const creds: ApiCredentials = {
      apiKey: data.apiKey ?? data.api_key,
      secret: data.secret,
      passphrase: data.passphrase,
      address,
    }
    saveCreds(creds)
    return creds
  } catch (e) {
    console.error('createApiKey error', e)
    return null
  }
}

export async function getOrCreateCreds(
  walletClient: any,
  address: string,
): Promise<ApiCredentials | null> {
  return loadCreds(address) ?? createApiKey(walletClient, address)
}

// HMAC-SHA256 with base64-decoded secret → base64-encoded signature
async function hmacBase64(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  let secretBytes: Uint8Array
  try {
    secretBytes = Uint8Array.from(atob(secret), c => c.charCodeAt(0))
  } catch {
    secretBytes = enc.encode(secret)
  }
  const key = await crypto.subtle.importKey(
    'raw', secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return btoa(Array.from(new Uint8Array(sig)).map(b => String.fromCharCode(b)).join(''))
}

// Build L2 auth headers for a CLOB request
export async function buildL2Headers(
  creds: ApiCredentials,
  method: string,
  path: string,
  body = '',
): Promise<Record<string, string>> {
  const ts = Math.floor(Date.now() / 1000).toString()
  const sig = await hmacBase64(creds.secret, ts + method.toUpperCase() + path + body)
  return {
    'POLY_ADDRESS': creds.address,
    'POLY_API_KEY': creds.apiKey,
    'POLY_PASSPHRASE': creds.passphrase,
    'POLY_SIGNATURE': sig,
    'POLY_TIMESTAMP': ts,
    'POLY_NONCE': '0',
  }
}
