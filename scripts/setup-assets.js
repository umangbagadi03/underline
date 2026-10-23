// One-time setup for developers: put every file the app needs into public/,
// so the app never fetches anything from other websites while people use it.
//   - AI runtime (onnxruntime-web .wasm) for the search model
//   - the small search model (bge-small-en-v1.5) from Hugging Face
//   - pdf.js fonts, character maps and image decoders
// Safe to run again: files that already exist are skipped.

import { copyFile, cp, mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');

const MODEL = 'Xenova/bge-small-en-v1.5';
const MODEL_FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_fp16.onnx', 'onnx/model_quantized.onnx'];
const ORT_FILES = ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'];
const PDFJS_FOLDERS = ['standard_fonts', 'cmaps', 'wasm'];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyRuntime() {
  const folder = join(pub, 'ort');
  await mkdir(folder, { recursive: true });
  for (const file of ORT_FILES) {
    await copyFile(join(root, 'node_modules/onnxruntime-web/dist', file), join(folder, file));
  }
  console.log('AI runtime copied to public/ort/');
}

async function copyPdfjsData() {
  for (const name of PDFJS_FOLDERS) {
    const from = join(root, 'node_modules/pdfjs-dist', name);
    await cp(from, join(pub, 'pdfjs', name), { recursive: true });
  }
  console.log('pdf.js data copied to public/pdfjs/');
}

async function downloadModel() {
  for (const file of MODEL_FILES) {
    const target = join(pub, 'models', MODEL, file);
    if (await exists(target)) continue;
    const url = `https://huggingface.co/${MODEL}/resolve/main/${file}`;
    console.log(`downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  console.log(`search model ready in public/models/${MODEL}/`);
}

await copyRuntime();
await copyPdfjsData();
await downloadModel();
