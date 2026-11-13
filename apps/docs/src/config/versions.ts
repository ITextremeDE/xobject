// Only published, retained snapshots belong in the public picker.
export const releasedVersions = ['1.7.0', '1.6.0', '1.5.0', '1.4.0', '1.3.0', '1.2.0', '1.1.0', '1.0.2', '1.0.1', '1.0.0'];
export const documentationVersion = process.env.XOBJECT_DOCS_VERSION;
export const versionLabel = documentationVersion
  ? `${/^\d+\.\d+\.\d+$/.test(documentationVersion) ? 'Release' : 'Unreleased snapshot'} ${documentationVersion}`
  : 'Current development';
const snapshotVersions = documentationVersion && /^\d+\.\d+\.\d+$/.test(documentationVersion) && !releasedVersions.includes(documentationVersion)
  ? [documentationVersion, ...releasedVersions]
  : releasedVersions;
export const versionOptions = [
  {label:'Current development', value:'https://docs.xobject.org/', selected:!documentationVersion},
  ...snapshotVersions.map(version=>({label:`Release ${version}`,value:`https://docs.xobject.org/versions/${version}/`,selected:version===documentationVersion})),
  ...(documentationVersion&&!snapshotVersions.includes(documentationVersion)
    ? [{label:versionLabel,value:`https://docs.xobject.org/versions/${documentationVersion}/`,selected:true}]:[]),
];
