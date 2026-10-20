import { Readable } from 'node:stream';
import {createPortability,readArchive,canonicalJson} from '@runeditrun/rer/modules/portability';
import {ArchiveVerifier} from '@runeditrun/rer/modules/portability/format';
import {prepareEaselExportTransform} from '../../src/easel/erasure-archive/prepare.mjs';

export async function createEaselExportService(options) {
 const {policy,metadata}=await prepareEaselExportTransform(options);
 const service=await createPortability({...options,policy});
 const download=service.exports.download;
 service.exports.download = async id => {
  const source = await download(id);
  if (!metadata) return source;
  return Readable.toWeb(Readable.from((async function* () {
   let verifier;
   // Verify the complete Base stream too; only the manifest binding changes.
   for await (const record of readArchive(source)) {
    if (record.kind === 'manifest') {
     record.transforms = [...(record.transforms ?? []), metadata];
     verifier = new ArchiveVerifier(record);
    } else if (record.kind === 'part') verifier.add(record);
    else record.archiveHash = verifier.digest();
    yield Buffer.from(canonicalJson(record) + '\n');
   }
  })()));
 };
 return service;
}
