import Markdown from 'react-markdown';
import type {Components} from 'react-markdown';
import {Separator} from './ui/separator';

// Markdown nodes need explicit typography because Tailwind resets native browser styles.
const components:Components={
 h1:({children})=><h1 className="text-2xl font-semibold tracking-tight">{children}</h1>,
 h2:({children})=><h2 className="text-xl font-semibold tracking-tight">{children}</h2>,
 h3:({children})=><h3 className="text-lg font-semibold">{children}</h3>,
 h4:({children})=><h4 className="text-base font-semibold">{children}</h4>,
 h5:({children})=><h5 className="text-sm font-semibold">{children}</h5>,
 h6:({children})=><h6 className="text-sm font-medium text-muted-foreground">{children}</h6>,
 p:({children})=><p className="whitespace-pre-wrap">{children}</p>,
 ul:({children})=><ul className="list-disc pl-6">{children}</ul>,
 ol:({children,start})=><ol start={start} className="list-decimal pl-6">{children}</ol>,
 li:({children})=><li className="my-1">{children}</li>,
 blockquote:({children})=><blockquote className="flex flex-col gap-2 border-l-2 pl-4 text-muted-foreground italic">{children}</blockquote>,
 a:({children,href,title})=><a href={href} title={title} className="text-primary underline underline-offset-4">{children}</a>,
 code:({children})=><code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">{children}</code>,
 pre:({children})=><pre className="overflow-x-auto rounded-lg bg-muted p-3 whitespace-pre [&>code]:p-0">{children}</pre>,
 hr:()=> <Separator/>,
};
const allowedElements=['p','strong','em','a','ul','ol','li','blockquote','code','pre','h1','h2','h3','h4','h5','h6','br','hr'];
export function MarkdownContent({children}:{children:string}){
 return <div className="flex min-w-0 flex-col gap-3 text-sm whitespace-normal wrap-anywhere"><Markdown skipHtml allowedElements={allowedElements} components={components}>{children}</Markdown></div>;
}
