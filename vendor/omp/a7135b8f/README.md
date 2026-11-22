# Pinned OMP 19.1.0 package inputs

The twelve core archives in this directory are the official npm archives for OMP 19.1.0, revision `a7135b8f31826c878734388b648f52bed8da436e`. Keep the archive bytes unchanged. [The copy manifest](copy-manifest.json) records source URLs, sizes and digests, including the six platform-specific native leaves. The leaves resolve from npm rather than Git; Docker and Electron consume the same pinned closure.

Root `patchedDependencies` applies the existing third-party patches and the application SDK patch to the vendored archive. The SDK patch retains offline initial model discovery and Bash job observation; it also preserves explicitly configured tool-command settings under their new names, authorizes native Bash at execution without replacing the built-in, routes special commands through the registered tool policy wrapper, and backports [OMP PR 20113](https://github.com/can1357/oh-my-pi/pull/20113) for MCP negotiation fallback.

The npm archive omits the browser relay extension workspace. The SDK patch keeps the native messaging host identifier in the package so that importing the SDK does not require that unpublished workspace.

To refresh artifacts, verify the official npm provenance and integrity for the target release; compare archive sizes and SHA-256 against the manifest. Update the root and service manifests, lockfile, Docker inputs and desktop staging checks together. Verify the SDK patch against a pristine extraction of the coding-agent archive before installing.
