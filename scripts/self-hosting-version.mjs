/** Current install instructions follow the latest Changelog release; upgrade examples stay historical. */
export function assertSelfHostingVersion(changelog, guide) {
 const version=changelog.match(/^## \[(\d+\.\d+\.\d+(?:-[\w.-]+)?)\]/m)?.[1];
 if(!version)throw Error('Changelog has no released version');
 const current=guide.split('## Initialize and sign in')[0];
 const versions=[...current.matchAll(/Community (\d+\.\d+\.\d+)|\/v(\d+\.\d+\.\d+)|xobject-(\d+\.\d+\.\d+)/g)].map(match=>match[1]??match[2]??match[3]);
 if(!versions.length||versions.some(value=>value!==version))throw Error(`Self-hosting installation instructions must consistently use latest release ${version}`);
 return version;
}
