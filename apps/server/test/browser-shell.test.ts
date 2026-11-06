import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserShell,webManifest} from '../src/browser-shell.js';
test('HTML metadata escapes administrator text and keeps links generic',()=>{
 const html=browserShell('<title>__APP_NAME__</title><meta content="__APP_DESCRIPTION__"><meta content="__APP_ORIGIN__/">','https://example.test','A <script>','" & private');
 assert.equal(html,'<title>A &lt;script&gt;</title><meta content="&quot; &amp; private"><meta content="https://example.test/">');
 const manifest=webManifest('Example');assert.equal(manifest.id,'/');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.icons.length,3);assert.equal(manifest.icons[2].purpose,'maskable');
});
