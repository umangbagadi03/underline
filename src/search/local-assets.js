// Tell the search model library to use files served by this app, never the internet.
// The files are put in public/ by scripts/setup-assets.js.

import { env } from '@huggingface/transformers';

export function useLocalAssets() {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = '/models/';
  env.backends.onnx.wasm.wasmPaths = {
    mjs: '/ort/ort-wasm-simd-threaded.asyncify.mjs',
    wasm: '/ort/ort-wasm-simd-threaded.asyncify.wasm',
  };
}
