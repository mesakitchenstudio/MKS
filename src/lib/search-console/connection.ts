import "server-only";
import { getDb } from "@/lib/db";
import {
  inferSearchConsolePropertyType,
  listSearchConsoleSites,
  type SearchConsoleSiteEntry,
} from "@/lib/search-console/api";
import { openSearchConsoleSecret, sealSearchConsoleSecret } from "@/lib/search-console/crypto";
import { SearchConsoleError } from "@/lib/search-console/errors";
import {
  fetchSearchConsoleGoogleAccountEmail,
  refreshSearchConsoleAccessToken,
  revokeSearchConsoleToken,
} from "@/lib/search-console/oauth";
import { SEARCH_CONSOLE_SCOPES, searchConsoleScopesAreSufficient } from "@/lib/search-console/scopes";

export type SearchConsoleConnectionPublic = {
  connected: boolean;
  status: string;
  googleAccountEmail: string;
  selectedProperty: string;
  selectedPropertyType: string;
  hasProperty: boolean;
  connectedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastSyncCompletedAt: string | null;
  lastDataDate: string | null;
  lastErrorCode: string;
  lastErrorMessage: string;
  scopesSufficient: boolean;
};

function toPublic(
  row: {
    status: string;
    googleAccountEmail: string;
    selectedProperty: string;
    selectedPropertyType: string;
    connectedAt: Date | null;
    lastSuccessfulSyncAt: Date | null;
    lastSyncCompletedAt: Date | null;
    lastDataDate: Date | null;
    lastErrorCode: string;
    lastErrorMessage: string;
    scopes: string;
    refreshTokenEnc: string;
  } | null,
): SearchConsoleConnectionPublic {
  if (!row || row.status === "disconnected" || !row.refreshTokenEnc) {
    return {
      connected: false,
      status: row?.status || "disconnected",
      googleAccountEmail: row?.googleAccountEmail || "",
      selectedProperty: row?.selectedProperty || "",
      selectedPropertyType: row?.selectedPropertyType || "",
      hasProperty: Boolean(row?.selectedProperty),
      connectedAt: null,
      lastSuccessfulSyncAt: row?.lastSuccessfulSyncAt?.toISOString() ?? null,
      lastSyncCompletedAt: row?.lastSyncCompletedAt?.toISOString() ?? null,
      lastDataDate: row?.lastDataDate?.toISOString().slice(0, 10) ?? null,
      lastErrorCode: row?.lastErrorCode || "",
      lastErrorMessage: row?.lastErrorMessage || "",
      scopesSufficient: false,
    };
  }
  return {
    connected: row.status === "connected" || row.status === "error" || row.status === "needs_reconnect",
    status: row.status,
    googleAccountEmail: row.googleAccountEmail,
    selectedProperty: row.selectedProperty,
    selectedPropertyType: row.selectedPropertyType,
    hasProperty: Boolean(row.selectedProperty),
    connectedAt: row.connectedAt?.toISOString() ?? null,
    lastSuccessfulSyncAt: row.lastSuccessfulSyncAt?.toISOString() ?? null,
    lastSyncCompletedAt: row.lastSyncCompletedAt?.toISOString() ?? null,
    lastDataDate: row.lastDataDate?.toISOString().slice(0, 10) ?? null,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    scopesSufficient: searchConsoleScopesAreSufficient(row.scopes),
  };
}

export async function getSearchConsoleConnectionRow() {
  return getDb().searchConsoleConnection.findFirst({
    orderBy: { updatedAt: "desc" },
  });
}

export async function getSearchConsoleConnectionPublic(): Promise<SearchConsoleConnectionPublic> {
  return toPublic(await getSearchConsoleConnectionRow());
}

export async function saveSearchConsoleConnection(input: {
  accessToken: string;
  refreshToken: string;
  scopes?: string;
  adminId: string;
}): Promise<{ googleAccountEmail: string }> {
  const scopes = input.scopes?.trim() || SEARCH_CONSOLE_SCOPES.join(" ");
  if (!searchConsoleScopesAreSufficient(scopes)) {
    throw new SearchConsoleError(
      "oauth_denied",
      "Google did not grant Search Console readonly access. Disconnect and connect again, approving the requested permission.",
      scopes,
    );
  }
  const email = await fetchSearchConsoleGoogleAccountEmail(input.accessToken);
  const sealed = sealSearchConsoleSecret(input.refreshToken);
  const db = getDb();
  const existing = await db.searchConsoleConnection.findFirst({ orderBy: { updatedAt: "desc" } });
  const data = {
    googleAccountEmail: email,
    refreshTokenEnc: sealed.ciphertext,
    tokenIv: sealed.iv,
    tokenAuthTag: sealed.authTag,
    scopes,
    status: "connected",
    connectedAt: new Date(),
    connectedByAdminId: input.adminId,
    lastRefreshAt: new Date(),
    lastErrorCode: "",
    lastErrorMessage: "",
    // Preserve selectedProperty across reconnect when present.
  };

  if (existing) {
    await db.searchConsoleConnection.update({ where: { id: existing.id }, data });
  } else {
    await db.searchConsoleConnection.create({ data });
  }
  return { googleAccountEmail: email };
}

export async function disconnectSearchConsoleConnection(): Promise<void> {
  const db = getDb();
  const row = await db.searchConsoleConnection.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!row) return;

  if (row.refreshTokenEnc && row.tokenIv && row.tokenAuthTag) {
    try {
      const refreshToken = openSearchConsoleSecret({
        ciphertext: row.refreshTokenEnc,
        iv: row.tokenIv,
        authTag: row.tokenAuthTag,
      });
      await revokeSearchConsoleToken(refreshToken);
    } catch {
      // Ignore revoke/decrypt failures.
    }
  }

  await db.searchConsoleConnection.update({
    where: { id: row.id },
    data: {
      status: "disconnected",
      refreshTokenEnc: "",
      tokenIv: "",
      tokenAuthTag: "",
      lastErrorCode: "",
      lastErrorMessage: "",
      lastRefreshAt: null,
    },
  });
}

export async function getSearchConsoleAccessToken(): Promise<{
  accessToken: string;
  connectionId: string;
}> {
  const db = getDb();
  const row = await db.searchConsoleConnection.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!row || !row.refreshTokenEnc || row.status === "disconnected") {
    throw new SearchConsoleError("not_connected", "Search Console is not connected.");
  }

  let refreshToken: string;
  try {
    refreshToken = openSearchConsoleSecret({
      ciphertext: row.refreshTokenEnc,
      iv: row.tokenIv,
      authTag: row.tokenAuthTag,
    });
  } catch {
    await db.searchConsoleConnection.update({
      where: { id: row.id },
      data: {
        status: "needs_reconnect",
        lastErrorCode: "decrypt_failed",
        lastErrorMessage: "Stored Search Console credentials could not be decrypted.",
      },
    });
    throw new SearchConsoleError(
      "refresh_failed",
      "Stored Search Console credentials could not be decrypted. Connect again.",
    );
  }

  try {
    const tokens = await refreshSearchConsoleAccessToken(refreshToken);
    await db.searchConsoleConnection.update({
      where: { id: row.id },
      data: {
        status: "connected",
        lastRefreshAt: new Date(),
        lastErrorCode: "",
        lastErrorMessage: "",
        ...(tokens.scope ? { scopes: tokens.scope } : {}),
      },
    });
    return { accessToken: tokens.access_token, connectionId: row.id };
  } catch (error) {
    const revoked = error instanceof SearchConsoleError && error.code === "revoked";
    await db.searchConsoleConnection.update({
      where: { id: row.id },
      data: {
        status: revoked ? "needs_reconnect" : "error",
        lastErrorCode: revoked ? "revoked" : "refresh_failed",
        lastErrorMessage: revoked
          ? "Search Console authorization was revoked. Connect again."
          : "Could not refresh Search Console access.",
      },
    });
    throw error;
  }
}

export async function listVerifiedSearchConsoleProperties(): Promise<SearchConsoleSiteEntry[]> {
  const { accessToken } = await getSearchConsoleAccessToken();
  return listSearchConsoleSites(accessToken);
}

export async function selectSearchConsoleProperty(siteUrl: string): Promise<void> {
  const property = String(siteUrl || "").trim();
  if (!property) {
    throw new SearchConsoleError("invalid_property", "Choose a Search Console property.");
  }
  const sites = await listVerifiedSearchConsoleProperties();
  const match = sites.find((site) => site.siteUrl === property);
  if (!match) {
    throw new SearchConsoleError(
      "invalid_property",
      "That Search Console property is not available for the connected Google account.",
    );
  }
  const db = getDb();
  const row = await db.searchConsoleConnection.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!row || row.status === "disconnected" || !row.refreshTokenEnc) {
    throw new SearchConsoleError("not_connected", "Search Console is not connected.");
  }
  await db.searchConsoleConnection.update({
    where: { id: row.id },
    data: {
      selectedProperty: match.siteUrl,
      selectedPropertyType: inferSearchConsolePropertyType(match.siteUrl),
      lastErrorCode: "",
      lastErrorMessage: "",
    },
  });
}
