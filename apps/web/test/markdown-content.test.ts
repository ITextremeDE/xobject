import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MarkdownContent} from '../src/components/markdown-content';
const render=(children:string)=>renderToStaticMarkup(createElement(MarkdownContent,{children}));
test('shared Markdown rendering retains headings, nested lists, numbered offsets and literal timestamp lines',()=>{
 const html=render('# Heading\n\n## Section\n\n###### Small heading\n\n- First\n  - Nested\n\n3. Third\n\n> Quote\n\n----- 04.11.2026 14:35 (John Doe) -----\nhere I write');
 assert.match(html,/<h1[^>]*>Heading<\/h1>/);assert.match(html,/<h2[^>]*>Section<\/h2>/);assert.match(html,/<h6[^>]*>Small heading<\/h6>/);
 assert.equal((html.match(/<ul\b/g)??[]).length,2);assert.match(html,/<ol[^>]*start="3"/);assert.match(html,/<blockquote\b/);
 assert.match(html,/----- 04\.11\.2026 14:35 \(John Doe\) -----\nhere I write/);
});
test('Markdown previews omit raw HTML and images and sanitize unsafe links',()=>{
 const html=render('<script>alert(1)</script>\n\n<img src="https://example.test/track">\n\n![Image](https://example.test/image.png)\n\n[Unsafe](javascript:alert(1))\n\n[Safe](https://example.test/)');
 assert.doesNotMatch(html,/<script|<img|href="javascript:/);assert.match(html,/href="https:\/\/example.test\/"/);
});
