const fs = require('node:fs');
const path = require('node:path');
const ResEdit = require('resedit');

const electronRoot = path.resolve(__dirname, '..');
const versionInfo = JSON.parse(fs.readFileSync(path.join(electronRoot, '..', 'config', 'version.json'), 'utf-8'));
const exePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(electronRoot, 'dist-package', 'win-unpacked', `${versionInfo.productName}.exe`);

if (!fs.existsSync(exePath)) {
  throw new Error(`exe not found: ${exePath}`);
}

const version = versionInfo.releaseVersion;
const productName = versionInfo.productName;
const description = `${productName} Runtime Workbench`;

const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
const res = ResEdit.NtExecutableResource.from(exe);
const versions = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
const vi = versions[0] || ResEdit.Resource.VersionInfo.createEmpty();
const language = { lang: 1033, codepage: 1200 };

vi.setFileVersion(version, language.lang);
vi.setProductVersion(version, language.lang);
vi.setStringValues(language, {
  CompanyName: 'howtion',
  FileDescription: description,
  FileVersion: version,
  InternalName: `${productName}.exe`,
  OriginalFilename: `${productName}.exe`,
  ProductName: productName,
  ProductVersion: version,
  LegalCopyright: 'Copyright (C) howtion. All rights reserved.',
}, true);
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));

console.log(JSON.stringify({ exePath, productName, version }, null, 2));
