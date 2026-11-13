import {Badge} from './ui/badge';
import {TruncatedText} from './truncated-text';
export function TagsValue({value}:{value:unknown}){
 return Array.isArray(value)&&value.length?<span className="flex max-w-full flex-wrap gap-1">{value.map(tag=><Badge key={String(tag)} variant="secondary" className="max-w-full"><TruncatedText>{String(tag)}</TruncatedText></Badge>)}</span>:<>—</>;
}
