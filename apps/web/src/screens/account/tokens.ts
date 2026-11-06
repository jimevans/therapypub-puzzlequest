import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

/** The tokens in emailed links are base64url. */
const WELL_FORMED = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Takes the one-time token from an emailed link's address, and removes it from
 * the address bar and the browser's history, where someone else could find it.
 * @returns the token, or null if the link doesn't have one that could be valid
 */
export function useTokenFromLink(): string | null {
  const [searchParams, setSearchParams] = useSearchParams();
  const [token] = useState(() => {
    const found = searchParams.get("token");
    return found && WELL_FORMED.test(found) ? found : null;
  });
  const hasAddressToken = searchParams.has("token");

  useEffect(() => {
    if (hasAddressToken) {
      setSearchParams({}, { replace: true });
    }
  }, [hasAddressToken, setSearchParams]);

  return token;
}
