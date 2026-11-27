# Shared page client

## Ownership

This module owns the shared-page request failure contract and synthetic answer parsing. The server owns recipients, encryption, relay links, PINs and authoritative page state. The author's card (`SharedPageCard`) and its group/upload/preview reads were dropped with the OpenCode-parts chat modules in merge `ea32dd3f3f`; restoring them is a recorded regression task, and git history carries the implementation this document's invariants describe.

## Invariants

- Cards read the server's group instead of the agent's tool result because tool results contain no links or PINs. Failed reads throw and unknown statuses request no action; enterprise refusal exposes no links, PINs or preview.
- Uploads retain source content with the sealed document so a recipient's agent can read the program or HTML rather than reverse-engineering its themed rendering. Preview reads the server's own copy without the relay.
- Answer identity comes from server metadata and an unverified-sender envelope. Summary and data lines decode JSON before shape validation so sender text remains data rather than a trusted instruction.
