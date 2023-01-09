log1('checkpoint 00');
import { Blob } from 'buffer';
global.Blob = Blob;
import { AssetManager } from '@slide-computer/assets';
import { fileURLToPath } from 'url';
import { HttpAgent } from '@dfinity/agent';
import fetch from 'isomorphic-fetch';
import fs from 'fs';
import imageThumbnail from 'image-thumbnail';
import mmm from 'mmmagic';
import { createRequire } from 'node:module';
import path from 'path';
import prettier from 'prettier';
import sha256File from 'sha256-file';
import {
  canisterId,
  createActor,
} from '../../src/declarations/dip721_nft_container/index.js';
import { identity } from './identity.js';

const log1 = console.log;
log1('checkpoint 1');
const require = createRequire(import.meta.url);
const localCanisterIds = require('../../.dfx/local/canister_ids.json');
const nftConfig = require('./nfts.json');
const encoder = new TextEncoder();

log1('checkpoint 2');
//package.json:   "type": "module",
const localport = '4943';
const agent = new HttpAgent({
  identity: await identity,
  host: 'http://127.0.0.1:' + localport,
  fetch,
}); //If we want to talk to the IC mainnet, the host should point to https://ic0.app.

log1('checkpoint 2');
const effectiveCanisterId =
  canisterId?.toString() ?? localCanisterIds.nft.local;

const assetCanisterId = localCanisterIds.asset.local;
const actor = createActor(effectiveCanisterId, {
  agent,
});
log1('checkpoint 4');

const assetManager = new AssetManager({
  canisterId: assetCanisterId,
  agent,
  concurrency: 32, // Optional (default: 32), max concurrent requests.
  maxSingleFileSize: 450000, // Optional bytes (default: 450000), larger files will be uploaded as chunks.
  maxChunkSize: 1900000, // Optional bytes (default: 1900000), size of chunks when file is uploaded as chunks.
});

log1('checkpoint 5');
// Prepare assets and metadata
nftConfig.reduce(async (prev, nft, idx) => {
  await prev;
  console.log('starting upload for ' + nft.asset);

  log1('nftConfig 1');
  // Parse metadata, if present
  const metadata = Object.entries(nft.metadata ?? []).map(([key, value]) => {
    return [key, { TextContent: value }];
  });

  log1('nftConfig 2');
  const filePath = path.join(
    fileURLToPath(import.meta.url),
    '..',
    'assets',
    nft.asset
  );

  log1('nftConfig 3');
  const file = fs.readFileSync(filePath); // Blob of file
  const sha = sha256File(filePath); // SHA of file

  log1('nftConfig 4');
  // Prepare thumbnail
  const options = {
    width: 256,
    height: 256,
    jpegOptions: { force: true, quality: 90 },
  };
  console.log('generating thumbnail');
  const thumbnail = await imageThumbnail(filePath, options);

  log1('nftConfig 6');
  // Detect filetype
  const magic = await new mmm.Magic(mmm.MAGIC_MIME_TYPE);
  const contentType = await new Promise((resolve, reject) => {
    magic.detectFile(filePath, (err, result) => {
      if (err) reject(err);
      resolve(result);
    });
  });
  console.log('detected contenttype of ', contentType);

  /**
   * For asset in nfts.json
   *
   * Take asset
   * Check extenstion / mimetype
   * Sha content
   * Generate thumbnail
   * Upload both to asset canister -> file paths
   * Generate metadata from key / value
   * Mint ^
   */
  log1('nftConfig 8');
  // Upload Assets
  const uploadedFilePath = `token/${idx}${path.extname(nft.asset)}`;
  const uploadedThumbnailPath = `thumbnail/${idx}.jpeg`;

  console.log('uploading asset to ', uploadedFilePath);

  log1('nftConfig 10');
  await assetManager.insert(file, { fileName: uploadedFilePath });
  console.log('uploading thumbnail to ', uploadedThumbnailPath);

  log1('nftConfig 11');
  await assetManager.insert(thumbnail, { fileName: uploadedThumbnailPath });

  log1('nftConfig 13');
  // Assemble the data and mint
  const data = [
    [
      'location',
      {
        TextContent: `http://${assetCanisterId}.localhost:${localport}/${uploadedFilePath}`,
      },
    ],
    [
      'thumbnail',
      {
        TextContent: `http://${assetCanisterId}.localhost:${localport}/${uploadedThumbnailPath}`,
      },
    ],
    ['contentType', { TextContent: contentType }],
    ['contentHash', { BlobContent: [...encoder.encode(sha)] }],
    ...metadata,
  ];

  log1('nftConfig 14');
  const principal = await (await identity).getPrincipal();
  const mintResult = await actor.mint(principal, BigInt(idx), data);
  console.log('result: ', mintResult);

  const metaResult = await actor.tokenMetadata(0n);
  console.log('new token info: ', metaResult);

  console.log(
    'token metadata: ',
    prettier.format(
      JSON.stringify(metaResult, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      ),
      { parser: 'json' }
    )
  );
});
