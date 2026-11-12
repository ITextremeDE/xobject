import {Tooltip,TooltipTrigger,TooltipContent} from './ui/tooltip';

/** Keep the complete text accessible and use the same tooltip as record icons. */
export function TruncatedText({children}:{children:string}){
 return <Tooltip><TooltipTrigger render={<span/>} className="block min-w-0 truncate">{children}</TooltipTrigger><TooltipContent>{children}</TooltipContent></Tooltip>;
}
