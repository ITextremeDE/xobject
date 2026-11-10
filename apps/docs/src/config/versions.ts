// Only published, retained snapshots belong in the public picker.
export const releasedVersions = ['1.0.1', '1.0.0'];
export const documentationVersion = process.env.XOBJECT_DOCS_VERSION;
export const versionLabel = documentationVersion
  ? `${/^\d+\.\d+\.\d+$/.test(documentationVersion) ? 'Release' : 'Unreleased snapshot'} ${documentationVersion}`
  : 'Current development';
export const versionOptions = [
  {label:'Current development', value:'https://docs.xobject.org/', selected:!documentationVersion},
  ...releasedVersions.map(version=>({label:`Release ${version}`,value:`https://docs.xobject.org/versions/${version}/`,selected:version===documentationVersion})),
  ...(documentationVersion&&!releasedVersions.includes(documentationVersion)
    ? [{label:versionLabel,value:`https://docs.xobject.org/versions/${documentationVersion}/`,selected:true}]:[]),
];
