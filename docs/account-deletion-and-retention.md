# Account deletion and retained transaction records

The authenticated `DELETE /api/v1/user/account` endpoint permanently removes
buyer and driver account records. It also removes carts, wishlists, reviews,
personal notifications, the profile image, and the corresponding Firebase
Authentication identity. Sign in with Apple authorization is revoked by the
iOS client immediately before it calls this endpoint.

Orders, payment records, and delivery records are not deleted because they can
be required for accounting, fraud, dispute, and tax records. The deletion flow
severs the account relationship and removes delivery name, phone, address,
location, payment nonce, and other directly identifying account fields from
those operational records.

French guidance says accounting documents and supporting documents such as
customer invoices and purchase orders are generally retained for 10 years from
the close of the financial year. The production operator must confirm the exact
retention schedule with its accountant or legal adviser and ensure any formal
invoice archive is access-controlled and purged when its legal period expires.

References:

- CNIL, data-retention lifecycle and the 10-year billing example:
  https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees
- French public service, business document retention periods:
  https://entreprendre.service-public.fr/vosdroits/F10029
- Apple, account deletion and Sign in with Apple token revocation:
  https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple

Operational requirements:

1. Keep Firebase Admin credentials available in every production instance.
2. Monitor failed deletion requests and external-provider errors.
3. Limit access to legally retained accounting records.
4. Document the final jurisdiction-specific schedule in the published privacy
   policy and delete archived records after that schedule ends.
