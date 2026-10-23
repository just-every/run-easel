# Enterprise identity

Enterprise identity is disabled until deployment configuration is supplied. Native sign-in and the installation owner continue through Base. SAML and OIDC sign in existing native accounts; neither creates a person from an assertion or an email claim. SCIM is the separately authenticated provisioning door.

This implementation awaits the clause owner's approval of the enterprise administration policy. It provides an IdP fake proof, rather than a held-key Okta, Microsoft Entra ID, Google Workspace or Auth tenant receipt.

## Installation configuration

Set configuration as deployment bindings/secrets; never place private keys, provisioning bearers or client secrets in a repository, browser bundle, archive or support message.

| Binding | Purpose |
| --- | --- |
| `EASEL_SAML_CONFIG` | JSON object described below. Absent means no SAML routes or sign-in link. |
| `EASEL_OIDC_PROVIDERS` | JSON array of Base OIDC provider configurations. Absent means no additional OIDC providers. |
| `OIDC_TRANSACTION_SECRET` | Independent secret of at least 32 characters, required with OIDC. Must differ from the session and SCIM secrets. |
| `EASEL_SCIM_CONFIG` | JSON object with the exact active native `ownerEmail` and the initial ordinary planning `role`, either `viewer` or `contributor`. Absent means SCIM is unavailable. |
| `EASEL_SCIM_TOKEN` | Separate provisioning bearer, 32–1024 non-whitespace characters. Must differ from the session and OIDC secrets. |

Configuration alone does not turn on provider sign-in: the native owner enables identity-provider sign-in through Base's `/auth/settings/identity` door. Turning that setting off revokes provider sessions. SCIM requires its configured owner to remain an active native owner on every request and in each mutation's transaction.

The SAML configuration fields are:

- `id`: route identifier, a lowercase letter followed by up to 31 lowercase letters, digits or hyphens.
- `issuer`: exact IdP entity identifier, including a tenant identifier or query where the provider uses one. HTTPS URLs and absolute URNs are supported.
- `idpSsoUrl`: exact HTTPS SSO endpoint, including a provider-required query and without fragment or credentials. Local HTTP is accepted only on literal loopback hosts in local mode.
- `idpCert`: the IdP's pinned PEM X.509 signing certificate, supplied by the administrator. Embedded response certificates never establish trust.
- `spEntityId`: the app's service-provider entity identifier registered with the IdP.
- `subjectEmails`: nonempty object mapping exact, case-sensitive persistent NameIDs to existing native account emails. A provider's email claim cannot replace this map.
- Optional `spPrivateKey` and `spCert`: PEM signing key and certificate when the IdP requires signed authentication requests. Supply both together.

Register the callback `/auth/saml/<id>/callback` at the installation origin. Download SP metadata from `GET /auth/saml/<id>/metadata`. Configure the IdP to sign **both the response and assertion**, use RSA SHA-256 or RSA SHA-512 for assertions, send a bearer subject confirmation to that exact callback and a bounded assertion expiry, and target the configured SP audience. The browser starts at `GET /auth/saml/<id>/start`, which presents a form; its same-origin POST opens the real protocol transaction. IdP-initiated unsolicited assertions and logout requests are refused.

Each transaction is bound to its browser cookie, random RelayState, exact request ID and configuration fingerprint. It lasts ten minutes and is consumed atomically before verification, including failed verification. The SAML library checks XML signatures against the configured certificate, request correlation, conditions and audience; Easel additionally requires the exact signed response destination and success status, issuer, mapped NameID, bearer recipient, signed request correlation, expiry and current native account. No route accepts asserted identity JSON.

SAML entity identifiers are encoded into an injective internal HTTPS namespace for Base's account-binding seam, because SAML supports URN and query-bearing entity identifiers. The verifier still compares the assertion's actual issuer with the configured IdP entity identifier. This internal namespace is never an outbound endpoint.

For OIDC, each array item follows Base's existing `IdentityProviderConfig`: `id`, `preset`, client registration, and a nonempty `subjectEmails` map. Supported presets are `okta`, `microsoft`, `google` and `auth`. Okta and Auth take their exact `issuer`; Microsoft takes `tenant`; Google's issuer is fixed by Base. Auth uses `private_key_jwt` with the deployment's private JWK; other presets support Base's registered client authentication methods. Base performs discovery, pins the registration, verifies signed ID tokens and checks state, PKCE, nonce, issuer, audience and expiry. The enterprise completion hook requires the configured subject association even where a preset also supports verified-email admission. A rejected completion is revoked before the response returns. Existing unrelated Base dependency providers retain their own admission policy.

## SCIM 2.0

Use the installation's `/scim/v2` base URL with `Authorization: Bearer <dedicated provisioning token>` and `Content-Type: application/scim+json`. Session cookies never authorize SCIM. Discovery is authenticated too.

The server provides `ServiceProviderConfig`, `ResourceTypes`, `Schemas`, `Users` and `Groups`. User and Group collections support POST and GET; individual resources support GET, PUT, PATCH and DELETE. List requests support `startIndex`, `count` up to 100, and equality filters on `id`, `externalId`, `userName` or `displayName`. Unsupported filters, protected attributes and operations fail explicitly. Bulk, sorting and password changes are unavailable. Responses carry resource locations and ETags; a supplied stale `If-Match` returns 412. Mutations also fence the model revision and the native target's current role, status and version within the D1 batch, returning 409 if they changed.

A new User requires an email-valued `userName` and a `displayName` or `name.formatted`. It creates an ordinary native member and a group-only planning membership in the configured initial role, with no direct departments, Pay detail or capabilities. Existing native accounts or planning memberships cannot be adopted or overwritten. SCIM never creates or promotes an owner/admin and never changes an existing planning role. Native finance can deliberately change the ordinary member's role and grants; SCIM preserves them. Renaming an email or changing `externalId` is refused.

User PATCH supports `add`/`replace` for `active`, `displayName`, `name.formatted` and the supported identity attributes. Email changes remain immutable. Setting `active:false` immediately deactivates the native account and membership and revokes its sessions, sign-in links, API credentials and provider binding in the same revision-fenced batch. Repeated deactivation stays inactive. Reactivation cannot revive a direct or group Pay grant: the native owner must handle that case. DELETE deactivates, revokes and removes the SCIM association; it retains historical planning attribution. A deleted native account cannot subsequently be adopted by SCIM POST.

A new Group creates an existing `access-group` record with no grants. Native owner/admin sessions configure its department/dimension grants, scenario shares and capabilities through Easel's ordinary group commands. SCIM updates membership only, plus its display name. Group PATCH supports adding/removing/replacing `members` and removing a member with `members[value eq "<SCIM User id>"]`. Members must be active, ordinary SCIM-managed people. Removing membership ends grants on the next request through the existing ACCESS-001 authority calculation; it never changes the person's planner/viewer role or expands an existing token's issuance ceiling.

SCIM cannot grant Pay detail or modify any pay-enabled group, including its name, members or deletion. Deprovisioning a member still ends all of that person's authority; it retains the inaccessible pay-group membership for native-owner administration. Deleting a non-pay group also removes its scenario shares so recreation cannot revive access. Group authority preserves existing department/dimension intersections, current connection custody, statement filtering and token ceilings.

Native member names/emails remain the historical attribution source after deprovisioning. Provisioning associations and SAML correlations live only in `oa_enterprise_*` security tables, covered by Base's existing `oa_%` archive exclusion. A native email change, including person erasure, atomically removes that person's SCIM external identifier and retained provider subject sessions. SCIM resources pass through the existing durable erasure map; erased users cannot be looked up through their former SCIM id. Ordinary planning records, audit values and retained history continue through Easel's existing erasure/export policy.

## Edition composition and evidence

Spread `enterpriseAuthConfig(env)` into the existing Base auth config, pass `enterpriseAuthHooks(env)` to `createOperatorAuth`, and mount `enterpriseIdentityResponse(request, env, auth)` before Base auth and product routes. The helper accepts the existing auth service to avoid a cyclic import. The SAML start link uses Base's supported `SignInPageOptions.links` extension. Apply the additive `0021_enterprise_identity.sql` migration. The runtime requires `nodejs_compat` and `@node-saml/node-saml` 5.1.0 and `xml2js` 0.6.2; `xml-crypto` 6.1.2 is a direct test dependency for the fake signer.

`tests/enterprise-identity.test.mjs` follows the public HTTP doors on real workerd/D1, with only the network IdP replaced. It generates a fresh signing key/certificate at runtime, exercises SAML requests and signed callback forms, OIDC discovery/authorization/code/PKCE/token verification, live group grants, removal, credential revocation, retained submission names and erasure. Its second journey refuses unsigned/tampered, unassociated, expired and misdirected SAML assertions and OIDC nonce/subject failures. The parent integration runs these tests and typecheck; the implementation lane does not claim provider sandbox certification.
