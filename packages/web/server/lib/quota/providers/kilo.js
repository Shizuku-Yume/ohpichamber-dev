import { credentialAccessToken } from './selected-credential.js';
import { buildResult, toUsageWindow, toNumber, formatMoney, asNonEmptyString, asObject } from '../utils/index.js';

export const providerId = 'kilo';
export const providerName = 'Kilo Code';

const KILO_BALANCE_URL = 'https://api.kilo.ai/api/profile/balance';

const getApiKey = (credential) => credentialAccessToken(credential);





const parseBalance = (value) => toNumber(asNonEmptyString(value)
  ?? (Number.isFinite(value) ? value : null));

export const isConfigured = (auth) => Boolean(getApiKey(auth));

export const fetchQuota = async ({ credential, fetchImpl = fetch } = {}) => {
  
  const apiKey = getApiKey(credential);

  if (!apiKey) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: 'Not configured'
    });
  }

  

  const timeoutSignal = AbortSignal.timeout(15_000);

  try {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'identity'
    };
    

    const response = await fetchImpl(KILO_BALANCE_URL, {
      method: 'GET',
      headers,
      signal: timeoutSignal
    });

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: response.status === 401 || response.status === 403
          ? 'Session expired — please re-authenticate with Kilo Code'
          : `API error: ${response.status}`
      });
    }

    const payload = asObject(await response.json());
    const balance = parseBalance(payload?.balance);

    if (balance === null) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: 'No quota data in response'
      });
    }

    const windows = {
      credits_balance: toUsageWindow({
        usedPercent: null,
        windowSeconds: null,
        resetAt: null,
        valueLabel: `$${formatMoney(balance)}`
      })
    };

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows }
    });
  } catch (error) {
    const isTimeout = error instanceof DOMException && (
      error.name === 'TimeoutError' || (error.name === 'AbortError' && timeoutSignal.aborted)
    );
    const isParseError = error instanceof SyntaxError;
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: isTimeout
        ? 'Request timed out'
        : isParseError
          ? 'Invalid response from provider'
          : ('Request failed')
    });
  }
};
