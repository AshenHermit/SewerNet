export interface StoredOidcFlow {
  schema: 1;
  state: string;
  issuer: string;
  redirectUri: string;
  sdkStateKey: string;
  sdkState: string;
  createdAt: number;
  context: {
    homeserverUrl: string;
    nonce: string;
    responseMode: 'query' | 'fragment';
    action?: 'register';
    revocationEndpoint?: string;
    redirectUri: string;
  };
  status: 'pending' | 'processing';
}

export interface ClaimedOidcCallback {
  flow: StoredOidcFlow;
  callback: { state: string; code?: string; error?: string };
}
