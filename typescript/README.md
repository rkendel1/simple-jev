# Simple Jev TypeScript

This package is a dependency-free TypeScript port of the repository's
engine-independent classifier contract. It preserves the v1 request validation,
canonical prompt construction, label mappings, and logits-to-response scoring.
Model-specific inference remains an adapter concern: pass one logits row per
prompt branch to `buildResponse`.

```sh
cd typescript
npm install
npm test
```

The Python implementation remains available for the Hugging Face/PyTorch server.
This package is intended for Node.js services and browser-compatible adapters.
